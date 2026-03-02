// frontend/secret/unlock.js (FIXED)
// ✅ Prevents scrambled output by canceling overlapping typewriter timers
// ✅ Uses a dedicated status line separate from decrypted message container
// ✅ Keeps your existing UI ids: result, typewriter-target, key, unlockBtn, count

import { decryptMessage } from "../crypto.js";
import { API_BASE } from "../config.js";

const API = API_BASE;

let isUnlocking = false;
let lastUnlockTime = 0;

// Track active typewriter timer per element (prevents overlap)
const TW = new WeakMap();

/** Cancel any running typewriter on element */
function cancelTypeWriter(el) {
  const t = TW.get(el);
  if (t) clearInterval(t);
  TW.delete(el);
}

/** Typewriter effect with cancel support */
function typeWriter(element, text, speed = 25) {
  return new Promise((resolve) => {
    if (!element) return resolve();

    cancelTypeWriter(element);

    let i = 0;
    element.textContent = "";

    const timer = setInterval(() => {
      if (i < text.length) {
        element.textContent += text.charAt(i++);
      } else {
        clearInterval(timer);
        TW.delete(element);
        resolve();
      }
    }, speed);

    TW.set(element, timer);
  });
}

// Ensure result contains separate status + messages containers
function ensureContainers() {
  const result = document.getElementById("result");
  const target = document.getElementById("typewriter-target");
  if (!result || !target) return null;

  // If target is used as the overall container, build inside it:
  // - status line (single line typed)
  // - messages area (boxes appended)
  let statusLine = document.getElementById("unlock-status");
  let msgArea = document.getElementById("unlock-messages");

  if (!statusLine || !msgArea) {
    target.innerHTML = `
      <div id="unlock-status" style="margin-bottom:10px;"></div>
      <div id="unlock-messages"></div>
    `;
    statusLine = document.getElementById("unlock-status");
    msgArea = document.getElementById("unlock-messages");
  }

  return { result, target, statusLine, msgArea };
}

function showStatus(text, color = "#00ff41") {
  const pack = ensureContainers();
  if (!pack) return;

  const { result, statusLine } = pack;

  result.style.display = "block";
  result.style.borderColor = color;

  statusLine.style.color = color;

  // type only the status line (never the whole target)
  return typeWriter(statusLine, `> ${text}`, 20);
}

function addErrorBox(msg) {
  const pack = ensureContainers();
  if (!pack) return;
  const { msgArea } = pack;

  const div = document.createElement("div");
  div.className = "msg-box msg-error";
  div.textContent = msg;
  msgArea.appendChild(div);
}

function addMsgBox(title, bodyText) {
  const pack = ensureContainers();
  if (!pack) return Promise.resolve();

  const { msgArea } = pack;

  const msgDiv = document.createElement("div");
  msgDiv.className = "msg-box";
  msgDiv.innerHTML = `<strong style="color:#00ff41;">${title}</strong><br><span class="text-body"></span>`;
  msgArea.appendChild(msgDiv);

  const bodySpan = msgDiv.querySelector(".text-body");
  return typeWriter(bodySpan, bodyText, 18);
}

function normalizeMessages(data) {
  let messages = data?.messages ?? data?.data ?? [];
  if (!Array.isArray(messages)) messages = [messages];
  return messages
    .map((m) => (typeof m === "string" ? m : m == null ? "" : String(m)))
    .filter((s) => s.length > 0);
}

// ---------------- UNLOCK FUNCTION ----------------
async function unlock() {
  if (isUnlocking) return;

  const now = Date.now();
  if (now - lastUnlockTime < 5000) {
    await showStatus("ERR: RATE_LIMIT_EXCEEDED. WAIT 5S.", "#ff003c");
    return;
  }
  lastUnlockTime = now;
  isUnlocking = true;

  const count = document.getElementById("count");
  if (count) count.style.display = "none";

  const keyInput = document.getElementById("key");
  if (!keyInput) {
    isUnlocking = false;
    return;
  }

  try {
    // Prepare UI containers early and cancel any running writers
    const pack = ensureContainers();
    if (!pack) return;

    const { statusLine, msgArea } = pack;
    cancelTypeWriter(statusLine);

    // Clear previous message boxes only (leave status line separate)
    msgArea.innerHTML = "";

    const key = keyInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,12}$/.test(key)) {
      await showStatus("ERR: INVALID_KEY_FORMAT.", "#ff003c");
      return;
    }

    await showStatus("SYS: ATTEMPTING_HANDSHAKE...", "#00ff41");

    const response = await fetch(`${API}/api/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    if (!response.ok) {
      await showStatus("ERR: REMOTE_HOST_DISCONNECT.", "#ff003c");
      return;
    }

    const data = await response.json().catch(() => null);
    if (!data) {
      await showStatus("ERR: BAD_SERVER_RESPONSE.", "#ff003c");
      return;
    }

    if (!data.found) {
      await showStatus("ERR: DATA_NOT_FOUND_OR_EXPIRED.", "#ff003c");
      return;
    }

    const messages = normalizeMessages(data);
    if (messages.length === 0) {
      await showStatus("ERR: EMPTY_PAYLOAD_FROM_SERVER.", "#ff003c");
      return;
    }

    await showStatus(`SYS: ${messages.length} PACKET(S) RECEIVED. DECRYPTING...`, "#00ff41");

    for (let i = 0; i < messages.length; i++) {
      const cipher = messages[i];

      // AES format quick check: must contain dot
      if (typeof cipher !== "string" || !cipher.includes(".")) {
        addErrorBox(`ERR: NOT_AES_FORMAT (PACKET_${i + 1})`);
        continue;
      }

      try {
        const decrypted = await decryptMessage(cipher, key);
        await addMsgBox(`[SECRET_MSG_${i + 1}]`, decrypted);
      } catch (err) {
        console.error("Decrypt failed:", err);
        addErrorBox(`ERR: DECRYPTION_FAILED (PACKET_${i + 1})`);
      }
    }

    if (count) {
      count.innerText = `[LOG]: ${messages.length} DATA_PACKETS_UNLOCKED`;
      count.style.display = "block";
    }

    await showStatus("SYS: DECRYPT_SEQUENCE_COMPLETE.", "#00ff41");
  } catch (err) {
    console.error("Unlock fatal:", err);
    await showStatus("ERR: FATAL_SYSTEM_ERROR.", "#ff003c");
  } finally {
    isUnlocking = false;
  }
}

// ---------------- INITIALIZATION ----------------
window.unlock = unlock;

document.addEventListener("DOMContentLoaded", () => {
  const unlockBtn = document.getElementById("unlockBtn");
  if (unlockBtn) unlockBtn.addEventListener("click", unlock);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && document.activeElement && document.activeElement.id === "key") {
    unlock();
  }
});