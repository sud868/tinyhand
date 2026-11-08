import GObject from 'gi://GObject';
import St from 'gi://St';

const FADE_DURATION = 0.6;

// Port of Ink.swift: round-capped strokes that fade a few seconds after the
// button is released, or stay until cleared when fadeSeconds is 0.
export const Ink = GObject.registerClass(
class TinyHandInk extends St.DrawingArea {
    _init() {
        super._init();
        this._strokes = [];
        this._current = null;
        this.fadeSeconds = 3;
    }

    get drawing() {
        return this._current !== null;
    }

    get fading() {
        return this._strokes.some(s => s.endedAt !== null);
    }

    begin(x, y, width, color) {
        this._current = {points: [[x, y]], width, color, endedAt: null, alpha: 1};
        this._strokes.push(this._current);
        this.queue_repaint();
    }

    extend(x, y) {
        const s = this._current;
        if (!s)
            return;
        const [lx, ly] = s.points[s.points.length - 1];
        if (Math.hypot(x - lx, y - ly) < 1.5)
            return;
        s.points.push([x, y]);
        this.queue_repaint();
    }

    end(now) {
        if (this._current && this.fadeSeconds > 0)
            this._current.endedAt = now;
        this._current = null;
    }

    clear() {
        this._strokes = [];
        this._current = null;
        this.queue_repaint();
    }

    // Returns true while some stroke is still fading.
    tick(now) {
        const delay = Math.max(0.5, this.fadeSeconds);
        let changed = false;
        for (const s of this._strokes) {
            if (s.endedAt === null)
                continue;
            const alpha = 1 - Math.min(1, Math.max(0, (now - s.endedAt - delay) / FADE_DURATION));
            if (alpha !== s.alpha) {
                s.alpha = alpha;
                changed = true;
            }
        }
        const before = this._strokes.length;
        this._strokes = this._strokes.filter(s => s.alpha > 0);
        if (changed || before !== this._strokes.length)
            this.queue_repaint();
        return this.fading;
    }

    vfunc_repaint() {
        const cr = this.get_context();
        cr.setLineCap(1); // Cairo.LineCap.ROUND
        cr.setLineJoin(1); // Cairo.LineJoin.ROUND
        for (const s of this._strokes) {
            const [r, g, b] = s.color;
            const passes = [[1, 1.5, [0, 0, 0, 0.18 * s.alpha]], [0, 0, [r, g, b, s.alpha]]];
            cr.setLineWidth(s.width);
            for (const [ox, oy, rgba] of passes) {
                cr.setSourceRGBA(...rgba);
                const [x0, y0] = s.points[0];
                cr.moveTo(x0 + ox, y0 + oy);
                if (s.points.length === 1)
                    cr.lineTo(x0 + ox + 0.01, y0 + oy);
                for (let i = 1; i < s.points.length; i++)
                    cr.lineTo(s.points[i][0] + ox, s.points[i][1] + oy);
                cr.stroke();
            }
        }
        cr.$dispose();
    }
});
