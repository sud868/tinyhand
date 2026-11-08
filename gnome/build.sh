#!/usr/bin/env bash
# Assemble the GNOME Shell extension from gnome/extension and the shared assets.
#   ./build.sh            build into gnome/build/<uuid>
#   ./build.sh install    build, then copy into ~/.local/share/gnome-shell/extensions
#   ./build.sh pack       build, then zip for extensions.gnome.org
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(dirname "$here")"
uuid="$(sed -n 's/.*"uuid": *"\([^"]*\)".*/\1/p' "$here/extension/metadata.json")"
out="$here/build/$uuid"

rm -rf "$out"
mkdir -p "$out/assets" "$out/sounds" "$out/icons"
cp -r "$here/extension/." "$out/"
cp "$root"/assets/hand_*.png "$out/assets/"
cp "$root"/assets/sounds/tap_*.wav "$out/sounds/"
cp "$root/assets/icon/menubar-on.svg" "$out/icons/tinyhand-on-symbolic.svg"
cp "$root/assets/icon/menubar-off.svg" "$out/icons/tinyhand-off-symbolic.svg"
glib-compile-schemas "$out/schemas"

case "${1:-}" in
  install)
    dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"
    rm -rf "$dest"
    mkdir -p "$(dirname "$dest")"
    cp -r "$out" "$dest"
    echo "Installed to $dest"
    echo "Log out and back in (Wayland), then: gnome-extensions enable $uuid"
    ;;
  pack)
    (cd "$out" && zip -qr "$here/build/$uuid.shell-extension.zip" .)
    echo "Packed $here/build/$uuid.shell-extension.zip"
    ;;
  "") echo "Built $out" ;;
  *) echo "usage: $0 [install|pack]" >&2; exit 2 ;;
esac
