// app.js (SESSION RANDOM SINGLE-FRAGMENT GAME LOOP) — ARCHITECTURE FIX (ENGINE-DRIVEN FAIL STAGES)
// ✅ DOM-safe boot
// ✅ Engine-driven fail stages (works even if vaultReject() returns nothing)
// ✅ Modal UX reacts to stage: DENIED / ALERT / HINT / DESTABILIZE / LOCKOUT
// ✅ No reset-on-open (keeps 3-fail hint progression alive)
// ✅ Wrong answers: modal feedback + shake; close ONLY on LOCKOUT
// ✅ Success: reset counter + unlock + next fragment
// ✅ Anti-bruteforce: LOCKOUT at 20 wrong attempts => session terminated + solved lost + URL cleared
// ✅ HELP button works (prints user guide in terminal)
// ✅ Menu "How it works" opens a real user manual modal explaining UNLOCK purpose
// ✅ Background loader intact
// ✅ No repeats within session, auto-next on solve

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
} from "./vault-engine.js";

const PUZZLES_URL = window.__PUZZLES_URL__ || "./puzzles.master.json";
const BASE_VAULT_IMG = "./assets/void.png";

// session keys
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

/* =======================
   HELP + USER MANUAL (NEW)
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
  "Errors:\n" +
  "• 'Vault not ready' → click a fragment first.\n" +
  "• 'No fragment for key' → that key isn’t in the loaded vault.\n";

function userManualHTML() {
  return `
    <p><b>You are a Signal Hunter.</b> Your mission is to reconstruct the Master Manifest by solving fragments.</p>

    <p><b>Loop:</b> <b>SCAN</b> → Click fragment → <b>SOLVE</b> → <b>UNLOCK</b> → Next fragment</p>

    <hr style="border:0;border-top:1px solid rgba(0,255,156,.14);margin:12px 0" />

    <p><b>SCAN</b><br/>
    Picks <b>one random Signal Fragment</b> for this session.</p>

    <p><b>Click the Fragment</b><br/>
    Clicking a fragment <b>synthesizes the vault in RAM</b> (not uploaded). This is what makes UNLOCK work.</p>

    <p><b>SOLVE</b><br/>
    You answer the question. If correct, the system unlocks the terminal fragment and selects the next unsolved signal.</p>

    <p><b>UNLOCK (what users get)</b><br/>
    UNLOCK reveals hidden fragments by key. It accepts:</p>
    <ul style="margin:8px 0 0 18px">
      <li><code>0x...</code> key (example: <code>0x163</code>)</li>
      <li><code>enc:v1:...</code> encrypted fragment (asks passphrase)</li>
    </ul>

    <p class="muted tiny" style="margin-top:10px">
      If UNLOCK says <b>Vault not ready</b>, you haven’t clicked a Signal yet.<br/>
      If UNLOCK says <b>No fragment for key</b>, that key is not inside the currently loaded vault.
    </p>

    <p class="muted tiny" style="margin-top:10px">
      <b>Progress:</b> Synchronicity reads URL flags like <code>?solved_0x100=1</code>.
    </p>
  `;
}

/* =======================
   Onboarding modal (used as User Manual)
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
    if (t <= 0) {
      closeOnboarding();
    }
  }, 1000);
}

/* =======================
   Modal feedback (puzzle modal)
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

  // default "bad"
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
  return String(s).replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
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
  try { sessionStorage.setItem(key, JSON.stringify([...set])); } catch {}
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
    o.connect(g); g.connect(ac.destination);
    o.start();
    o.stop(ac.currentTime + dur);
  };

  return {
    toggle() { on = !on; return on; },
    tick(type) {
      if (type === "ok") { beep(740, .05, .06); setTimeout(() => beep(980, .05, .04), 60); }
      else if (type === "bad") { beep(220, .08, .06); }
      else if (type === "rare") { beep(520, .05, .05); setTimeout(() => beep(1040, .09, .06), 60); }
      else if (type === "sys") { beep(440, .04, .03); }
      else if (type === "warn") { beep(330, .06, .05); }
    }
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
   Synchronicity meter
   ======================= */
function setMeter() {
  const params = new URLSearchParams(location.search);
  const solved = PUZZLES.filter(p => params.get("solved_" + p.signal_id) === "1").length;
  const total = Math.max(PUZZLES.length, 1);
  const pct = Math.round((solved / total) * 100);
  if (els.syncPct) els.syncPct.textContent = String(pct);
  if (els.syncFill) els.syncFill.style.width = pct + "%";
}
function markSolvedUrl(signal_id) {
  const url = new URL(location.href);
  url.searchParams.set("solved_" + signal_id, "1");
  history.replaceState({}, "", url.toString());
  setMeter();
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
  [...el.classList].forEach(c => { if (c.startsWith("signal-jitter-")) el.classList.remove(c); });
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
   Random single fragment selection
   ======================= */
function isUrlSolved(sigId) {
  const params = new URLSearchParams(location.search);
  return params.get("solved_" + sigId) === "1";
}
function pickRandomUnsolved() {
  const sessionSolved = getSessionSolved();
  const pool = PUZZLES.filter(p => !isUrlSolved(p.signal_id) && !sessionSolved.has(p.signal_id));
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function renderSingleSignal(sig) {
  if (!els.signals) return;

  if (!sig) {
    els.signals.innerHTML = `
      <div class="side-text muted tiny">
        No unsolved fragments available (this session).<br/>
        Reset progress or start a new session.
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
    PUZZLES = parsed;

    setMeter();
    setStatus(`signals loaded (${PUZZLES.length})`);
    Sound.tick("sys");

    const chosen = pickRandomUnsolved();
    if (chosen) {
      markSessionSeen(chosen.signal_id);
      renderSingleSignal(chosen);
      revealDirectHint("⟡ SCAN COMPLETE.\nOne fragment has been selected for this session.", { mode: "SYSTEM", key: "SCAN", rare: true });
      jumpToNewest?.();
    } else {
      renderSingleSignal(null);
      revealDirectHint("⟡ NO NEW FRAGMENTS.\nAll available fragments are solved (or solved this session).", { mode: "SYSTEM", key: "SCAN" });
      jumpToNewest?.();
    }
  } catch (e) {
    const msg = e?.message || "scan failed";
    setStatus("scan failed");
    showSignalsHelper("SCAN failed: " + msg, `Open directly: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`);
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

  // DO NOT reset reject counter on open (keep hint progression)
  // resetRejectCounter(sig.signal_id);

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
  els.puzMeta && (els.puzMeta.textContent =
    `Signal: ${sig.signal_id} • ${sig.transmission_type || "SIGNAL"} • Difficulty ${sig.difficulty || 1}`);
  els.puzPrompt && (els.puzPrompt.textContent = sig.prompt ? String(sig.prompt) : "Solve the signal.");
  if (els.puzPayload) els.puzPayload.value = "";
  if (els.puzAnswer) els.puzAnswer.value = "";

  els.puzzleModal.classList.add("show");
  els.puzAnswer?.focus?.();
}

function closePuzzle() {
  clearTimeout(modalCloseTimer);
  els.puzzleModal?.classList.remove("show");
  clearModalMessage();
  active = null;
}

/* =======================
   Engine-driven fail state adapter
   - If vaultReject() returns {count, stage, snippet}, we use it.
   - If it returns nothing, we compute stages locally
     while still calling engine for terminal output.
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
  try {
    info = vaultReject(signalId, difficulty);
  } catch {
    info = null;
  }

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
  setPhase("LOCKOUT");

  revealDirectHint(
`⚠ BRUTE FORCE DETECTED
${LOCKOUT_AFTER} failed attempts recorded.

SESSION TERMINATED.
Solved fragments lost.

Scan again to continue.`,
    { mode: "SYSTEM", key: "LOCKOUT", rare: true }
  );

  setMeter();
  showSignalsHelper("Session terminated. Press SCAN to pull a new fragment.");
}

/* =======================
   Engine-driven modal UX
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
    try { ok = await verifyAnswer(active, ans); } catch { ok = false; }

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

    showModalMessage("ACCEPTED • FRAGMENT UNLOCKED", "ok");

    markSolvedUrl(active.signal_id);
    markSessionSolved(active.signal_id);

    setStatus("unlocked");
    Sound.tick("rare");

    unlockHintByKey(active.signal_id);

    revealDirectHint("⟡ SOLVED: " + (active.title || active.signal_id), { mode: "SYSTEM", key: "SOLVED", rare: true });
    if (active.unlock_fragment) {
      revealDirectHint("⟡ " + active.unlock_fragment, { mode: "SYSTEM", key: active.signal_id, rare: true });
    }

    scheduleClosePuzzle(520);
    jumpToNewest?.();

    const next = pickRandomUnsolved();
    if (next) {
      markSessionSeen(next.signal_id);
      renderSingleSignal(next);
      revealDirectHint("⟡ NEXT FRAGMENT SELECTED.\nContinue the hunt.", { mode: "SYSTEM", key: "NEXT", rare: true });
      jumpToNewest?.();
    } else {
      renderSingleSignal(null);
      revealDirectHint("⟡ SESSION COMPLETE.\nNo unsolved fragments remain (this session).", { mode: "SYSTEM", key: "DONE", rare: true });
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
    obTimer: document.getElementById("obTimer"),
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

  // ✅ HELP button now works (terminal guide)
  els.helpBtn?.addEventListener("click", () => {
    revealDirectHint(HELP_TERMINAL_TEXT, { mode: "SYSTEM", key: "HELP", rare: true });
    setStatus("help loaded");
    Sound.tick("sys");
    jumpToNewest?.();
  });

  els.clearBtn?.addEventListener("click", () => {
    clearStream();
    setStatus("stream cleared");
    Sound.tick("sys");
  });

  // Modal controls
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

  // ✅ Menu → How it works opens full manual explaining UNLOCK
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

  // Clear progress
  els.clearProgress?.addEventListener("click", () => {
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

    setMeter();
    setStatus("progress reset");
    revealDirectHint("⟡ PROGRESS RESET.\nScan again to get a new random fragment.", { mode: "SYSTEM", key: "RESET", rare: true });
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

  revealDirectHint(
    "⟡ SIGNAL HUNTER ONLINE.\nSCAN picks one random fragment per session.\nSolve to unlock the next.",
    { mode: "SYSTEM", key: "BOOT", rare: true }
  );
  jumpToNewest?.();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { boot(); }, { once: true });
} else {
  boot();
}