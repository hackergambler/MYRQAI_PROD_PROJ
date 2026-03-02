// js/storage.js (FIXED + SAFER VERSION)
// ✅ Safe localStorage access (works even if blocked)
// ✅ Prevents corrupted JSON crash
// ✅ Clamps weight ranges safely
// ✅ Prevents duplicate seen IDs
// ✅ Fully compatible with persona-app.js

const KEY_W = "myrq_weights_v1";
const KEY_SEEN = "myrq_seen_v1";

/* ---------------- Safe Storage Helpers ---------------- */

function safeGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function safeSet(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // silently fail (private mode / blocked storage)
  }
}

/* ---------------- Weights ---------------- */

export function loadWeights() {
  const w = safeGet(KEY_W, {});
  return typeof w === "object" && w !== null ? w : {};
}

export function saveWeights(w) {
  if (!w || typeof w !== "object") return;
  safeSet(KEY_W, w);
}

/* ---------------- Seen Scenario IDs ---------------- */

export function loadSeen() {
  const arr = safeGet(KEY_SEEN, []);
  return Array.isArray(arr) ? arr : [];
}

export function saveSeen(arr) {
  if (!Array.isArray(arr)) return;

  // remove duplicates automatically
  const unique = [...new Set(arr)];
  safeSet(KEY_SEEN, unique);
}

/* ---------------- Weight Update Logic ---------------- */

export function updateWeight(weights, category, isYes) {
  if (!weights || typeof weights !== "object") return weights;
  if (!category) return weights;

  const cur = Number(weights[category] || 0);

  // Yes increases more than No decreases
  const delta = isYes ? 0.25 : -0.20;

  // Clamp between -3 and +7 to avoid extreme bias
  const next = Math.max(-3, Math.min(7, cur + delta));

  weights[category] = Number.isFinite(next) ? next : 0;

  return weights;
}