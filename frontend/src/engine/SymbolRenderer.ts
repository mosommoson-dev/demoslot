import { Container, Sprite, BLEND_MODES, Filter } from "pixi.js";
import { gsap } from "gsap";
import type { SymbolId } from "@math/types";
import { AssetLoader } from "../assets/AssetLoader";

/**
 * SymbolRenderer wraps a base sprite and a glow overlay for a single
 * symbol cell. The same container is reused across spins — we just swap
 * the texture instead of allocating a new sprite, which makes a long
 * autoplay session essentially allocation-free.
 */
export class SymbolRenderer extends Container {
  public symbolId: SymbolId;
  private base: Sprite;
  private glow: Sprite;
  private idleTween: gsap.core.Tween | null = null;
  private winTween: gsap.core.Tween | null = null;
  private readonly size: number;

  constructor(private readonly assets: AssetLoader, initial: SymbolId) {
    super();
    this.symbolId = initial;
    this.size = assets.symbolSize;
    const bundle = assets.getSymbol(initial);

    this.base = new Sprite(bundle.base);
    this.base.anchor.set(0.5);
    this.base.x = this.size / 2;
    this.base.y = this.size / 2;
    this.addChild(this.base);

    this.glow = new Sprite(bundle.glow);
    this.glow.anchor.set(0.5);
    this.glow.x = this.size / 2;
    this.glow.y = this.size / 2;
    this.glow.alpha = 0;
    this.glow.blendMode = BLEND_MODES.ADD;
    this.addChild(this.glow);
  }

  /** Swap to a new symbol with no animation (used during reel scroll). */
  setSymbol(id: SymbolId): void {
    if (id === this.symbolId) return;
    this.symbolId = id;
    const bundle = this.assets.getSymbol(id);
    this.base.texture = bundle.base;
    this.glow.texture = bundle.glow;
    this.stopWinAnimation();
    this.stopIdleAnimation();
    if (id === "WILD") this.startWildIdle();
    if (id === "SCATTER") this.startScatterIdle();
  }

  /** Play a small bounce when the reel lands on this row. */
  playLand(delay = 0): gsap.core.Tween {
    gsap.killTweensOf(this.base.scale);
    this.base.scale.set(1);
    return gsap.fromTo(
      this.base.scale,
      { x: 0.86, y: 1.18 },
      { x: 1, y: 1, duration: 0.32, ease: "elastic.out(1.1, 0.55)", delay },
    );
  }

  /** Win highlight: scale pulse + glow flash, infinite until stopped. */
  playWin(): void {
    this.stopWinAnimation();
    this.glow.alpha = 0;
    this.glow.scale.set(0.9);
    const tl = gsap.timeline({ repeat: -1, defaults: { ease: "sine.inOut" } });
    tl.to(this.glow, { alpha: 1, duration: 0.35 }, 0);
    tl.to(this.glow.scale, { x: 1.25, y: 1.25, duration: 0.45 }, 0);
    tl.to(this.base.scale, { x: 1.08, y: 1.08, duration: 0.35 }, 0);
    tl.to(this.glow, { alpha: 0.4, duration: 0.45 }, 0.45);
    tl.to(this.glow.scale, { x: 1.05, y: 1.05, duration: 0.45 }, 0.45);
    tl.to(this.base.scale, { x: 0.98, y: 0.98, duration: 0.45 }, 0.45);
    this.winTween = tl as unknown as gsap.core.Tween;
  }

  stopWinAnimation(): void {
    if (this.winTween) {
      this.winTween.kill();
      this.winTween = null;
    }
    this.glow.alpha = 0;
    this.glow.scale.set(1);
    this.base.scale.set(1);
  }

  /** Continuous idle animation. WILD pulses; SCATTER rotates. */
  playIdle(): void {
    if (this.symbolId === "WILD") this.startWildIdle();
    else if (this.symbolId === "SCATTER") this.startScatterIdle();
  }

  stopIdleAnimation(): void {
    if (this.idleTween) {
      this.idleTween.kill();
      this.idleTween = null;
    }
    this.base.rotation = 0;
    this.glow.alpha = 0;
  }

  /** Drop the symbol fully transparent (used when transitioning to free spins). */
  fadeOut(duration = 0.3): gsap.core.Tween {
    return gsap.to(this, { alpha: 0, duration });
  }

  fadeIn(duration = 0.3): gsap.core.Tween {
    return gsap.to(this, { alpha: 1, duration });
  }

  private startWildIdle(): void {
    this.stopIdleAnimation();
    this.glow.alpha = 0.0;
    const tl = gsap.timeline({ repeat: -1, yoyo: true, defaults: { ease: "sine.inOut" } });
    tl.to(this.glow, { alpha: 0.55, duration: 0.9 }, 0);
    tl.to(this.glow.scale, { x: 1.18, y: 1.18, duration: 0.9 }, 0);
    this.idleTween = tl as unknown as gsap.core.Tween;
  }

  private startScatterIdle(): void {
    this.stopIdleAnimation();
    this.glow.alpha = 0.25;
    const tl = gsap.timeline({ repeat: -1, defaults: { ease: "none" } });
    tl.to(this.base, { rotation: Math.PI * 2, duration: 4.5 }, 0);
    this.idleTween = tl as unknown as gsap.core.Tween;
  }

  destroySymbol(): void {
    this.stopIdleAnimation();
    this.stopWinAnimation();
    this.destroy({ children: true });
  }
}

export function createBlurFilter(strengthY: number): Filter | null {
  if (strengthY <= 0) return null;
  // PixiJS exposes BlurFilter via filters subpath; we import lazily in the
  // renderer to avoid bundling it eagerly here.
  return null;
}
