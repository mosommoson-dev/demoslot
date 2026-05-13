import { Application, Container } from "pixi.js";
import { gsap } from "gsap";
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
import { GameController, BET_STEPS } from "./game/GameController";
import { Logger, NsLogger } from "./game/Logger";
import type { AutoplayPreset, AutoplayLimits } from "./game/Autoplay";

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
    positions: w.positions,
  } as unknown as PaylineWin));
}

export class GameScene {
  public readonly stage: Container;
  public readonly controller: GameController;
  private readonly log: NsLogger = Logger.of("slot:scene");
  private assets: AssetLoader;
  private reels: ReelRenderer[] = [];
  private reelGroup = new Container();
  private particles!: ParticleSystem;
  private background!: Background;
  private animation!: AnimationManager;
  private paylineRenderer!: PaylineRenderer;
  private winDisplay!: WinDisplay;
  private ui!: UIManager;

  constructor(private readonly app: Application, controller?: GameController) {
    this.stage = new Container();
    app.stage.addChild(this.stage);
    this.controller = controller ?? new GameController();
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
    this.winDisplay.setBalance(this.controller.balance);
    this.winDisplay.setBet(this.controller.currentBet);
    this.winDisplay.setLastWin(0);

    this.ui = new UIManager(
      this.stage,
      this.assets,
      {
        onSpin: () => void this.controller.requestSpin(),
        onToggleAutoplay: (preset, limits) => this.toggleAutoplay(preset, limits),
        onBetChange: (delta) => this.controller.changeBet(delta),
        onShowInfo: () => this.showPaytableInfo(),
        onResetBalance: () => this.controller.resetSession(),
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

    this.wireControllerEvents();
    this.resize();
  }

  private buildReels(): void {
    const initialGrid = this.controller.engine.spin();
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

  // ─── Controller wiring (the view is purely reactive) ─────────────────────

  private wireControllerEvents(): void {
    const c = this.controller;

    c.on("stateChanged", (next, prev) => {
      this.log.debug(`state ${prev} → ${next}`);
      const busy = next !== "IDLE" && next !== "SESSION_END";
      this.ui.setSpinningState(busy);
    });

    c.on("balanceChanged", (balance) => {
      this.winDisplay.setBalance(balance);
    });

    c.on("betChanged", (bet) => {
      this.winDisplay.setBet(bet);
    });

    c.on("sessionReset", (balance, bet) => {
      this.winDisplay.setBalance(balance);
      this.winDisplay.setBet(bet);
      this.winDisplay.setLastWin(0);
      this.animation.clearWins();
      this.ui.flashReset();
    });

    c.on("autoplayChanged", (snapshot, stopReason) => {
      this.ui.setAutoplay(snapshot);
      if (stopReason && stopReason !== "user-stopped") {
        this.ui.flashAutoplayReason(stopReason);
      }
    });

    c.on("roundCompleted", (_round, stats) => {
      this.ui.setSessionStats(stats);
    });

    // The two animation hooks: these MUST return promises so the controller
    // can sequence base + free spins correctly.
    c.on("reelsShouldSpinBase", (round) => this.animateBaseSpin(round.bet, round.base));
    c.on("reelsShouldSpinFreeSpin", (spin, _i, _total, multiplier) =>
      this.animateFreeSpin(spin, multiplier),
    );

    c.on("freeSpinsEntered", (session, retriggers) => {
      void this.animation.showFreeSpinsEntry(
        session.spinsPlayed,
        session.spins[0]?.scatter.count ?? 3,
      );
      this.log.info("free spins entered", { spinsPlayed: session.spinsPlayed, retriggers });
    });

    c.on("freeSpinsExited", (session) => {
      this.log.info("free spins exited", { totalWin: session.totalWin });
    });
  }

  private async animateBaseSpin(bet: number, base: SpinEvaluation): Promise<void> {
    this.animation.clearWins();
    for (const reel of this.reels) reel.startSpin();

    const stagger = 150;
    const stops: Promise<void>[] = [];
    for (let i = 0; i < this.reels.length; i++) {
      const reel = this.reels[i]!;
      const column = base.grid[i] ?? ["I", "I", "I"];
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

    await this.animation.showWin({
      lineWins: toPaylineWins(base.lineWins),
      scatter: base.scatter,
      totalWin: base.totalWin,
      betPerSpin: bet,
      isFreeSpin: false,
    });
  }

  private async animateFreeSpin(spin: SpinEvaluation, multiplier: number): Promise<void> {
    this.animation.clearWins();
    for (const reel of this.reels) reel.startSpin();

    const stops: Promise<void>[] = [];
    for (let r = 0; r < this.reels.length; r++) {
      const reel = this.reels[r]!;
      const column = spin.grid[r] ?? ["I", "I", "I"];
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
      lineWins: toPaylineWins(spin.lineWins),
      scatter: spin.scatter,
      totalWin: spin.totalWin,
      betPerSpin: this.controller.currentBet,
      isFreeSpin: true,
    });
    await new Promise<void>((resolve) => gsap.delayedCall(0.18, resolve));
    void multiplier; // FS multiplier is already baked into spin.totalWin.
  }

  private toggleAutoplay(preset: AutoplayPreset, limits: AutoplayLimits): void {
    if (this.controller.autoplay.active) {
      this.controller.stopAutoplay("user-stopped");
    } else {
      void this.controller.startAutoplay(preset, limits);
    }
  }

  private showPaytableInfo(): void {
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
    console.info("BET steps:", BET_STEPS);
    console.info("Session stats:", this.controller.history.stats());
    console.info("Recent rounds:", this.controller.history.recent());
  }
}
