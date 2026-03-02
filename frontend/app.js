import { encryptMessage, decryptMessage } from './crypto.js';

import { API_BASE } from "./config.js";

const API = API_BASE;

let sending = false;
let lastSendTime = 0;   

// ---------------- UI HELPERS ----------------
function showError(message) {
  const output = document.getElementById("out");
  if (!output) return;

  output.style.display = "block";
  output.style.color = "#ff003c"; // Hacker Red
  output.style.border = "1px solid #ff003c";
  output.style.padding = "10px";
  output.innerText = `[!] ERR: ${message}`;
}

function showSuccess(html) {
  const output = document.getElementById("out");
  if (!output) return;

  output.style.display = "block";
  output.style.color = "#00ff41"; // Neon Green
  output.style.border = "1px dashed #00ff41";
  output.style.padding = "14px";
  // The CSS in send.html handles the wrapping for this innerHTML
  output.innerHTML = html;
}

// ---------------- RATE LIMIT ----------------
function canSend() {
  const now = Date.now();
  if (now - lastSendTime < 5000) {
    showError("RATE_LIMIT_EXCEEDED. WAIT 5S.");
    return false;
  }
  lastSendTime = now;
  return true;
}

// ---------------- MESSAGE SEND ----------------
async function send() {
  if (sending) return;
  if (!canSend()) return;   

  try {
    const keyInput = document.getElementById("key");
    const msgInput = document.getElementById("msg");
    const output = document.getElementById("out");

    if (!keyInput || !msgInput || !output) return;

    const key = keyInput.value.trim().toUpperCase();
    const msg = msgInput.value.trim();

    // Reset output
    output.style.display = "none";
    output.innerText = "";

    // ✅ Terminal Key validation
    if (!/^[A-Z0-9]{6,12}$/.test(key)) {
      return showError("INVALID_KEY_FORMAT. USE 6-12 ALPHANUMERIC.");
    }

    // ✅ Message validation
    if (!msg) {
      return showError("EMPTY_PAYLOAD. INPUT REQUIRED.");
    }

    sending = true;

    output.style.display = "block";
    output.style.color = "#00ff41";
    output.style.border = "1px solid #00ff41";
    output.innerText = "> INITIALIZING_ENCRYPTION_PROTOCOL...";

    // ---------------- ENCRYPT ----------------
    // Simulating a small delay for "hacker" feel
    const encrypted = await encryptMessage(msg, key);
    
    output.innerText = "> ENCRYPTION_COMPLETE. ESTABLISHING_UPLINK...";

    // ---------------- SEND TO SERVER ----------------
    const r = await fetch(`${API}/send`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, data: encrypted })
    });

    const j = await r.json();

    if (!r.ok || !j.success) {
      return showError(j.error || "UPLINK_FAILED. SERVER_UNREACHABLE.");
    }

    // ✅ HACKER SUCCESS UI
    // We use word-break: break-all on the key display just in case it's long
    showSuccess(`
      <div style="text-align:center;">
        <p style="margin-bottom:8px; font-weight:bold; letter-spacing:1px;">
          [+] DATA_INJECTED_SUCCESSFULLY
        </p>

        <p style="font-size:11px; opacity:0.7;">ACCESS_KEY_IDENTIFIER:</p>
        <h2 style="margin:10px 0; letter-spacing:4px; border:1px solid #00ff41; display:inline-block; padding:8px 20px; word-break:break-all;">
          ${key}
        </h2>

        <div style="font-size:12px; margin-top:10px; opacity:0.8; line-height:1.4; text-align:left; border-top:1px solid rgba(0,255,65,0.2); padding-top:10px;">
          • TRANSMIT KEY TO RECIPIENT.<br>
          • AUTO_DESTRUCT: ARMED (24H).<br>
          • PROTOCOL: ONE-TIME READ.
        </div>

        <div style="margin-top:12px; font-size:10px; opacity:0.5; font-style:italic;">
          SECURE CHANNEL RECOMMENDED FOR KEY TRANSFER.
        </div>
      </div>
    `);

    msgInput.value = "";

  } catch (e) {
    console.error(e);
    showError("CRITICAL_SYSTEM_FAILURE. CHECK_UPLINK.");
  } finally {
    sending = false;
  }
}

// ---------------- BIND CLICK BUTTON ----------------
document.addEventListener("DOMContentLoaded", () => {
  const sendBtn = document.getElementById("sendBtn");
  if (sendBtn) {
    sendBtn.addEventListener("click", send);
  }

  // Handle Ctrl+Enter for the message textarea
  const msgInput = document.getElementById("msg");
  if (msgInput) {
    msgInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && e.ctrlKey) {
        e.preventDefault(); // Prevent newline
        send();
      }
    });
  }
});