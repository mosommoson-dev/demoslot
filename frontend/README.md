# Slot Frontend — PixiJS v7 + TypeScript + GSAP

Visual layer for the 5 × 3 slot. Runs entirely in the browser, talks to the
math engine in `../src` for every spin, and uses no external image assets —
all symbol artwork is generated procedurally with `Graphics`.

## Quick start

```bash
cd frontend
npm install
npm run dev      # vite dev server on http://localhost:5173
npm run build    # tsc strict + vite build → frontend/dist
npm run preview  # serve the built bundle
```

The `tsc --noEmit` strict pass runs as part of `npm run build`, including the
math engine sources (the frontend extends its own `tsconfig.json` to also
type-check `../src/**/*.ts`).

## Architecture

```
frontend/src/
├── main.ts                    Bootstraps PIXI.Application, mounts GameScene
├── GameScene.ts               Orchestrator — owns reels, UI, integrates SlotEngine
├── shims/node-crypto.ts       Vite alias target — replaces `node:crypto`
│                              import in the math engine with browser WebCrypto
├── assets/
│   ├── symbols.ts             Per-symbol style + shape descriptors
│   └── AssetLoader.ts         Bakes all textures into RenderTextures at boot
├── engine/
│   ├── SymbolRenderer.ts      One cell — playIdle/playWin/playLand
│   ├── ReelRenderer.ts        One reel — startSpin / stop(target) with blur, ease, bounce
│   ├── AnimationManager.ts    Win highlighting, payline reveal, BIG/MEGA/EPIC WIN, FS intro
│   └── ParticleSystem.ts      Pooled additive sprites for scatter & big-win bursts
└── ui/
    ├── Background.ts          Animated neon backdrop with drifting motes + frame
    ├── PaylineRenderer.ts     Animated polyline draw across winning positions
    ├── WinDisplay.ts          BALANCE / BET / LAST WIN readout panels (PIXI text)
    └── UIManager.ts           PixiButton + bottom-bar (SPIN, AUTOPLAY, BET ±, INFO)
```

### Why a Vite alias for `node:crypto`?

`src/rng.ts` imports `webcrypto` from `node:crypto`. Browsers don't have
that import, so `frontend/vite.config.ts` and `tsconfig.json` map
`node:crypto` → `src/shims/node-crypto.ts`, which simply re-exports
`globalThis.crypto`. The math engine source code is untouched; both the
Node test runner and the browser bundle satisfy the same import.

## Pipeline of one spin

```
UIManager.SPIN click
    → GameScene.handleSpin
    → SlotEngine.playRound(bet)          (math; deterministic given RNG)
    → for each reel: ReelRenderer.startSpin
    → 600 + 150*i ms later: ReelRenderer.stop({ target })
        - swaps target column into the upcoming strip
        - tweens with back.out(1.6) (ease-out + slight bounce)
        - blur ramps 0 → 8 on start, back to 0 on stop
    → all reels resolved → AnimationManager.showWin
        - winning cells: SymbolRenderer.playWin (pulse + additive glow)
        - PaylineRenderer reveals each line in sequence
        - WinDisplay rolls the LAST WIN counter
        - if multiplier >= 10x bet → BIG/MEGA/EPIC WIN overlay + particles
    → if scatter triggered free spins → run FreeSpinSession + overlay intro
```

The math engine returns the full `RoundResult` synchronously before any
animation begins — the visual layer is purely a replay over that result.
This is exactly the architecture every certified slot uses: math is
auditable in isolation; the animation is a pure function of the
evaluation result.
