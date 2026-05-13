import { Container, Sprite, Text, TextStyle } from "pixi.js";
import { gsap } from "gsap";
import type { AssetLoader } from "../assets/AssetLoader";

export interface MeterValues {
  balance: number;
  bet: number;
  lastWin: number;
}

/**
 * WinDisplay renders the three readouts at the bottom of the cabinet:
 * BALANCE, BET, LAST WIN. It also exposes `showRoundWin(amount)` which
 * rolls the LAST WIN value up to the target with a counting animation.
 */
export class WinDisplay extends Container {
  private readonly balancePanel: Container;
  private readonly betPanel: Container;
  private readonly winPanel: Container;
  private readonly balanceText: Text;
  private readonly betText: Text;
  private readonly winText: Text;
  private readonly balanceLabel: Text;
  private readonly betLabel: Text;
  private readonly winLabel: Text;
  private state: MeterValues = { balance: 0, bet: 0, lastWin: 0 };
  private winTween: gsap.core.Tween | null = null;

  constructor(private readonly assets: AssetLoader) {
    super();
    this.balancePanel = this.createPanel("BALANCE", "0.00");
    this.betPanel = this.createPanel("BET", "0.00");
    this.winPanel = this.createPanel("LAST WIN", "0.00");
    this.addChild(this.balancePanel, this.betPanel, this.winPanel);

    this.balanceLabel = this.balancePanel.getChildAt(1) as Text;
    this.betLabel = this.betPanel.getChildAt(1) as Text;
    this.winLabel = this.winPanel.getChildAt(1) as Text;
    this.balanceText = this.balancePanel.getChildAt(2) as Text;
    this.betText = this.betPanel.getChildAt(2) as Text;
    this.winText = this.winPanel.getChildAt(2) as Text;
  }

  private createPanel(label: string, initial: string): Container {
    const c = new Container();
    const bg = new Sprite(this.assets.getPanelTexture());
    c.addChild(bg);
    const lbl = new Text(
      label,
      new TextStyle({
        fontFamily: "Georgia, serif",
        fontSize: 18,
        fontWeight: "700",
        fill: 0xffd76a,
        letterSpacing: 4,
        align: "center",
      }),
    );
    lbl.anchor.set(0.5, 0);
    lbl.x = bg.width / 2;
    lbl.y = 10;
    c.addChild(lbl);
    const value = new Text(
      initial,
      new TextStyle({
        fontFamily: "Impact, sans-serif",
        fontSize: 30,
        fontWeight: "900",
        fill: 0xffffff,
        stroke: 0x140628,
        strokeThickness: 3,
        align: "center",
      }),
    );
    value.anchor.set(0.5, 0);
    value.x = bg.width / 2;
    value.y = 36;
    c.addChild(value);
    return c;
  }

  setLayout(x: number, y: number, gap = 20): void {
    this.balancePanel.x = x;
    this.balancePanel.y = y;
    this.betPanel.x = x + this.balancePanel.width + gap;
    this.betPanel.y = y;
    this.winPanel.x = this.betPanel.x + this.betPanel.width + gap;
    this.winPanel.y = y;
  }

  /** Width of the entire three-panel readout. */
  get totalWidth(): number {
    return this.winPanel.x + this.winPanel.width - this.balancePanel.x;
  }

  setBalance(value: number): void {
    this.state.balance = value;
    this.balanceText.text = value.toFixed(2);
  }

  setBet(value: number): void {
    this.state.bet = value;
    this.betText.text = value.toFixed(2);
  }

  setLastWin(value: number): void {
    this.state.lastWin = value;
    this.winText.text = value.toFixed(2);
  }

  showRoundWin(amount: number): void {
    if (this.winTween) this.winTween.kill();
    const start = { v: 0 };
    this.winText.text = "0.00";
    this.winTween = gsap.to(start, {
      v: amount,
      duration: Math.min(0.35 + amount / 50, 2.2),
      ease: "power2.out",
      onUpdate: () => {
        this.winText.text = start.v.toFixed(2);
      },
      onComplete: () => {
        this.state.lastWin = amount;
        this.winText.text = amount.toFixed(2);
      },
    });
    gsap.fromTo(
      this.winLabel,
      { alpha: 1 },
      {
        alpha: 0.4,
        duration: 0.4,
        repeat: 3,
        yoyo: true,
        ease: "sine.inOut",
      },
    );
  }
}
