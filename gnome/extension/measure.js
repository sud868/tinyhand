// Shared by the shell (hand.js) and the preferences window (prefs.js), so it
// must not import anything shell-only.

// Port of HandAsset.measure (Sources/TinyHand/PointerStyle.swift): finds the
// fingertip, wrist and rod in the PNG's alpha channel, as fractions of its size.
export function measure(pixbuf) {
    const w = pixbuf.get_width();
    const h = pixbuf.get_height();
    const stride = pixbuf.get_rowstride();
    const channels = pixbuf.get_n_channels();
    const hasAlpha = pixbuf.get_has_alpha();
    const px = pixbuf.get_pixels();
    const solid = (x, y) => !hasAlpha || px[y * stride + x * channels + 3] > 128;

    const counts = new Int32Array(h);
    for (let y = 0; y < h; y++) {
        let n = 0;
        for (let x = 0; x < w; x++) {
            if (solid(x, y))
                n++;
        }
        counts[y] = n;
    }
    const center = y => {
        let lo = -1, hi = -1;
        for (let x = 0; x < w; x++) {
            if (solid(x, y)) {
                if (lo < 0)
                    lo = x;
                hi = x;
            }
        }
        return lo < 0 ? 0.5 : (lo + hi) / 2 / w;
    };
    const firstFrom = (from, test) => {
        for (let y = from; y < h; y++) {
            if (test(counts[y]))
                return y;
        }
        return -1;
    };

    const top = firstFrom(0, c => c > 0);
    if (top < 0)
        return null;
    const searchEnd = Math.min(h, top + Math.floor(0.45 * h));
    let maxW = 0;
    for (let y = top; y < searchEnd; y++)
        maxW = Math.max(maxW, counts[y]);
    const fist = firstFrom(top, c => c > 0.6 * maxW);
    const wrist = fist < 0 ? -1 : firstFrom(fist, c => c < 0.35 * maxW);
    if (maxW === 0 || wrist < 0)
        return null;
    const rodW = counts[Math.min(h - 1, wrist + Math.floor(h / 50))];
    let lastRow = h - 1;
    while (lastRow > 0 && counts[lastRow] === 0)
        lastRow--;
    const handle = firstFrom(Math.min(h - 1, wrist + Math.floor(h / 33)), c => c > 1.8 * rodW);
    const rodEnd = handle < 0 ? lastRow : handle;

    return {
        aspect: w / h,
        handTop: Math.max(0, top - 0.004 * h) / h,
        tip: top / h,
        wrist: wrist / h,
        rodEnd: rodEnd / h,
        tipX: center(Math.min(h - 1, top + Math.floor(h / 200))),
        rodX: center(Math.floor((wrist + rodEnd) / 2)),
    };
}
