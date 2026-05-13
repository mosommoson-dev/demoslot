/**
 * Tiny namespaced debug logger. Inspired by the `debug` npm package but with
 * zero runtime dependencies. Categories are enabled via
 *
 *     localStorage.debug = "slot:*"          // enable everything
 *     localStorage.debug = "slot:fsm,slot:spin"  // selective
 *     localStorage.debug = ""                // off (default)
 *
 * Or programmatically:
 *
 *     Logger.setPattern("slot:*")
 *     Logger.setPattern(null)
 *
 * Each log line includes a high-resolution timestamp (`performance.now`)
 * and the namespace, so timing windows are visible in the console.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const colors: Record<string, string> = {
  "slot:fsm": "#ffd76a",
  "slot:spin": "#9ad2ff",
  "slot:autoplay": "#ff9ad2",
  "slot:wallet": "#9aff9a",
  "slot:history": "#c6b8ff",
  "slot:scene": "#ff9a9a",
  "slot:ui": "#ffe066",
};

function defaultColor(ns: string): string {
  if (colors[ns]) return colors[ns];
  let h = 0;
  for (const ch of ns) h = (h * 31 + ch.charCodeAt(0)) & 0xffff;
  return `hsl(${h % 360}, 70%, 70%)`;
}

let pattern: RegExp | null = null;
let printers: Record<LogLevel, (...a: unknown[]) => void> = {
  debug: console.debug.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

function patternFromString(spec: string | null | undefined): RegExp | null {
  if (!spec) return null;
  // Convert "slot:*,slot:spin" into a single regex.
  const parts = spec
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*"));
  if (parts.length === 0) return null;
  return new RegExp(`^(?:${parts.join("|")})$`);
}

function init(): void {
  try {
    if (typeof localStorage !== "undefined") {
      pattern = patternFromString(localStorage.getItem("debug"));
    }
  } catch {
    /* SSR / sandboxed env */
  }
}
init();

export class Logger {
  static setPattern(spec: string | null): void {
    pattern = patternFromString(spec);
    try {
      if (typeof localStorage !== "undefined") {
        if (spec) localStorage.setItem("debug", spec);
        else localStorage.removeItem("debug");
      }
    } catch {
      /* no-op */
    }
  }

  static enabled(namespace: string): boolean {
    return pattern !== null && pattern.test(namespace);
  }

  static setPrinter(level: LogLevel, fn: (...a: unknown[]) => void): void {
    printers[level] = fn;
  }

  static of(namespace: string): NsLogger {
    return new NsLogger(namespace);
  }
}

export class NsLogger {
  constructor(private readonly ns: string) {}

  private write(level: LogLevel, msg: string, payload?: unknown): void {
    if (!Logger.enabled(this.ns)) return;
    const t = performance.now().toFixed(1);
    const color = defaultColor(this.ns);
    const args: unknown[] = [
      `%c${this.ns} %c+${t}ms`,
      `color:${color};font-weight:600`,
      "color:#888",
      msg,
    ];
    if (payload !== undefined) args.push(payload);
    printers[level](...args);
  }

  debug(msg: string, payload?: unknown): void {
    this.write("debug", msg, payload);
  }
  info(msg: string, payload?: unknown): void {
    this.write("info", msg, payload);
  }
  warn(msg: string, payload?: unknown): void {
    this.write("warn", msg, payload);
  }
  error(msg: string, payload?: unknown): void {
    this.write("error", msg, payload);
  }
}
