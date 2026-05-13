import { Container, Graphics, BLEND_MODES } from "pixi.js";
import { gsap } from "gsap";
import type { PaylineWin } from "@math/types";

export interface PaylineLayout {
  /** Top-left x of the leftmost reel's first symbol. */
  readonly originX: number;
  /** Top-left y of the leftmost reel's first symbol. */
  readonly originY: number;
  /** Distance between reel column centers (= symbolSize + gap). */
  readonly columnStride: number;
  /** Distance between row centers (= symbolSize + gap). */
  readonly rowStride: number;
  /** Symbol cell size — used to center the polyline on each cell. */
  readonly cellSize: number;
}

const LINE_COLORS = [
  0xffe066, 0xff5d8f, 0x4cffb3, 0x7ab8ff, 0xff8a3d,
  0xc6b8ff, 0x8effd8, 0xffa1d4, 0x9ad2ff, 0xffc15a,
  0xff5d6d, 0x5bffc8, 0xffb27a, 0xa39bff, 0xff79b0,
  0x7ce6ff, 0xffea7a, 0xff6a78, 0x9affc4, 0xffb066,
] as const;

export class PaylineRenderer extends Container {
  private graphics = new Graphics();
  private active: gsap.core.Tween[] = [];
  private layout: PaylineLayout | null = null;

  constructor() {
    super();
    this.addChild(this.graphics);
    this.graphics.blendMode = BLEND_MODES.ADD;
  }

  setLayout(layout: PaylineLayout): void {
    this.layout = layout;
  }

  /** Render all winning paylines: sequential reveal then concurrent display. */
  async showWins(wins: ReadonlyArray<PaylineWin>): Promise<void> {
    if (wins.length === 0) return;
    if (!this.layout) return;

    this.clear();

    for (let i = 0; i < wins.length; i++) {
      const win = wins[i]!;
      await this.revealLine(win, i, 0.35);
    }
    // Hold every drawn line briefly so the player can see them all.
    await new Promise<void>((resolve) => {
      gsap.delayedCall(0.5, resolve);
    });
  }

  clear(): void {
    for (const t of this.active) t.kill();
    this.active = [];
    this.graphics.clear();
  }

  private revealLine(win: PaylineWin, paylineIndex: number, duration: number): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.layout) {
        resolve();
        return;
      }
      const layout = this.layout;
      const color = LINE_COLORS[paylineIndex % LINE_COLORS.length] as number;
      const points: Array<{ x: number; y: number }> = win.positions.map((p) => ({
        x: layout.originX + p[0] * layout.columnStride + layout.cellSize / 2,
        y: layout.originY + p[1] * layout.rowStride + layout.cellSize / 2,
      }));

      // Progress 0 → 1 reveals each segment of the polyline in turn.
      const state = { p: 0 };
      const tween = gsap.to(state, {
        p: 1,
        duration,
        ease: "power1.inOut",
        onUpdate: () => {
          this.redraw();
          this.drawPolyline(color, points, state.p);
        },
        onComplete: () => resolve(),
      });
      this.active.push(tween);
    });
  }

  /**
   * Re-render all already-revealed lines on every animation tick — the
   * Graphics buffer is cleared each time so partial lines can keep
   * progressing while completed lines stay drawn.
   */
  private redraw(): void {
    this.graphics.clear();
  }

  private drawPolyline(color: number, points: Array<{ x: number; y: number }>, progress: number): void {
    if (points.length < 2) return;

    const segmentCount = points.length - 1;
    const totalDistance = points.reduce((acc, p, i) => {
      if (i === 0) return 0;
      const prev = points[i - 1]!;
      return acc + Math.hypot(p.x - prev.x, p.y - prev.y);
    }, 0);
    const target = totalDistance * progress;

    this.graphics.lineStyle({ width: 4, color: 0x000000, alpha: 0.35, alignment: 0.5 });
    this.graphics.moveTo(points[0]!.x, points[0]!.y);
    let drawn = 0;
    for (let i = 1; i <= segmentCount; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const remaining = target - drawn;
      if (remaining <= 0) break;
      const f = Math.min(remaining / segLen, 1);
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      this.graphics.lineTo(x, y);
      drawn += f * segLen;
      if (f < 1) break;
    }

    this.graphics.lineStyle({ width: 6, color, alpha: 0.9, alignment: 0.5 });
    this.graphics.moveTo(points[0]!.x, points[0]!.y);
    drawn = 0;
    for (let i = 1; i <= segmentCount; i++) {
      const a = points[i - 1]!;
      const b = points[i]!;
      const segLen = Math.hypot(b.x - a.x, b.y - a.y);
      const remaining = target - drawn;
      if (remaining <= 0) break;
      const f = Math.min(remaining / segLen, 1);
      const x = a.x + (b.x - a.x) * f;
      const y = a.y + (b.y - a.y) * f;
      this.graphics.lineTo(x, y);
      drawn += f * segLen;
      if (f < 1) break;
    }

    // Dots at every passed waypoint.
    let passed = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i]!;
      if (i > 0) {
        const prev = points[i - 1]!;
        passed += Math.hypot(p.x - prev.x, p.y - prev.y);
      }
      if (passed > target) break;
      this.graphics.beginFill(color, 0.95);
      this.graphics.drawCircle(p.x, p.y, 6);
      this.graphics.endFill();
    }
  }
}
