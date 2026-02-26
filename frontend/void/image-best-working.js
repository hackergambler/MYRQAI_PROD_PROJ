// IMAGE VAULT EXTRACTOR (HARDENED + BINARY SAFE)
// Reads hidden vault appended after PNG safely
// Fixes:
// - marker search uses cached marker bytes (faster)
// - vault slicing skips optional newline right after START
// - supports multiple vault blocks (returns the LAST valid block by default)
// - safer DEEP handling (won't throw if split missing)
// - less console spam, consistent logs

const START = "MYRQAI_VAULT_START";
const END = "MYRQAI_VAULT_END";
const DEEP = "MYRQAI_VAULT_DEEP";

// cache marker bytes once
const enc = new TextEncoder();
const START_B = enc.encode(START);
const END_B = enc.encode(END);
const DEEP_B = enc.encode(DEEP);

export async function loadImageVault(imgPath) {
  try {
    const res = await fetch(imgPath, { cache: "no-store" });
    if (!res.ok) {
      console.log("🜏 Image fetch failed:", res.status);
      return null;
    }

    const bytes = new Uint8Array(await res.arrayBuffer());

    // We may have multiple vault blocks appended (e.g., repeated synthesis).
    // We'll scan and keep the LAST valid block.
    let scanFrom = 0;
    let lastText = null;

    while (true) {
      const startIndex = findMarker(bytes, START_B, scanFrom);
      if (startIndex === -1) break;

      // start right after START marker
      let vaultStart = startIndex + START_B.length;

      // skip common separators (newline / CR / space) after marker
      while (vaultStart < bytes.length) {
        const b = bytes[vaultStart];
        if (b === 10 || b === 13 || b === 32 || b === 9) vaultStart++;
        else break;
      }

      const endIndex = findMarker(bytes, END_B, vaultStart);
      if (endIndex === -1) {
        // no end marker for this start; stop scanning further
        break;
      }

      if (endIndex <= vaultStart) {
        scanFrom = startIndex + START_B.length;
        continue;
      }

      const hiddenBytes = bytes.slice(vaultStart, endIndex);

      let hiddenText = "";
      try {
        hiddenText = new TextDecoder("utf-8", { fatal: false })
          .decode(hiddenBytes)
          .trim();
      } catch (e) {
        console.log("🜏 Vault decode failed", e);
        scanFrom = endIndex + END_B.length;
        continue;
      }

      if (hiddenText) lastText = hiddenText;

      // continue scanning after this END marker in case there are more
      scanFrom = endIndex + END_B.length;
    }

    if (!lastText) {
      // keep logs minimal; vault not always present
      return null;
    }

    // ===============================
    // DEEP VAULT DETECTION (optional)
    // ===============================
    if (lastText.includes(DEEP)) {
      const idx = lastText.indexOf(DEEP);
      const deep = lastText.slice(idx + DEEP.length).trim();
      if (deep) {
        window.__VOID_DEEP_LAYER = deep;
        // (optional) console.log("🜏 Deep vault detected");
      }
    }

    // (optional) console.log("🜏 Vault extracted");
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