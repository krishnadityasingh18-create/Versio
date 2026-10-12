// @ts-check
// Browser (and Node 20+) SHA-256 via crypto.subtle. Returns lowercase 64-char hex.
// ponytail: runs on the main thread; files are ≤25 MB so the pause is short. Move to a Web Worker
// if hashing many large CAD files makes the editor stutter.

/**
 * @param {Blob | string} input  File/Blob bytes, or a string hashed as UTF-8.
 * @returns {Promise<string>}
 */
export async function sha256Hex(input) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : await input.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
