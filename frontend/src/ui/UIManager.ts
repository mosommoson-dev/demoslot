import { Container, Graphics, Sprite, Text, TextStyle, BlurFilter } from "pixi.js";
import { gsap } from "gsap";
import type { AssetLoader } from "../assets/AssetLoader";

export interface UIButtons {
  spin: PixiButton;
  autoplay: PixiButton;
  betMinus: PixiButton;
  betPlus: PixiButton;
  info: PixiButton;
}

export interface UICallbacks {
  onSpin(): void;
  onToggleAutoplay(): void;
  onBetChange(delta: number): void;
  onShowInfo(): void;
}

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
    private readonly variant: "primary" | "secondary" | "ghost" = "secondary",
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

/** UIManager wires the bottom-bar buttons and their interactions. */
export class UIManager {
  public readonly root = new Container();
  public readonly buttons: UIButtons;
  private readonly bg: Graphics;
  private readonly autoplayLabel = "AUTOPLAY";

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
      autoplay: new PixiButton(this.autoplayLabel, "secondary", 170, 64, drawAutoIcon),
      betMinus: new PixiButton("−", "secondary", 64, 64),
      betPlus: new PixiButton("+", "secondary", 64, 64),
      info: new PixiButton("i", "ghost", 56, 56, drawInfoIcon),
    };

    this.root.addChild(
      this.buttons.info,
      this.buttons.betMinus,
      this.buttons.betPlus,
      this.buttons.autoplay,
      this.buttons.spin,
    );

    this.buttons.spin.on("pointertap", () => callbacks.onSpin());
    this.buttons.autoplay.on("pointertap", () => callbacks.onToggleAutoplay());
    this.buttons.betMinus.on("pointertap", () => callbacks.onBetChange(-1));
    this.buttons.betPlus.on("pointertap", () => callbacks.onBetChange(1));
    this.buttons.info.on("pointertap", () => callbacks.onShowInfo());
  }

  setSpinningState(spinning: boolean): void {
    this.buttons.spin.setEnabled(!spinning);
    this.buttons.betMinus.setEnabled(!spinning);
    this.buttons.betPlus.setEnabled(!spinning);
  }

  setAutoplayActive(active: boolean): void {
    this.buttons.autoplay.setActive(active);
    this.buttons.autoplay.setLabel(active ? "STOP" : this.autoplayLabel);
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
    this.buttons.autoplay.y = cy - 32;

    this.buttons.betMinus.x = this.buttons.spin.x - 84;
    this.buttons.betMinus.y = cy - 32;

    this.buttons.betPlus.x = this.buttons.spin.x + 200 + 20;
    this.buttons.betPlus.y = cy + 36;

    this.buttons.info.x = 32;
    this.buttons.info.y = cy - 28;
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

// BlurFilter is re-exported here so we don't have to depend on the renderer
// for the import — useful for unit tests that mock the canvas.
export { BlurFilter };
