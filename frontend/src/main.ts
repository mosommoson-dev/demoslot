import { Application } from "pixi.js";
import { GameScene } from "./GameScene";

async function boot(): Promise<void> {
  const root = document.getElementById("app");
  if (!root) throw new Error("#app element missing from index.html");

  const app = new Application({
    backgroundAlpha: 0,
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio,
    resizeTo: window,
  });

  // PixiJS v7 exposes the canvas via `app.view`.
  const canvas = app.view as HTMLCanvasElement;
  canvas.style.display = "block";
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  root.appendChild(canvas);

  const scene = new GameScene(app);
  scene.init();

  const onResize = (): void => scene.resize();
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  // Hide the boot loader.
  const boot = document.getElementById("boot");
  if (boot) boot.classList.add("hidden");

  // Expose for quick debugging in the browser console.
  (window as unknown as { __slot?: GameScene }).__slot = scene;
}

boot().catch((err) => {
  console.error("Failed to boot slot frontend", err);
  const boot = document.getElementById("boot");
  if (boot) boot.textContent = `Boot failed: ${err instanceof Error ? err.message : String(err)}`;
});
