// IMAGE VAULT EXTRACTOR (HARDENED + BINARY SAFE)
// Reads hidden vault appended after PNG safely
// Fixes / Features:
// ✅ marker search uses cached marker bytes (faster)
// ✅ vault slicing skips optional newline right after START
// ✅ supports multiple vault blocks (returns the LAST valid block by default)
// ✅ safer DEEP handling (won't throw if split missing)
// ✅ accepts URL OR Blob OR ArrayBuffer OR Uint8Array
// ✅ minimal console noise

const START = "MYRQAI_VAULT_START";
const END = "MYRQAI_VAULT_END";
const DEEP = "MYRQAI_VAULT_DEEP";

// cache marker bytes once
const enc = new TextEncoder();
const START_B = enc.encode(START);
const END_B = enc.encode(END);
const DEEP_B = enc.encode(DEEP); // (kept for parity, not required for includes())

/**
 * loadImageVault(source)
 * - source can be:
 *   - string URL (including blob: URL)
 *   - Blob
 *   - ArrayBuffer
 *   - Uint8Array
 *
 * Returns:
 *  - string (vault text) OR null
 */
export async function loadImageVault(source) {
  try {
    const bytes = await toBytes(source);
    if (!bytes || bytes.length === 0) return null;

    // We may have multiple vault blocks appended (e.g., repeated synthesis).
    // We'll scan and keep the LAST valid block.
    let scanFrom = 0;
    let lastText = null;

    while (scanFrom < bytes.length) {
      const startIndex = findMarker(bytes, START_B, scanFrom);
      if (startIndex === -1) break;

      // start right after START marker
      let vaultStart = startIndex + START_B.length;

      // skip common separators (newline / CR / space / tab) after marker
      while (vaultStart < bytes.length) {
        const b = bytes[vaultStart];
        if (b === 10 || b === 13 || b === 32 || b === 9) vaultStart++;
        else break;
      }

      const endIndex = findMarker(bytes, END_B, vaultStart);

      // If there is no END marker after this START, move scan forward and keep searching.
      // (Do NOT break: there might be another START later in corrupted/stacked blobs.)
      if (endIndex === -1) {
        scanFrom = startIndex + START_B.length;
        continue;
      }

      if (endIndex > vaultStart) {
        const hiddenBytes = bytes.slice(vaultStart, endIndex);

        let hiddenText = "";
        try {
          hiddenText = new TextDecoder("utf-8", { fatal: false })
            .decode(hiddenBytes)
            .trim();
        } catch {
          hiddenText = "";
        }

        if (hiddenText) lastText = hiddenText;
      }

      // continue scanning after this END marker in case there are more blocks
      scanFrom = endIndex + END_B.length;
    }

    if (!lastText) return null;

    // ===============================
    // DEEP VAULT DETECTION (optional)
    // ===============================
    // Keep it minimal, store deep layer for potential later features.
    if (lastText.includes(DEEP)) {
      const idx = lastText.indexOf(DEEP);
      const deep = lastText.slice(idx + DEEP.length).trim();
      if (deep) window.__VOID_DEEP_LAYER = deep;
    }

    return lastText;
  } catch (err) {
    console.log("🜏 Vault load error:", err);
    return null;
  }
}

/* ===============================
   OPTIONAL NOISE LAYER (future use)
================================ */
export function fakeLayer(canvas) {
  const ctx = canvas?.getContext?.("2d");
  if (!ctx) return;
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/* ===============================
   INTERNAL: convert input to Uint8Array
================================ */
async function toBytes(source) {
  if (!source) return null;

  // Uint8Array
  if (source instanceof Uint8Array) return source;

  // ArrayBuffer
  if (source instanceof ArrayBuffer) return new Uint8Array(source);

  // Blob/File
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    const ab = await source.arrayBuffer();
    return new Uint8Array(ab);
  }

  // URL string (including blob:)
  if (typeof source === "string") {
    const res = await fetch(source, { cache: "no-store" });
    if (!res.ok) {
      console.log("🜏 Image fetch failed:", res.status);
      return null;
    }
    const ab = await res.arrayBuffer();
    return new Uint8Array(ab);
  }

  return null;
}

/* ===============================
   MARKER SEARCH (binary safe)
   - markerBytes is Uint8Array (pre-encoded)
================================ */
function findMarker(bytes, markerBytes, offset = 0) {
  outer: for (let i = offset; i <= bytes.length - markerBytes.length; i++) {
    for (let j = 0; j < markerBytes.length; j++) {
      if (bytes[i + j] !== markerBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}