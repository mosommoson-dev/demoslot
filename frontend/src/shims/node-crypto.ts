/**
 * Browser-side shim for `node:crypto` so that the math-engine import
 * `import { webcrypto } from "node:crypto"` resolves to the host's
 * WebCrypto implementation. All modern browsers expose
 * `globalThis.crypto.getRandomValues`, which is the only API the math
 * engine needs.
 */
export const webcrypto = globalThis.crypto;
