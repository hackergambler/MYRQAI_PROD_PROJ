// unlock.js (FIXED + HARDENED)
// - Strong DOM guards (avoids silent null crashes)
// - Normalizes messages to strings before decrypt
// - Better error reporting to UI (so you know what failed)
// - Sequential typewriter per message (no overlapping timers)

import { decryptMessage } from "../crypto.js";
import { API_BASE } from "../config.js";

const API = API_BASE;

let isUnlocking = false;
let lastUnlockTime = 0;

// ---------------- TYPEWRITER EFFECT (returns Promise) ----------------
function typeWriter(element, text, speed = 25) {
  return new Promise((resolve) => {
    if (!element) return resolve();
    let i = 0;
    element.innerText = "";
    const timer = setInterval(() => {
      if (i < text.length) {
        element.innerText += text.charAt(i);
        i++;
      } else {
        clearInterval(timer);
        resolve();
      }
    }, speed);
  });
}

// ---------------- UI HELPERS ----------------
function showResult(content, color = "#00ff41", isHtml = false) {
  const result = document.getElementById("result");
  const target = document.getElementById("typewriter-target");
  if (!result || !target) return;

  result.style.display = "block";
  result.style.borderColor = color;

  if (isHtml) {
    target.innerHTML = content;
  } else {
    target.style.color = color;
    // not awaited here; it's ok for single-line status
    typeWriter(target, `> ${content}`);
  }
}

function getEl(id) {
  return document.getElementById(id);
}

function normalizeMessages(data) {
  // Your worker returns: { found: true, messages: [...] }
  let messages = data?.messages ?? data?.data ?? [];
  if (!Array.isArray(messages)) messages = [messages];

  // Convert everything to string (decrypt expects string ciphertext)
  return messages
    .map((m) => {
      if (typeof m === "string") return m;
      if (m == null) return "";
      // If it was stored wrongly as object, at least make it visible/debuggable
      return String(m);
    })
    .filter((s) => s.length > 0);
}

// ---------------- UNLOCK FUNCTION ----------------
async function unlock() {
  if (isUnlocking) return;

  const now = Date.now();
  if (now - lastUnlockTime < 5000) {
    showResult("ERR: RATE_LIMIT_EXCEEDED. WAIT 5S.", "#ff003c");
    return;
  }
  lastUnlockTime = now;

  isUnlocking = true;

  const count = getEl("count");
  if (count) count.style.display = "none";

  const result = getEl("result");
  const target = getEl("typewriter-target");
  const keyInput = getEl("key");

  // Hard guard: required elements
  if (!result || !target || !keyInput) {
    // If IDs don't match your HTML, decrypt will "not work"
    console.error("Missing required elements:", {
      result: !!result,
      target: !!target,
      keyInput: !!keyInput,
    });
    showResult("ERR: UI_WIRING_MISSING (CHECK IDs).", "#ff003c");
    isUnlocking = false;
    return;
  }

  try {
    const key = keyInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,12}$/.test(key)) {
      showResult("ERR: INVALID_KEY_FORMAT.", "#ff003c");
      return;
    }

    showResult("SYS: ATTEMPTING_HANDSHAKE...", "#00ff41");

    const response = await fetch(`${API}/api/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      console.error("GET failed:", response.status, await response.text().catch(() => ""));
      showResult("ERR: REMOTE_HOST_DISCONNECT.", "#ff003c");
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      showResult("ERR: BAD_SERVER_RESPONSE.", "#ff003c");
      return;
    }

    if (!data.found) {
      showResult("ERR: DATA_NOT_FOUND_OR_EXPIRED.", "#ff003c");
      return;
    }

    const messages = normalizeMessages(data);

    // Clear previous results
    target.innerHTML = "";

    if (messages.length === 0) {
      showResult("ERR: EMPTY_PAYLOAD_FROM_SERVER.", "#ff003c");
      return;
    }

    // Decrypt sequentially (prevents overlapping typewriters)
    for (let i = 0; i < messages.length; i++) {
      const cipher = messages[i];

      // Create the box for each message
      const msgDiv = document.createElement("div");
      msgDiv.className = "msg-box";
      msgDiv.innerHTML = `<strong style="color:#00ff41;">[SECRET_MSG_${i + 1}]</strong><br><span class="text-body"></span>`;
      target.appendChild(msgDiv);

      const bodySpan = msgDiv.querySelector(".text-body");

      try {
        const decrypted = await decryptMessage(cipher, key);
        await typeWriter(bodySpan, decrypted, 25);
      } catch (err) {
        console.error("Decryption failed for message", i + 1, err);
        const errDiv = document.createElement("div");
        errDiv.className = "msg-box msg-error";
        // show a helpful hint
        errDiv.innerText =
          "ERR: DECRYPTION_FAILED (WRONG KEY OR CORRUPT DATA)";
        target.appendChild(errDiv);
      }
    }

    result.style.display = "block";

    if (count) {
      count.innerText = `[LOG]: ${messages.length} DATA_PACKETS_UNLOCKED`;
      count.style.display = "block";
    }
  } catch (err) {
    console.error("Unlock fatal:", err);
    showResult("ERR: FATAL_SYSTEM_ERROR.", "#ff003c");
  } finally {
    isUnlocking = false;
  }
}

// ---------------- INITIALIZATION ----------------
window.unlock = unlock;

document.addEventListener("DOMContentLoaded", () => {
  const unlockBtn = getEl("unlockBtn");
  if (unlockBtn) unlockBtn.addEventListener("click", unlock);
});

document.addEventListener("keydown", (e) => {
  const active = document.activeElement;
  if (e.key === "Enter" && active && active.id === "key") {
    unlock();
  }
});