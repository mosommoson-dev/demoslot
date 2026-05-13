import { Application, Graphics, RenderTexture, Text, TextStyle, Container, BLEND_MODES } from "pixi.js";
import type { SymbolId } from "@math/types";
import { SYMBOL_STYLES, SymbolStyle } from "./symbols";

export interface SymbolTextureBundle {
  readonly id: SymbolId;
  readonly base: RenderTexture;
  readonly glow: RenderTexture;
  readonly tier: SymbolStyle["tier"];
}

/**
 * AssetLoader generates all visual assets procedurally with PIXI Graphics —
 * no external image files. Each symbol gets a "base" texture (used on the reel)
 * and a "glow" texture (used as an overlay when the symbol participates in a win).
 *
 * Textures are baked into RenderTextures at construction time so every reel
 * sprite is a cheap Sprite instead of a re-drawn Graphics each frame.
 */
export class AssetLoader {
  public readonly symbolSize: number;
  private readonly textures = new Map<SymbolId, SymbolTextureBundle>();
  private particleTexture: RenderTexture | null = null;
  private rayTexture: RenderTexture | null = null;
  private framePanelTexture: RenderTexture | null = null;

  constructor(private readonly app: Application, symbolSize = 150) {
    this.symbolSize = symbolSize;
  }

  /** Builds every symbol texture. Synchronous and fast (~1 ms per symbol). */
  build(): void {
    for (const style of Object.values(SYMBOL_STYLES)) {
      this.textures.set(style.id, this.bakeSymbol(style));
    }
    this.particleTexture = this.bakeParticle();
    this.rayTexture = this.bakeRay();
    this.framePanelTexture = this.bakePanel();
  }

  getSymbol(id: SymbolId): SymbolTextureBundle {
    const bundle = this.textures.get(id);
    if (!bundle) throw new Error(`AssetLoader: symbol ${id} not baked yet`);
    return bundle;
  }

  getParticleTexture(): RenderTexture {
    if (!this.particleTexture) throw new Error("AssetLoader: particle not baked");
    return this.particleTexture;
  }

  getRayTexture(): RenderTexture {
    if (!this.rayTexture) throw new Error("AssetLoader: ray not baked");
    return this.rayTexture;
  }

  getPanelTexture(): RenderTexture {
    if (!this.framePanelTexture) throw new Error("AssetLoader: panel not baked");
    return this.framePanelTexture;
  }

  /* ----------------------- private bake helpers --------------------------- */

  private bakeSymbol(style: SymbolStyle): SymbolTextureBundle {
    const size = this.symbolSize;
    const inner = size * 0.84;

    // Base sprite container.
    const root = new Container();

    // Tile background with subtle vignette.
    const bg = new Graphics();
    bg.beginFill(0x0e0a1c, 0.95);
    bg.lineStyle({ width: 2, color: 0x312251, alpha: 0.9 });
    bg.drawRoundedRect(0, 0, size, size, 18);
    bg.endFill();
    // Inner glow stripe.
    bg.beginFill(style.primary, 0.06);
    bg.drawRoundedRect(6, 6, size - 12, size - 12, 14);
    bg.endFill();
    root.addChild(bg);

    const art = new Graphics();
    art.x = size / 2;
    art.y = size / 2;
    this.drawShape(art, style, inner);
    root.addChild(art);

    if (style.tier !== "WILD" && style.tier !== "SCATTER") {
      const label = new Text(style.label, this.symbolLabelStyle(style));
      label.anchor.set(0.5);
      label.x = size / 2;
      label.y = size - 18;
      root.addChild(label);
    } else {
      const label = new Text(style.label, this.specialLabelStyle(style));
      label.anchor.set(0.5);
      label.x = size / 2;
      label.y = size - 16;
      root.addChild(label);
    }

    const base = RenderTexture.create({ width: size, height: size, resolution: this.app.renderer.resolution });
    this.app.renderer.render(root, { renderTexture: base });
    root.destroy({ children: true });

    // Glow overlay — bright duplicate of the shape, additively blended.
    const glowRoot = new Container();
    const halo = new Graphics();
    halo.beginFill(style.primary, 0.45);
    halo.drawCircle(size / 2, size / 2, size * 0.55);
    halo.endFill();
    halo.blendMode = BLEND_MODES.ADD;
    glowRoot.addChild(halo);

    const glowArt = new Graphics();
    glowArt.x = size / 2;
    glowArt.y = size / 2;
    glowArt.blendMode = BLEND_MODES.ADD;
    this.drawShape(glowArt, { ...style, primary: style.accent }, inner * 1.05);
    glowRoot.addChild(glowArt);

    const glow = RenderTexture.create({ width: size, height: size, resolution: this.app.renderer.resolution });
    this.app.renderer.render(glowRoot, { renderTexture: glow });
    glowRoot.destroy({ children: true });

    return { id: style.id, base, glow, tier: style.tier };
  }

  private drawShape(g: Graphics, style: SymbolStyle, size: number): void {
    const half = size / 2;
    switch (style.shape) {
      case "diamond":
        this.drawGem(g, size, [
          [0, -half],
          [half * 0.85, 0],
          [0, half],
          [-half * 0.85, 0],
        ], style);
        break;
      case "ruby":
        this.drawGem(g, size, [
          [-half * 0.5, -half * 0.6],
          [half * 0.5, -half * 0.6],
          [half * 0.8, half * 0.1],
          [0, half * 0.85],
          [-half * 0.8, half * 0.1],
        ], style);
        break;
      case "emerald":
        this.drawGem(g, size, [
          [-half * 0.55, -half * 0.5],
          [half * 0.55, -half * 0.5],
          [half * 0.7, half * 0.05],
          [half * 0.4, half * 0.6],
          [-half * 0.4, half * 0.6],
          [-half * 0.7, half * 0.05],
        ], style);
        break;
      case "sapphire":
        this.drawGem(g, size, [
          [0, -half * 0.95],
          [half * 0.85, -half * 0.2],
          [half * 0.55, half * 0.7],
          [-half * 0.55, half * 0.7],
          [-half * 0.85, -half * 0.2],
        ], style);
        break;
      case "heart":
        this.drawHeart(g, size, style);
        break;
      case "spade":
        this.drawSpade(g, size, style);
        break;
      case "club":
        this.drawClub(g, size, style);
        break;
      case "diamondCard":
        this.drawCardDiamond(g, size, style);
        break;
      case "ten":
        this.drawTen(g, size, style);
        break;
      case "wild":
        this.drawWild(g, size, style);
        break;
      case "scatter":
        this.drawScatter(g, size, style);
        break;
    }
  }

  private drawGem(g: Graphics, size: number, vertices: ReadonlyArray<[number, number]>, style: SymbolStyle): void {
    const path: number[] = [];
    for (const [x, y] of vertices) {
      path.push(x, y);
    }
    g.lineStyle({ width: 3, color: style.accent, alpha: 0.9, alignment: 0 });
    g.beginFill(style.primary, 1);
    g.drawPolygon(path);
    g.endFill();

    // Inner facet (darker, smaller polygon)
    const inner = vertices.map(([x, y]) => [x * 0.55, y * 0.55] as [number, number]);
    const innerPath: number[] = [];
    for (const [x, y] of inner) innerPath.push(x, y);
    g.lineStyle({ width: 1.5, color: style.accent, alpha: 0.7, alignment: 0 });
    g.beginFill(style.secondary, 1);
    g.drawPolygon(innerPath);
    g.endFill();

    // Highlight spark
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.75);
    g.drawEllipse(-size * 0.15, -size * 0.2, size * 0.08, size * 0.04);
    g.endFill();
  }

  private drawHeart(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.45;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.secondary, alignment: 0 });
    g.moveTo(0, s * 0.85);
    g.bezierCurveTo(s * 1.3, s * 0.1, s * 0.7, -s * 1.2, 0, -s * 0.3);
    g.bezierCurveTo(-s * 0.7, -s * 1.2, -s * 1.3, s * 0.1, 0, s * 0.85);
    g.endFill();
    g.lineStyle(0);
    g.beginFill(0xffffff, 0.55);
    g.drawEllipse(-s * 0.45, -s * 0.4, s * 0.25, s * 0.12);
    g.endFill();
  }

  private drawSpade(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.42;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.secondary, alignment: 0 });
    g.moveTo(0, -s);
    g.bezierCurveTo(s * 1.3, -s * 0.1, s * 0.6, s * 0.9, 0, s * 0.3);
    g.bezierCurveTo(-s * 0.6, s * 0.9, -s * 1.3, -s * 0.1, 0, -s);
    g.endFill();
    g.beginFill(style.secondary, 1);
    g.drawPolygon([0, s * 0.2, s * 0.35, s * 0.95, -s * 0.35, s * 0.95]);
    g.endFill();
  }

  private drawClub(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.32;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.secondary, alignment: 0 });
    g.drawCircle(0, -s * 0.55, s * 0.7);
    g.drawCircle(-s * 0.7, s * 0.2, s * 0.7);
    g.drawCircle(s * 0.7, s * 0.2, s * 0.7);
    g.endFill();
    g.beginFill(style.secondary, 1);
    g.drawPolygon([0, s * 0.4, s * 0.45, s * 1.3, -s * 0.45, s * 1.3]);
    g.endFill();
  }

  private drawCardDiamond(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.45;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.secondary, alignment: 0 });
    g.drawPolygon([0, -s, s * 0.7, 0, 0, s, -s * 0.7, 0]);
    g.endFill();
    g.beginFill(0xffffff, 0.4);
    g.drawPolygon([0, -s * 0.55, s * 0.18, -s * 0.2, -s * 0.18, -s * 0.2]);
    g.endFill();
  }

  private drawTen(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.4;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.secondary, alignment: 0 });
    g.drawRoundedRect(-s, -s * 0.9, s * 2, s * 1.8, s * 0.4);
    g.endFill();
    g.beginFill(0xffffff, 0.25);
    g.drawRoundedRect(-s * 0.85, -s * 0.75, s * 1.7, s * 0.5, s * 0.25);
    g.endFill();
  }

  private drawWild(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.48;
    // Faceted starburst
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.accent, alignment: 0 });
    const points: number[] = [];
    const spokes = 10;
    for (let i = 0; i < spokes * 2; i++) {
      const angle = (i / (spokes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? s : s * 0.55;
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    g.drawPolygon(points);
    g.endFill();
    g.beginFill(style.secondary, 0.9);
    g.drawCircle(0, 0, s * 0.55);
    g.endFill();
    g.beginFill(0xffffff, 0.85);
    g.drawCircle(-s * 0.18, -s * 0.18, s * 0.18);
    g.endFill();
  }

  private drawScatter(g: Graphics, size: number, style: SymbolStyle): void {
    const s = size * 0.46;
    g.beginFill(style.primary, 1);
    g.lineStyle({ width: 3, color: style.accent, alignment: 0 });
    const points: number[] = [];
    const spokes = 6;
    for (let i = 0; i < spokes * 2; i++) {
      const angle = (i / (spokes * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? s : s * 0.4;
      points.push(Math.cos(angle) * r, Math.sin(angle) * r);
    }
    g.drawPolygon(points);
    g.endFill();
    g.beginFill(style.secondary, 0.9);
    g.drawCircle(0, 0, s * 0.35);
    g.endFill();
    g.beginFill(0xffffff, 0.85);
    g.drawCircle(-s * 0.1, -s * 0.1, s * 0.12);
    g.endFill();
  }

  private bakeParticle(): RenderTexture {
    const g = new Graphics();
    const size = 24;
    g.beginFill(0xffffff, 1);
    g.drawCircle(size / 2, size / 2, size / 2);
    g.endFill();
    const tex = RenderTexture.create({ width: size, height: size, resolution: this.app.renderer.resolution });
    this.app.renderer.render(g, { renderTexture: tex });
    g.destroy();
    return tex;
  }

  private bakeRay(): RenderTexture {
    const width = 320;
    const height = 24;
    const g = new Graphics();
    for (let i = 0; i < 12; i++) {
      const a = 1 - i / 12;
      g.beginFill(0xffe066, a * 0.5);
      g.drawRect(0, (height / 2) - (height / 2) * (1 - i / 12), width, height * (1 - i / 12));
      g.endFill();
    }
    g.beginFill(0xffffff, 0.95);
    g.drawRoundedRect(0, height / 2 - 3, width, 6, 3);
    g.endFill();
    const tex = RenderTexture.create({ width, height, resolution: this.app.renderer.resolution });
    this.app.renderer.render(g, { renderTexture: tex });
    g.destroy();
    return tex;
  }

  private bakePanel(): RenderTexture {
    const w = 220;
    const h = 80;
    const g = new Graphics();
    g.beginFill(0x070414, 0.85);
    g.lineStyle({ width: 2, color: 0x6a48d8, alpha: 0.8 });
    g.drawRoundedRect(0, 0, w, h, 14);
    g.endFill();
    g.lineStyle({ width: 1, color: 0xffe066, alpha: 0.5 });
    g.drawRoundedRect(4, 4, w - 8, h - 8, 10);
    const tex = RenderTexture.create({ width: w, height: h, resolution: this.app.renderer.resolution });
    this.app.renderer.render(g, { renderTexture: tex });
    g.destroy();
    return tex;
  }

  private symbolLabelStyle(style: SymbolStyle): TextStyle {
    return new TextStyle({
      fontFamily: "Georgia, serif",
      fontSize: 18,
      fontWeight: "700",
      fill: [style.accent, style.primary],
      stroke: 0x000000,
      strokeThickness: 3,
      align: "center",
    });
  }

  private specialLabelStyle(style: SymbolStyle): TextStyle {
    return new TextStyle({
      fontFamily: "Impact, sans-serif",
      fontSize: style.id === "WILD" ? 22 : 18,
      fontWeight: "900",
      fill: [0xffffff, style.primary],
      stroke: style.secondary,
      strokeThickness: 4,
      letterSpacing: 2,
      align: "center",
    });
  }
}
