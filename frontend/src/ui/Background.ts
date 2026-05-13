import { Container, Graphics, Sprite, BLEND_MODES, Ticker } from "pixi.js";
import type { AssetLoader } from "../assets/AssetLoader";

interface Mote {
  sprite: Sprite;
  vx: number;
  vy: number;
  baseScale: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

/** Animated dark-neon backdrop with slowly drifting golden motes. */
export class Background extends Container {
  private readonly bg = new Graphics();
  private readonly frame = new Graphics();
  private readonly motes: Mote[] = [];
  private readonly moteLayer = new Container();
  private readonly boundUpdate: (delta: number) => void;
  private ticker: Ticker | null = null;

  constructor(
    private readonly assets: AssetLoader,
    private readonly stageWidth: () => number,
    private readonly stageHeight: () => number,
  ) {
    super();
    this.addChild(this.bg);
    this.addChild(this.moteLayer);
    this.addChild(this.frame);
    // BLEND_MODES.ADD applies per-sprite below; layered into moteLayer for free.
    this.boundUpdate = this.update.bind(this);
  }

  attach(ticker: Ticker): void {
    if (this.ticker) return;
    ticker.add(this.boundUpdate);
    this.ticker = ticker;
  }

  resize(reelArea: { x: number; y: number; width: number; height: number }): void {
    const w = this.stageWidth();
    const h = this.stageHeight();

    this.bg.clear();
    this.bg.beginFill(0x07060f);
    this.bg.drawRect(0, 0, w, h);
    this.bg.endFill();
    // Radial-ish vignette via stacked translucent ovals.
    for (let i = 0; i < 4; i++) {
      const alpha = 0.18 - i * 0.04;
      const r = Math.max(w, h);
      this.bg.beginFill(0x1a0f2e, alpha);
      this.bg.drawEllipse(w / 2, h / 2, r * (0.55 + i * 0.1), r * (0.4 + i * 0.1));
      this.bg.endFill();
    }

    this.frame.clear();
    const pad = 24;
    this.frame.lineStyle({ width: 4, color: 0x6a48d8, alpha: 0.55, alignment: 0 });
    this.frame.beginFill(0x000000, 0);
    this.frame.drawRoundedRect(reelArea.x - pad, reelArea.y - pad, reelArea.width + pad * 2, reelArea.height + pad * 2, 24);
    this.frame.endFill();
    this.frame.lineStyle({ width: 2, color: 0xffd76a, alpha: 0.6, alignment: 0 });
    this.frame.drawRoundedRect(reelArea.x - pad + 6, reelArea.y - pad + 6, reelArea.width + (pad - 6) * 2, reelArea.height + (pad - 6) * 2, 18);

    // Refill motes if stage size has changed.
    if (this.motes.length === 0) this.seedMotes();
  }

  private seedMotes(): void {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const sprite = new Sprite(this.assets.getParticleTexture());
      sprite.anchor.set(0.5);
      sprite.tint = Math.random() < 0.7 ? 0xffe066 : 0xc6b8ff;
      sprite.blendMode = BLEND_MODES.ADD;
      sprite.x = Math.random() * this.stageWidth();
      sprite.y = Math.random() * this.stageHeight();
      const baseScale = 0.3 + Math.random() * 0.8;
      sprite.scale.set(baseScale);
      this.moteLayer.addChild(sprite);
      this.motes.push({
        sprite,
        vx: (Math.random() - 0.5) * 0.4,
        vy: -0.2 - Math.random() * 0.5,
        baseScale,
        twinkleSpeed: 0.5 + Math.random() * 2,
        twinklePhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private update(delta: number): void {
    const w = this.stageWidth();
    const h = this.stageHeight();
    const dt = delta / 60;
    for (const m of this.motes) {
      m.sprite.x += m.vx;
      m.sprite.y += m.vy;
      m.twinklePhase += m.twinkleSpeed * dt;
      m.sprite.alpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(m.twinklePhase));
      m.sprite.scale.set(m.baseScale * (0.85 + 0.3 * Math.sin(m.twinklePhase + 1.2)));
      if (m.sprite.y < -20) m.sprite.y = h + 20;
      if (m.sprite.y > h + 20) m.sprite.y = -20;
      if (m.sprite.x < -20) m.sprite.x = w + 20;
      if (m.sprite.x > w + 20) m.sprite.x = -20;
    }
  }
}
