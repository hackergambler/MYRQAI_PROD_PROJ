// unlock.js
import { decryptMessage } from '../crypto.js';

const API = "https://myrqai-prod.tibco-tibco-8.workers.dev";
let isUnlocking = false;
let lastUnlockTime = 0;

// ---------------- TYPEWRITER EFFECT ----------------
function typeWriter(element, text, speed = 25) {
  let i = 0;
  element.innerText = "";
  const timer = setInterval(() => {
    if (i < text.length) {
      element.innerText += text.charAt(i);
      i++;
    } else {
      clearInterval(timer);
    }
  }, speed);
}

// ---------------- UI HELPERS ----------------
function showResult(content, color = "#00ff41", isHtml = false) {
  const result = document.getElementById("result");
  const target = document.getElementById("typewriter-target");
  if (!result || !target) return;

  result.style.display = "block";
  result.style.borderColor = color;
  
  if (isHtml) {
    // For HTML (decrypted messages), we bypass simple typewriter for the container
    // but the individual message divs will be handled below
    target.innerHTML = content;
  } else {
    // For simple system status messages
    target.style.color = color;
    typeWriter(target, `> ${content}`);
  }
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
  const count = document.getElementById("count");
  if (count) count.style.display = "none";

  try {
    const keyInput = document.getElementById("key");
    const key = keyInput.value.trim().toUpperCase();

    if (!/^[A-Z0-9]{6,12}$/.test(key)) {
      showResult("ERR: INVALID_KEY_FORMAT.", "#ff003c");
      return;
    }

    showResult("SYS: ATTEMPTING_HANDSHAKE...", "#00ff41");

    const response = await fetch(`${API}/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key })
    });

    if (!response.ok) {
      showResult("ERR: REMOTE_HOST_DISCONNECT.", "#ff003c");
      return;
    }

    const data = await response.json();

    if (!data.found) {
      showResult("ERR: DATA_NOT_FOUND_OR_EXPIRED.", "#ff003c");
      return;
    }

    let messages = data.messages || data.data || [];
    if (!Array.isArray(messages)) messages = [messages];

    // Clear previous results before starting decryption display
    const target = document.getElementById("typewriter-target");
    target.innerHTML = ""; 

    for (let i = 0; i < messages.length; i++) {
      try {
        const decrypted = await decryptMessage(messages[i], key);
        
        // Create the box for each message
        const msgDiv = document.createElement("div");
        msgDiv.className = "msg-box";
        msgDiv.innerHTML = `<strong style="color:#00ff41;">[SECRET_MSG_${i + 1}]</strong><br><span class="text-body"></span>`;
        target.appendChild(msgDiv);

        // Typewriter the actual secret content
        const bodySpan = msgDiv.querySelector(".text-body");
        typeWriter(bodySpan, decrypted);

      } catch (err) {
        target.innerHTML += `<div class="msg-box msg-error">ERR: DECRYPTION_FAILED_CHKSUM</div>`;
      }
    }

    document.getElementById("result").style.display = "block";
    
    if (count) {
      count.innerText = `[LOG]: ${messages.length} DATA_PACKETS_UNLOCKED`;
      count.style.display = "block";
    }

  } catch (err) {
    showResult("ERR: FATAL_SYSTEM_ERROR.", "#ff003c");
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
  if (e.key === "Enter" && document.activeElement.id === "key") {
    unlock();
  }
});