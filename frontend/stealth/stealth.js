import { encryptMessage, decryptMessage } from "../crypto.js";

/* =============================
   ELEMENTS & CONFIG
============================= */
const canvas = document.getElementById("imageCanvas");
const ctx = canvas?.getContext("2d", { willReadFrequently: true });
if (canvas) canvas.style.display = "none";

const msgInput = document.getElementById("secretMessage");
const coverInput = document.getElementById("coverImageInput");
const capacityInfo = document.getElementById("capacityInfo");
const genBtn = document.getElementById("generateImageBtn");

const ABSOLUTE_MAX_CHARS = 100;
const MIN_DIMENSION = 256;

let currentImageValid = false;

/* =============================
   THEME COLORS (RED MODE)
   - OK now uses neon red (instead of green)
   - Error uses a deeper / alternate red for contrast
   - Pull from CSS variables if you have them
============================= */
function cssVar(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch {
    return fallback;
  }
}

const OK_COLOR = cssVar("--neon-red", "#ff003c");       // ✅ Success = neon red
const ERR_COLOR = cssVar("--danger-red", "#ff4d6d");    // ❌ Error = alternate red (still red theme)

/* =============================
   STATUS HELPERS
============================= */
function showStatus(id, msg, ok = false) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = "block";
  el.style.color = ok ? OK_COLOR : ERR_COLOR;
  el.innerText = msg;
}

// Typewriter effect for a "hacker" feel
function typeWriter(text, elementId) {
  const el = document.getElementById(elementId);
  if (!el) return;
  el.innerText = "";
  let i = 0;
  const interval = setInterval(() => {
    el.innerText += text.charAt(i);
    i++;
    if (i >= text.length) clearInterval(interval);
  }, 30);
}

function getPerimeterIndices(width, height) {
  const indices = [];
  for (let x = 0; x < width; x++) indices.push(x);
  for (let y = 1; y < height; y++) indices.push(y * width + (width - 1));
  for (let x = width - 2; x >= 0; x--) indices.push((height - 1) * width + x);
  for (let y = height - 2; y > 0; y--) indices.push(y * width);
  return indices;
}

/* =============================
   VALIDATION LOGIC
============================= */
async function validateEncryptionIntegrity(originalMessage, key, width, height) {
  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const pixels = imageData.data;
    const perimeter = getPerimeterIndices(width, height);
    const bytes = [];

    for (let i = 0; i < perimeter.length; i++) {
      const pixelIdx = perimeter[i] * 4;
      if (pixels[pixelIdx] === 56) {
        bytes.push(pixels[pixelIdx + 1]);
      }
    }

    const raw = new TextDecoder().decode(new Uint8Array(bytes));
    if (!raw.includes("###END###")) return false;

    const cleanJson = raw.split("###END###")[0];
    const payload = JSON.parse(atob(cleanJson));
    const decrypted = await decryptMessage(payload.msg, key);

    return decrypted === originalMessage;
  } catch (e) {
    console.error("Integrity Check Failed:", e);
    return false;
  }
}

/* =============================
   PNG UPLOAD & SIZE VALIDATION
============================= */
coverInput?.addEventListener("change", e => {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.type.includes("png")) {
    showStatus("encodeStatus", "Error: Only PNG images supported");
    e.target.value = "";
    currentImageValid = false;
    return;
  }

  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;

  img.onload = () => {
    if (img.width < MIN_DIMENSION || img.height < MIN_DIMENSION) {
      showStatus("encodeStatus", `Image too small. Minimum ${MIN_DIMENSION}x${MIN_DIMENSION} required.`);
      currentImageValid = false;
      if (capacityInfo) capacityInfo.style.display = "none";
    } else {
      showStatus("encodeStatus", "Image dimensions verified.", true);
      currentImageValid = true;
      if (capacityInfo) {
        capacityInfo.style.display = "block";
        capacityInfo.innerText = `Stealth Limit: ${ABSOLUTE_MAX_CHARS} characters (Perimeter Mode)`;
      }
    }

    if (typeof window.updateGenerateBtn === "function") {
      window.isImageSizeValid = currentImageValid;
      window.updateGenerateBtn();
    }
    URL.revokeObjectURL(url);
  };
});

/* =============================
   ENCODE LOGIC
============================= */
document.getElementById("generateImageBtn")?.addEventListener("click", async () => {
  const message = msgInput?.value?.trim() || "";
  const key = document.getElementById("secretKey")?.value?.trim()?.toUpperCase() || "";
  const file = coverInput?.files?.[0];
  const link = document.getElementById("downloadLink");

  if (link) link.style.display = "none";
  showStatus("encodeStatus", "🔄 Handshaking Secure Perimeter...", true);

  try {
    const encrypted = await encryptMessage(message, key);
    const payload = btoa(JSON.stringify({ msg: encrypted })) + "###END###";
    const bytes = new TextEncoder().encode(payload);

    const img = new Image();
    const url = URL.createObjectURL(file);
    img.src = url;

    img.onload = async () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;
      const perimeter = getPerimeterIndices(img.width, img.height);

      if (bytes.length > perimeter.length) {
        showStatus("encodeStatus", "Message exceeds perimeter capacity.");
        URL.revokeObjectURL(url);
        return;
      }

      for (let i = 0; i < bytes.length; i++) {
        const pixelIdx = perimeter[i] * 4;
        pixels[pixelIdx] = 56;
        pixels[pixelIdx + 1] = bytes[i];
      }
      ctx.putImageData(imageData, 0, 0);

      const isVerified = await validateEncryptionIntegrity(message, key, canvas.width, canvas.height);

      if (isVerified) {
        if (link) {
          link.href = canvas.toDataURL("image/png");
          link.download = "stealth_payload.png";
          link.style.display = "inline-block";
          link.innerText = "⬇ DOWNLOAD VERIFIED IMAGE";
        }
        showStatus("encodeStatus", "✅ STEALTH PAYLOAD READY", true);
      } else {
        showStatus("encodeStatus", "❌ COMPATIBILITY ERROR: Injection failed.");
      }

      URL.revokeObjectURL(url);
    };
  } catch (err) {
    showStatus("encodeStatus", "Encoding failed: System Error.");
  }
});

/* =============================
   DECODE LOGIC
============================= */
document.getElementById("extractBtn")?.addEventListener("click", async () => {
  const file = document.getElementById("imageInput")?.files?.[0];
  const key = document.getElementById("decodeKey")?.value?.trim()?.toUpperCase() || "";

  if (!file || !key) return;

  const img = new Image();
  const url = URL.createObjectURL(file);
  img.src = url;

  img.onload = async () => {
    try {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const perimeter = getPerimeterIndices(img.width, img.height);
      const bytes = [];

      for (let i = 0; i < perimeter.length; i++) {
        const pixelIdx = perimeter[i] * 4;
        if (pixels[pixelIdx] === 56) {
          bytes.push(pixels[pixelIdx + 1]);
        }
      }

      const raw = new TextDecoder().decode(new Uint8Array(bytes));
      if (!raw.includes("###END###")) {
        showStatus("decodeStatus", "No stealth data found.");
        return;
      }

      const cleanJson = raw.split("###END###")[0];
      const payload = JSON.parse(atob(cleanJson));
      const decrypted = await decryptMessage(payload.msg, key);

      const resultContainer = document.getElementById("decodedResult");
      if (resultContainer) resultContainer.style.display = "block";

      typeWriter(decrypted, "actualMessage");

      showStatus("decodeStatus", "✅ EXTRACTION COMPLETE", true);
    } catch (e) {
      showStatus("decodeStatus", "Error: Unauthorized Key or Corrupted IMAGE.");
    } finally {
      URL.revokeObjectURL(url);
    }
  };
});