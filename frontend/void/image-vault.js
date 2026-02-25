// IMAGE VAULT EXTRACTOR (FIXED + BINARY SAFE)
// Reads hidden vault appended after PNG safely

export async function loadImageVault(imgPath) {
  try {
    const res = await fetch(imgPath, { cache: "no-store" });

    if (!res.ok) {
      console.log("🜏 Image fetch failed:", res.status);
      return null;
    }

    const buffer = await res.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    const START = "MYRQAI_VAULT_START";
    const END = "MYRQAI_VAULT_END";
    const DEEP = "MYRQAI_VAULT_DEEP";

    // ✅ Find START
    const startIndex = findMarker(bytes, START, 0);
    if (startIndex === -1) {
      console.log("🜏 No vault start marker");
      return null;
    }

    // ✅ Find END only AFTER START (critical fix)
    const vaultStart = startIndex + START.length;
    const endIndex = findMarker(bytes, END, vaultStart);

    if (endIndex === -1) {
      console.log("🜏 No vault end marker (corrupt or not synthesized)");
      return null;
    }

    const vaultEnd = endIndex;

    if (vaultEnd <= vaultStart) {
      console.log("🜏 Vault marker corrupted (end before start)");
      return null;
    }

    const hiddenBytes = bytes.slice(vaultStart, vaultEnd);

    let hiddenText = "";
    try {
      hiddenText = new TextDecoder("utf-8", { fatal: false })
        .decode(hiddenBytes)
        .trim();
    } catch (e) {
      console.log("🜏 Vault decode failed", e);
      return null;
    }

    if (!hiddenText) {
      console.log("🜏 Empty vault");
      return null;
    }

    console.log("🜏 Vault extracted");

    /* ===============================
       DEEP VAULT DETECTION
    =============================== */

    if (hiddenText.includes(DEEP)) {
      const deep = hiddenText.split(DEEP)[1]?.trim();
      if (deep) {
        window.__VOID_DEEP_LAYER = deep;
        console.log("🜏 Deep vault detected");
      }
    }

    return hiddenText;
  } catch (err) {
    console.log("🜏 Vault load error:", err);
    return null;
  }
}

/* ===============================
   OPTIONAL NOISE LAYER (future use)
================================ */

export function fakeLayer(canvas) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(0,0,0,0.02)";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  console.log("🜏 Noise layer detected");
}

/* ===============================
   MARKER SEARCH (binary safe)
   - Adds offset so END search starts AFTER START
================================ */

function findMarker(bytes, marker, offset = 0) {
  const markerBytes = new TextEncoder().encode(marker);

  outer: for (let i = offset; i <= bytes.length - markerBytes.length; i++) {
    for (let j = 0; j < markerBytes.length; j++) {
      if (bytes[i + j] !== markerBytes[j]) continue outer;
    }
    return i;
  }
  return -1;
}