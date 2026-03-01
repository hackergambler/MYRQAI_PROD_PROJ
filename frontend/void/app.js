// app.js (FIXED FULL) — SEQUENTIAL FRAGMENTS + RANK/PHASE UI UPDATES + SAFE PAYLOAD HIDING + CINEMATIC COMPLETION
// ✅ FIX: Rank/Phase/Fragments UI updates AFTER SCAN, AFTER SOLVE, AFTER RESET
// ✅ FIX: Progress badge (#phaseBadge) stays synced to engine progress phase
// ✅ FIX: Secret payload hidden by default (shows only if ?dev=1 OR localStorage MYRQAI_DEV=1)
// ✅ ADD: Cinematic completion overlay support (plays #completionVideo if present; writes #completionText)
// ✅ Keeps: sequential pick, vault synth, logs UI, completion overlay, FX, modals

import {
  initVoidUI,
  setStatus,
  setPhase as setProgressPhase,
  clearStream,
  synthesizeFromPayload,
  unlockHintByKey,
  revealDirectHint,
  setHintMask,
  jumpToNewest,
  vaultReject,
  resetRejectCounter,

  // progression + logs
  getProgress,
  onSolveSuccess,
  isSignalUnlocked,
  resetProgress,
  getVaultLog,
  clearVaultLog,
} from "./vault-engine.js";

const PUZZLES_URL = window.__PUZZLES_URL__ || "./puzzles.master.json";
const BASE_VAULT_IMG = "./assets/void.png";

// session keys
const S_SEEN = "myrq_seen_signals";
const S_SOLVED = "myrq_solved_signals";

// fail policy
const LOCKOUT_AFTER = 20;

// DEV flag: hide payload by default
const DEV_SHOW_PAYLOAD = (() => {
  try {
    const url = new URL(location.href);
    const q = url.searchParams.get("dev");
    if (q === "1" || q === "true") return true;
    const ls = localStorage.getItem("MYRQAI_DEV");
    return ls === "1" || ls === "true";
  } catch {
    return false;
  }
})();

// Completion cinematic video (optional). Place file at /void/assets/completion.mp4
const COMPLETION_VIDEO_SRC = "./assets/completion.mp4";

let els = {};
let PUZZLES = [];
let active = null;
let synthesizedFor = null;
let scanning = false;
let solving = false;

// completion FX guard
let COMPLETION_FIRED = false;

/* =======================
   UI helpers
   ======================= */
function setState(state) {
  try {
    const b = document.getElementById("stateBadge");
    if (b) b.textContent = String(state || "").toUpperCase();
  } catch {}
}

function getTotalFragmentsCount() {
  // Use puzzles length when available (ex: 10 puzzles => show 0/10 ... 10/10)
  // Fallback to 100 before scan finishes (keeps your HUD stable on first paint)
  const n = Array.isArray(PUZZLES) ? PUZZLES.length : 0;
  return n > 0 ? n : 100;
}

function getSolvedFragmentsCount() {
  const p = getProgress?.() || {};
  const sc = Number(p.solvedCount);
  if (Number.isFinite(sc)) return sc;
  const fr = Number(p.fragments);
  return Number.isFinite(fr) ? fr : 0;
}

function fragText() {
  const solved = getSolvedFragmentsCount();
  const total = getTotalFragmentsCount();
  return `${Math.min(solved, total)}/${total}`;
}

function renderProgressHeader() {
  try {
    const p = getProgress?.() || {};
    const rEl = document.getElementById("rankLabel");
    const fEl = document.getElementById("fragLabel");
    const phEl = document.getElementById("phaseLabel");

    if (rEl) rEl.textContent = String(p.rank || "UNKNOWN");
    if (fEl) fEl.textContent = fragText();
    if (phEl) phEl.textContent = String(p.phase || "PHASE I");

    // keep engine badge synced to PROGRESS PHASE (NOT state)
    try {
      setProgressPhase?.(p.phase || "PHASE I");
    } catch {}
  } catch {}
}

/* =======================
   HELP + USER MANUAL
   ======================= */
const HELP_TERMINAL_TEXT =
  "⟡ HELP // GHOST SIGNAL\n\n" +
  "Core Loop (SEQUENTIAL):\n" +
  "1) Press SCAN → system selects the next available fragment IN ORDER.\n" +
  "2) Click the fragment → the vault is synthesized in RAM.\n" +
  "3) Solve → if correct, it reveals a hidden terminal fragment.\n" +
  "4) Then it auto-selects the NEXT unsolved fragment (in order).\n\n" +
  "UNLOCK (why this button exists):\n" +
  "• UNLOCK is a decoder tool.\n" +
  "• It works after a Signal Card is clicked (vault must be loaded).\n" +
  "• Type a key like 0x163 to reveal its fragment.\n" +
  "• Or paste enc:v1:... to decrypt (you’ll be asked a passphrase).\n\n" +
  "Progress:\n" +
  "• Progress is stored locally (your browser), not on the server.\n" +
  "• Rank + Phase Gates unlock more signals as fragments rise.\n";

function userManualHTML() {
  return `
    <p><b>You are a Signal Hunter.</b> Your mission is to reconstruct the Master Manifest by solving fragments.</p>

    <p><b>Loop:</b> <b>SCAN</b> → Click fragment → <b>SOLVE</b> → <b>UNLOCK</b> → Next fragment</p>

    <hr style="border:0;border-top:1px solid rgba(0,255,156,.14);margin:12px 0" />

    <p><b>SCAN</b><br/>
    Picks the <b>next Signal Fragment in order</b> (based on your clearance gate).</p>

    <p><b>Click the Fragment</b><br/>
    Clicking a fragment <b>synthesizes the vault in RAM</b> (not uploaded). This is what makes UNLOCK work.</p>

    <p><b>SOLVE</b><br/>
    If correct, the system verifies your answer, stores progress locally, and unlocks the terminal fragment + vault log entry.</p>

    <p><b>UNLOCK</b><br/>
    UNLOCK reveals hidden fragments by key. It accepts:</p>
    <ul style="margin:8px 0 0 18px">
      <li><code>0x...</code> key (example: <code>0x163</code>)</li>
      <li><code>enc:v1:...</code> encrypted fragment (asks passphrase)</li>
    </ul>

    <p><b>Rewards</b><br/>
    You gain <b>Fragments</b> (progress), <b>Rank</b> (clearance), and an archived <b>Vault Log</b> of recovered intel.</p>

    <p class="muted tiny" style="margin-top:10px">
      If UNLOCK says <b>Vault not ready</b>, you haven’t clicked a Signal yet.<br/>
      If UNLOCK says <b>No fragment for key</b>, that key is not inside the currently loaded vault.
    </p>
  `;
}

/* =======================
   Onboarding modal (User Manual)
   ======================= */
let onboardingTimer = null;

function setOnboardingOpen(open) {
  if (!els.onboarding) return;
  els.onboarding.classList.toggle("show", !!open);
  els.onboarding.setAttribute("aria-hidden", open ? "false" : "true");
}

function setOnboardingBody(html) {
  if (!els.onboarding) return;
  const body = els.onboarding.querySelector(".modal-text");
  if (!body) return;
  body.innerHTML = html;
}

function closeOnboarding() {
  clearInterval(onboardingTimer);
  onboardingTimer = null;
  setOnboardingOpen(false);
}

function openUserManual() {
  clearInterval(onboardingTimer);
  onboardingTimer = null;

  setOnboardingBody(`
    <p><b>HOW IT WORKS</b></p>
    ${userManualHTML()}
    <p class="muted tiny" style="margin-top:10px">Auto-closes in <span id="obTimer">25</span>s.</p>
  `);

  setOnboardingOpen(true);

  let t = 25;
  const timerEl = els.onboarding.querySelector("#obTimer");
  if (timerEl) timerEl.textContent = String(t);

  onboardingTimer = setInterval(() => {
    t--;
    const te = els.onboarding.querySelector("#obTimer");
    if (te) te.textContent = String(Math.max(t, 0));
    if (t <= 0) closeOnboarding();
  }, 1000);
}

/* =======================
   Puzzle modal feedback
   ======================= */
let modalMsgEl = null;
let modalCloseTimer = null;

function ensureModalMsgEl() {
  if (!els.puzzleModal) return null;
  if (modalMsgEl && modalMsgEl.isConnected) return modalMsgEl;

  const existing = els.puzzleModal.querySelector(".puz-msg");
  if (existing) {
    modalMsgEl = existing;
    return modalMsgEl;
  }

  const msg = document.createElement("div");
  msg.className = "puz-msg";
  msg.style.marginTop = "10px";
  msg.style.padding = "10px 12px";
  msg.style.borderRadius = "14px";
  msg.style.fontSize = "12px";
  msg.style.letterSpacing = ".10em";
  msg.style.textTransform = "uppercase";
  msg.style.display = "none";
  msg.style.userSelect = "none";

  msg.style.border = "1px solid rgba(255,45,109,.35)";
  msg.style.background = "rgba(255,45,109,.10)";
  msg.style.color = "rgba(255,230,240,.92)";

  const anchor = els.puzPrompt?.parentElement || els.puzzleModal;
  anchor.appendChild(msg);

  modalMsgEl = msg;
  return modalMsgEl;
}

function showModalMessage(text, type = "bad") {
  const el = ensureModalMsgEl();
  if (!el) return;

  el.textContent = String(text || "");
  el.style.display = "block";

  if (type === "ok") {
    el.style.border = "1px solid rgba(0,255,156,.35)";
    el.style.background = "rgba(0,255,156,.10)";
    el.style.color = "rgba(225,255,245,.92)";
  } else if (type === "warn") {
    el.style.border = "1px solid rgba(255,204,0,.35)";
    el.style.background = "rgba(255,204,0,.10)";
    el.style.color = "rgba(255,246,210,.92)";
  } else {
    el.style.border = "1px solid rgba(255,45,109,.35)";
    el.style.background = "rgba(255,45,109,.10)";
    el.style.color = "rgba(255,230,240,.92)";
  }
}

function clearModalMessage() {
  if (!modalMsgEl) return;
  modalMsgEl.textContent = "";
  modalMsgEl.style.display = "none";
}

function modalShake(ms = 420) {
  if (!els.puzzleModal) return;
  const card = els.puzzleModal.querySelector(".modal-card") || els.puzzleModal;
  card.classList.add("shake");
  setTimeout(() => card.classList.remove("shake"), ms);
}

function scheduleClosePuzzle(ms = 650) {
  clearTimeout(modalCloseTimer);
  modalCloseTimer = setTimeout(() => closePuzzle(), ms);
}

/* =======================
   Utils
   ======================= */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}
function normalizeAnswer(s) {
  return String(s || "").trim().toUpperCase();
}
function parseHexIdToInt(id) {
  const m = String(id || "").match(/^0x([0-9a-f]+)$/i);
  return m ? parseInt(m[1], 16) : Number.POSITIVE_INFINITY;
}
function showSignalsHelper(msg, extraHtml = "") {
  if (!els.signals) return;
  els.signals.innerHTML = `
    <div class="side-text muted tiny">
      ${escapeHtml(msg)}
      ${extraHtml ? `<div style="margin-top:8px">${extraHtml}</div>` : ""}
    </div>
  `;
}

function readSet(key) {
  try {
    const raw = sessionStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}
function writeSet(key, set) {
  try {
    sessionStorage.setItem(key, JSON.stringify([...set]));
  } catch {}
}
function getSessionSeen() { return readSet(S_SEEN); }
function getSessionSolved() { return readSet(S_SOLVED); }
function markSessionSeen(id) { const s = getSessionSeen(); s.add(id); writeSet(S_SEEN, s); }
function markSessionSolved(id) { const s = getSessionSolved(); s.add(id); writeSet(S_SOLVED, s); }

/* =======================
   Hard FX helpers (FORCE RETRIGGER)
   ======================= */
function forceReflow() {
  try { void document.body.offsetHeight; } catch {}
}
function pulse(cls, ms = 280) {
  try {
    document.body.classList.remove(cls);
    forceReflow();
    document.body.classList.add(cls);
    setTimeout(() => document.body.classList.remove(cls), ms);
  } catch {}
}
function clearJitterClasses() {
  try {
    [...document.body.classList].forEach((c) => {
      if (c.startsWith("signal-jitter-")) document.body.classList.remove(c);
    });
  } catch {}
}
function jitter(level = 1, ms = 700) {
  try {
    clearJitterClasses();
    forceReflow();
    const cls = "signal-jitter-" + Math.max(1, Math.min(9, Math.floor(Number(level) || 1)));
    document.body.classList.add(cls);
    setTimeout(() => {
      document.body.classList.remove(cls);
      clearJitterClasses();
    }, ms);
  } catch {}
}
let jitterClassTimer = null;
function difficultyJitter(level = 1) {
  clearTimeout(jitterClassTimer);
  clearJitterClasses();
  const cls = "signal-jitter-" + Math.max(1, Math.min(9, Math.floor(Number(level) || 1)));
  document.body.classList.add(cls);
  jitterClassTimer = setTimeout(() => {
    document.body.classList.remove(cls);
    clearJitterClasses();
  }, 520);
}

/* =======================
   Sound (safe)
   ======================= */
const Sound = (() => {
  let on = false;
  let ctx = null;

  const ensure = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  const beep = (freq = 440, dur = 0.06, gain = 0.05) => {
    if (!on) return;
    const ac = ensure();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g);
    g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  };

  return {
    toggle() { on = !on; return on; },
    tick(type) {
      if (type === "ok") { beep(740, 0.05, 0.06); setTimeout(() => beep(980, 0.05, 0.04), 60); }
      else if (type === "bad") { beep(220, 0.08, 0.06); }
      else if (type === "rare") { beep(520, 0.05, 0.05); setTimeout(() => beep(1040, 0.09, 0.06), 60); }
      else if (type === "sys") { beep(440, 0.04, 0.03); }
      else if (type === "warn") { beep(330, 0.06, 0.05); }
    },
  };
})();

/* =======================
   Background loader
   ======================= */
function applyBackgroundImage(url) {
  if (!url) return;
  document.documentElement.style.setProperty("--bg-image", `url("${url}")`);
}
function loadBackground(url, fallbackUrl = "") {
  const pick = url || fallbackUrl;
  if (!pick) return;

  const img = new Image();
  img.onload = () => {
    applyBackgroundImage(pick);
    document.body.classList.add("bg-ready");
  };
  img.onerror = () => {
    if (fallbackUrl && pick !== fallbackUrl) {
      loadBackground(fallbackUrl, "");
      return;
    }
    console.warn("[BG] failed:", pick);
  };
  img.src = pick;
}

/* =======================
   Synchronicity meter (REAL PROGRESS)
   ======================= */
function setMeter() {
  const p = getProgress?.() || { solvedCount: 0 };
  const total = Math.max(PUZZLES.length, 1);
  const pct = Math.round((Math.min(p.solvedCount || 0, total) / total) * 100);

  if (els.syncPct) els.syncPct.textContent = String(pct);
  if (els.syncFill) els.syncFill.style.width = pct + "%";
}

/* Cosmetic URL flags only */
function markSolvedUrl(signal_id) {
  const url = new URL(location.href);
  url.searchParams.set("solved_" + signal_id, "1");
  history.replaceState({}, "", url.toString());
}
function clearSolvedUrlFlags() {
  const url = new URL(location.href);
  const keys = Array.from(url.searchParams.keys());
  for (const k of keys) if (k.startsWith("solved_")) url.searchParams.delete(k);
  history.replaceState({}, "", url.toString());
}

/* =======================
   Crypto verify
   ======================= */
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}
async function verifyAnswer(sig, answerRaw) {
  const ans = normalizeAnswer(answerRaw);
  if (!ans) return false;

  if (sig.answer_hash && sig.salt) {
    const computed = await sha256Hex(`${sig.salt}:${ans}`);
    return computed === String(sig.answer_hash).toLowerCase();
  }
  if (sig.expected_answer) return ans === normalizeAnswer(sig.expected_answer);
  return false;
}

/* =======================
   SELECTION (SEQUENTIAL, CLEARANCE + UNSOLVED)
   ======================= */
function isGloballySolved(sigId) {
  const p = getProgress?.();
  const solved = p?.solved || {};
  return Boolean(solved[String(sigId || "").toUpperCase()]);
}

/**
 * Picks the NEXT unsolved signal IN ORDER (by __index), respecting clearance gates.
 * If gates block higher indices, it will stop at the first locked section.
 */
function pickNextUnsolvedInOrder() {
  if (!Array.isArray(PUZZLES) || PUZZLES.length === 0) return null;

  for (const p of PUZZLES) {
    if (!p?.signal_id) continue;
    if (isGloballySolved(p.signal_id)) continue;

    const idx = Number(p.__index) || 1;
    if (!isSignalUnlocked?.(idx)) return null; // clearance gate blocks further
    return p;
  }
  return null;
}

function renderSingleSignal(sig) {
  if (!els.signals) return;

  if (!sig) {
    const p = getProgress?.() || {};
    els.signals.innerHTML = `
      <div class="side-text muted tiny">
        No available fragments right now.<br/>
        Either you solved them, or your clearance gate is locked.<br/><br/>
        <b>Fragments:</b> ${escapeHtml(fragText())}<br/>
        <b>Rank:</b> ${escapeHtml(String(p.rank ?? "UNKNOWN"))}
      </div>
    `;
    return;
  }

  els.signals.innerHTML = "";

  const frame = document.createElement("div");
  frame.className = "fragment-frame";

  const btn = document.createElement("button");
  btn.className = "signal-card single-card";
  btn.type = "button";

  const t = sig.transmission_type || "SIGNAL";
  const hint = (sig.hint_mask || "").slice(0, 140);

  btn.innerHTML = `
    <div class="signal-title">${escapeHtml(sig.title || sig.signal_id)}</div>
    <div class="signal-meta">ID ${escapeHtml(sig.signal_id)} • DIFFICULTY ${sig.difficulty || 1} • ${escapeHtml(t)}</div>
    <div class="signal-desc">${escapeHtml(hint)}${(sig.hint_mask || "").length > 140 ? "…" : ""}</div>
    <div class="signal-cta">CLICK TO SYNTHESIZE →</div>
  `;

  btn.addEventListener("click", () => openSignal(sig));
  frame.appendChild(btn);
  els.signals.appendChild(frame);
}

/* =======================
   Logs UI
   ======================= */
function safeDate(ts) {
  if (!ts) return "";
  try { return new Date(ts).toLocaleString(); } catch { return ""; }
}

function clip(s, n) {
  const t = String(s ?? "");
  if (t.length <= n) return t;
  return t.slice(0, n) + "…";
}

function getLogArray() {
  try {
    const log = getVaultLog?.();
    return Array.isArray(log) ? log : [];
  } catch {
    return [];
  }
}

function renderVaultLog() {
  if (!els.vaultLogList || !els.vaultLogCount) return;

  const log = getLogArray();
  els.vaultLogCount.textContent = String(log.length);

  if (log.length === 0) {
    els.vaultLogList.innerHTML = `
      <div class="vaultlog-empty">
        No logs recovered yet.<br/>
        Solve a signal to extract a vault entry.
      </div>
    `;
    return;
  }

  els.vaultLogList.innerHTML = log
    .map((e, i) => {
      const id = escapeHtml(e.signal_id || "0x???");
      const when = escapeHtml(safeDate(e.ts));
      const title = escapeHtml(e.title || "Recovered Entry");
      const body = escapeHtml(clip(e.text || "", 140));
      return `
        <div class="vaultlog-item" data-log-idx="${i}" role="button" tabindex="0" aria-label="Open log ${id}">
          <div class="vaultlog-row">
            <div class="vaultlog-id">${id}</div>
            <div class="vaultlog-time">${when}</div>
          </div>
          <div class="vaultlog-name">${title}</div>
          <div class="vaultlog-preview">${body}</div>
        </div>
      `;
    })
    .join("");
}

function openLogModal(entry) {
  if (!els.logModal || !els.logBody || !els.logTitle || !els.logMeta) return;

  const sid = String(entry?.signal_id || "0x???").toUpperCase();
  const ttl = String(entry?.title || "Recovered Log");
  const when = safeDate(entry?.ts);
  const ttype = entry?.transmission_type ? String(entry.transmission_type).toUpperCase() : "";
  const diff = entry?.difficulty != null ? String(entry.difficulty) : "";
  const text = String(entry?.text || "").trim() || "(empty)";

  els.logTitle.textContent = ttl;
  els.logMeta.innerHTML =
    `${when ? `TIME <code>${escapeHtml(when)}</code> ` : ""}` +
    `ID <code>${escapeHtml(sid)}</code>` +
    `${ttype ? ` • TYPE <code>${escapeHtml(ttype)}</code>` : ""}` +
    `${diff ? ` • DIFF <code>${escapeHtml(diff)}</code>` : ""}`;

  els.logBody.textContent = text;

  els.logModal.classList.add("show");
  els.logModal.setAttribute("aria-hidden", "false");

  revealDirectHint(`⟡ RECOVERED LOG OPENED\nID: ${sid}\n${when ? `TIME: ${when}\n` : ""}\n${text}`, {
    mode: "SYSTEM",
    key: "LOG",
    rare: true,
  });
  jumpToNewest?.();
}

function closeLogModal() {
  if (!els.logModal) return;
  els.logModal.classList.remove("show");
  els.logModal.setAttribute("aria-hidden", "true");
}

async function copyLogText() {
  const t = els.logBody?.textContent || "";
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    setStatus("log copied");
    Sound.tick("sys");
  } catch {
    prompt("Copy log:", t);
  }
}

function wireVaultLogUI() {
  renderVaultLog();

  els.vaultLogRefresh?.addEventListener("click", () => {
    renderVaultLog();
    setStatus("log refreshed");
    Sound.tick("sys");
  });

  els.vaultLogClear?.addEventListener("click", () => {
    const ok = typeof window.confirm === "function" ? confirm("Clear recovered logs? (Progress stays)") : true;
    if (!ok) return;

    try {
      clearVaultLog?.();
    } catch {
      setStatus("log clear failed");
      Sound.tick("bad");
      return;
    }

    renderVaultLog();
    setStatus("log cleared");
    Sound.tick("warn");
    pulse("vault-hit", 220);
    jitter(2, 520);
  });

  els.vaultLogList?.addEventListener("click", (e) => {
    const item = e.target?.closest?.(".vaultlog-item");
    if (!item) return;

    const idx = Number(item.getAttribute("data-log-idx"));
    const list = getLogArray();
    const entry = list[idx];
    if (entry) openLogModal(entry);
  });

  els.vaultLogList?.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const item = e.target?.closest?.(".vaultlog-item");
    if (!item) return;
    const idx = Number(item.getAttribute("data-log-idx"));
    const list = getLogArray();
    const entry = list[idx];
    if (entry) openLogModal(entry);
  });

  els.logClose?.addEventListener("click", closeLogModal);
  els.logCopy?.addEventListener("click", copyLogText);
  els.logModal?.addEventListener("click", (e) => {
    if (e.target === els.logModal) closeLogModal();
  });
}

/* =======================
   Completion FX (ENGINE overlay)
   Supports both:
   - old overlay: #completionOverlay .completion-box p
   - cinematic overlay: #completionText + #completionVideo
   ======================= */
function closeCompletionOverlay() {
  const ov = document.getElementById("completionOverlay");
  if (!ov) return;

  const vid = document.getElementById("completionVideo");
  if (vid) {
    try { vid.pause(); } catch {}
    try { vid.currentTime = 0; } catch {}
  }

  ov.classList.remove("show");
  ov.setAttribute("aria-hidden", "true");
}

function openCompletionOverlay(textLines) {
  const ov = document.getElementById("completionOverlay");
  if (!ov) return false;

  // Cinematic overlay support
  const proof = document.getElementById("completionText");
  if (proof && textLines) proof.textContent = String(textLines);

  const vid = document.getElementById("completionVideo");
  if (vid) {
    try {
      const src = COMPLETION_VIDEO_SRC;
      if (src && (!vid.getAttribute("data-src") || vid.getAttribute("data-src") !== src)) {
        vid.setAttribute("data-src", src);
        vid.src = src;
      }
      vid.muted = false;
      vid.playsInline = true;
      vid.loop = false;
      const p = vid.play();
      if (p && typeof p.catch === "function") p.catch(() => {});
    } catch {}
  }

  // Legacy overlay support
  const box = ov.querySelector(".completion-box") || ov;
  const pEl = box.querySelector("p");
  if (pEl && textLines) pEl.textContent = String(textLines);

  ov.classList.add("show");
  ov.setAttribute("aria-hidden", "false");
  return true;
}

async function showCompletionFX() {
  if (COMPLETION_FIRED) return;
  COMPLETION_FIRED = true;

  const p = getProgress?.() || {};
  const rank = p.rank || "PROTOCOL COMPLETE";

  const msg =
    "VOID VAULT COMPROMISED\n" +
    `RANK: ${rank}\n` +
    `FRAGMENTS: ${fragText()}\n` +
    "PROOF: ACCESS GRANTED";

  const usedEngineOverlay = openCompletionOverlay(msg);

  revealDirectHint(
    "⟡ PROTOCOL COMPLETE\n" +
      `⟡ RANK: ${rank}\n` +
      `⟡ FRAGMENTS: ${fragText()}\n` +
      "⟡ PROOF: ACCESS GRANTED",
    { mode: "SYSTEM", key: "COMPLETE", rare: true }
  );

  Sound.tick("rare");
  pulse("vault-hit-2", 360);
  jitter(9, 900);
  jumpToNewest?.();

  if (usedEngineOverlay) {
    const ov = document.getElementById("completionOverlay");
    ov?.addEventListener("click", () => closeCompletionOverlay(), { once: true });

    // If autoplay was blocked, clicking the overlay will also attempt play once
    const vid = document.getElementById("completionVideo");
    if (vid) {
      ov?.addEventListener("click", () => { try { vid.play(); } catch {} }, { once: true });
    }
  }
}

function maybeTriggerCompletionFX() {
  const total = getTotalFragmentsCount();
  const solved = getSolvedFragmentsCount();
  // completion when ALL loaded puzzles are solved (or fallback 100/100 if puzzles not loaded)
  if (solved >= total) showCompletionFX();
}

/* =======================
   Scan (LOAD + CHOOSE NEXT IN ORDER)
   ======================= */
async function scanForSignals() {
  if (scanning) return;
  scanning = true;

  setState("SCANNING");
  setStatus("scanning…");
  showSignalsHelper("Scanning…");

  try {
    const r = await fetch(PUZZLES_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} while fetching ${PUZZLES_URL}`);

    const text = await r.text();
    let parsed;
    try { parsed = JSON.parse(text); }
    catch { throw new Error("puzzles.master.json is not valid JSON (server returned HTML?)"); }

    if (!Array.isArray(parsed)) throw new Error("puzzles.master.json must be an ARRAY");
    for (const p of parsed) {
      if (!p?.signal_id || !p?.secret_payload) throw new Error("One or more puzzles missing signal_id/secret_payload");
    }

    parsed.sort((a, b) => parseHexIdToInt(a.signal_id) - parseHexIdToInt(b.signal_id));
    parsed.forEach((p, i) => (p.__index = i + 1));
    PUZZLES = parsed;

    setMeter();
    renderVaultLog();
    renderProgressHeader(); // ✅ after scan

    setStatus(`signals loaded (${PUZZLES.length})`);
    Sound.tick("sys");
    pulse("vault-hit", 220);
    jitter(1, 420);

    const chosen = pickNextUnsolvedInOrder();
    if (chosen) {
      markSessionSeen(chosen.signal_id);
      renderSingleSignal(chosen);

      const prog = getProgress?.() || {};
      revealDirectHint(
        "⟡ SCAN COMPLETE.\nNext fragment selected (SEQUENTIAL).\n" +
          `⟡ Rank: ${prog.rank || "UNKNOWN"}\n` +
          `⟡ Fragments: ${fragText()}\n` +
          `⟡ Next: ${chosen.signal_id}`,
        { mode: "SYSTEM", key: "SCAN", rare: true }
      );
      jumpToNewest?.();
    } else {
      renderSingleSignal(null);

      const prog = getProgress?.() || {};
      revealDirectHint(
        "⟡ NO AVAILABLE FRAGMENTS.\nEither all are solved, or clearance gates are locked.\n" +
          `⟡ Rank: ${prog.rank || "UNKNOWN"} • Fragments: ${fragText()}`,
        { mode: "SYSTEM", key: "SCAN" }
      );
      jumpToNewest?.();
    }

    maybeTriggerCompletionFX();
  } catch (e) {
    const msg = e?.message || "scan failed";
    setStatus("scan failed");
    showSignalsHelper(
      "SCAN failed: " + msg,
      `Open directly: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
    );
    revealDirectHint("🜏 SCAN FAILED.\nEnsure puzzles.master.json exists and is served.", { mode: "SYSTEM", key: "SCAN" });
    Sound.tick("bad");
    pulse("vault-hit", 260);
    jitter(3, 720);
  } finally {
    scanning = false;
  }
}

/* =======================
   Open/Close Signal
   ======================= */
async function openSignal(sig) {
  active = sig;

  clearTimeout(modalCloseTimer);
  clearModalMessage();

  difficultyJitter(sig.difficulty || 1);

  setHintMask(sig.hint_mask || "");
  setState("SYNTHESIZING");
  setStatus("stabilizing signal…");

  if (synthesizedFor !== sig.signal_id) {
    try {
      await synthesizeFromPayload(sig.secret_payload, BASE_VAULT_IMG, { signal_id: sig.signal_id });
      synthesizedFor = sig.signal_id;

      setState("READY");
      setStatus("signal stabilized");
      Sound.tick("ok");

      pulse("vault-hit-2", 300);
      jitter(sig.difficulty || 1, 760);

      revealDirectHint("⟡ SIGNAL STABILIZED.\nVault synthesized in RAM.\nYou may now SOLVE or UNLOCK.", {
        mode: "SYSTEM",
        key: sig.signal_id,
        rare: true,
      });
      jumpToNewest?.();
    } catch (e) {
      setStatus("synthesis failed");
      setState("ERROR");
      revealDirectHint(
        "🜏 SYNTHESIS FAILED.\nCheck base image path and payload integrity.\n\n" +
          "Fix checklist:\n" +
          "• ./assets/void.png must exist\n" +
          "• Server must serve .png with correct path\n" +
          "• puzzle secret_payload must be intact\n",
        { mode: "SYSTEM", key: "SYNTH" }
      );
      Sound.tick("bad");
      pulse("vault-hit", 260);
      jitter(4, 820);
      console.warn("[SYNTH FAIL]", e);
      return;
    }
  } else {
    setState("READY");
    setStatus("signal cached");
    pulse("vault-hit", 180);
  }

  if (!els.puzzleModal) return;

  els.puzTitle && (els.puzTitle.textContent = sig.title || sig.signal_id);
  els.puzMeta &&
    (els.puzMeta.textContent = `Signal: ${sig.signal_id} • ${sig.transmission_type || "SIGNAL"} • Difficulty ${sig.difficulty || 1}`);
  els.puzPrompt && (els.puzPrompt.textContent = sig.prompt ? String(sig.prompt) : "Solve the signal.");

  // ✅ hide payload by default
  if (els.puzPayload) {
    if (DEV_SHOW_PAYLOAD) {
      els.puzPayload.value = sig.secret_payload || "";
    } else {
      els.puzPayload.value = "— ENCRYPTED PAYLOAD —\n(locked)\nSolve to extract intel.\n";
    }
  }

  if (els.puzAnswer) els.puzAnswer.value = "";

  els.puzzleModal.classList.add("show");
  els.puzzleModal.setAttribute("aria-hidden", "false");
  els.puzAnswer?.focus?.();
}

function closePuzzle() {
  clearTimeout(modalCloseTimer);
  els.puzzleModal?.classList.remove("show");
  els.puzzleModal?.setAttribute?.("aria-hidden", "true");
  clearModalMessage();
  active = null;
}

/* =======================
   Engine-driven fail adapter
   ======================= */
const LOCAL_FAIL = new Map(); // signalId -> count

function localBump(signalId) {
  const k = String(signalId || "UNKNOWN").toUpperCase();
  const n = (LOCAL_FAIL.get(k) || 0) + 1;
  LOCAL_FAIL.set(k, n);
  return n;
}
function localReset(signalId) {
  const k = String(signalId || "UNKNOWN").toUpperCase();
  LOCAL_FAIL.delete(k);
}

function deriveStageAndSnippet(count, sig) {
  const hint = String(sig?.hint_mask || "").trim();
  const leak = hint ? hint.slice(0, Math.min(70, hint.length)) + (hint.length > 70 ? "…" : "") : "";

  if (count <= 1) return { stage: "DENIED", snippet: "" };
  if (count === 2) return { stage: "ALERT", snippet: "" };
  if (count === 3) return { stage: "HINT", snippet: leak };
  if (count >= LOCKOUT_AFTER) return { stage: "LOCKOUT", snippet: "SESSION TERMINATED" };
  return { stage: "DESTABILIZE", snippet: leak ? `LEAK: ${leak}` : "" };
}

function rejectInfo(signalId, difficulty, sig) {
  let info;
  try { info = vaultReject(signalId, difficulty); }
  catch { info = null; }

  if (info && typeof info === "object") {
    const count = Number(info.count || 1);
    const stage = String(info.stage || "DENIED").toUpperCase();
    const snippet = String(info.snippet || "");
    return { count, stage, snippet };
  }

  const count = localBump(signalId);
  const { stage, snippet } = deriveStageAndSnippet(count, sig);
  return { count, stage, snippet };
}

/* =======================
   Lockout termination
   ======================= */
function terminateSession(signalId) {
  clearSolvedUrlFlags();

  try {
    sessionStorage.removeItem(S_SEEN);
    sessionStorage.removeItem(S_SOLVED);
  } catch {}

  LOCAL_FAIL.clear();
  try { resetRejectCounter?.(signalId); } catch {}

  closePuzzle();

  setStatus("session terminated");
  setState("LOCKOUT");

  revealDirectHint(
    `⚠ BRUTE FORCE DETECTED
${LOCKOUT_AFTER} failed attempts recorded.

SESSION TERMINATED.
Session progress lost.

Scan again to continue.`,
    { mode: "SYSTEM", key: "LOCKOUT", rare: true }
  );

  Sound.tick("bad");
  pulse("vault-hit-2", 420);
  jitter(6, 900);

  setMeter();
  showSignalsHelper("Session terminated. Press SCAN to pull the next fragment.");
}

/* =======================
   Modal UX text for reject
   ======================= */
function modalMessageFromReject(rej) {
  const n = rej?.count ?? 1;
  const stage = String(rej?.stage || "DENIED").toUpperCase();
  const snippet = (rej?.snippet || "").trim();

  if (stage === "DENIED") return { type: "bad", text: `ACCESS DENIED • TRY AGAIN (${n}/${LOCKOUT_AFTER})`, shake: 520 };
  if (stage === "ALERT") return { type: "warn", text: `SECOND FAILURE • THINK DIFFERENT (${n}/${LOCKOUT_AFTER})`, shake: 480 };
  if (stage === "HINT") return { type: "warn", text: snippet ? `HINT LEAK (${n}/${LOCKOUT_AFTER}) • ${snippet}` : `HINT LEAK (${n}/${LOCKOUT_AFTER})`, shake: 380 };
  if (stage === "DESTABILIZE") return { type: "bad", text: snippet ? `DESTABILIZING (${n}/${LOCKOUT_AFTER}) • ${snippet}` : `DESTABILIZING (${n}/${LOCKOUT_AFTER})`, shake: 520 };
  if (stage === "LOCKOUT") return { type: "bad", text: "LOCKOUT • SESSION TERMINATED", shake: 620 };
  return { type: "bad", text: `REJECTED (${n}/${LOCKOUT_AFTER})`, shake: 520 };
}

/* =======================
   Solve flow
   ======================= */
async function solveActive() {
  if (!active) return;
  if (solving) return;
  solving = true;

  try {
    const ans = (els.puzAnswer?.value || "").trim();
    if (!ans) {
      setStatus("type an answer");
      showModalMessage("TYPE AN ANSWER", "warn");
      modalShake(420);
      Sound.tick("sys");
      pulse("vault-hit", 180);
      jitter(1, 520);
      els.puzAnswer?.focus?.();
      return;
    }

    let ok = false;
    try { ok = await verifyAnswer(active, ans); }
    catch { ok = false; }

    if (!ok) {
      const rej = rejectInfo(active.signal_id, active.difficulty || 1, active);
      const ui = modalMessageFromReject(rej);

      showModalMessage(ui.text, ui.type);
      modalShake(ui.shake || 520);

      pulse("vault-hit", 220);
      jitter(active.difficulty || 1, 720);

      if (rej.stage === "ALERT" || rej.stage === "HINT") Sound.tick("warn");
      else Sound.tick("bad");

      if (rej.stage === "LOCKOUT" || rej.count >= LOCKOUT_AFTER) {
        terminateSession(active.signal_id);
        return;
      }

      els.puzAnswer?.focus?.();
      return;
    }

    // SUCCESS: reset fail counters (local + engine)
    localReset(active.signal_id);
    resetRejectCounter?.(active.signal_id);

    showModalMessage("ACCEPTED • VERIFIED", "ok");

    Sound.tick("rare");
    pulse("vault-hit-2", 360);
    jitter(9, 950);

    // Persist progression + vault log (localStorage)
    try {
      onSolveSuccess?.({
        signal_id: active.signal_id,
        title: active.title,
        transmission_type: active.transmission_type,
        difficulty: active.difficulty,
        secret_payload: active.secret_payload,
        unlock_fragment: active.unlock_fragment,
      });
    } catch (e) {
      console.warn("[onSolveSuccess] failed", e);
    }

    markSolvedUrl(active.signal_id);
    markSessionSolved(active.signal_id);

    setMeter();
    renderVaultLog();
    renderProgressHeader(); // ✅ after solve

    setStatus("unlocked");

    try {
      unlockHintByKey(active.signal_id);
    } catch (e) {
      console.warn("[unlockHintByKey] failed", e);
      revealDirectHint("🜏 UNLOCK FAILED.\nVault might not be ready.\nClick the Signal Card first.", {
        mode: "SYSTEM",
        key: "UNLOCK",
        rare: true,
      });
    }

    const p = getProgress?.() || {};
    revealDirectHint(
      "⟡ SOLVED: " + (active.title || active.signal_id) + "\n" + `⟡ Rank: ${p.rank || "UNKNOWN"} • Fragments: ${fragText()}`,
      { mode: "SYSTEM", key: "SOLVED", rare: true }
    );
    if (active.unlock_fragment) {
      revealDirectHint("⟡ " + active.unlock_fragment, { mode: "SYSTEM", key: active.signal_id, rare: true });
    }

    scheduleClosePuzzle(520);
    jumpToNewest?.();

    // Completion FX (now triggers at solved == total puzzles)
    maybeTriggerCompletionFX();

    // NEXT (SEQUENTIAL)
    const next = pickNextUnsolvedInOrder();
    if (next) {
      markSessionSeen(next.signal_id);
      renderSingleSignal(next);
      revealDirectHint(`⟡ NEXT FRAGMENT SELECTED.\n${next.signal_id} • Continue the hunt.`, { mode: "SYSTEM", key: "NEXT", rare: true });
      jumpToNewest?.();
    } else {
      renderSingleSignal(null);
      revealDirectHint(
        "⟡ NO AVAILABLE FRAGMENTS.\nEither all are solved, or clearance gates are locked.\nSolve more to raise rank.",
        { mode: "SYSTEM", key: "DONE", rare: true }
      );
      jumpToNewest?.();
    }
  } finally {
    setTimeout(() => { solving = false; }, 120);
  }
}

/* =======================
   Menu helpers
   ======================= */
function toggleMenu(force) {
  if (!els.menuDrop || !els.menuBtn) return;
  const open = typeof force === "boolean" ? force : !els.menuDrop.classList.contains("open");
  els.menuDrop.classList.toggle("open", open);
  els.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
}

/* =======================
   Boot (DOM-safe)
   ======================= */
function wireUI() {
  els = {
    scanBtn: document.getElementById("scanBtn"),
    signals: document.getElementById("signals"),
    urlLabel: document.getElementById("signalsUrlLabel"),
    syncPct: document.getElementById("syncPct"),
    syncFill: document.getElementById("syncFill"),

    puzzleModal: document.getElementById("puzzleModal"),
    puzTitle: document.getElementById("puzTitle"),
    puzMeta: document.getElementById("puzMeta"),
    puzPrompt: document.getElementById("puzPrompt"),
    puzPayload: document.getElementById("puzPayload"),
    puzAnswer: document.getElementById("puzAnswer"),
    puzSolve: document.getElementById("puzSolve"),
    puzClose: document.getElementById("puzClose"),

    keyInput: document.getElementById("keyInput"),
    unlockBtn: document.getElementById("unlockBtn"),
    helpBtn: document.getElementById("helpBtn"),
    clearBtn: document.getElementById("clearBtn"),

    menuBtn: document.getElementById("menuBtn"),
    menuDrop: document.getElementById("menuDrop"),
    openOnboarding: document.getElementById("openOnboarding"),
    clearProgress: document.getElementById("clearProgress"),
    genChallenge: document.getElementById("genChallenge"),
    soundToggle: document.getElementById("soundToggle"),
    challengeOut: document.getElementById("challengeOut"),
    copyChallengeBtn: document.getElementById("copyChallengeBtn"),

    onboarding: document.getElementById("onboarding"),
    closeOnboarding: document.getElementById("closeOnboarding"),

    // logs UI
    vaultLogList: document.getElementById("vaultLogList"),
    vaultLogCount: document.getElementById("vaultLogCount"),
    vaultLogRefresh: document.getElementById("vaultLogRefresh"),
    vaultLogClear: document.getElementById("vaultLogClear"),

    logModal: document.getElementById("logModal"),
    logTitle: document.getElementById("logTitle"),
    logMeta: document.getElementById("logMeta"),
    logBody: document.getElementById("logBody"),
    logClose: document.getElementById("logClose"),
    logCopy: document.getElementById("logCopy"),
  };

  initVoidUI(
    {
      streamSelector: "#voidStream",
      statusSelector: "#status",
      badgeSelector: "#phaseBadge",
      newestBtnSelector: "#streamTopBtn",
    },
    { beep: (t) => Sound.tick(t) }
  );

  // Sync header on boot
  renderProgressHeader();

  // debug
  try {
    const p = getProgress?.() || {};
    console.log("[APP] engine OK • progress:", {
      fragments: p.fragments,
      rank: p.rank,
      solved: p.solvedCount,
      dev_payload: DEV_SHOW_PAYLOAD,
      completion_video: COMPLETION_VIDEO_SRC,
    });
  } catch (e) {
    console.warn("[APP] getProgress failed:", e);
  }

  if (els.urlLabel) els.urlLabel.textContent = PUZZLES_URL;
  loadBackground(window.__BG_IMAGE__, BASE_VAULT_IMG);

  setMeter();
  wireVaultLogUI();
  maybeTriggerCompletionFX();

  const completion = document.getElementById("completionOverlay");
  if (completion) completion.setAttribute("aria-hidden", completion.classList.contains("show") ? "false" : "true");

  els.scanBtn?.addEventListener("click", () => scanForSignals());

  els.unlockBtn?.addEventListener("click", () => {
    const v = (els.keyInput?.value || "").trim();
    if (!v) {
      setStatus("type a key (0x...) or paste enc:v1 fragment");
      Sound.tick("sys");
      pulse("vault-hit", 160);
      return;
    }
    pulse("vault-hit", 200);
    jitter(2, 540);
    unlockHintByKey(v);
  });

  els.keyInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") els.unlockBtn?.click?.();
  });

  // HELP
  els.helpBtn?.addEventListener("click", () => {
    revealDirectHint(HELP_TERMINAL_TEXT, { mode: "SYSTEM", key: "HELP", rare: true });

    try {
      const p = getProgress?.() || {};
      const logCount = getLogArray().length;
      revealDirectHint(
        `⟡ LOCAL PROGRESS\nFragments: ${fragText()}\nRank: ${p.rank || "UNKNOWN"}\nVault Log: ${logCount}`,
        { mode: "SYSTEM", key: "PROGRESS", rare: true }
      );
    } catch {}

    setStatus("help loaded");
    Sound.tick("sys");
    pulse("vault-hit", 180);
    jitter(1, 520);
    jumpToNewest?.();
  });

  els.clearBtn?.addEventListener("click", () => {
    clearStream();
    setStatus("stream cleared");
    Sound.tick("sys");
    pulse("vault-hit", 160);
  });

  // Puzzle modal
  els.puzClose?.addEventListener("click", closePuzzle);
  els.puzzleModal?.addEventListener("click", (e) => {
    if (e.target === els.puzzleModal) closePuzzle();
  });
  els.puzSolve?.addEventListener("click", solveActive);
  els.puzAnswer?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      solveActive();
    }
  });

  // Menu
  els.menuBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMenu();
  });

  els.openOnboarding?.addEventListener("click", () => {
    toggleMenu(false);
    openUserManual();
  });

  document.addEventListener("click", (e) => {
    if (!els.menuDrop?.classList.contains("open")) return;
    const inMenu = e.target?.closest?.("#menuDrop");
    const onBtn = e.target?.closest?.("#menuBtn");
    if (inMenu || onBtn) return;
    toggleMenu(false);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      toggleMenu(false);
      closePuzzle();
      closeOnboarding();
      closeLogModal();
      closeCompletionOverlay();
    }
  });

  // Onboarding close
  els.closeOnboarding?.addEventListener("click", closeOnboarding);
  els.onboarding?.addEventListener("click", (e) => {
    if (e.target === els.onboarding) closeOnboarding();
  });

  // Sound toggle
  els.soundToggle?.addEventListener("click", () => {
    const on = Sound.toggle();
    els.soundToggle.textContent = "SOUND: " + (on ? "ON" : "OFF");
    setStatus(on ? "sound enabled" : "sound disabled");
    Sound.tick("sys");
    pulse("vault-hit", 180);
  });

  // Challenge
  function genChallenge() {
    const code = ("GS-" + Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6)).toUpperCase();
    if (els.challengeOut) els.challengeOut.value = code;

    const link = new URL(location.href);
    link.searchParams.set("challenge", code);

    navigator.clipboard?.writeText(link.toString()).catch(() => {});
    revealDirectHint("⟡ CHALLENGE LINK COPIED:\n" + link.toString(), { mode: "SYSTEM", key: "CHALLENGE", rare: true });
    Sound.tick("rare");
    pulse("vault-hit-2", 320);
    jitter(7, 820);
    jumpToNewest?.();
  }
  els.genChallenge?.addEventListener("click", genChallenge);

  els.copyChallengeBtn?.addEventListener("click", async () => {
    const v = els.challengeOut?.value?.trim();
    if (!v) return;
    try { await navigator.clipboard.writeText(v); setStatus("challenge copied"); }
    catch { prompt("Copy:", v); }
  });

  // Reset progress
  els.clearProgress?.addEventListener("click", () => {
    const ok = typeof window.confirm === "function" ? confirm("Reset ALL progress and logs?") : true;
    if (!ok) return;

    clearSolvedUrlFlags();

    try {
      sessionStorage.removeItem(S_SEEN);
      sessionStorage.removeItem(S_SOLVED);
    } catch {}

    LOCAL_FAIL.clear();
    if (active?.signal_id) {
      localReset(active.signal_id);
      resetRejectCounter?.(active.signal_id);
    }

    try { resetProgress?.(); } catch {}

    COMPLETION_FIRED = false;
    closeCompletionOverlay();

    setMeter();
    renderVaultLog();
    renderProgressHeader(); // ✅ after reset

    setStatus("progress reset");
    revealDirectHint("⟡ PROGRESS RESET.\nLocal vault cleared.\nScan again to get the next fragment.", {
      mode: "SYSTEM",
      key: "RESET",
      rare: true,
    });

    Sound.tick("warn");
    pulse("vault-hit-2", 360);
    jitter(5, 900);

    jumpToNewest?.();
    showSignalsHelper("Press SCAN to pull the next fragment…");
  });

  showSignalsHelper(
    "Press SCAN to pull the next fragment…",
    `Expected: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
  );
}

async function boot() {
  wireUI();
  await scanForSignals();

  renderProgressHeader(); // ✅ keep header synced post-initial scan

  const p = getProgress?.() || {};
  revealDirectHint(
    "⟡ SIGNAL HUNTER ONLINE.\nSCAN selects the next fragment in order.\nSolve to unlock the next.\n\n" +
      `⟡ Rank: ${p.rank || "UNKNOWN"} • Fragments: ${fragText()}`,
    { mode: "SYSTEM", key: "BOOT", rare: true }
  );
  pulse("vault-hit", 220);
  jitter(2, 620);
  jumpToNewest?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}