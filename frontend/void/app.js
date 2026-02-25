import {
  initVoidUI,
  setStatus,
  setPhase,
  synthesizeFromPayload,
  unlockHintByKey,
  revealDirectHint,
  setHintMask
} from "./vault-engine.js";

/**
 * MYRQAI GHOST SIGNAL — app.js (FIXED for 100 puzzles)
 *
 * Must exist for localhost:
 *  - /void/puzzles.master.json
 *  - /void/assets/void.png
 */

const PUZZLES_URL = window.__PUZZLES_URL__ || "./puzzles.master.json";
const DAILY_PULSE = !!window.__DAILY_PULSE__;
const GEMINI_API_KEY = window.__GEMINI_API_KEY__ || "";
const BASE_VAULT_IMG = "./assets/void.png";

/* ===== Elements ===== */
const els = {
  scanBtn: document.getElementById("scanBtn"),
  signals: document.getElementById("signals"),
  urlLabel: document.getElementById("signalsUrlLabel"),
  syncPct: document.getElementById("syncPct"),
  syncFill: document.getElementById("syncFill"),

  // puzzle modal
  puzzleModal: document.getElementById("puzzleModal"),
  puzTitle: document.getElementById("puzTitle"),
  puzMeta: document.getElementById("puzMeta"),
  puzPrompt: document.getElementById("puzPrompt"),
  puzPayload: document.getElementById("puzPayload"),
  puzAnswer: document.getElementById("puzAnswer"),
  puzSolve: document.getElementById("puzSolve"),
  puzClose: document.getElementById("puzClose"),

  // terminal input
  keyInput: document.getElementById("keyInput"),
  unlockBtn: document.getElementById("unlockBtn"),

  // menu
  menuBtn: document.getElementById("menuBtn"),
  menuDrop: document.getElementById("menuDrop"),
  openOnboarding: document.getElementById("openOnboarding"),
  clearProgress: document.getElementById("clearProgress"),
  genChallenge: document.getElementById("genChallenge"),
  soundToggle: document.getElementById("soundToggle"),
  challengeOut: document.getElementById("challengeOut"),
  copyChallengeBtn: document.getElementById("copyChallengeBtn"),

  // onboarding
  onboarding: document.getElementById("onboarding"),
  closeOnboarding: document.getElementById("closeOnboarding"),
  obTimer: document.getElementById("obTimer"),
};

let PUZZLES = [];
let active = null;

/* ===== Utils ===== */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]
  ));
}
function todayYYYYMMDD() {
  return new Date().toISOString().slice(0, 10).replaceAll("-", "");
}
function validateDateKey(val) {
  return /^\d{8}$/.test(val);
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

/* ===== Sound ===== */
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

/* ===== Signal Strength meter (jitter bar) ===== */
let jitterTimer = null;

function ensureSignalStrength() {
  const host = document.querySelector(".meter")?.parentElement;
  if (!host) return;
  if (document.getElementById("ssFill")) return;

  const wrap = document.createElement("div");
  wrap.className = "signal-strength";
  wrap.innerHTML = `
    <div class="signal-strength-head">
      <div class="signal-strength-title">SIGNAL STRENGTH</div>
      <div class="signal-strength-meta" id="ssPct">—</div>
    </div>
    <div class="signal-strength-bar"><div class="signal-strength-fill" id="ssFill"></div></div>
  `;
  const signalsEl = host.querySelector(".signals");
  host.insertBefore(wrap, signalsEl || null);
}
ensureSignalStrength();

function jitter(on) {
  const fill = document.getElementById("ssFill");
  const pct = document.getElementById("ssPct");
  if (!fill || !pct) return;

  if (on) {
    clearInterval(jitterTimer);
    jitterTimer = setInterval(() => {
      const v = Math.floor(12 + Math.random() * 78);
      fill.style.width = v + "%";
      pct.textContent = v + "%";
    }, 90);
  } else {
    clearInterval(jitterTimer);
    fill.style.width = "100%";
    pct.textContent = "100%";
    setTimeout(() => { fill.style.width = "72%"; pct.textContent = "72%"; }, 700);
  }
}

/* ===== Init ===== */
initVoidUI(
  { streamSelector: "#voidStream", statusSelector: "#status", badgeSelector: "#phaseBadge" },
  { beep: (t) => Sound.tick(t) }
);
if (els.urlLabel) els.urlLabel.textContent = PUZZLES_URL;

/* ===== Synchronicity meter from URL flags ===== */
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
  const params = new URLSearchParams(location.search);
  const solved = PUZZLES.filter(p => params.get("solved_" + p.signal_id) === "1").length;
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
}

/* ===== Daily Pulse ===== */
const DAILY_DATE_KEY = "last_pulse_date";
const DAILY_CACHE_KEY = "myrqai_daily_signals";

async function checkDailyPulse() {
  if (!DAILY_PULSE) return false;

  const today = new Date().toISOString().slice(0, 10);
  const last = localStorage.getItem(DAILY_DATE_KEY);
  const cached = localStorage.getItem(DAILY_CACHE_KEY);

  if (last === today && cached) {
    setStatus("daily pulse: cached");
    PUZZLES = JSON.parse(cached);
    ingestSignals(PUZZLES);
    setMeter();
    return true;
  }

  if (!GEMINI_API_KEY) {
    revealDirectHint("🜏 Daily Pulse is ON but Gemini key is missing. Falling back to Master Manifest.", { mode: "SYSTEM", key: "daily" });
    return false;
  }

  setPhase("SCANNING");
  setStatus("STABILIZING DAILY SIGNAL...");
  revealDirectHint("⟡ STABILIZING DAILY SIGNAL...", { mode: "SYSTEM", key: "daily", rare: true });
  jitter(true);

  try {
    const signals = await generateDailySignalsGemini();
    localStorage.setItem(DAILY_DATE_KEY, today);
    localStorage.setItem(DAILY_CACHE_KEY, JSON.stringify(signals));
    PUZZLES = signals;
    ingestSignals(PUZZLES);
    setMeter();
    revealDirectHint("⟡ STABILIZING DAILY SIGNAL... SUCCESS.", { mode: "SYSTEM", key: "daily", rare: true });
    setStatus("daily pulse ready");
    jitter(false);
    Sound.tick("rare");
    return true;
  } catch {
    jitter(false);
    setStatus("daily pulse failed");
    revealDirectHint("🜏 Daily Pulse failed. Falling back to Master Manifest.", { mode: "SYSTEM", key: "daily" });
    return false;
  }
}

async function generateDailySignalsGemini() {
  const prompt = `
Return ONLY valid JSON (no markdown).
Create an array of 3 Signal objects for "MYRQAI GHOST SIGNAL".
Fields: signal_id (hex), title, difficulty(1-5), transmission_type,
secret_payload ("<signal_id>::<base64>" OR "<signal_id>::enc:v1:<...>"),
hint_mask, synchronicity_weight (integer), unlock_fragment (string),
expected_answer (string).
Weights must sum to 100.
`;
  const r = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key=" + encodeURIComponent(GEMINI_API_KEY),
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  const j = await r.json();
  const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("gemini empty");
  return JSON.parse(text);
}

/* ===== Scan (Master Manifest) ===== */
async function scanForSignals() {
  setPhase("SCANNING");
  setStatus("scanning…");
  jitter(true);

  showSignalsHelper("Scanning…");

  try {
    const r = await fetch(PUZZLES_URL, { cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status} while fetching ${PUZZLES_URL}`);

    const text = await r.text();
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error("puzzles.master.json is not valid JSON (server returned HTML?)");
    }

    if (!Array.isArray(parsed)) throw new Error("puzzles.master.json must be an ARRAY");

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
    revealDirectHint("🜏 SCAN FAILED. Ensure /void/puzzles.master.json exists and is served by your server.", { mode: "SYSTEM", key: "SCAN" });
    Sound.tick("bad");
  } finally {
    jitter(false);
  }
}

function ingestSignals(list) {
  if (!els.signals) return;
  els.signals.innerHTML = "";

  list.forEach(sig => {
    const btn = document.createElement("button");
    btn.className = "signal-card";
    btn.type = "button";
    const t = sig.transmission_type || "SIGNAL";

    btn.innerHTML = `
      <div class="signal-title">${escapeHtml(sig.title || sig.signal_id)}</div>
      <div class="signal-meta">ID ${escapeHtml(sig.signal_id)} • DIFFICULTY ${sig.difficulty || 1} • ${escapeHtml(t)}</div>
      <div class="signal-desc">${escapeHtml((sig.hint_mask || "").slice(0, 100))}${(sig.hint_mask || "").length > 100 ? "…" : ""}</div>
    `;

    btn.addEventListener("click", () => openSignal(sig));
    els.signals.appendChild(btn);
  });
}

/* ===== Difficulty-based Signal Jitter ===== */
function difficultyJitter(level = 1) {
  const el = document.body;
  el.classList.add("signal-jitter-" + level);
  setTimeout(() => el.classList.remove("signal-jitter-" + level), 900 + level * 200);
}

/* ===== Open / Synthesize / Solve ===== */
function buildPrompt(sig) {
  // Use puzzle prompt if provided by JSON
  if (sig.prompt) return String(sig.prompt);

  // fallback for old manifest types
  if (sig.transmission_type === "CAESAR") return "Caesar detected. Provide the correct decrypted keyword.";
  if (sig.transmission_type === "CSS_GHOST") return "Inspect hidden CSS variables / metadata for the key.";
  if (sig.transmission_type === "AES_GCM") return "Decrypt the enc:v1 fragment using the required key.";
  if (sig.transmission_type === "LOGIC_DATE") return "Enter today's date in YYYYMMDD format.";
  if (sig.transmission_type === "MASTER_RIDDLE") return "Combine previous keys + date into one answer.";
  return "Solve the signal (use the hint mask).";
}

function openSignal(sig) {
  active = sig;
  difficultyJitter(sig.difficulty || 1);

  setHintMask(sig.hint_mask || "");
  setPhase("SYNTHESIZING");
  setStatus("synthesizing…");

  synthesizeFromPayload(sig.secret_payload, BASE_VAULT_IMG)
    .then(() => {
      setPhase("UNLOCKING");
      setStatus("signal stabilized");
      Sound.tick("ok");

      // Show its key-based hint in stream if your vault-engine supports it
      unlockHintByKey(sig.signal_id);

      if (sig.unlock_fragment) {
        revealDirectHint("⟡ " + sig.unlock_fragment, { mode: "SYSTEM", key: sig.signal_id, rare: true });
      }
    })
    .catch(() => {
      setStatus("synthesis failed (check ./assets/void.png path)");
      Sound.tick("bad");
    });

  // Modal
  if (!els.puzzleModal) return;
  els.puzTitle.textContent = sig.title || sig.signal_id;
  els.puzMeta.textContent = `Signal: ${sig.signal_id} • ${sig.transmission_type || "SIGNAL"} • Difficulty ${sig.difficulty || 1}`;
  els.puzPrompt.textContent = buildPrompt(sig);
  els.puzPayload.value = sig.secret_payload || "";
  els.puzAnswer.value = "";
  els.puzzleModal.classList.add("show");
  els.puzAnswer?.focus?.();
}

function closePuzzle() {
  els.puzzleModal?.classList.remove("show");
  active = null;
}
els.puzClose?.addEventListener("click", closePuzzle);

// close when clicking backdrop
els.puzzleModal?.addEventListener("click", (e) => {
  if (e.target === els.puzzleModal) closePuzzle();
});

els.puzSolve?.addEventListener("click", () => {
  if (!active) return;

  const ans = (els.puzAnswer.value || "").trim().toUpperCase();
  let ok = false;

  // ✅ Generic solving for 100 puzzles
  if (active.expected_answer) {
    ok = ans === String(active.expected_answer).trim().toUpperCase();
  }

  // ✅ Dynamic date puzzles (optional)
  if (!ok && active.transmission_type === "LOGIC_DATE") {
    const t = todayYYYYMMDD();
    ok = validateDateKey(ans) && ans === t;
  }

  // ✅ Master riddle (optional)
  if (!ok && active.transmission_type === "MASTER_RIDDLE") {
    const t = todayYYYYMMDD();
    ok = ans === `ORIGIN-SILENCE-GHOST-${t}`;
  }

  if (ok) {
    markSolved(active.signal_id);
    revealDirectHint("⟡ SOLVED: " + (active.title || active.signal_id), { mode: "SYSTEM", key: "SOLVED", rare: true });
    Sound.tick("rare");
    closePuzzle();
  } else {
    setStatus("incorrect");
    Sound.tick("bad");
  }
});

/* ===== Terminal input ===== */
els.unlockBtn?.addEventListener("click", () => {
  const v = (els.keyInput.value || "").trim();
  if (!v) return setStatus("paste fragment or enter key");
  unlockHintByKey(v);
});
els.keyInput?.addEventListener("keydown", (e) => { if (e.key === "Enter") els.unlockBtn.click(); });

/* ===== Menu ===== */
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
  }
});

/* ===== Onboarding ===== */
function openOnboarding() {
  els.onboarding?.classList.add("show");
  let t = 10;
  if (els.obTimer) els.obTimer.textContent = String(t);
  const it = setInterval(() => {
    t--;
    if (els.obTimer) els.obTimer.textContent = String(Math.max(t, 0));
    if (t <= 0) {
      clearInterval(it);
      els.onboarding?.classList.remove("show");
    }
  }, 1000);
}
els.openOnboarding?.addEventListener("click", openOnboarding);
els.closeOnboarding?.addEventListener("click", () => els.onboarding?.classList.remove("show"));
if (!sessionStorage.getItem("myrq_seen_ob")) {
  sessionStorage.setItem("myrq_seen_ob", "1");
  setTimeout(openOnboarding, 500);
}

/* ===== Sound toggle ===== */
els.soundToggle?.addEventListener("click", () => {
  const on = Sound.toggle();
  els.soundToggle.textContent = "SOUND: " + (on ? "ON" : "OFF");
  setStatus(on ? "sound enabled" : "sound disabled");
});

/* ===== Challenge code ===== */
function genChallenge() {
  const code = ("GS-" + Math.random().toString(36).slice(2, 6) + "-" + Math.random().toString(36).slice(2, 6)).toUpperCase();
  if (els.challengeOut) els.challengeOut.value = code;

  const link = new URL(location.href);
  link.searchParams.set("challenge", code);

  navigator.clipboard?.writeText(link.toString()).catch(() => {});
  revealDirectHint("⟡ CHALLENGE LINK COPIED:\n" + link.toString(), { mode: "SYSTEM", key: "CHALLENGE", rare: true });
  Sound.tick("rare");
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
  Array.from(url.searchParams.keys()).forEach(k => { if (k.startsWith("solved_")) url.searchParams.delete(k); });
  history.replaceState({}, "", url.toString());
  setMeter();
  setStatus("url flags cleared");
});

/* ===== SCAN button wiring ===== */
els.scanBtn?.addEventListener("click", () => scanForSignals());

/* ===== Start ===== */
(async () => {
  showSignalsHelper(
    "Press SCAN to load signals.",
    `Expected: <code>${escapeHtml(new URL(PUZZLES_URL, location.href).toString())}</code>`
  );

  const daily = await checkDailyPulse();
  if (!daily) await scanForSignals();
})();