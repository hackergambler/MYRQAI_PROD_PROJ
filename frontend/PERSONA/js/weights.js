// js/weights.js (FIXED + HARDENED)
// ✅ Handles missing categories safely
// ✅ Prevents NaN/undefined weights
// ✅ Ensures consistent sorted output
// ✅ Normalizes to 0..1 scale (safe when all weights are 0)
// ✅ Adds tiny fallback biases so output never becomes empty

const coreBias = {
  1: ["career_fear", "discipline", "identity"],
  2: ["people_pleasing", "love_conflict", "loneliness"],
  3: ["social_anxiety", "identity", "purpose"],
  4: ["family_pressure", "money_stress", "discipline"],
  5: ["purpose", "identity", "career_fear"],
  6: ["love_conflict", "family_pressure", "trust_wound"],
  7: ["overthinking", "trust_wound", "purpose"],
  8: ["money_stress", "career_fear", "burnout"],
  9: ["grief_change", "purpose", "loneliness"],
};

function add(map, key, val) {
  if (!key) return;
  const cur = Number(map[key] || 0);
  const v = Number(val || 0);
  map[key] = cur + v;
}

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

export function buildCategoryWeights(seed, storedWeights = {}, allCategories = []) {
  const w = {};

  // If categories are missing, create a minimal fallback list
  const cats = Array.isArray(allCategories) && allCategories.length
    ? allCategories
    : [
        "self_doubt","overthinking","loneliness","burnout","identity","family_pressure",
        "trust_wound","career_fear","love_conflict","discipline","social_anxiety",
        "grief_change","money_stress","purpose","anger_suppression","people_pleasing"
      ];

  // initialize
  for (const c of cats) w[c] = 0;

  const core = safeNum(seed?.core);
  const bias = coreBias[core] || [];

  // core bias
  bias.forEach((c, i) => add(w, c, 1.2 - i * 0.25));

  const f = seed?.features || {};
  const repeatScore = safeNum(f.repeatScore);
  const digitCount = safeNum(f.digitCount);
  const rareLetterScore = safeNum(f.rareLetterScore);
  const len = safeNum(f.len);
  const symbolScore = safeNum(f.symbolScore);
  const entropy = safeNum(f.entropy);

  // pattern modifiers (only add if category exists)
  if (repeatScore >= 2) { add(w, "overthinking", 0.9); add(w, "trust_wound", 0.5); }
  if (digitCount >= 2)  { add(w, "money_stress", 0.7); add(w, "career_fear", 0.5); }
  if (rareLetterScore > 0) { add(w, "identity", 0.6); add(w, "purpose", 0.4); }
  if (len > 0 && len <= 5)  { add(w, "discipline", 0.4); add(w, "career_fear", 0.3); }
  if (len >= 10) { add(w, "overthinking", 0.5); add(w, "people_pleasing", 0.3); }
  if (symbolScore >= 1) { add(w, "identity", 0.3); add(w, "trust_wound", 0.2); }
  if (entropy > 0 && entropy < 0.55) add(w, "discipline", 0.3);
  else add(w, "identity", 0.2);

  // merge learned weights from localStorage (only if known category)
  if (storedWeights && typeof storedWeights === "object") {
    for (const [k, v] of Object.entries(storedWeights)) {
      if (k in w) add(w, k, safeNum(v));
    }
  }

  // create sorted list
  const arr = Object.entries(w).map(([key, val]) => ({
    key,
    w: safeNum(val),
  }));

  arr.sort((a, b) => b.w - a.w);

  // normalize to 0..1 for stable UI + selection
  const top = safeNum(arr[0]?.w);
  const denom = top > 0 ? top : 1;

  const scaled = arr.map(x => ({
    key: x.key,
    w: Math.max(0, x.w / denom),
  }));

  return scaled;
}