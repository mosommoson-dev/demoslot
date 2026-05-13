import type { Payline } from './types';

/**
 * 20 paylines on a 5x3 grid.
 *
 * Rows are indexed 0=top, 1=middle, 2=bottom. Reels are indexed 0..4 left
 * to right. Each payline is a tuple of one row per reel — wins only count
 * if the same symbol lands on consecutive reels starting from reel 0.
 *
 * Lines 1..3: straight horizontals (the foundation of every classic line
 * slot).
 * Lines 4..5: top/bottom V-shapes.
 * Lines 6..20: zig-zags that cover the remaining row triplets the player
 * can visually trace; the exact set follows the conventional NetEnt-style
 * "20 lines" layout used in many commercial slots.
 */
export const PAYLINES: readonly Payline[] = [
  // 3 straight horizontals
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  // V and inverted V
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  // Zig-zags
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 2, 0, 2, 0],
] as const;
