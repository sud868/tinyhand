import Clutter from 'gi://Clutter';
import Cogl from 'gi://Cogl';
import GdkPixbuf from 'gi://GdkPixbuf';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import St from 'gi://St';

import {measure} from './measure.js';

const MIN_ROD_FRAC = 0.05;
const GRIP_LEAN_FRAC = 0.30;
const GRIP_DEPTH_FRAC = 0.12;
const GRIP_FOLLOW = 0.08;
const PRESS_DECAY = 0.18;
const TEXTURE_STEP = 64;

const measured = new Map();

export function loadAsset(path) {
    const hit = measured.get(path);
    if (hit)
        return hit;
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file(path);
    const geometry = measure(pixbuf);
    if (!geometry)
        return null;
    const asset = {pixbuf, ...geometry};
    measured.clear();
    measured.set(path, asset);
    return asset;
}

function contentFrom(pixbuf) {
    const cogl = global.stage.context.get_backend().get_cogl_context();
    const content = St.ImageContent.new_with_preferred_size(pixbuf.get_width(), pixbuf.get_height());
    content.set_bytes(
        cogl,
        pixbuf.read_pixel_bytes(),
        pixbuf.get_has_alpha() ? Cogl.PixelFormat.RGBA_8888 : Cogl.PixelFormat.RGB_888,
        pixbuf.get_width(),
        pixbuf.get_height(),
        pixbuf.get_rowstride());
    return content;
}

// Port of ArmView.aim: a fixed-size hand on a rod that stretches from a grip
// below the bottom edge of the monitor, leaning so the fingertip lands on the cursor.
export const Hand = GObject.registerClass(
class TinyHandHand extends St.Widget {
    _init() {
        super._init({clip_to_allocation: true});
        this._arm = new Clutter.Actor({pivot_point: new Graphene.Point({x: 0.5, y: 1})});
        this._rod = new Clutter.Actor();
        this._palm = new Clutter.Actor();
        this._arm.add_child(this._rod);
        this._arm.add_child(this._palm);
        this.add_child(this._arm);

        this.asset = null;
        this.sizeFrac = 0.13;
        this.held = false;
        this._press = 0;
        this._gripX = null;
        this._gripTarget = null;
        this._textureHeight = 0;
        this._scale = 1;
    }

    setAsset(asset) {
        this.asset = asset;
        this._textureHeight = 0;
        this._arm.pivot_point = new Graphene.Point({x: asset.rodX, y: 1});
    }

    setMonitor(monitor) {
        this.set_position(monitor.x, monitor.y);
        this.set_size(monitor.width, monitor.height);
        this._scale = monitor.geometry_scale ?? 1;
        this._gripX = null;
        this._textureHeight = 0;
    }

    press() {
        this._press = 1;
    }

    get settling() {
        if (this._press > 0.002)
            return true;
        return this._gripX !== null && Math.abs(this._gripTarget - this._gripX) > 0.5;
    }

    // x, y are monitor-local, y down. frames is elapsed time in 60 Hz frames.
    aim(x, y, frames) {
        const a = this.asset;
        if (!a)
            return;
        const W = this.width;
        const H = this.height;
        const k = f => 1 - Math.pow(1 - f, frames);

        const cy = H - y;
        const targetX = Math.min(Math.max(x + GRIP_LEAN_FRAC * W, W * 0.15), W * 1.05);
        this._gripX = this._gripX === null ? targetX : this._gripX + (targetX - this._gripX) * k(GRIP_FOLLOW);
        this._gripTarget = targetX;
        const gx = this._gripX;
        const gy = -GRIP_DEPTH_FRAC * H;
        if (!this.held)
            this._press += (0 - this._press) * k(PRESS_DECAY);

        const dx = x - gx;
        const dy = cy - gy;
        const reach = Math.hypot(dx, dy);
        const aimAngle = Math.atan2(dy, dx);

        const handPts = this.sizeFrac * H * (1 - 0.06 * this._press);
        const s = handPts / (a.wrist - a.handTop);
        const widthPts = s * a.aspect;
        const handTipPts = (a.wrist - a.tip) * s;
        const tipOffX = (a.tipX - a.rodX) * widthPts;
        const along = Math.sqrt(Math.max(0, reach * reach - tipOffX * tipOffX));
        const rodLen = Math.max(MIN_ROD_FRAC * H, along - handTipPts);
        const tipAngle = Math.atan2(rodLen + handTipPts, tipOffX);
        const rotation = aimAngle - tipAngle;

        this._updateTextures(a, s);
        const armH = rodLen + handPts;
        this._palm.set_position(0, 0);
        this._palm.set_size(widthPts, handPts);
        this._rod.set_position(0, handPts);
        this._rod.set_size(widthPts, rodLen);
        this._arm.set_size(widthPts, armH);
        this._arm.set_position(gx - a.rodX * widthPts, H - gy - armH);
        this._arm.rotation_angle_z = -rotation * 180 / Math.PI;
    }

    _updateTextures(a, imageHeightPts) {
        const full = a.pixbuf.get_height();
        const needed = Math.ceil(imageHeightPts * this._scale / TEXTURE_STEP) * TEXTURE_STEP;
        const height = needed >= full * 0.9 ? full : Math.max(TEXTURE_STEP, needed);
        if (height === this._textureHeight)
            return;
        this._textureHeight = height;
        const image = height === full
            ? a.pixbuf
            : a.pixbuf.scale_simple(Math.max(1, Math.round(a.pixbuf.get_width() * height / full)), height,
                GdkPixbuf.InterpType.HYPER);
        const w = image.get_width();
        const rows = f => Math.round(f * height);
        const slice = (from, to) => image.new_subpixbuf(0, rows(from), w, Math.max(1, rows(to) - rows(from))).copy();
        this._palm.set_content(contentFrom(slice(a.handTop, a.wrist)));
        this._rod.set_content(contentFrom(slice(a.wrist, a.rodEnd)));
    }
});
