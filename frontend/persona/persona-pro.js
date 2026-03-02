// persona-pro.js (LOCAL ENGINE WRAPPER) — FULL FIX
// ✅ Removes Worker/API calls completely
// ✅ Uses the shared local dataset + username seed + weights engine
// ✅ Works with your UPDATED persona-pro.html IDs:
//    - input:  #usernameInput
//    - status: #personaStatus
//    - output: #personaOutput
//    - note:   #privacyNote
// ✅ Keeps your HTML button: onclick="scan()"
// ✅ Must be loaded with: <script type="module" src="./persona-pro.js"></script>

import { runPersonaMode } from "./js/persona-app.js";

let running = false;

window.scan = async function scan() {
  if (running) return;
  running = true;

  try {
    const input = document.getElementById("usernameInput");
    const status = document.getElementById("personaStatus");
    const out = document.getElementById("personaOutput");

    const username = (input?.value || "").trim();

    if (!username || username.length < 3) {
      if (status) status.textContent = "Enter valid username (min 3 characters).";
      if (out) out.innerHTML = "";
      running = false;
      return alert("Enter valid username (min 3 characters)");
    }

    // immediate UI feedback
    if (status) status.textContent = "⏳ Running deep neural scan…";
    if (out) out.innerHTML = "";

    // run local engine in PERSONA PRO mode
    await runPersonaMode("persona_pro");
  } catch (err) {
    console.error("Persona PRO (local) Error:", err);

    const status = document.getElementById("personaStatus");
    const out = document.getElementById("personaOutput");
    if (status) status.textContent = "⚠️ Persona PRO scan failed.";

    if (out) {
      out.innerHTML = `
        <div class="card">
          ⚠️ Persona PRO scan failed.<br>
          <small>${escapeHTML(err?.message || "Unknown error")}</small><br>
          Please refresh and retry.
        </div>
      `;
    }
  } finally {
    running = false;
  }
};

// Prevent HTML injection (used only in error output)
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}