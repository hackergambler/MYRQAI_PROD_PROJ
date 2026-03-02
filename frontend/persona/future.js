// future.js (LOCAL ENGINE WRAPPER) — FULL FIX
// ✅ Removes Worker/API calls completely
// ✅ Uses the shared local dataset + username seed + weights engine
// ✅ Works with your UPDATED future.html IDs:
//    - input:  #usernameInput
//    - status: #personaStatus
//    - output: #personaOutput
//    - note:   #privacyNote
// ✅ Keeps your HTML button: onclick="predict()"
// ✅ Must be loaded with: <script type="module" src="./future.js"></script>

import { runPersonaMode } from "./js/persona-app.js";

let running = false;

window.predict = async function predict() {
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

    // show immediate feedback (engine also updates)
    if (status) status.textContent = "⏳ Running neural future scan…";
    if (out) out.innerHTML = "";

    // run local engine in FUTURE mode
    await runPersonaMode("future");
  } catch (err) {
    console.error("Future AI (local) Error:", err);

    const status = document.getElementById("personaStatus");
    const out = document.getElementById("personaOutput");
    if (status) status.textContent = "⚠️ Neural scan failed.";

    if (out) {
      out.innerHTML = `
        <div class="card">
          ⚠️ Future scan failed.<br>
          <small>${escapeHTML(err?.message || "Unknown error")}</small><br>
          Please refresh and retry.
        </div>
      `;
    }
  } finally {
    running = false;
  }
};

// Prevent HTML injection (used in error output)
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[m]));
}