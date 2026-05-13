import { Container, Sprite, BLEND_MODES, Ticker } from "pixi.js";
import type { AssetLoader } from "../assets/AssetLoader";

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  life: number;
  ttl: number;
  spin: number;
  startScale: number;
  endScale: number;
  startAlpha: number;
}

export interface ParticleBurstOptions {
  readonly x: number;
  readonly y: number;
  readonly count?: number;
  readonly color?: number;
  readonly speed?: number;
  readonly spread?: number;
  readonly ttl?: number;
  readonly gravity?: number;
  readonly startScale?: number;
  readonly endScale?: number;
}

/**
 * Lightweight CPU particle system. The sprites are pooled per-instance —
 * we never destroy them, just mark them inactive and reuse on the next
 * burst. This keeps free-spins or win celebrations allocation-free.
 */
export class ParticleSystem {
  private readonly layer = new Container();
  private readonly active: Particle[] = [];
  private readonly pool: Sprite[] = [];
  private boundUpdate: (delta: number) => void;
  private ticker: Ticker | null = null;

  constructor(parent: Container, private readonly assets: AssetLoader) {
    parent.addChild(this.layer);
    this.layer.sortableChildren = false;
    this.boundUpdate = this.update.bind(this);
  }

  attach(ticker: Ticker): void {
    if (this.ticker) return;
    ticker.add(this.boundUpdate);
    this.ticker = ticker;
  }

  detach(): void {
    if (this.ticker) {
      this.ticker.remove(this.boundUpdate);
      this.ticker = null;
    }
  }

  burst(opts: ParticleBurstOptions): void {
    const count = opts.count ?? 24;
    const color = opts.color ?? 0xffe066;
    const baseSpeed = opts.speed ?? 4;
    const spread = opts.spread ?? Math.PI * 2;
    const ttl = opts.ttl ?? 0.9;
    const gravity = opts.gravity ?? 0;
    const startScale = opts.startScale ?? 0.7;
    const endScale = opts.endScale ?? 0.05;

    for (let i = 0; i < count; i++) {
      const sprite = this.pool.pop() ?? this.createSprite();
      sprite.tint = color;
      sprite.alpha = 1;
      sprite.x = opts.x;
      sprite.y = opts.y;
      sprite.scale.set(startScale);
      this.layer.addChild(sprite);

      const angle =
        spread >= Math.PI * 2 - 0.01
          ? Math.random() * Math.PI * 2
          : -Math.PI / 2 + (Math.random() - 0.5) * spread;
      const speed = baseSpeed * (0.6 + Math.random() * 0.7);
      this.active.push({
        sprite,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - (gravity > 0 ? 0 : speed * 0.2),
        life: 0,
        ttl: ttl * (0.7 + Math.random() * 0.6),
        spin: (Math.random() - 0.5) * 0.4,
        startScale,
        endScale,
        startAlpha: 1,
      });
    }
  }

  private update(delta: number): void {
    const dt = delta / 60;
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i]!;
      p.life += dt;
      const t = p.life / p.ttl;
      if (t >= 1) {
        this.recycle(i);
        continue;
      }
      p.sprite.x += p.vx;
      p.sprite.y += p.vy;
      p.vy += 0.05;
      p.sprite.rotation += p.spin;
      const s = p.startScale + (p.endScale - p.startScale) * t;
      p.sprite.scale.set(s);
      p.sprite.alpha = (1 - t) * p.startAlpha;
    }
  }

  private recycle(index: number): void {
    const p = this.active[index]!;
    this.layer.removeChild(p.sprite);
    this.pool.push(p.sprite);
    this.active.splice(index, 1);
  }

  private createSprite(): Sprite {
    const s = new Sprite(this.assets.getParticleTexture());
    s.anchor.set(0.5);
    s.blendMode = BLEND_MODES.ADD;
    return s;
  }

  clear(): void {
    for (let i = this.active.length - 1; i >= 0; i--) {
      this.recycle(i);
    }
  }
}
