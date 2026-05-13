import { Container, Graphics, BlurFilter } from "pixi.js";
import { gsap } from "gsap";
import type { SymbolId } from "@math/types";
import { ALL_SYMBOL_IDS } from "../assets/symbols";
import { AssetLoader } from "../assets/AssetLoader";
import { SymbolRenderer } from "./SymbolRenderer";

export interface ReelConfig {
  /** Number of visible rows (always 3 for this slot, but kept configurable). */
  readonly rows: number;
  /** Size of each square symbol in pixels (matches AssetLoader.symbolSize). */
  readonly symbolSize: number;
  /** Gap between adjacent reels and rows. */
  readonly gap: number;
}

interface ReelCell {
  symbol: SymbolRenderer;
  /** Logical y position within the strip (in cells, can grow during spin). */
  cellIndex: number;
}

export interface ReelLandingOptions {
  /** Time spent at full speed before this reel begins decelerating, ms. */
  readonly spinDuration: number;
  /** Length of the deceleration tween, ms. */
  readonly decelDuration: number;
  /** Symbols to land in the visible window (length === rows). */
  readonly target: readonly SymbolId[];
}

/**
 * ReelRenderer animates a single reel.
 *
 * Internally the reel owns a vertical strip of `rows + 2` cells stacked
 * top-to-bottom. While spinning, we tween a `position` variable forwards
 * forever and re-seat any cell that scrolls below the bottom of the view
 * to the top, replacing its symbol with the next strip symbol — same
 * trick every slot uses. When `stop(target)` is called, we splice the
 * target symbols into the strip just-in-time so the deceleration ends at
 * exactly the right visual state.
 */
export class ReelRenderer extends Container {
  private readonly maskRect: Graphics;
  private readonly stripContainer: Container;
  private readonly cells: ReelCell[] = [];
  private readonly rows: number;
  private readonly symbolSize: number;
  private readonly stride: number;
  private spinning = false;
  private scrollOffset = 0;
  private spinTween: gsap.core.Tween | null = null;
  private upcomingStrip: SymbolId[] = [];
  private readonly blurFilter: BlurFilter;

  constructor(
    private readonly assets: AssetLoader,
    private readonly cfg: ReelConfig,
    initialColumn: readonly SymbolId[],
  ) {
    super();
    this.rows = cfg.rows;
    this.symbolSize = cfg.symbolSize;
    this.stride = cfg.symbolSize + cfg.gap;

    this.stripContainer = new Container();
    this.addChild(this.stripContainer);

    // Reel mask — keeps anything outside the visible window invisible.
    this.maskRect = new Graphics();
    this.maskRect.beginFill(0xffffff);
    this.maskRect.drawRoundedRect(0, 0, this.symbolSize, this.stride * this.rows - cfg.gap, 14);
    this.maskRect.endFill();
    this.addChild(this.maskRect);
    this.stripContainer.mask = this.maskRect;

    // Build cells. We keep `rows + 2` cells so that one extra cell is
    // always above the visible window and one below — this guarantees
    // smooth wrap-around during spinning.
    const cellCount = this.rows + 2;
    for (let i = 0; i < cellCount; i++) {
      const symbolId = i >= 1 && i <= this.rows
        ? initialColumn[i - 1] ?? "I"
        : this.randomSymbol();
      const symbol = new SymbolRenderer(assets, symbolId);
      symbol.y = (i - 1) * this.stride;
      this.stripContainer.addChild(symbol);
      this.cells.push({ symbol, cellIndex: i - 1 });
      symbol.playIdle();
    }

    this.blurFilter = new BlurFilter(0, 1);
    this.blurFilter.blendMode = 0;
    this.blurFilter.padding = 8;
  }

  /** Currently displayed column, top-to-bottom (length === rows). */
  getVisibleColumn(): SymbolId[] {
    return this.cells
      .filter((c) => c.cellIndex >= 0 && c.cellIndex < this.rows)
      .sort((a, b) => a.cellIndex - b.cellIndex)
      .map((c) => c.symbol.symbolId);
  }

  /** Begin the spin loop. The reel will keep moving until `stop()` is called. */
  startSpin(): void {
    if (this.spinning) return;
    this.spinning = true;
    this.blurFilter.blur = 0;
    this.stripContainer.filters = [this.blurFilter];
    // Stop idle animations during high-speed spin to keep CPU low.
    for (const c of this.cells) c.symbol.stopIdleAnimation();

    // Pre-fill the upcoming strip with random symbols.
    this.upcomingStrip = [];
    for (let i = 0; i < 24; i++) this.upcomingStrip.push(this.randomSymbol());

    // Ramp up blur quickly and start an endless tween that we'll interrupt.
    gsap.killTweensOf(this.blurFilter);
    gsap.to(this.blurFilter, { blur: 8, duration: 0.18, ease: "power2.out" });

    const start = performance.now();
    this.spinTween = gsap.to(this, {
      duration: 30,
      ease: "none",
      onUpdate: () => {
        const elapsed = (performance.now() - start) / 1000;
        // High-speed ramp: 0 -> 60 cells/sec by t=0.18s.
        const speed = Math.min(elapsed / 0.18, 1) * 60;
        const dt = gsap.ticker.deltaRatio() / 60;
        this.advance(dt * speed);
      },
    });
  }

  /** Smoothly decelerate so the visible window ends on `options.target`. */
  stop(options: ReelLandingOptions): Promise<void> {
    return new Promise<void>((resolve) => {
      if (!this.spinning) {
        // We never started — just snap.
        this.snapToTarget(options.target);
        resolve();
        return;
      }
      if (this.spinTween) {
        this.spinTween.kill();
        this.spinTween = null;
      }

      // Inject the target symbols into the upcoming strip so they appear in
      // the visible window exactly at the end of the deceleration tween.
      // After all cells have settled, the visible rows (cellIndex 0..rows-1)
      // must hold target[0..rows-1].
      const cellsToScroll = 12; // ensures a satisfying spin even if stop is fast
      const padding: SymbolId[] = [];
      for (let i = 0; i < cellsToScroll; i++) padding.push(this.randomSymbol());
      this.upcomingStrip = padding.concat(options.target);

      // Compute target offset so that, after advancing cellsToScroll + rows
      // cells, the reel snaps to its grid origin.
      const advanceCells = cellsToScroll + this.rows;
      const targetOffset = this.scrollOffset + advanceCells * this.stride;

      const tweenObj = { p: this.scrollOffset };
      gsap.to(this.blurFilter, { blur: 0, duration: 0.18, ease: "power2.in" });
      gsap.to(tweenObj, {
        p: targetOffset,
        duration: options.decelDuration / 1000,
        ease: "back.out(1.6)",
        onUpdate: () => {
          const delta = tweenObj.p - this.scrollOffset;
          if (delta > 0) this.advance(delta / this.stride);
        },
        onComplete: () => {
          this.spinning = false;
          this.stripContainer.filters = null;
          this.snapAfterDecel(options.target);
          resolve();
        },
      });
    });
  }

  private snapAfterDecel(target: readonly SymbolId[]): void {
    // Force exact alignment: each visible cell takes the target symbol and
    // sits at its canonical y. This protects against accumulated FP drift.
    this.cells.sort((a, b) => a.symbol.y - b.symbol.y);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      c.cellIndex = i - 1;
      c.symbol.y = (i - 1) * this.stride;
      if (i >= 1 && i <= this.rows) {
        c.symbol.setSymbol(target[i - 1] ?? "I");
        c.symbol.playLand(0.04 * (i - 1));
      } else {
        c.symbol.setSymbol(this.randomSymbol());
      }
    }
  }

  private snapToTarget(target: readonly SymbolId[]): void {
    this.cells.sort((a, b) => a.symbol.y - b.symbol.y);
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i]!;
      c.cellIndex = i - 1;
      c.symbol.y = (i - 1) * this.stride;
      if (i >= 1 && i <= this.rows) c.symbol.setSymbol(target[i - 1] ?? "I");
    }
  }

  /**
   * Advance the strip by `cells` cells worth of distance, scrolling cells
   * off the bottom and back to the top with fresh symbols.
   */
  private advance(cells: number): void {
    const dy = cells * this.stride;
    this.scrollOffset += dy;
    for (const c of this.cells) c.symbol.y += dy;
    // Recycle anything that scrolled past the bottom.
    const recycleBelow = this.rows * this.stride + this.stride;
    while (true) {
      const lowest = this.cells.reduce((acc, c) => (c.symbol.y > acc.symbol.y ? c : acc));
      const highest = this.cells.reduce((acc, c) => (c.symbol.y < acc.symbol.y ? c : acc));
      if (lowest.symbol.y < recycleBelow) break;
      lowest.symbol.y = highest.symbol.y - this.stride;
      lowest.symbol.setSymbol(this.upcomingStrip.length > 0 ? (this.upcomingStrip.pop() as SymbolId) : this.randomSymbol());
    }
  }

  private randomSymbol(): SymbolId {
    // Bias away from WILD/SCATTER during spinning — they only need to land
    // when the math actually places them.
    let id: SymbolId;
    do {
      id = ALL_SYMBOL_IDS[Math.floor(Math.random() * ALL_SYMBOL_IDS.length)] as SymbolId;
    } while (id === "SCATTER" && Math.random() < 0.85);
    return id;
  }

  /** Iterate over the visible symbols (top-to-bottom). */
  forEachVisibleSymbol(cb: (sym: SymbolRenderer, row: number) => void): void {
    const ordered = this.cells
      .filter((c) => c.cellIndex >= 0 && c.cellIndex < this.rows)
      .sort((a, b) => a.cellIndex - b.cellIndex);
    for (let i = 0; i < ordered.length; i++) {
      cb(ordered[i]!.symbol, i);
    }
  }
}
