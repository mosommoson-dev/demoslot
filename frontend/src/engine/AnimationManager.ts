import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { gsap } from "gsap";
import type { PaylineWin, ScatterWin, SymbolId } from "@math/types";
import type { ReelRenderer } from "./ReelRenderer";
import type { ParticleSystem } from "./ParticleSystem";
import type { PaylineRenderer } from "../ui/PaylineRenderer";
import type { WinDisplay } from "../ui/WinDisplay";

const BIG_WIN_THRESHOLDS = [
  { name: "BIG WIN", multiplier: 10, color: 0xffe066 },
  { name: "MEGA WIN", multiplier: 25, color: 0xff8a3d },
  { name: "EPIC WIN", multiplier: 100, color: 0xff3df3 },
] as const;

export interface WinShowOptions {
  readonly lineWins: ReadonlyArray<PaylineWin>;
  readonly scatter: ScatterWin;
  readonly betPerSpin: number;
  readonly totalWin: number;
  readonly isFreeSpin: boolean;
}

export class AnimationManager {
  private bigWinLayer: Container;
  private bigWinText: Text;
  private bigWinSubtitle: Text;
  private bigWinBg: Graphics;
  private overlayLayer: Container;

  constructor(
    parent: Container,
    private readonly reels: readonly ReelRenderer[],
    private readonly paylineRenderer: PaylineRenderer,
    private readonly particles: ParticleSystem,
    private readonly winDisplay: WinDisplay,
    private readonly stageWidth: () => number,
    private readonly stageHeight: () => number,
  ) {
    this.bigWinLayer = new Container();
    this.bigWinLayer.eventMode = "none";
    this.bigWinLayer.visible = false;
    parent.addChild(this.bigWinLayer);

    this.bigWinBg = new Graphics();
    this.bigWinLayer.addChild(this.bigWinBg);

    this.bigWinText = new Text(
      "",
      new TextStyle({
        fontFamily: "Impact, sans-serif",
        fontSize: 96,
        fontWeight: "900",
        fill: [0xffffff, 0xffd76a],
        stroke: 0x4a0e0e,
        strokeThickness: 8,
        letterSpacing: 4,
        align: "center",
      }),
    );
    this.bigWinText.anchor.set(0.5);
    this.bigWinLayer.addChild(this.bigWinText);

    this.bigWinSubtitle = new Text(
      "",
      new TextStyle({
        fontFamily: "Georgia, serif",
        fontSize: 52,
        fontWeight: "700",
        fill: [0xffe066, 0xff8a3d],
        stroke: 0x1a0814,
        strokeThickness: 6,
        align: "center",
      }),
    );
    this.bigWinSubtitle.anchor.set(0.5);
    this.bigWinLayer.addChild(this.bigWinSubtitle);

    this.overlayLayer = new Container();
    this.overlayLayer.eventMode = "none";
    this.overlayLayer.visible = false;
    parent.addChild(this.overlayLayer);
  }

  resize(): void {
    this.bigWinText.x = this.stageWidth() / 2;
    this.bigWinText.y = this.stageHeight() / 2 - 40;
    this.bigWinSubtitle.x = this.stageWidth() / 2;
    this.bigWinSubtitle.y = this.stageHeight() / 2 + 60;
    this.drawBigWinBackdrop();
  }

  private drawBigWinBackdrop(): void {
    this.bigWinBg.clear();
    this.bigWinBg.beginFill(0x000000, 0.55);
    this.bigWinBg.drawRect(0, 0, this.stageWidth(), this.stageHeight());
    this.bigWinBg.endFill();
  }

  /** Run the full post-spin win presentation. */
  async showWin(opts: WinShowOptions): Promise<void> {
    const allWins = [...opts.lineWins];
    const winningCells = new Set<string>();
    for (const w of allWins) {
      for (const pos of w.positions) {
        winningCells.add(`${pos[0]}:${pos[1]}`);
      }
    }
    if (opts.scatter.count >= 3) {
      for (const pos of opts.scatter.positions) {
        winningCells.add(`${pos[0]}:${pos[1]}`);
      }
    }

    // Highlight every winning symbol.
    this.reels.forEach((reel, reelIndex) => {
      reel.forEachVisibleSymbol((sym, row) => {
        if (winningCells.has(`${reelIndex}:${row}`)) sym.playWin();
      });
    });

    // Scatter burst — particles for each scatter.
    if (opts.scatter.count >= 3) {
      for (const pos of opts.scatter.positions) {
        const reelIdx = pos[0];
        const row = pos[1];
        const reel = this.reels[reelIdx];
        if (!reel) continue;
        this.particles.burst({
          x: reel.x + reel.width / 2,
          y: reel.y + row * (reel.height / 3) + reel.height / 6,
          count: 40,
          color: 0xffd76a,
          speed: 6,
          ttl: 1.1,
          startScale: 0.9,
        });
      }
    }

    // Show win counter rolling up.
    if (opts.totalWin > 0) {
      this.winDisplay.showRoundWin(opts.totalWin);
    }

    // Animate paylines in sequence (each visible for 600ms, then all together).
    await this.paylineRenderer.showWins(allWins);

    // Big win celebration if threshold passed.
    if (opts.totalWin > 0 && opts.betPerSpin > 0) {
      const multiple = opts.totalWin / opts.betPerSpin;
      const tier = BIG_WIN_THRESHOLDS.slice()
        .reverse()
        .find((t) => multiple >= t.multiplier);
      if (tier) {
        await this.playBigWin(tier.name, tier.color, opts.totalWin, opts.betPerSpin);
      }
    }
  }

  /** Reset all win-time animations. Call before each new spin. */
  clearWins(): void {
    for (const reel of this.reels) {
      reel.forEachVisibleSymbol((sym) => sym.stopWinAnimation());
    }
    this.paylineRenderer.clear();
    this.particles.clear();
  }

  private async playBigWin(name: string, color: number, amount: number, bet: number): Promise<void> {
    this.drawBigWinBackdrop();
    this.bigWinLayer.visible = true;
    this.bigWinLayer.alpha = 0;
    this.bigWinText.text = name;
    this.bigWinText.tint = color;
    this.bigWinText.scale.set(0.4);
    this.bigWinSubtitle.text = "0.00";

    await new Promise<void>((resolve) => {
      gsap.to(this.bigWinLayer, { alpha: 1, duration: 0.25 });
      gsap.to(this.bigWinText.scale, {
        x: 1.1,
        y: 1.1,
        duration: 0.5,
        ease: "back.out(2.2)",
      });
      const counter = { value: 0 };
      const targetMultiplier = amount / Math.max(bet, 1e-9);
      gsap.to(counter, {
        value: amount,
        duration: 1.6,
        ease: "power2.out",
        onUpdate: () => {
          this.bigWinSubtitle.text = `${counter.value.toFixed(2)}  (${(counter.value / bet).toFixed(1)}x bet)`;
          // Burst particles intermittently while the counter rolls.
          if (Math.random() < 0.25) {
            this.particles.burst({
              x: this.stageWidth() / 2 + (Math.random() - 0.5) * 240,
              y: this.stageHeight() / 2 + (Math.random() - 0.5) * 200,
              count: 18,
              color,
              speed: 5,
              ttl: 0.8,
            });
          }
        },
        onComplete: () => {
          this.bigWinSubtitle.text = `${amount.toFixed(2)}  (${targetMultiplier.toFixed(1)}x bet)`;
        },
      });
      gsap.to(this.bigWinText.scale, {
        x: 1,
        y: 1,
        duration: 0.35,
        delay: 0.55,
        ease: "power2.inOut",
      });
      gsap.to(this.bigWinLayer, {
        alpha: 0,
        delay: 2.4,
        duration: 0.45,
        onComplete: () => {
          this.bigWinLayer.visible = false;
          resolve();
        },
      });
    });
  }

  /** Free spins intro overlay. Resolves after the user-facing animation. */
  async showFreeSpinsEntry(awarded: number, scatterCount: number): Promise<void> {
    this.overlayLayer.removeChildren();
    this.overlayLayer.visible = true;
    this.overlayLayer.alpha = 0;

    const bg = new Graphics();
    bg.beginFill(0x140628, 0.92);
    bg.drawRect(0, 0, this.stageWidth(), this.stageHeight());
    bg.endFill();
    this.overlayLayer.addChild(bg);

    const title = new Text(
      "FREE SPINS!",
      new TextStyle({
        fontFamily: "Impact, sans-serif",
        fontSize: 110,
        fontWeight: "900",
        fill: [0xffffff, 0xffd76a, 0xff7a18],
        stroke: 0x3a0e0e,
        strokeThickness: 10,
        letterSpacing: 6,
        align: "center",
      }),
    );
    title.anchor.set(0.5);
    title.x = this.stageWidth() / 2;
    title.y = this.stageHeight() / 2 - 60;
    this.overlayLayer.addChild(title);

    const subtitle = new Text(
      `${scatterCount}× SCATTER — ${awarded} SPINS WITH ×3 MULTIPLIER`,
      new TextStyle({
        fontFamily: "Georgia, serif",
        fontSize: 36,
        fill: [0xffe066, 0xff8a3d],
        stroke: 0x1a0814,
        strokeThickness: 4,
        align: "center",
      }),
    );
    subtitle.anchor.set(0.5);
    subtitle.x = this.stageWidth() / 2;
    subtitle.y = this.stageHeight() / 2 + 60;
    this.overlayLayer.addChild(subtitle);

    title.scale.set(0.4);
    await new Promise<void>((resolve) => {
      gsap.to(this.overlayLayer, { alpha: 1, duration: 0.3 });
      gsap.to(title.scale, {
        x: 1,
        y: 1,
        duration: 0.55,
        ease: "back.out(2.5)",
      });
      // particles raining
      const stop = { run: true };
      const rain = (): void => {
        if (!stop.run) return;
        this.particles.burst({
          x: Math.random() * this.stageWidth(),
          y: -20,
          count: 6,
          color: 0xffd76a,
          speed: 2,
          spread: Math.PI / 4,
          ttl: 1.4,
          gravity: 1,
          startScale: 0.6,
          endScale: 0.1,
        });
      };
      const interval = setInterval(rain, 80);
      gsap.to(this.overlayLayer, {
        alpha: 0,
        delay: 2.2,
        duration: 0.5,
        onComplete: () => {
          stop.run = false;
          clearInterval(interval);
          this.overlayLayer.visible = false;
          resolve();
        },
      });
    });
  }
}
