import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {Hand, loadAsset} from './hand.js';
import {Ink} from './ink.js';
import {inkFor} from './styles.js';

const DRAG_START = 4;
const KEY_MODES = Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP;

const PREFS_BUS_NAME = 'org.gnome.Shell.Extensions';

const now = () => GLib.get_monotonic_time() / 1e6;

const Overlay = GObject.registerClass(
class TinyHandOverlay extends St.Widget {
    _init(ext) {
        super._init({reactive: true});
        this._ext = ext;
        this._settings = ext.getSettings();

        this.ink = new Ink();
        this.hand = new Hand();
        this.add_child(this.ink);
        this.add_child(this.hand);
        this.set_cursor_type(Clutter.CursorType.NONE);

        this._monitor = null;
        this._pointer = [0, 0];
        this._down = null;
        this._lastTick = now();
        this._timeline = new Clutter.Timeline({actor: this, duration: 1000, repeat_count: -1});
        this._timeline.connect('new-frame', () => this._tick());

        this.connect('event', (_actor, event) => this._onEvent(event));
        this._settingsIds = ['hand-style', 'pointer-size', 'fade-seconds']
            .map(key => this._settings.connect(`changed::${key}`, () => this._applySettings()));
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => this._layout());

        this._applySettings();
        this._layout();
    }

    _applySettings() {
        const style = this._settings.get_string('hand-style');
        const path = `${this._ext.path}/assets/hand_${style}.png`;
        let asset = null;
        try {
            asset = loadAsset(path);
        } catch (e) {
            console.warn(`TinyHand: cannot load ${path}: ${e.message}`);
        }
        asset ??= loadAsset(`${this._ext.path}/assets/hand_lavender.png`);
        this.hand.setAsset(asset);
        this.hand.sizeFrac = this._settings.get_double('pointer-size');
        this.ink.fadeSeconds = this._settings.get_double('fade-seconds');
        this._inkColor = inkFor(style);
        this._wake();
    }

    _layout() {
        this.set_position(0, 0);
        this.set_size(global.stage.width, global.stage.height);
        this.ink.set_size(global.stage.width, global.stage.height);
        this._monitor = null;
        const [x, y] = global.get_pointer();
        this._moveTo(x, y);
    }

    _monitorAt(x, y) {
        const monitors = Main.layoutManager.monitors;
        return monitors.find(m => x >= m.x && x < m.x + m.width && y >= m.y && y < m.y + m.height) ??
            Main.layoutManager.primaryMonitor;
    }

    _moveTo(x, y) {
        this._pointer = [x, y];
        const monitor = this._monitorAt(x, y);
        if (monitor !== this._monitor) {
            this._monitor = monitor;
            this.hand.setMonitor(monitor);
        }
        this._wake();
    }

    _wake() {
        if (!this._timeline.is_playing()) {
            this._lastTick = now();
            this._aim(1);
            this._timeline.start();
        }
    }

    _aim(frames) {
        const m = this._monitor;
        if (!m)
            return;
        const [x, y] = this._pointer;
        this.hand.aim(x - m.x, y - m.y, frames);
    }

    _tick() {
        const t = now();
        const frames = Math.min(4, (t - this._lastTick) * 60);
        this._lastTick = t;
        this._aim(frames);
        const fading = this.ink.tick(t);
        if (!this.hand.settling && !this.hand.held && !fading)
            this._timeline.stop();
    }

    _onEvent(event) {
        const type = event.type();
        if (type === Clutter.EventType.MOTION) {
            const [x, y] = event.get_coords();
            this._moveTo(x, y);
            if (this._down)
                this._drag(x, y);
        } else if (type === Clutter.EventType.BUTTON_PRESS && event.get_button() === Clutter.BUTTON_PRIMARY) {
            const [x, y] = event.get_coords();
            this._moveTo(x, y);
            this._down = [x, y];
            this.hand.held = true;
            this.hand.press();
            this._ext.playTap();
        } else if (type === Clutter.EventType.BUTTON_RELEASE && event.get_button() === Clutter.BUTTON_PRIMARY) {
            this._down = null;
            this.hand.held = false;
            this.ink.end(now());
            this._wake();
        }
        return Clutter.EVENT_STOP;
    }

    _drag(x, y) {
        if (!this.ink.drawing) {
            const [sx, sy] = this._down;
            if (Math.hypot(x - sx, y - sy) < DRAG_START)
                return;
            const width = Math.max(3, (this._monitor?.height ?? global.stage.height) * 0.0055);
            this.ink.begin(sx, sy, width, this._inkColor);
        }
        this.ink.extend(x, y);
    }

    clearInk() {
        this.ink.clear();
    }

    destroy() {
        this._timeline.stop();
        this._settingsIds.forEach(id => this._settings.disconnect(id));
        Main.layoutManager.disconnect(this._monitorsId);
        super.destroy();
    }
});

const Indicator = GObject.registerClass(
class TinyHandIndicator extends PanelMenu.Button {
    _init(ext) {
        super._init(0.0, 'TinyHand', true);
        this._ext = ext;
        this._icon = new St.Icon({style_class: 'system-status-icon'});
        this.add_child(this._icon);
        this.setActive(false);
        const click = new Clutter.ClickGesture({required_button: Clutter.BUTTON_PRIMARY});
        click.connect('recognize', () => ext.toggle());
        this.add_action(click);
        const prefs = new Clutter.ClickGesture({required_button: Clutter.BUTTON_SECONDARY});
        prefs.connect('recognize', () => ext.showPreferences());
        this.add_action(prefs);
    }

    setActive(active) {
        const name = active ? 'tinyhand-on-symbolic.svg' : 'tinyhand-off-symbolic.svg';
        this._icon.gicon = Gio.FileIcon.new(Gio.File.new_for_path(`${this._ext.path}/icons/${name}`));
        this._icon.opacity = active ? 255 : 150;
    }
});

export default class TinyHandExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
        this._indicator = new Indicator(this);
        Main.panel.addToStatusArea(this.uuid, this._indicator);
        Main.wm.addKeybinding('toggle-pointer', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            KEY_MODES, () => this.toggle());
        Main.wm.addKeybinding('clear-ink', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            KEY_MODES, () => this._overlay?.clearInk());
    }

    disable() {
        this.turnOff();
        Main.wm.removeKeybinding('toggle-pointer');
        Main.wm.removeKeybinding('clear-ink');
        this._indicator?.destroy();
        this._indicator = null;
        this._settings = null;
    }

    toggle() {
        if (this._overlay)
            this.turnOff();
        else
            this.turnOn();
    }

    turnOn() {
        if (this._overlay)
            return;
        this._overlay = new Overlay(this);
        Main.uiGroup.add_child(this._overlay);
        Main.uiGroup.set_child_above_sibling(this._overlay, null);
        this._raiseId = Main.uiGroup.connect('child-added', () =>
            Main.uiGroup.set_child_above_sibling(this._overlay, null));
        Main.wm.addKeybinding('exit-pointer', this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            KEY_MODES, () => this.turnOff());
        this._indicator.setActive(true);
    }

    turnOff() {
        if (!this._overlay)
            return;
        Main.wm.removeKeybinding('exit-pointer');
        Main.uiGroup.disconnect(this._raiseId);
        this._overlay.destroy();
        this._overlay = null;
        this._indicator?.setActive(false);
    }

    // Extension.openPreferences() fails with "Already showing a prefs dialog" when the
    // window is already open (and only logs it), so raise the existing window instead.
    showPreferences() {
        if (this._raisePrefsWindow())
            return;
        Gio.DBus.session.call(
            PREFS_BUS_NAME, '/org/gnome/Shell/Extensions', PREFS_BUS_NAME, 'OpenExtensionPrefs',
            new GLib.Variant('(ssa{sv})', [this.uuid, '', {}]),
            null, Gio.DBusCallFlags.NONE, -1, null
        ).catch(e => {
            if (!this._raisePrefsWindow())
                console.warn(`TinyHand: cannot open preferences: ${e.message}`);
        });
    }

    _raisePrefsWindow() {
        const tracker = Shell.WindowTracker.get_default();
        const windows = global.display.list_all_windows()
            .filter(w => tracker.get_window_app(w)?.get_id() === `${PREFS_BUS_NAME}.desktop`);
        const win = windows.find(w => w.get_title() === this.metadata.name) ?? windows[0];
        if (!win)
            return false;
        Main.activateWindow(win);
        return true;
    }

    playTap() {
        const sound = this._settings.get_string('tap-sound');
        if (sound === 'off')
            return;
        const file = Gio.File.new_for_path(`${this.path}/sounds/tap_${sound}.wav`);
        global.display.get_sound_player().play_from_file(file, 'TinyHand tap', null);
    }
}
