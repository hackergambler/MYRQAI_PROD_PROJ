// js/persona-app.js (FIXED) — LOCAL ENGINE ORCHESTRATOR
// ✅ Works when pages live inside /persona/ folder (uses "./data/..." not "/data/...")
// ✅ Uses IDs: #usernameInput #personaStatus #personaOutput #privacyNote
// ✅ Stronger guards + better errors + minimal XSS safety
// ✅ Caches dataset in-memory (no repeated fetch)
// ✅ Still uses your existing modules (username-seed/storage/weights/modes)

import { calcSeed } from "./username-seed.js";
import { loadWeights, saveWeights, loadSeen, saveSeen, updateWeight } from "./storage.js";
import { buildCategoryWeights } from "./weights.js";
import { buildPersona, buildPersonaPro, buildFuture } from "./modes.js";

let _datasetCache = null;

async function loadDataset() {
  if (_datasetCache) return _datasetCache;

  // IMPORTANT: relative path because your pages are in /persona/
  const r = await fetch("./data/scenarios.json", { cache: "no-store" });

  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Failed to load ./data/scenarios.json (${r.status}) ${txt}`.trim());
  }

  const j = await r.json().catch(() => null);
  if (!j || !Array.isArray(j.scenarios) || !Array.isArray(j.categories)) {
    throw new Error("Invalid scenarios.json format (missing categories/scenarios arrays).");
  }

  _datasetCache = j;
  return j;
}

function escapeHTML(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[m]));
}

function el(html) {
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstElementChild;
}

function safeNum(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.max(0, Math.min(100, Math.round(x)));
}

function renderCards(container, out) {
  if (!container) return;
  container.innerHTML = "";

  // FUTURE MODE
  if (out.mode === "future") {
    container.appendChild(el(`<div class="result-title">FUTURE AI Predictor</div>`));

    const bars = out.bars || {};
    container.appendChild(el(`
      <div class="bars">
        ${Object.entries(bars).map(([k, v]) => {
          const pct = safeNum(v);
          return `
            <div class="barrow">
              <div class="barlabel">${escapeHTML(k)}</div>
              <div class="bartrack"><div class="barfill" style="width:${pct}%"></div></div>
              <div class="barpct">${pct}%</div>
            </div>`;
        }).join("")}
      </div>
    `));

    (out.futureTimeline || []).forEach(t => {
      container.appendChild(el(`
        <div class="card">
          <div class="card-h">${escapeHTML(t.label)}</div>
          <div class="card-p">${escapeHTML(t.insight)}</div>
          <div class="card-a">Gentle action: <span>${escapeHTML(t.action)}</span></div>
        </div>
      `));
    });

    return;
  }

  // PERSONA / PERSONA PRO
  const title = out.mode === "persona_pro" ? "PERSONA PRO" : "PERSONA";
  container.appendChild(el(`<div class="result-title">${title}</div>`));

  (out.cards || []).forEach(sc => {
    const card = el(`
      <div class="card" data-id="${escapeHTML(sc.id)}" data-cat="${escapeHTML(sc.category)}">
        <div class="card-h">${escapeHTML(sc.title)}</div>

        <div class="card-s"><b>Past:</b> ${escapeHTML(sc.past)}</div>
        <div class="card-s"><b>Present:</b> ${escapeHTML(sc.present)}</div>
        <div class="card-s"><b>Future:</b> ${escapeHTML(sc.future)}</div>
        <div class="card-s"><b>Hidden strength:</b> ${escapeHTML(sc.hidden_strength)}</div>
        <div class="card-a"><b>Gentle action:</b> <span>${escapeHTML(sc.gentle_action)}</span></div>

        <div class="feedback">
          <span class="q">Does this match you?</span>
          <button class="yes" type="button">Yes</button>
          <button class="no" type="button">No</button>
        </div>
      </div>
    `);
    container.appendChild(card);
  });

  if (out.mode === "persona_pro" && out.synthesis) {
    container.appendChild(el(`
      <div class="synthesis">
        <div class="syn-h">Deeper Clarity</div>
        <div class="syn-p">${escapeHTML(out.synthesis.headline)}</div>
        <div class="syn-p">${escapeHTML(out.synthesis.shadow)}</div>
        <div class="syn-p">${escapeHTML(out.synthesis.healingDirection)}</div>
        <ul class="syn-list">
          ${(out.synthesis.microPlan || []).map(x => `<li>${escapeHTML(x)}</li>`).join("")}
        </ul>
      </div>
    `));
  }
}

function attachFeedback(container, weights) {
  if (!container) return;

  container.querySelectorAll(".card").forEach(card => {
    const cat = card.getAttribute("data-cat");
    const yes = card.querySelector("button.yes");
    const no = card.querySelector("button.no");

    if (!yes || !no || !cat) return;

    const lock = () => {
      yes.disabled = true;
      no.disabled = true;
      card.classList.add("locked");
    };

    yes.addEventListener("click", () => {
      updateWeight(weights, cat, true);
      saveWeights(weights);
      lock();
    });

    no.addEventListener("click", () => {
      updateWeight(weights, cat, false);
      saveWeights(weights);
      lock();
    });
  });
}

function getUI() {
  const input = document.querySelector("#usernameInput");
  const outBox = document.querySelector("#personaOutput");
  const status = document.querySelector("#personaStatus");
  const note = document.querySelector("#privacyNote");

  return { input, outBox, status, note };
}

export async function runPersonaMode(mode) {
  const { input, outBox, status, note } = getUI();

  if (!input || !outBox) {
    console.error("[persona-app] Missing #usernameInput or #personaOutput in HTML.");
    if (status) status.textContent = "UI error: missing required elements.";
    return;
  }

  const raw = (input.value || "").trim();
  if (!raw) {
    if (status) status.textContent = "Enter a username first.";
    outBox.innerHTML = "";
    return;
  }

  // status + clear
  if (status) status.textContent = "Scanning identity pattern…";
  outBox.innerHTML = "";

  // load dataset
  let dataset;
  try {
    dataset = await loadDataset();
  } catch (e) {
    console.error("[persona-app] dataset load failed:", e);
    if (status) status.textContent = "Failed to load scenario library.";
    outBox.innerHTML = `
      <div class="card">
        ⚠️ Failed to load scenario library.<br>
        <small>${escapeHTML(e?.message || "Unknown error")}</small><br>
        Check that <b>./data/scenarios.json</b> exists.
      </div>
    `;
    return;
  }

  // compute seed + weights
  const seed = calcSeed(raw);

  const weights = loadWeights();
  const seen = loadSeen();

  const weighted = buildCategoryWeights(seed, weights, dataset.categories);

  // tiny delay for “scan feel”
  await new Promise(r => setTimeout(r, 650));

  // build output
  let out;
  if (mode === "persona") out = buildPersona(dataset, seed, weighted, seen);
  else if (mode === "persona_pro") out = buildPersonaPro(dataset, seed, weighted, seen);
  else out = buildFuture(dataset, seed, weighted, seen);

  // persist seen ids
  saveSeen(seen);

  // render
  if (status) status.textContent = "Complete.";
  renderCards(outBox, out);

  // feedback only for persona/persona_pro
  if (mode !== "future") attachFeedback(outBox, weights);

  // privacy note
  if (note) note.textContent = "We do not store your username. Feedback stays on your device.";
}