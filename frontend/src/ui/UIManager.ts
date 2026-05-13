import { Container, Graphics, Text, TextStyle, BlurFilter } from "pixi.js";
import { gsap } from "gsap";
import type { AssetLoader } from "../assets/AssetLoader";
import type {
  AutoplayLimits,
  AutoplayPreset,
  AutoplaySnapshot,
  AutoplayStopReason,
} from "../game/Autoplay";
import { DEFAULT_AUTOPLAY_LIMITS } from "../game/Autoplay";
import type { SessionStats } from "../game/SpinHistory";

export interface UIButtons {
  spin: PixiButton;
  autoplay: PixiButton;
  autoplayPreset: PixiButton;
  betMinus: PixiButton;
  betPlus: PixiButton;
  info: PixiButton;
  reset: PixiButton;
}

export interface UICallbacks {
  onSpin(): void;
  onToggleAutoplay(preset: AutoplayPreset, limits: AutoplayLimits): void;
  onBetChange(delta: number): void;
  onShowInfo(): void;
  onResetBalance(): void;
}

const AUTOPLAY_PRESETS: readonly AutoplayPreset[] = [10, 25, 50, 100];

export class PixiButton extends Container {
  public readonly hit: Graphics;
  private readonly bg: Graphics;
  private readonly innerGlow: Graphics;
  private readonly label: Text;
  private readonly icon: Container;
  private _enabled = true;
  private active = false;

  public readonly btnWidth: number;
  public readonly btnHeight: number;

  constructor(
    text: string,
    private readonly variant: "primary" | "secondary" | "ghost" | "danger" = "secondary",
    btnWidth = 180,
    btnHeight = 64,
    iconBuilder?: (g: Graphics, w: number, h: number) => void,
  ) {
    super();
    this.btnWidth = btnWidth;
    this.btnHeight = btnHeight;
    this.eventMode = "static";
    this.cursor = "pointer";

    this.bg = new Graphics();
    this.innerGlow = new Graphics();
    this.icon = new Container();
    const labelStyle = new TextStyle({
      fontFamily: "Impact, sans-serif",
      fontSize: variant === "primary" ? 28 : 22,
      fontWeight: "900",
      fill: variant === "primary" ? [0xffffff, 0xffd76a] : 0xffffff,
      stroke: variant === "primary" ? 0x4a0e0e : 0x14062c,
      strokeThickness: 4,
      letterSpacing: variant === "primary" ? 6 : 3,
      align: "center",
    });
    this.label = new Text(text, labelStyle);
    this.label.anchor.set(0.5);
    this.label.x = btnWidth / 2;
    this.label.y = btnHeight / 2;

    if (iconBuilder) {
      const ig = new Graphics();
      iconBuilder(ig, btnWidth, btnHeight);
      this.icon.addChild(ig);
    }

    this.addChild(this.bg);
    this.addChild(this.innerGlow);
    this.addChild(this.icon);
    this.addChild(this.label);

    this.hit = new Graphics();
    this.hit.beginFill(0x000000, 0.0001);
    this.hit.drawRoundedRect(0, 0, btnWidth, btnHeight, 18);
    this.hit.endFill();
    this.addChild(this.hit);

    this.drawBackground(false);

    this.on("pointerdown", () => {
      if (!this._enabled) return;
      gsap.to(this.scale, { x: 0.94, y: 0.94, duration: 0.08, ease: "power2.out" });
    });
    this.on("pointerup", () => {
      if (!this._enabled) return;
      gsap.to(this.scale, { x: 1, y: 1, duration: 0.18, ease: "back.out(2.4)" });
    });
    this.on("pointerupoutside", () => {
      gsap.to(this.scale, { x: 1, y: 1, duration: 0.18, ease: "back.out(2.4)" });
    });
    this.on("pointerover", () => {
      if (this._enabled) this.drawBackground(true);
    });
    this.on("pointerout", () => {
      this.drawBackground(false);
    });
  }

  setEnabled(v: boolean): void {
    this._enabled = v;
    this.alpha = v ? 1 : 0.45;
    this.eventMode = v ? "static" : "none";
    this.cursor = v ? "pointer" : "default";
  }

  setActive(v: boolean): void {
    this.active = v;
    this.drawBackground(false);
  }

  setLabel(text: string): void {
    this.label.text = text;
  }

  flashGlow(color: number, repeat = 2): void {
    gsap.fromTo(
      this.innerGlow,
      { alpha: 1 },
      { alpha: 0.2, duration: 0.32, repeat: repeat * 2, yoyo: true, ease: "sine.inOut" },
    );
    void color;
  }

  private drawBackground(hover: boolean): void {
    this.bg.clear();
    this.innerGlow.clear();
    const w = this.btnWidth;
    const h = this.btnHeight;
    const radius = 18;

    const colors = (() => {
      if (this.variant === "primary") {
        return hover
          ? { top: 0xffea7a, bot: 0xff7a18, stroke: 0xfff7d6, glow: 0xffd76a }
          : this.active
            ? { top: 0xffd76a, bot: 0xff5d8f, stroke: 0xffffff, glow: 0xff5d8f }
            : { top: 0xffd76a, bot: 0xff7a18, stroke: 0xfff7d6, glow: 0xffe066 };
      }
      if (this.variant === "secondary") {
        return hover
          ? { top: 0x3a2070, bot: 0x6a48d8, stroke: 0xffe066, glow: 0xc6b8ff }
          : this.active
            ? { top: 0xffd76a, bot: 0x6a48d8, stroke: 0xffffff, glow: 0xffd76a }
            : { top: 0x2a1656, bot: 0x4a2a9e, stroke: 0x9ad2ff, glow: 0x6a48d8 };
      }
      if (this.variant === "danger") {
        return hover
          ? { top: 0xff7676, bot: 0xa61b1b, stroke: 0xffe6e6, glow: 0xff8080 }
          : this.active
            ? { top: 0xff8080, bot: 0x801010, stroke: 0xffffff, glow: 0xff5050 }
            : { top: 0x6a1818, bot: 0x3a0a0a, stroke: 0xff8080, glow: 0xa61b1b };
      }
      return hover
        ? { top: 0x1a1030, bot: 0x2a1656, stroke: 0xffd76a, glow: 0x6a48d8 }
        : { top: 0x0a0418, bot: 0x140628, stroke: 0x6a48d8, glow: 0x4a2a9e };
    })();

    this.bg.beginFill(colors.top, 1);
    this.bg.lineStyle({ width: 2, color: colors.stroke, alignment: 0 });
    this.bg.drawRoundedRect(0, 0, w, h, radius);
    this.bg.endFill();

    this.bg.beginFill(colors.bot, 0.55);
    this.bg.drawRoundedRect(2, h * 0.5, w - 4, h * 0.5 - 2, radius - 6);
    this.bg.endFill();

    this.innerGlow.beginFill(colors.glow, 0.18);
    this.innerGlow.drawRoundedRect(-6, -6, w + 12, h + 12, radius + 6);
    this.innerGlow.endFill();
    if (this.variant === "primary") {
      this.innerGlow.beginFill(colors.glow, 0.08);
      this.innerGlow.drawRoundedRect(-14, -14, w + 28, h + 28, radius + 12);
      this.innerGlow.endFill();
    }
  }
}

/**
 * Compact session stats panel: SPINS / NET / RTP / BIGGEST.
 * Sits above the bottom bar.
 */
class SessionStatsPanel extends Container {
  private readonly bg: Graphics;
  private readonly spins: Text;
  private readonly net: Text;
  private readonly rtp: Text;
  private readonly best: Text;
  public panelWidth = 460;
  public panelHeight = 44;

  constructor() {
    super();
    this.bg = new Graphics();
    this.addChild(this.bg);
    this.spins = this.makeText("SPINS 0");
    this.net = this.makeText("NET 0.00");
    this.rtp = this.makeText("RTP -%");
    this.best = this.makeText("BEST 0.00");
    this.addChild(this.spins, this.net, this.rtp, this.best);
    this.drawBg();
    this.layout();
  }

  private makeText(initial: string): Text {
    return new Text(
      initial,
      new TextStyle({
        fontFamily: "Georgia, serif",
        fontSize: 14,
        fontWeight: "700",
        fill: 0xffe066,
        letterSpacing: 2,
        align: "center",
      }),
    );
  }

  private drawBg(): void {
    this.bg.clear();
    this.bg.beginFill(0x05030a, 0.7);
    this.bg.lineStyle({ width: 1.5, color: 0x6a48d8, alpha: 0.55 });
    this.bg.drawRoundedRect(0, 0, this.panelWidth, this.panelHeight, 10);
    this.bg.endFill();
  }

  private layout(): void {
    const cols = [this.spins, this.net, this.rtp, this.best];
    const cellW = this.panelWidth / cols.length;
    for (let i = 0; i < cols.length; i++) {
      const t = cols[i]!;
      t.anchor.set(0.5);
      t.x = (i + 0.5) * cellW;
      t.y = this.panelHeight / 2;
    }
  }

  set(stats: SessionStats): void {
    this.spins.text = `SPINS ${stats.spins}`;
    const netSign = stats.net >= 0 ? "+" : "−";
    this.net.text = `NET ${netSign}${Math.abs(stats.net).toFixed(2)}`;
    this.rtp.text = `RTP ${stats.spins > 0 ? (stats.rtp * 100).toFixed(1) + "%" : "—"}`;
    this.best.text = `BEST ${stats.biggestWin.toFixed(2)}`;
  }
}

/** UIManager wires the bottom-bar buttons and their interactions. */
export class UIManager {
  public readonly root = new Container();
  public readonly buttons: UIButtons;
  private readonly bg: Graphics;
  private readonly autoplayLabel = "AUTOPLAY";
  private readonly stats: SessionStatsPanel;
  private readonly demoBadge: Text;
  private currentPreset: AutoplayPreset = 10;
  private currentLimits: AutoplayLimits = DEFAULT_AUTOPLAY_LIMITS;

  constructor(
    parent: Container,
    private readonly assets: AssetLoader,
    private readonly callbacks: UICallbacks,
    private readonly stageWidth: () => number,
    private readonly stageHeight: () => number,
  ) {
    this.bg = new Graphics();
    this.root.addChild(this.bg);
    parent.addChild(this.root);

    this.buttons = {
      spin: new PixiButton("SPIN", "primary", 200, 92, drawSpinIcon),
      autoplay: new PixiButton(this.autoplayLabel, "secondary", 170, 56, drawAutoIcon),
      autoplayPreset: new PixiButton("×10", "ghost", 70, 30),
      betMinus: new PixiButton("−", "secondary", 64, 64),
      betPlus: new PixiButton("+", "secondary", 64, 64),
      info: new PixiButton("i", "ghost", 56, 56, drawInfoIcon),
      reset: new PixiButton("RESET", "danger", 110, 44),
    };

    this.root.addChild(
      this.buttons.info,
      this.buttons.reset,
      this.buttons.betMinus,
      this.buttons.betPlus,
      this.buttons.autoplay,
      this.buttons.autoplayPreset,
      this.buttons.spin,
    );

    this.stats = new SessionStatsPanel();
    this.root.addChild(this.stats);

    this.demoBadge = new Text(
      "DEMO COINS",
      new TextStyle({
        fontFamily: "Georgia, serif",
        fontSize: 11,
        fontWeight: "700",
        fill: 0xffd76a,
        letterSpacing: 4,
      }),
    );
    this.demoBadge.anchor.set(0.5);
    this.root.addChild(this.demoBadge);

    this.buttons.spin.on("pointertap", () => callbacks.onSpin());
    this.buttons.autoplay.on("pointertap", () =>
      callbacks.onToggleAutoplay(this.currentPreset, this.currentLimits),
    );
    this.buttons.autoplayPreset.on("pointertap", () => {
      const idx = AUTOPLAY_PRESETS.indexOf(this.currentPreset);
      this.currentPreset = AUTOPLAY_PRESETS[(idx + 1) % AUTOPLAY_PRESETS.length]!;
      this.buttons.autoplayPreset.setLabel(`×${this.currentPreset}`);
    });
    this.buttons.betMinus.on("pointertap", () => callbacks.onBetChange(-1));
    this.buttons.betPlus.on("pointertap", () => callbacks.onBetChange(1));
    this.buttons.info.on("pointertap", () => callbacks.onShowInfo());
    this.buttons.reset.on("pointertap", () => callbacks.onResetBalance());
  }

  setSpinningState(spinning: boolean): void {
    this.buttons.spin.setEnabled(!spinning);
    this.buttons.betMinus.setEnabled(!spinning);
    this.buttons.betPlus.setEnabled(!spinning);
    this.buttons.autoplayPreset.setEnabled(!spinning);
    this.buttons.reset.setEnabled(!spinning);
    // AUTOPLAY itself remains clickable during a spin so the user can stop it.
  }

  setAutoplay(snapshot: AutoplaySnapshot): void {
    this.buttons.autoplay.setActive(snapshot.active);
    this.buttons.autoplay.setLabel(
      snapshot.active ? `STOP (${snapshot.remaining})` : this.autoplayLabel,
    );
  }

  setSessionStats(stats: SessionStats): void {
    this.stats.set(stats);
  }

  /** Pulse the RESET button to acknowledge a reset was applied. */
  flashReset(): void {
    this.buttons.reset.flashGlow(0xff5050, 3);
  }

  /** Visually flash the AUTOPLAY button to highlight an auto-stop reason. */
  flashAutoplayReason(reason: AutoplayStopReason): void {
    this.buttons.autoplay.flashGlow(0xffd76a, reason === "free-spins" ? 4 : 2);
  }

  resize(): void {
    const w = this.stageWidth();
    const h = this.stageHeight();
    const barHeight = 140;
    this.bg.clear();
    this.bg.beginFill(0x05030a, 0.78);
    this.bg.lineStyle({ width: 2, color: 0x6a48d8, alpha: 0.45, alignment: 0 });
    this.bg.drawRect(0, h - barHeight, w, barHeight);
    this.bg.endFill();

    const cy = h - barHeight / 2;
    this.buttons.spin.x = w / 2 - 100;
    this.buttons.spin.y = cy - 46;

    this.buttons.autoplay.x = this.buttons.spin.x + 220;
    this.buttons.autoplay.y = cy - 28;

    this.buttons.autoplayPreset.x = this.buttons.autoplay.x + 90 - 35;
    this.buttons.autoplayPreset.y = this.buttons.autoplay.y + 60;

    this.buttons.betMinus.x = this.buttons.spin.x - 84;
    this.buttons.betMinus.y = cy - 32;

    this.buttons.betPlus.x = this.buttons.spin.x + 200 + 20;
    this.buttons.betPlus.y = cy + 36;

    this.buttons.info.x = 32;
    this.buttons.info.y = cy - 28;

    this.buttons.reset.x = w - 32 - this.buttons.reset.btnWidth;
    this.buttons.reset.y = cy - 22;

    this.stats.x = (w - this.stats.panelWidth) / 2;
    this.stats.y = h - barHeight - this.stats.panelHeight - 16;

    this.demoBadge.x = w / 2;
    this.demoBadge.y = h - barHeight - this.stats.panelHeight - 36;
  }
}

function drawSpinIcon(g: Graphics, w: number, h: number): void {
  const cx = w - 38;
  const cy = h / 2;
  const r = 16;
  g.lineStyle({ width: 4, color: 0xffffff, alpha: 0.85 });
  for (let i = 0; i < 6; i++) {
    const a0 = (i / 6) * Math.PI * 2;
    const a1 = a0 + 0.5;
    g.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    g.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
  }
  g.lineStyle(0);
  g.beginFill(0xffffff, 0.85);
  g.drawPolygon([cx + r * 1.2, cy - 6, cx + r * 1.55, cy, cx + r * 1.2, cy + 6]);
  g.endFill();
}

function drawAutoIcon(g: Graphics, w: number, h: number): void {
  const cx = w - 26;
  const cy = h / 2;
  g.lineStyle({ width: 3, color: 0xffd76a, alpha: 0.9 });
  g.drawCircle(cx, cy, 12);
  g.beginFill(0xffd76a, 0.85);
  g.drawPolygon([cx - 4, cy - 6, cx + 6, cy, cx - 4, cy + 6]);
  g.endFill();
}

function drawInfoIcon(g: Graphics, w: number, h: number): void {
  const cx = w / 2;
  const cy = h / 2;
  g.lineStyle({ width: 2, color: 0xffe066, alpha: 0.85 });
  g.drawCircle(cx, cy, 18);
  g.lineStyle(0);
  g.beginFill(0xffe066);
  g.drawCircle(cx, cy - 6, 2.5);
  g.drawRect(cx - 2, cy - 2, 4, 14);
  g.endFill();
}

export { BlurFilter };
