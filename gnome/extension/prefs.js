import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GdkPixbuf from 'gi://GdkPixbuf';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';
import Pango from 'gi://Pango';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {measure} from './measure.js';
import {HANDS, SOUNDS} from './styles.js';

const THUMB_HEIGHT = 72;
const FADES = [[3, 'After 3 seconds'], [6, 'After 6 seconds'], [10, 'After 10 seconds'], [0, 'Keep until cleared']];
const SHORTCUTS = [
    ['toggle-pointer', 'Turn the pointer on or off'],
    ['clear-ink', 'Clear the drawing'],
    ['exit-pointer', 'Turn the pointer off', 'Only active while the pointer is on'],
];

// Crops a hand PNG to the hand itself (no rod), scaled for the picker.
function thumbnail(path) {
    const pixbuf = GdkPixbuf.Pixbuf.new_from_file_at_scale(path, -1, THUMB_HEIGHT * 5, true);
    const g = measure(pixbuf);
    const h = pixbuf.get_height();
    const top = g ? Math.floor(g.handTop * h) : 0;
    const bottom = g ? Math.min(h, Math.ceil((g.wrist + 0.03) * h)) : h;
    const hand = pixbuf.new_subpixbuf(0, top, pixbuf.get_width(), bottom - top);
    const scale = THUMB_HEIGHT * 2 / hand.get_height();
    const small = hand.scale_simple(Math.max(1, Math.round(hand.get_width() * scale)), THUMB_HEIGHT * 2,
        GdkPixbuf.InterpType.HYPER);
    return Gdk.MemoryTexture.new(small.get_width(), small.get_height(),
        small.get_has_alpha() ? Gdk.MemoryFormat.R8G8B8A8 : Gdk.MemoryFormat.R8G8B8,
        small.read_pixel_bytes(), small.get_rowstride());
}

function shortcutLabel(accels) {
    return accels.length ? accels[0] : '';
}

export default class TinyHandPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 720);
        window.add(this._pointerPage(settings));
        window.add(this._drawingPage(settings));
        window.add(this._shortcutsPage(settings, window));
    }

    _pointerPage(settings) {
        const page = new Adw.PreferencesPage({title: 'Pointer', icon_name: 'input-mouse-symbolic'});

        const handGroup = new Adw.PreferencesGroup({title: 'Hand'});
        const flow = new Gtk.FlowBox({
            selection_mode: Gtk.SelectionMode.SINGLE,
            homogeneous: true,
            min_children_per_line: 4,
            max_children_per_line: 8,
            row_spacing: 6,
            column_spacing: 6,
            css_classes: ['card'],
            margin_bottom: 6,
        });
        const children = new Map();
        const pending = [];
        for (const hand of HANDS) {
            const picture = new Gtk.Picture({
                content_fit: Gtk.ContentFit.CONTAIN,
                height_request: THUMB_HEIGHT,
                width_request: THUMB_HEIGHT,
            });
            const box = new Gtk.Box({
                orientation: Gtk.Orientation.VERTICAL, spacing: 4,
                margin_top: 8, margin_bottom: 8, margin_start: 4, margin_end: 4,
            });
            box.append(picture);
            box.append(new Gtk.Label({label: hand.title, css_classes: ['caption'], ellipsize: Pango.EllipsizeMode.END}));
            const child = new Gtk.FlowBoxChild({child: box, tooltip_text: hand.title});
            child._id = hand.id;
            flow.append(child);
            children.set(hand.id, child);
            pending.push([picture, `${this.path}/assets/hand_${hand.id}.png`]);
        }
        // Decode thumbnails a few at a time so the window opens immediately.
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            const next = pending.shift();
            if (!next)
                return GLib.SOURCE_REMOVE;
            try {
                next[0].set_paintable(thumbnail(next[1]));
            } catch (e) {
                console.warn(`TinyHand: thumbnail ${next[1]}: ${e.message}`);
            }
            return GLib.SOURCE_CONTINUE;
        });

        const select = () => {
            const child = children.get(settings.get_string('hand-style'));
            if (child && !child.is_selected())
                flow.select_child(child);
        };
        select();
        flow.connect('selected-children-changed', () => {
            const [child] = flow.get_selected_children();
            if (child && child._id !== settings.get_string('hand-style'))
                settings.set_string('hand-style', child._id);
        });
        settings.connect('changed::hand-style', select);
        handGroup.add(flow);

        const sizeGroup = new Adw.PreferencesGroup();
        const sizeRow = new Adw.ActionRow({title: 'Size', subtitle: 'Hand length, relative to the screen height'});
        const range = settings.settings_schema.get_key('pointer-size').get_range().recursiveUnpack()[1];
        const scale = new Gtk.Scale({
            adjustment: new Gtk.Adjustment({lower: range[0], upper: range[1], step_increment: 0.01}),
            draw_value: false,
            hexpand: true,
            width_request: 220,
            valign: Gtk.Align.CENTER,
        });
        scale.add_mark(0.13, Gtk.PositionType.BOTTOM, null);
        settings.bind('pointer-size', scale.adjustment, 'value', Gio.SettingsBindFlags.DEFAULT);
        sizeRow.add_suffix(scale);
        sizeGroup.add(sizeRow);
        page.add(sizeGroup);
        page.add(handGroup);

        return page;
    }

    _drawingPage(settings) {
        const page = new Adw.PreferencesPage({title: 'Drawing & sound', icon_name: 'document-edit-symbolic'});

        const inkGroup = new Adw.PreferencesGroup({
            title: 'Ink',
            description: 'Hold the button and drag to draw. Each hand draws in its own colour.',
        });
        const fadeRow = new Adw.ComboRow({
            title: 'Lines fade',
            model: Gtk.StringList.new(FADES.map(f => f[1])),
        });
        const syncFade = () => {
            const v = settings.get_double('fade-seconds');
            let best = 0;
            FADES.forEach(([s], i) => {
                if (Math.abs(s - v) < Math.abs(FADES[best][0] - v))
                    best = i;
            });
            fadeRow.selected = best;
        };
        syncFade();
        fadeRow.connect('notify::selected', () => {
            const v = FADES[fadeRow.selected][0];
            if (v !== settings.get_double('fade-seconds'))
                settings.set_double('fade-seconds', v);
        });
        settings.connect('changed::fade-seconds', syncFade);
        inkGroup.add(fadeRow);
        page.add(inkGroup);

        const soundGroup = new Adw.PreferencesGroup({title: 'Sound'});
        const soundRow = new Adw.ComboRow({
            title: 'Tap sound',
            subtitle: 'Played on each click',
            model: Gtk.StringList.new(SOUNDS.map(s => s.title)),
        });
        const play = () => {
            const id = SOUNDS[soundRow.selected].id;
            if (id === 'off')
                return;
            this._player = Gtk.MediaFile.new_for_filename(`${this.path}/sounds/tap_${id}.wav`);
            this._player.play();
        };
        const preview = new Gtk.Button({
            icon_name: 'media-playback-start-symbolic',
            tooltip_text: 'Play',
            valign: Gtk.Align.CENTER,
            css_classes: ['flat'],
        });
        preview.connect('clicked', play);
        soundRow.add_suffix(preview);
        const syncSound = () => {
            const i = SOUNDS.findIndex(s => s.id === settings.get_string('tap-sound'));
            soundRow.selected = Math.max(0, i);
            preview.sensitive = SOUNDS[soundRow.selected].id !== 'off';
        };
        syncSound();
        soundRow.connect('notify::selected', () => {
            const id = SOUNDS[soundRow.selected].id;
            if (id !== settings.get_string('tap-sound')) {
                settings.set_string('tap-sound', id);
                play();
            }
        });
        settings.connect('changed::tap-sound', syncSound);
        soundGroup.add(soundRow);
        page.add(soundGroup);

        return page;
    }

    _shortcutsPage(settings, window) {
        const page = new Adw.PreferencesPage({title: 'Shortcuts', icon_name: 'preferences-desktop-keyboard-shortcuts-symbolic'});
        const group = new Adw.PreferencesGroup({
            title: 'Keyboard shortcuts',
            description: 'Click a shortcut to change it. Backspace disables it.',
        });
        for (const [key, title, subtitle] of SHORTCUTS) {
            const row = new Adw.ActionRow({title, subtitle: subtitle ?? '', activatable: true});
            const label = new Gtk.ShortcutLabel({valign: Gtk.Align.CENTER, disabled_text: 'Disabled'});
            const reset = new Gtk.Button({
                icon_name: 'edit-undo-symbolic',
                tooltip_text: 'Reset to default',
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
            });
            reset.connect('clicked', () => settings.reset(key));
            const sync = () => {
                label.accelerator = shortcutLabel(settings.get_strv(key));
                reset.visible = settings.get_user_value(key) !== null;
            };
            sync();
            settings.connect(`changed::${key}`, sync);
            row.add_suffix(label);
            row.add_suffix(reset);
            row.connect('activated', () => this._capture(window, title, accel => settings.set_strv(key, accel)));
            group.add(row);
        }
        page.add(group);
        return page;
    }

    // Asks for a key combination. done(['<Control><Alt>h']), done([]) to disable.
    _capture(window, title, done) {
        const dialog = new Adw.AlertDialog({
            heading: title,
            body: 'Press the new shortcut, with Ctrl, Alt or Super. Backspace disables it, Esc cancels.',
        });
        dialog.add_response('cancel', 'Cancel');
        const controller = new Gtk.EventControllerKey({propagation_phase: Gtk.PropagationPhase.CAPTURE});
        controller.connect('key-pressed', (_c, keyval, keycode, state) => {
            const mods = state & Gtk.accelerator_get_default_mod_mask() & ~Gdk.ModifierType.LOCK_MASK;
            const key = Gdk.keyval_to_lower(keyval);
            if (!mods && key === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (!mods && key === Gdk.KEY_BackSpace) {
                done([]);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            // A bare letter would be swallowed everywhere; only function keys work alone.
            const fkey = key >= Gdk.KEY_F1 && key <= Gdk.KEY_F35;
            if (!Gtk.accelerator_valid(key, mods) || (!mods && !fkey))
                return Gdk.EVENT_STOP;
            done([Gtk.accelerator_name_with_keycode(null, key, keycode, mods)]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);
        dialog.present(window);
    }
}
