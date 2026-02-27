// app.js (SESSION RANDOM SINGLE-FRAGMENT GAME LOOP) — ENGINE + PROGRESSION (LOCAL VAULT) + OPTION A LOGS UI
// ✅ Persistent progression (localStorage via vault-engine.js)
// ✅ Session-random gameplay loop (1 fragment at a time)
// ✅ Phase Gates enforced (won’t pick locked signals)
// ✅ Synchronicity meter reflects REAL progress (solvedCount / total)
// ✅ URL solved_* flags kept only as cosmetic/share
// ✅ Clear Progress clears session + URL + local progression
// ✅ Option A: Recovered Logs panel + Log Modal (click entry to open + copy)
// ✅ Completion FX overlay (no HTML changes required): triggers at 100 fragments

import {
  initVoidUI,
  setStatus,
  setPhase,
  clearStream,
  synthesizeFromPayload,
  unlockHintByKey,
  revealDirectHint,
  setHintMask,
  jumpToNewest,
  vaultReject,
  resetRejectCounter,

  // progression + logs (from updated vault-engine.js)
  getProgress,
  onSolveSuccess,
  isSignalUnlocked,
  resetProgress,
  getVaultLog,
  clearVaultLog, // ✅ REQUIRED (your previous code was incorrectly using resetProgress for log clear)
} from "./vault-engine.js";

const PUZZLES_URL = window.__PUZZLES_URL__ || "./puzzles.master.json";
const BASE_VAULT_IMG = "./assets/void.png";

// session keys (still used for “no repeats within session”)
const S_SEEN = "myrq_seen_signals";
const S_SOLVED = "myrq_solved_signals";

// fail policy
const LOCKOUT_AFTER = 20;

let els = {};
let PUZZLES = [];
let active = null;
let synthesizedFor = null;
let scanning = false;
let solving = false;

// completion FX guard
let COMPLETION_FIRED = false;

/* =======================
   HELP + USER MANUAL
   ======================= */
const HELP_TERMINAL_TEXT =
  "⟡ HELP // GHOST SIGNAL\n\n" +
  "Core Loop:\n" +
  "1) Press SCAN → system selects one random fragment.\n" +
  "2) Click the fragment → the vault is synthesized in RAM.\n" +
  "3) Solve → if correct, it reveals a hidden terminal fragment.\n" +
  "4) Then it auto-selects the next unsolved fragment.\n\n" +
  "UNLOCK (why this button exists):\n" +
  "• UNLOCK is a decoder tool.\n" +
  "• It works after a Signal Card is clicked (because the vault must be loaded).\n" +
  "• You can type a key like 0x163 to reveal its fragment.\n" +
  "• Or paste an encrypted fragment like enc:v1:... to decrypt (you’ll be asked a passphrase).\n\n" +
  "Progress:\n" +
  "• Progress is stored locally (your browser), not on the server.\n" +
  "• Rank + Phase Gates unlock more signals as fragments rise.\n";

function userManualHTML() {
  return `
    <p><b>You are a Signal Hunter.</b> Your mission is to reconstruct the Master Manifest by solving fragments.</p>

    <p><b>Loop:</b> <b>SCAN</b> → Click fragment → <b>SOLVE</b> → <b>UNLOCK</b> → Next fragment</p>

    <hr style="border:0;border-top:1px solid rgba(0,255,156,.14);margin:12px 0" />

    <p><b>SCAN</b><br/>
    Picks <b>one random Signal Fragment</b> for this session (from what your clearance allows).</p>

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
    <div class="modal-text">
      <p><b>HOW IT WORKS</b></p>
      ${userManualHTML()}
      <p class="muted tiny" style="margin-top:10px">Auto-closes in <span id="obTimer">25</span>s.</p>
    </div>
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
   Jitter (finite)
   ======================= */
let jitterClassTimer = null;
function clearJitterClasses() {
  const el = document.body;
  [...el.classList].forEach((c) => { if (c.startsWith("signal-jitter-")) el.classList.remove(c); });
}
function difficultyJitter(level = 1) {
  clearTimeout(jitterClassTimer);
  clearJitterClasses();
  const cls = "signal-jitter-" + level;
  document.body.classList.add(cls);
  jitterClassTimer = setTimeout(() => {
    document.body.classList.remove(cls);
    clearJitterClasses();
  }, 520);
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
   Random single fragment selection (CLEARANCE + UNSOLVED)
   ======================= */
function isGloballySolved(sigId) {
  const p = getProgress?.();
  const solved = p?.solved || {};
  return Boolean(solved[String(sigId || "").toUpperCase()]);
}

function pickRandomUnsolved() {
  const sessionSolved = getSessionSolved();

  const pool = PUZZLES.filter((p) => {
    if (!p?.signal_id) return false;
    if (isGloballySolved(p.signal_id)) return false;
    if (sessionSolved.has(p.signal_id)) return false;

    const idx = Number(p.__index) || 1;
    if (!isSignalUnlocked?.(idx)) return false;

    return true;
  });

  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderSingleSignal(sig) {
  if (!els.signals) return;

  if (!sig) {
    const p = getProgress?.() || {};
    els.signals.innerHTML = `
      <div class="side-text muted tiny">
        No available fragments right now.<br/>
        Either you solved them, or your clearance gate is locked.<br/><br/>
        <b>Fragments:</b> ${escapeHtml(String(p.fragments ?? 0))}/100<br/>
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
   Option A: Recovered Logs UI
   ======================= */
function safeDate(ts) {
  if (!ts) return "";
  // vault-engine stores ISO string by default; support numeric too
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

  const log = getLogArray(); // engine already returns newest-first (unshift)
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

  // Keep engine order (newest first) to match UI expectation
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

  // also print into terminal stream (nice hacker feel)
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

  // ✅ FIX: clear ONLY the log (not full reset)
  els.vaultLogClear?.addEventListener("click", () => {
    const ok = typeof window.confirm === "function" ? confirm("Clear recovered logs? (Progress stays)") : true;
    if (!ok) return;

    try {
      clearVaultLog?.();
    } catch {
      // If engine missing, fail gracefully
      setStatus("log clear failed");
      Sound.tick("bad");
      return;
    }

    renderVaultLog();
    setStatus("log cleared");
    Sound.tick("warn");
  });

  // open entry click (event delegation)
  els.vaultLogList?.addEventListener("click", (e) => {
    const item = e.target?.closest?.(".vaultlog-item");
    if (!item) return;

    const idx = Number(item.getAttribute("data-log-idx"));
    const list = getLogArray(); // same order as render
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

  // modal controls
  els.logClose?.addEventListener("click", closeLogModal);
  els.logCopy?.addEventListener("click", copyLogText);
  els.logModal?.addEventListener("click", (e) => {
    if (e.target === els.logModal) closeLogModal();
  });
}

/* =======================
   Completion FX (overlay + pulses)
   ======================= */
function injectCompletionStylesOnce() {
  if (document.getElementById("completionFxStyles")) return;

  const st = document.createElement("style");
  st.id = "completionFxStyles";
  st.textContent = `
  .completion-overlay{
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: grid;
    place-items: center;
    padding: 20px;
    background:
      radial-gradient(900px 520px at 50% 40%, rgba(0,255,156,.18), rgba(0,0,0,.86) 62%),
      linear-gradient(180deg, rgba(0,0,0,.60), rgba(0,0,0,.92));
    backdrop-filter: blur(10px);
    animation: compIn 420ms ease-out both;
  }
  @keyframes compIn{
    from{ opacity:0; transform: scale(.98); }
    to{ opacity:1; transform: scale(1); }
  }
  .completion-card{
    width: min(860px, 94vw);
    border-radius: 24px;
    border: 1px solid rgba(0,255,156,.24);
    background: rgba(0,0,0,.45);
    box-shadow: 0 30px 80px rgba(0,0,0,.65);
    padding: 18px;
    position: relative;
    overflow: hidden;
  }
  .completion-card::before{
    content:"";
    position:absolute;
    inset:-20%;
    background:
      radial-gradient(40% 30% at 30% 30%, rgba(0,255,156,.28), transparent 60%),
      radial-gradient(40% 30% at 70% 60%, rgba(170,80,255,.18), transparent 62%),
      radial-gradient(35% 28% at 60% 25%, rgba(0,120,255,.14), transparent 62%);
    filter: blur(18px);
    opacity:.75;
    animation: compDrift 7.5s ease-in-out infinite;
  }
  @keyframes compDrift{
    0%{ transform: translate3d(-1.2%, -0.8%, 0) scale(1.02); }
    50%{ transform: translate3d( 1.0%,  0.6%, 0) scale(1.03); }
    100%{ transform: translate3d(-1.2%, -0.8%, 0) scale(1.02); }
  }
  .completion-inner{
    position: relative;
    z-index: 2;
    display:flex;
    flex-direction: column;
    gap: 12px;
  }
  .completion-title{
    margin: 0;
    font-size: 18px;
    letter-spacing: .22em;
    text-transform: uppercase;
    color: rgba(225,255,245,.96);
  }
  .completion-sub{
    margin: 0;
    font-size: 12px;
    letter-spacing: .10em;
    color: rgba(225,255,245,.70);
    line-height: 1.7;
    white-space: pre-wrap;
  }
  .completion-code{
    margin-top: 6px;
    font-size: 14px;
    letter-spacing: .18em;
    font-weight: 900;
    color: rgba(0,255,156,.92);
    padding: 12px 12px;
    border-radius: 16px;
    border: 1px solid rgba(0,255,156,.22);
    background: rgba(0,0,0,.35);
    display:flex;
    justify-content: space-between;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }
  .completion-actions{
    display:flex;
    gap: 10px;
    flex-wrap: wrap;
    justify-content:flex-end;
    margin-top: 6px;
  }
  .completion-btn{
    border-radius: 16px;
    border: 1px solid rgba(0,255,156,.22);
    background: rgba(0,0,0,.24);
    color: rgba(225,255,245,.92);
    padding: 12px 14px;
    letter-spacing: .12em;
    font-weight: 900;
    cursor: pointer;
    text-transform: uppercase;
  }
  .completion-btn.primary{
    background: linear-gradient(180deg, rgba(0,255,156,.18), rgba(0,0,0,.18));
    border-color: rgba(0,255,156,.35);
  }
  .completion-btn:hover{ transform: translateY(-1px); }
  `;
  document.head.appendChild(st);
}

async function showCompletionFX() {
  if (COMPLETION_FIRED) return;
  COMPLETION_FIRED = true;

  injectCompletionStylesOnce();

  const p = getProgress?.() || {};
  const rank = p.rank || "PROTOCOL COMPLETE";
  const code = "PROOF: " + (p.fragments >= 100 ? "VAULT_OPEN" : "UNKNOWN");

  const overlay = document.createElement("div");
  overlay.className = "completion-overlay";
  overlay.setAttribute("role", "dialog");
  overlay.setAttribute("aria-modal", "true");

  const card = document.createElement("div");
  card.className = "completion-card";

  const inner = document.createElement("div");
  inner.className = "completion-inner";

  const title = document.createElement("h2");
  title.className = "completion-title";
  title.textContent = "VAULT OPEN • PROTOCOL COMPLETE";

  const sub = document.createElement("p");
  sub.className = "completion-sub";
  sub.textContent =
    "All fragments recovered.\n" +
    `RANK: ${rank}\n` +
    "Screenshot this screen as proof.";

  const codeRow = document.createElement("div");
  codeRow.className = "completion-code";

  const left = document.createElement("div");
  left.textContent = "CLEARANCE CARD";

  const right = document.createElement("div");
  right.style.display = "flex";
  right.style.gap = "10px";
  right.style.alignItems = "center";
  right.style.flexWrap = "wrap";

  const codeEl = document.createElement("span");
  // If vault-engine already prints deterministic code in terminal, you can paste it manually.
  // Here we still show a simple badge; your engine has the real VAULT-XXXXXXXX code in terminal.
  codeEl.textContent = code;

  const copyBtn = document.createElement("button");
  copyBtn.className = "completion-btn";
  copyBtn.type = "button";
  copyBtn.textContent = "COPY";
  copyBtn.addEventListener("click", async () => {
    const t = `${title.textContent}\nRANK: ${rank}\n${code}`;
    try {
      await navigator.clipboard.writeText(t);
      setStatus("completion copied");
      Sound.tick("sys");
    } catch {
      prompt("Copy:", t);
    }
  });

  right.appendChild(codeEl);
  right.appendChild(copyBtn);

  codeRow.appendChild(left);
  codeRow.appendChild(right);

  const actions = document.createElement("div");
  actions.className = "completion-actions";

  const close = document.createElement("button");
  close.className = "completion-btn primary";
  close.type = "button";
  close.textContent = "RETURN TO TERMINAL";
  close.addEventListener("click", () => overlay.remove());

  const reset = document.createElement("button");
  reset.className = "completion-btn";
  reset.type = "button";
  reset.textContent = "RESET PROGRESS";
  reset.addEventListener("click", () => {
    overlay.remove();
    // trigger the same behavior as menu reset
    els.clearProgress?.click?.();
  });

  actions.appendChild(reset);
  actions.appendChild(close);

  inner.appendChild(title);
  inner.appendChild(sub);
  inner.appendChild(codeRow);
  inner.appendChild(actions);

  card.appendChild(inner);
  overlay.appendChild(card);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });

  document.body.appendChild(overlay);

  // extra feel
  Sound.tick("rare");
  document.body.classList.add("vault-hit-2");
  setTimeout(() => document.body.classList.remove("vault-hit-2"), 360);
}

function maybeTriggerCompletionFX() {
  const p = getProgress?.() || {};
  if ((p.fragments || 0) >= 100) showCompletionFX();
}

/* =======================
   Scan
   ======================= */
async function scanForSignals() {
  if (scanning) return;
  scanning = true;

  setPhase("SCANNING");
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

    // assign 1..N index for Phase Gates
    parsed.forEach((p, i) => (p.__index = i + 1));
    PUZZLES = parsed;

    setMeter();
    renderVaultLog();

    setStatus(`signals loaded (${PUZZLES.length})`);
    Sound.tick("sys");

    const chosen = pickRandomUnsolved();
    if (chosen) {
      markSessionSeen(chosen.signal_id);
      renderSingleSignal(chosen);

      const prog = getProgress?.() || {};
      revealDirectHint(
        "⟡ SCAN COMPLETE.\nOne fragment has been selected.\n" +
          `⟡ Rank: ${prog.rank || "UNKNOWN"}\n` +
          `⟡ Fragments: ${prog.fragments || 0}/100`,
        { mode: "SYSTEM", key: "SCAN", rare: true }
      );
      jumpToNewest?.();
    } else {
      renderSingleSignal(null);
      revealDirectHint(
        "⟡ NO AVAILABLE FRAGMENTS.\nEither all are solved, or clearance gates are locked.\nSolve more to raise rank.",
        { mode: "SYSTEM", key: "SCAN" }
      );
      jumpToNewest?.();
    }

    // if user already completed earlier, show FX once
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
  setPhase("SYNTHESIZING");
  setStatus("stabilizing signal…");

  if (synthesizedFor !== sig.signal_id) {
    try {
      await synthesizeFromPayload(sig.secret_payload, BASE_VAULT_IMG, { signal_id: sig.signal_id });
      synthesizedFor = sig.signal_id;
      setPhase("READY");
      setStatus("signal stabilized");
      Sound.tick("ok");
    } catch {
      setStatus("synthesis failed");
      revealDirectHint("🜏 SYNTHESIS FAILED.\nCheck base image path and payload integrity.", { mode: "SYSTEM", key: "SYNTH" });
      Sound.tick("bad");
      return;
    }
  } else {
    setPhase("READY");
    setStatus("signal cached");
  }

  if (!els.puzzleModal) return;

  els.puzTitle && (els.puzTitle.textContent = sig.title || sig.signal_id);
  els.puzMeta &&
    (els.puzMeta.textContent = `Signal: ${sig.signal_id} • ${sig.transmission_type || "SIGNAL"} • Difficulty ${sig.difficulty || 1}`);
  els.puzPrompt && (els.puzPrompt.textContent = sig.prompt ? String(sig.prompt) : "Solve the signal.");
  if (els.puzPayload) els.puzPayload.value = "";
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
  // session-only wipe (DO NOT wipe local progression here)
  clearSolvedUrlFlags();

  try {
    sessionStorage.removeItem(S_SEEN);
    sessionStorage.removeItem(S_SOLVED);
  } catch {}

  LOCAL_FAIL.clear();
  try { resetRejectCounter?.(signalId); } catch {}

  closePuzzle();

  setStatus("session terminated");
  setPhase("LOCKOUT");

  revealDirectHint(
    `⚠ BRUTE FORCE DETECTED
${LOCKOUT_AFTER} failed attempts recorded.

SESSION TERMINATED.
Session progress lost.

Scan again to continue.`,
    { mode: "SYSTEM", key: "LOCKOUT", rare: true }
  );

  setMeter();
  showSignalsHelper("Session terminated. Press SCAN to pull a new fragment.");
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

      if (rej.stage === "ALERT" || rej.stage === "HINT") Sound.tick("warn");

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
    } catch {}

    // Cosmetic URL flag (optional)
    markSolvedUrl(active.signal_id);

    // Session tracking
    markSessionSolved(active.signal_id);

    // Update UI progress + logs
    setMeter();
    renderVaultLog();

    setStatus("unlocked");
    Sound.tick("rare");

    // Reveal fragment in terminal using existing pipeline
    unlockHintByKey(active.signal_id);

    const p = getProgress?.() || {};
    revealDirectHint(
      "⟡ SOLVED: " + (active.title || active.signal_id) + "\n" + `⟡ Rank: ${p.rank || "UNKNOWN"} • Fragments: ${p.fragments || 0}/100`,
      { mode: "SYSTEM", key: "SOLVED", rare: true }
    );
    if (active.unlock_fragment) {
      revealDirectHint("⟡ " + active.unlock_fragment, { mode: "SYSTEM", key: active.signal_id, rare: true });
    }

    scheduleClosePuzzle(520);
    jumpToNewest?.();

    // ✅ Completion FX
    maybeTriggerCompletionFX();

    const next = pickRandomUnsolved();
    if (next) {
      markSessionSeen(next.signal_id);
      renderSingleSignal(next);
      revealDirectHint("⟡ NEXT FRAGMENT SELECTED.\nContinue the hunt.", { mode: "SYSTEM", key: "NEXT", rare: true });
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

    // ✅ Option A log UI
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

  if (els.urlLabel) els.urlLabel.textContent = PUZZLES_URL;
  loadBackground(window.__BG_IMAGE__, BASE_VAULT_IMG);

  // initial meter + log UI from stored progress
  setMeter();
  wireVaultLogUI();

  // if already completed from previous runs, show once
  maybeTriggerCompletionFX();

  els.scanBtn?.addEventListener("click", () => scanForSignals());

  els.unlockBtn?.addEventListener("click", () => {
    const v = (els.keyInput?.value || "").trim();
    if (!v) {
      setStatus("type a key (0x...) or paste enc:v1 fragment");
      Sound.tick("sys");
      return;
    }
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
        `⟡ LOCAL PROGRESS\nFragments: ${p.fragments || 0}/100\nRank: ${p.rank || "UNKNOWN"}\nVault Log: ${logCount}`,
        { mode: "SYSTEM", key: "PROGRESS", rare: true }
      );
    } catch {}

    setStatus("help loaded");
    Sound.tick("sys");
    jumpToNewest?.();
  });

  els.clearBtn?.addEventListener("click", () => {
    clearStream();
    setStatus("stream cleared");
    Sound.tick("sys");
  });

  // Puzzle modal controls
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
    }
  });

  // Onboarding close + click outside
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
    jumpToNewest?.();
  }
  els.genChallenge?.addEventListener("click", genChallenge);

  els.copyChallengeBtn?.addEventListener("click", async () => {
    const v = els.challengeOut?.value?.trim();
    if (!v) return;
    try { await navigator.clipboard.writeText(v); setStatus("challenge copied"); }
    catch { prompt("Copy:", v); }
  });

  // Clear progress (clears local progression too)
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

    // allow completion FX to fire again later
    COMPLETION_FIRED = false;

    setMeter();
    renderVaultLog();
    setStatus("progress reset");
    revealDirectHint("⟡ PROGRESS RESET.\nLocal vault cleared.\nScan again to get a new random fragment.", {
      mode: "SYSTEM",
      key: "RESET",
      rare: true,
    });
    jumpToNewest?.();
    showSignalsHelper("Press SCAN to pull a fragment…");
  });

  showSignalsHelper(
    "Press SCAN to pull a fragment…",
    `Expected: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
  );
}

async function boot() {
  wireUI();
  await scanForSignals();

  const p = getProgress?.() || {};
  revealDirectHint(
    "⟡ SIGNAL HUNTER ONLINE.\nSCAN picks one random fragment per session.\nSolve to unlock the next.\n\n" +
      `⟡ Rank: ${p.rank || "UNKNOWN"} • Fragments: ${p.fragments || 0}/100`,
    { mode: "SYSTEM", key: "BOOT", rare: true }
  );
  jumpToNewest?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}