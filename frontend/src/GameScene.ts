import { Application, Container } from "pixi.js";
import { gsap } from "gsap";
import { SlotEngine, DEFAULT_CONFIG, createDefaultRng } from "@math/index";
import type {
  Grid,
  SymbolId,
  SpinEvaluation,
  FreeSpinSessionResult,
  PaylineWin,
} from "@math/types";
import { AssetLoader } from "./assets/AssetLoader";
import { ReelRenderer } from "./engine/ReelRenderer";
import { AnimationManager } from "./engine/AnimationManager";
import { ParticleSystem } from "./engine/ParticleSystem";
import { UIManager } from "./ui/UIManager";
import { PaylineRenderer } from "./ui/PaylineRenderer";
import { WinDisplay } from "./ui/WinDisplay";
import { Background } from "./ui/Background";

const BET_STEPS = [0.2, 0.4, 0.6, 1, 2, 5, 10, 20, 50, 100];
const SYMBOL_SIZE = 150;
const REEL_GAP = 10;
const ROWS = 3;
const REELS = 5;

interface PaylineSourceWin {
  readonly lineIndex: number;
  readonly symbol: SymbolId;
  readonly matchLength: number;
  readonly amount: number;
  readonly positions: ReadonlyArray<readonly [number, number]>;
}

function toPaylineWins(wins: ReadonlyArray<PaylineSourceWin>): PaylineWin[] {
  return wins.map((w) => ({
    paylineIndex: w.lineIndex,
    symbol: w.symbol,
    matchLength: w.matchLength,
    amount: w.amount,
    path: w.positions.map((p) => ({ reel: p[0], row: p[1] })),
    positions: w.positions, // pass-through so legacy type stays compatible
  } as unknown as PaylineWin));
}

export class GameScene {
  public readonly stage: Container;
  private engine: SlotEngine;
  private assets: AssetLoader;
  private reels: ReelRenderer[] = [];
  private reelGroup = new Container();
  private particles!: ParticleSystem;
  private background!: Background;
  private animation!: AnimationManager;
  private paylineRenderer!: PaylineRenderer;
  private winDisplay!: WinDisplay;
  private ui!: UIManager;
  private balance = 1000;
  private betIndex = 3; // default 1.0
  private spinning = false;
  private autoplaying = false;
  private autoplayHandle: number | null = null;

  constructor(private readonly app: Application) {
    this.stage = new Container();
    app.stage.addChild(this.stage);
    this.engine = new SlotEngine(DEFAULT_CONFIG, createDefaultRng());
    this.assets = new AssetLoader(app, SYMBOL_SIZE);
  }

  init(): void {
    this.assets.build();

    this.background = new Background(
      this.assets,
      () => this.app.renderer.width / this.app.renderer.resolution,
      () => this.app.renderer.height / this.app.renderer.resolution,
    );
    this.stage.addChild(this.background);
    this.background.attach(this.app.ticker);

    this.stage.addChild(this.reelGroup);
    this.buildReels();

    this.paylineRenderer = new PaylineRenderer();
    this.stage.addChild(this.paylineRenderer);

    this.particles = new ParticleSystem(this.stage, this.assets);
    this.particles.attach(this.app.ticker);

    this.winDisplay = new WinDisplay(this.assets);
    this.stage.addChild(this.winDisplay);
    this.winDisplay.setBalance(this.balance);
    this.winDisplay.setBet(this.currentBet);
    this.winDisplay.setLastWin(0);

    this.ui = new UIManager(
      this.stage,
      this.assets,
      {
        onSpin: () => this.handleSpin(),
        onToggleAutoplay: () => this.toggleAutoplay(),
        onBetChange: (delta) => this.changeBet(delta),
        onShowInfo: () => this.showPaytableInfo(),
      },
      () => this.app.renderer.width / this.app.renderer.resolution,
      () => this.app.renderer.height / this.app.renderer.resolution,
    );

    this.animation = new AnimationManager(
      this.stage,
      this.reels,
      this.paylineRenderer,
      this.particles,
      this.winDisplay,
      () => this.app.renderer.width / this.app.renderer.resolution,
      () => this.app.renderer.height / this.app.renderer.resolution,
    );

    this.resize();
  }

  private get currentBet(): number {
    return BET_STEPS[this.betIndex]!;
  }

  private buildReels(): void {
    const initialGrid = this.engine.spin();
    for (let r = 0; r < REELS; r++) {
      const column = initialGrid[r] ?? ["I", "I", "I"];
      const reel = new ReelRenderer(
        this.assets,
        { rows: ROWS, symbolSize: SYMBOL_SIZE, gap: REEL_GAP },
        column,
      );
      this.reels.push(reel);
      this.reelGroup.addChild(reel);
    }
  }

  resize(): void {
    const w = this.app.renderer.width / this.app.renderer.resolution;
    const h = this.app.renderer.height / this.app.renderer.resolution;

    const reelWidth = SYMBOL_SIZE * REELS + REEL_GAP * (REELS - 1);
    const reelHeight = SYMBOL_SIZE * ROWS + REEL_GAP * (ROWS - 1);
    const targetWidth = Math.min(w * 0.78, 1100);
    const scale = Math.min(targetWidth / reelWidth, (h * 0.55) / reelHeight, 1);
    this.reelGroup.scale.set(scale);
    const scaledW = reelWidth * scale;
    const scaledH = reelHeight * scale;
    this.reelGroup.x = (w - scaledW) / 2;
    this.reelGroup.y = h * 0.16;

    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i]!;
      reel.x = i * (SYMBOL_SIZE + REEL_GAP);
      reel.y = 0;
    }

    // Background frame + paylines anchor to the reel area.
    this.background.resize({
      x: this.reelGroup.x,
      y: this.reelGroup.y,
      width: scaledW,
      height: scaledH,
    });

    this.paylineRenderer.setLayout({
      originX: this.reelGroup.x,
      originY: this.reelGroup.y,
      columnStride: (SYMBOL_SIZE + REEL_GAP) * scale,
      rowStride: (SYMBOL_SIZE + REEL_GAP) * scale,
      cellSize: SYMBOL_SIZE * scale,
    });

    this.ui.resize();
    this.animation.resize();

    const meterWidth = this.winDisplay.totalWidth;
    this.winDisplay.setLayout((w - meterWidth) / 2, h * 0.16 + scaledH + 24);
  }

  private async handleSpin(): Promise<void> {
    if (this.spinning) return;
    if (this.balance < this.currentBet) {
      this.balance = Math.max(this.balance, this.currentBet);
      this.winDisplay.setBalance(this.balance);
      return;
    }
    this.spinning = true;
    this.ui.setSpinningState(true);
    this.animation.clearWins();

    this.balance -= this.currentBet;
    this.winDisplay.setBalance(this.balance);
    this.winDisplay.setLastWin(0);

    // Get the round result from the math engine BEFORE the visual spin starts.
    const round = this.engine.playRound(this.currentBet);

    // Start all reels spinning, then stop them in sequence with 150ms staggers.
    for (const reel of this.reels) reel.startSpin();

    const stagger = 150;
    const stops: Promise<void>[] = [];
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i]!;
      const column = round.base.grid[i] ?? ["I", "I", "I"];
      stops.push(
        new Promise<void>((resolve) => {
          gsap.delayedCall(0.6 + (i * stagger) / 1000, () => {
            reel
              .stop({
                spinDuration: 600 + i * stagger,
                decelDuration: 800 + i * 50,
                target: column,
              })
              .then(resolve);
          });
        }),
      );
    }
    await Promise.all(stops);

    // Show base game wins.
    this.balance += round.base.totalWin;
    this.winDisplay.setBalance(this.balance);
    await this.animation.showWin({
      lineWins: toPaylineWins(round.base.lineWins),
      scatter: round.base.scatter,
      totalWin: round.base.totalWin,
      betPerSpin: this.currentBet,
      isFreeSpin: false,
    });

    // If free spins triggered, play them.
    if (round.freeSpins) {
      await this.runFreeSpinSession(round.freeSpins);
      this.balance += round.freeSpins.totalWin;
      this.winDisplay.setBalance(this.balance);
    }

    this.spinning = false;
    this.ui.setSpinningState(false);

    if (this.autoplaying) {
      this.autoplayHandle = window.setTimeout(() => {
        this.autoplayHandle = null;
        this.handleSpin();
      }, 450);
    }
  }

  private async runFreeSpinSession(session: FreeSpinSessionResult): Promise<void> {
    await this.animation.showFreeSpinsEntry(session.spinsPlayed, session.spins[0]?.scatter.count ?? 3);

    for (let i = 0; i < session.spins.length; i++) {
      const evalResult = session.spins[i]!;
      this.animation.clearWins();
      for (const reel of this.reels) reel.startSpin();

      const stops: Promise<void>[] = [];
      for (let r = 0; r < this.reels.length; r++) {
        const reel = this.reels[r]!;
        const column = evalResult.grid[r] ?? ["I", "I", "I"];
        stops.push(
          new Promise<void>((resolve) => {
            gsap.delayedCall(0.45 + r * 0.12, () => {
              reel
                .stop({ spinDuration: 450, decelDuration: 700, target: column })
                .then(resolve);
            });
          }),
        );
      }
      await Promise.all(stops);

      await this.animation.showWin({
        lineWins: toPaylineWins(evalResult.lineWins),
        scatter: evalResult.scatter,
        totalWin: evalResult.totalWin,
        betPerSpin: this.currentBet,
        isFreeSpin: true,
      });
      await new Promise<void>((resolve) => gsap.delayedCall(0.25, resolve));
    }
  }

  private toggleAutoplay(): void {
    this.autoplaying = !this.autoplaying;
    this.ui.setAutoplayActive(this.autoplaying);
    if (this.autoplaying && !this.spinning) this.handleSpin();
    if (!this.autoplaying && this.autoplayHandle !== null) {
      window.clearTimeout(this.autoplayHandle);
      this.autoplayHandle = null;
    }
  }

  private changeBet(delta: number): void {
    const next = Math.max(0, Math.min(BET_STEPS.length - 1, this.betIndex + delta));
    if (next === this.betIndex) return;
    this.betIndex = next;
    this.winDisplay.setBet(this.currentBet);
  }

  private showPaytableInfo(): void {
    // Print a quick summary into the dev console — the UI is intentionally
    // restrained so we don't clutter the cabinet with modals. The full math
    // is documented in `src/paytable.ts` and the README.
    console.info(
      "Paytable summary:",
      Object.entries({
        WILD: "x3=75, x4=250, x5=1000",
        A: "x3=72, x4=190, x5=500",
        B: "x3=36, x4=92,  x5=250",
        C: "x3=23, x4=58,  x5=150",
        D: "x3=17, x4=41,  x5=100",
        E: "x3=12, x4=32,  x5=50",
        F: "x3=10, x4=27,  x5=40",
        G: "x3=9,  x4=22,  x5=30",
        H: "x3=7,  x4=16,  x5=25",
        I: "x3=5,  x4=13,  x5=20",
      }),
    );
  }
}
