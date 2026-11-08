# TinyHand for GNOME

A GNOME Shell extension port of TinyHand. GNOME on Wayland does not let ordinary
apps draw above every window, hide the cursor or swallow clicks, so the hand runs
inside the shell as an extension.

Tested on GNOME Shell 51 (Wayland).

## Install

```sh
gnome/build.sh install
```

Log out and back in, then enable it:

```sh
gnome-extensions enable tinyhand@tinyhand.app
```

## Use

| | |
|---|---|
| Click the top-bar icon, or **Ctrl+Alt+H** | Turn the pointer on or off |
| Right-click the top-bar icon | Settings |
| Click | Tap (nothing underneath gets clicked) |
| Hold and drag | Draw on the screen |
| **Ctrl+Alt+X** | Clear the drawing |
| **Esc** | Turn the pointer off |

While the pointer is on, the keyboard still goes to your apps, except **Esc**.

## Settings

Right-click the top-bar icon, or run `gnome-extensions prefs tinyhand@tinyhand.app`:
hand style, size, tap sound, how long drawings stay, and the keyboard shortcuts.

## Layout

- `extension/`: the extension source (`extension.js`, `hand.js`, `ink.js`, `prefs.js` for the settings window, `styles.js` and `measure.js` shared by both, settings schema).
- `build.sh`: copies the source plus the shared `assets/` hands, sounds and icons into `build/<uuid>`.

`hand.js` ports the asset measurement from `PointerStyle.swift` and the pose maths
from `ArmView.swift`, so the hands line up the same way as on macOS.

## Not yet ported

Toolbar, laser dot, custom hands, ink colour override, welcome window, drop shadow.
