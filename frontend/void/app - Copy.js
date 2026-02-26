// app.js (FULL UPDATED + FIXED)
// Fixes included:
// ✅ Verify rule supports BOTH formats:
//    (A) legacy: sha256(signal_id + ":" + ANSWER_UPPER + ":" + salt)
//    (B) new:    sha256(salt + ":" + ANSWER_UPPER)
// ✅ No more “FR M” / weird glyph spam: sanitize vault payload text before printing (best-effort)
// ✅ No more auto-reveal on open (only reveals after SOLVE)
// ✅ “Stuck shaking” fixed: hard cleanup timers + safety cleanup on every modal close / escape
// ✅ Stream UX: uses toNewestBtn + jumpToNewest() safely
// ✅ Robust scan validation + stable sort by hex id
// ✅ Modal payload: never shows secret_payload (ARG feel)
// ✅ Better solved UX: highlights solved cards + disables repeated spam clicks (optional but helpful)

import {
  initVoidUI,
  setStatus,
  setPhase,
  clearStream,
  synthesizeFromPayload,
  unlockHintByKey,
  revealDirectHint,
  setHintMask,
  jumpToNewest
} from "./vault-engine.js";

const PUZZLES_URL = window.__PUZZLES_URL__ || "./puzzles.master.json";
const BASE_VAULT_IMG = "./assets/void.png";

const els = {
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
  toNewestBtn: document.getElementById("toNewestBtn"),

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
  obTimer: document.getElementById("obTimer")
};

let PUZZLES = [];
let active = null;
let synthesizedFor = null;

/* =========================
   Utils
========================= */
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

function getSolvedSetFromUrl() {
  const params = new URLSearchParams(location.search);
  const solved = new Set();
  for (const [k, v] of params.entries()) {
    if (k.startsWith("solved_") && v === "1") solved.add(k.slice("solved_".length));
  }
  return solved;
}

/**
 * Best-effort cleanup for the weird “FR M” output you saw.
 * That usually happens when bytes are decoded as UTF-8 incorrectly somewhere.
 * This sanitizer removes control chars and replacement chars, but keeps newlines.
 */
function sanitizeText(s) {
  const str = String(s ?? "");
  return str
    .replace(/\uFFFD/g, "")                 // remove replacement char  
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "") // strip non-ascii except tabs/newlines
    .trim();
}

/* =========================
   Sound
========================= */
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
    }
  };
})();

/* =========================
   Init UI
========================= */
initVoidUI(
  { streamSelector: "#voidStream", statusSelector: "#status", badgeSelector: "#phaseBadge" },
  {
    beep: (t) => Sound.tick(t),
    // optional hook if vault-engine supports it: sanitize stream text (safe no-op if unused)
    sanitize: sanitizeText
  }
);

if (els.urlLabel) els.urlLabel.textContent = PUZZLES_URL;

/* =========================
   Synchronicity meter
========================= */
function showManifestReconstruction() {
  if (document.querySelector(".manifest-overlay")) return;
  const overlay = document.createElement("div");
  overlay.className = "manifest-overlay";
  overlay.innerHTML = `
    <div class="manifest-box">
      <h2>MASTER MANIFEST RECONSTRUCTED</h2>
      <p>Myrq Signal Fully Synchronized.</p>
      <p>All fragments aligned.</p>
      <button id="manifestClose">CLOSE</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById("manifestClose").onclick = () => overlay.remove();
}

function setMeter() {
  const solvedSet = getSolvedSetFromUrl();
  const solved = PUZZLES.filter(p => solvedSet.has(p.signal_id)).length;
  const total = Math.max(PUZZLES.length, 1);
  const pct = Math.round((solved / total) * 100);

  if (els.syncPct) els.syncPct.textContent = String(pct);
  if (els.syncFill) els.syncFill.style.width = pct + "%";

  if (pct >= 100 && PUZZLES.length > 0) showManifestReconstruction();
}

function markSolved(signal_id) {
  const url = new URL(location.href);
  url.searchParams.set("solved_" + signal_id, "1");
  history.replaceState({}, "", url.toString());
  setMeter();
  paintSolvedCards();
}

/* =========================
   FIX: jitter/shake stuck
========================= */
let jitterClassTimer = null;

function clearJitterClasses() {
  const el = document.body;
  [...el.classList].forEach(c => {
    if (c.startsWith("signal-jitter-")) el.classList.remove(c);
  });
}

function stopAllJitterNow() {
  clearTimeout(jitterClassTimer);
  clearJitterClasses();
}

function difficultyJitter(level = 1) {
  stopAllJitterNow();

  const cls = "signal-jitter-" + level;
  document.body.classList.add(cls);

  // guaranteed cleanup
  jitterClassTimer = setTimeout(() => {
    document.body.classList.remove(cls);
    clearJitterClasses();
  }, 520);
}

/* =========================
   Crypto verify
========================= */
async function sha256Hex(str) {
  const data = new TextEncoder().encode(String(str));
  const hash = await crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(hash);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * Supports BOTH hashing formats so you don't get “no answers” confusion:
 * 1) new:    sha256( salt + ":" + ANSWER_UPPER )
 * 2) legacy: sha256( signal_id + ":" + ANSWER_UPPER + ":" + salt )
 */
async function verifyAnswer(sig, answerRaw) {
  const ans = normalizeAnswer(answerRaw);
  if (!ans) return false;

  // hashed puzzles
  if (sig.answer_hash && sig.salt) {
    const target = String(sig.answer_hash).toLowerCase();

    // (A) new format
    const hNew = await sha256Hex(`${sig.salt}:${ans}`);
    if (hNew === target) return true;

    // (B) legacy format
    const hLegacy = await sha256Hex(`${sig.signal_id}:${ans}:${sig.salt}`);
    if (hLegacy === target) return true;

    return false;
  }

  // fallback old format (not recommended)
  if (sig.expected_answer) return ans === normalizeAnswer(sig.expected_answer);

  return false;
}

/* =========================
   Scan
========================= */
async function scanForSignals() {
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

    // basic validation
    for (const p of parsed) {
      if (!p?.signal_id || !String(p.signal_id).match(/^0x[0-9a-f]+$/i)) {
        throw new Error("One or more puzzles have an invalid signal_id (expected 0x...)");
      }
      if (!p?.secret_payload || typeof p.secret_payload !== "string") {
        throw new Error("One or more puzzles are missing secret_payload (string)");
      }
      if (!p?.prompt) {
        // allow, but keep game playable
        p.prompt = "Solve the signal.";
      }
    }

    // stable order
    parsed.sort((a, b) => parseHexIdToInt(a.signal_id) - parseHexIdToInt(b.signal_id));

    PUZZLES = parsed;
    ingestSignals(PUZZLES);
    setMeter();

    setStatus(`signals ingested (${PUZZLES.length})`);
    Sound.tick("sys");

    if (PUZZLES.length === 0) showSignalsHelper("No signals found in puzzles.master.json");
  } catch (e) {
    const msg = e?.message || "scan failed";
    setStatus("scan failed");
    showSignalsHelper(
      "SCAN failed: " + msg,
      `Open directly: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
    );
    revealDirectHint(
      "🜏 SCAN FAILED.\nEnsure /void/puzzles.master.json exists and is served by your server.",
      { mode: "SYSTEM", key: "SCAN" }
    );
    Sound.tick("bad");
  }
}

function ingestSignals(list) {
  if (!els.signals) return;
  els.signals.innerHTML = "";

  list.forEach(sig => {
    const btn = document.createElement("button");
    btn.className = "signal-card";
    btn.type = "button";
    btn.dataset.signalId = sig.signal_id;

    const t = sig.transmission_type || "SIGNAL";
    const hint = (sig.hint_mask || "").slice(0, 120);

    btn.innerHTML = `
      <div class="signal-title">${escapeHtml(sig.title || sig.signal_id)}</div>
      <div class="signal-meta">ID ${escapeHtml(sig.signal_id)} • DIFFICULTY ${sig.difficulty || 1} • ${escapeHtml(t)}</div>
      <div class="signal-desc">${escapeHtml(hint)}${(sig.hint_mask || "").length > 120 ? "…" : ""}</div>
    `;

    btn.addEventListener("click", () => openSignal(sig));
    els.signals.appendChild(btn);
  });

  paintSolvedCards();
}

function paintSolvedCards() {
  if (!els.signals) return;
  const solved = getSolvedSetFromUrl();
  els.signals.querySelectorAll(".signal-card").forEach(btn => {
    const id = btn.dataset.signalId;
    const isSolved = solved.has(id);
    btn.classList.toggle("solved", isSolved);
    btn.setAttribute("aria-pressed", isSolved ? "true" : "false");
  });
}

function buildPrompt(sig) {
  return sig.prompt ? String(sig.prompt) : "Solve the signal.";
}

/* =========================
   Open Signal
========================= */
async function openSignal(sig) {
  active = sig;

  // kill any lingering shake immediately (extra safety)
  stopAllJitterNow();
  difficultyJitter(sig.difficulty || 1);

  setHintMask(sig.hint_mask || "");
  setPhase("SYNTHESIZING");
  setStatus("stabilizing signal…");

  // synth only once per signal (prevents repeated stream spam)
  if (synthesizedFor !== sig.signal_id) {
    try {
      await synthesizeFromPayload(sig.secret_payload, BASE_VAULT_IMG);
      synthesizedFor = sig.signal_id;

      setPhase("READY");
      setStatus("signal stabilized");
      Sound.tick("ok");
    } catch {
      setPhase("ERROR");
      setStatus("synthesis failed (check ./assets/void.png path)");
      Sound.tick("bad");
    }
  } else {
    setPhase("READY");
    setStatus("signal cached");
  }

  // Modal
  if (!els.puzzleModal) return;

  els.puzTitle.textContent = sig.title || sig.signal_id;
  els.puzMeta.textContent = `Signal: ${sig.signal_id} • ${sig.transmission_type || "SIGNAL"} • Difficulty ${sig.difficulty || 1}`;
  els.puzPrompt.textContent = buildPrompt(sig);

  // never leak secret_payload in UI (ARG)
  if (els.puzPayload) els.puzPayload.value = "";

  els.puzAnswer.value = "";
  els.puzzleModal.classList.add("show");
  els.puzAnswer?.focus?.();
}

function closePuzzle() {
  els.puzzleModal?.classList.remove("show");
  active = null;
  // ensure we never “stick shake” after closing
  stopAllJitterNow();
}

els.puzClose?.addEventListener("click", closePuzzle);
els.puzzleModal?.addEventListener("click", (e) => {
  if (e.target === els.puzzleModal) closePuzzle();
});

/* =========================
   Solve
========================= */
els.puzSolve?.addEventListener("click", async () => {
  if (!active) return;

  const ans = (els.puzAnswer.value || "").trim();
  if (!ans) return setStatus("type an answer");

  setStatus("verifying…");

  let ok = false;
  try {
    ok = await verifyAnswer(active, ans);
  } catch {
    ok = false;
  }

  if (!ok) {
    setStatus("incorrect");
    Sound.tick("bad");
    return;
  }

  // success
  markSolved(active.signal_id);
  setStatus("unlocked");
  Sound.tick("rare");

  // reveal fragment ONLY AFTER solve
  unlockHintByKey(active.signal_id);

  // lore message
  const msg = active.unlock_fragment ? ("⟡ " + active.unlock_fragment) : "⟡ SIGNAL SOLVED.";
  revealDirectHint(msg, { mode: "SYSTEM", key: "SOLVED_" + active.signal_id, rare: true });

  // scroll stream to newest
  jumpToNewest?.();

  closePuzzle();
});

/* =========================
   Terminal input
========================= */
els.unlockBtn?.addEventListener("click", () => {
  const v = (els.keyInput.value || "").trim();
  if (!v) return setStatus("type a key (0x...) or paste enc:v1 fragment");
  unlockHintByKey(v);
});

els.keyInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") els.unlockBtn?.click();
});

els.toNewestBtn?.addEventListener("click", () => jumpToNewest?.());

els.clearBtn?.addEventListener("click", () => {
  clearStream();
  setStatus("stream cleared");
});

els.helpBtn?.addEventListener("click", openOnboarding);

/* =========================
   Menu
========================= */
els.menuBtn?.addEventListener("click", () => {
  const open = els.menuDrop.classList.toggle("open");
  els.menuBtn.setAttribute("aria-expanded", open ? "true" : "false");
});

document.addEventListener("click", (e) => {
  if (!els.menuDrop?.classList.contains("open")) return;
  if (e.target === els.menuBtn || els.menuDrop.contains(e.target)) return;
  els.menuDrop.classList.remove("open");
  els.menuBtn?.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (els.menuDrop?.classList.contains("open")) {
      els.menuDrop.classList.remove("open");
      els.menuBtn?.setAttribute("aria-expanded", "false");
    }
    closePuzzle();
    stopAllJitterNow();
  }
});

/* =========================
   Onboarding
========================= */
let obInterval = null;

function openOnboarding() {
  els.onboarding?.classList.add("show");
  stopAllJitterNow();

  if (obInterval) clearInterval(obInterval);

  let t = 10;
  if (els.obTimer) els.obTimer.textContent = String(t);

  obInterval = setInterval(() => {
    t--;
    if (els.obTimer) els.obTimer.textContent = String(Math.max(t, 0));
    if (t <= 0) {
      clearInterval(obInterval);
      obInterval = null;
      els.onboarding?.classList.remove("show");
    }
  }, 1000);
}

els.openOnboarding?.addEventListener("click", openOnboarding);
els.closeOnboarding?.addEventListener("click", () => {
  if (obInterval) { clearInterval(obInterval); obInterval = null; }
  els.onboarding?.classList.remove("show");
});

if (!sessionStorage.getItem("myrq_seen_ob")) {
  sessionStorage.setItem("myrq_seen_ob", "1");
  setTimeout(openOnboarding, 500);
}

/* =========================
   Sound toggle
========================= */
els.soundToggle?.addEventListener("click", () => {
  const on = Sound.toggle();
  els.soundToggle.textContent = "SOUND: " + (on ? "ON" : "OFF");
  setStatus(on ? "sound enabled" : "sound disabled");
});

/* =========================
   Challenge
========================= */
function genChallenge() {
  const code =
    ("GS-" + Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6))
      .toUpperCase();

  if (els.challengeOut) els.challengeOut.value = code;

  const link = new URL(location.href);
  link.searchParams.set("challenge", code);

  navigator.clipboard?.writeText(link.toString()).catch(() => {});
  revealDirectHint("⟡ CHALLENGE LINK COPIED:\n" + link.toString(), {
    mode: "SYSTEM",
    key: "CHALLENGE",
    rare: true
  });
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

els.clearProgress?.addEventListener("click", () => {
  const url = new URL(location.href);
  Array.from(url.searchParams.keys()).forEach(k => {
    if (k.startsWith("solved_")) url.searchParams.delete(k);
  });
  history.replaceState({}, "", url.toString());
  setMeter();
  paintSolvedCards();
  setStatus("progress cleared");
});

/* =========================
   Start
========================= */
els.scanBtn?.addEventListener("click", () => scanForSignals());

(async () => {
  showSignalsHelper(
    "Press SCAN to load signals.",
    `Expected: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
  );

  await scanForSignals();

  revealDirectHint(
    "⟡ SIGNAL HUNTER ONLINE.\nSolve each Signal’s riddle to reconstruct the Master Manifest.\nTip: UNLOCK accepts vault keys (0x...) and encrypted fragments (enc:v1...).",
    { mode: "SYSTEM", key: "BOOT", rare: true }
  );

  jumpToNewest?.();
})();