import type { SymbolId } from "@math/types";

export interface SymbolStyle {
  readonly id: SymbolId;
  readonly label: string;
  readonly tier: "WILD" | "SCATTER" | "HIGH" | "LOW";
  readonly primary: number;
  readonly secondary: number;
  readonly accent: number;
  readonly shape:
    | "diamond"
    | "ruby"
    | "emerald"
    | "sapphire"
    | "heart"
    | "spade"
    | "club"
    | "diamondCard"
    | "ten"
    | "wild"
    | "scatter";
}

export const SYMBOL_STYLES: Record<SymbolId, SymbolStyle> = {
  WILD: {
    id: "WILD",
    label: "WILD",
    tier: "WILD",
    primary: 0xffe066,
    secondary: 0xff5d8f,
    accent: 0xffffff,
    shape: "wild",
  },
  SCATTER: {
    id: "SCATTER",
    label: "SCATTER",
    tier: "SCATTER",
    primary: 0xffd76a,
    secondary: 0xff7a18,
    accent: 0xfff3c4,
    shape: "scatter",
  },
  A: {
    id: "A",
    label: "A",
    tier: "HIGH",
    primary: 0xffe066,
    secondary: 0xc9961c,
    accent: 0xfff7d6,
    shape: "diamond",
  },
  B: {
    id: "B",
    label: "B",
    tier: "HIGH",
    primary: 0xff5d6d,
    secondary: 0x8a1422,
    accent: 0xffd2d8,
    shape: "ruby",
  },
  C: {
    id: "C",
    label: "C",
    tier: "HIGH",
    primary: 0x4cffb3,
    secondary: 0x0e7a4a,
    accent: 0xd6ffe8,
    shape: "emerald",
  },
  D: {
    id: "D",
    label: "D",
    tier: "HIGH",
    primary: 0x7ab8ff,
    secondary: 0x1f4a8a,
    accent: 0xd0e4ff,
    shape: "sapphire",
  },
  E: {
    id: "E",
    label: "A",
    tier: "LOW",
    primary: 0xff86a8,
    secondary: 0xb22650,
    accent: 0xfff0f5,
    shape: "heart",
  },
  F: {
    id: "F",
    label: "K",
    tier: "LOW",
    primary: 0x9aa0ff,
    secondary: 0x2c2c66,
    accent: 0xe6e7ff,
    shape: "spade",
  },
  G: {
    id: "G",
    label: "Q",
    tier: "LOW",
    primary: 0x8effd8,
    secondary: 0x14624b,
    accent: 0xe8fff6,
    shape: "club",
  },
  H: {
    id: "H",
    label: "J",
    tier: "LOW",
    primary: 0xffc15a,
    secondary: 0x8a4c0e,
    accent: 0xfff0d2,
    shape: "diamondCard",
  },
  I: {
    id: "I",
    label: "10",
    tier: "LOW",
    primary: 0xc6b8ff,
    secondary: 0x3b2a7a,
    accent: 0xefe9ff,
    shape: "ten",
  },
};

export const ALL_SYMBOL_IDS: readonly SymbolId[] = [
  "WILD",
  "SCATTER",
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
];
