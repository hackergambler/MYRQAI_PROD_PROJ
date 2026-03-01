// js/modes.js (FIXED + HARDENED)
// ✅ Never returns empty cards (fallback to any category if needed)
// ✅ Avoids duplicates using seenSet + local de-dupe
// ✅ Handles missing/short weighted array safely
// ✅ Ensures topCategories always have something
// ✅ Caps seen list size and prevents runaway growth
// ✅ Keeps output schema exactly as persona-app expects

function safeArr(a) {
  return Array.isArray(a) ? a : [];
}

function safeStr(s) {
  return typeof s === "string" ? s : "";
}

function safeNum(n) {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function pickRandom(list) {
  if (!list || list.length === 0) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function pickFromCategory(dataset, category, seenSet) {
  const scenarios = safeArr(dataset?.scenarios);
  const cat = safeStr(category);

  const pool = scenarios.filter(s => s && s.category === cat && s.id && !seenSet.has(s.id));
  if (pool.length === 0) return null;
  return pickRandom(pool);
}

function pickAny(dataset, seenSet) {
  const scenarios = safeArr(dataset?.scenarios);
  const pool = scenarios.filter(s => s && s.id && !seenSet.has(s.id));
  if (pool.length === 0) return null;

  // Prefer variety: try to avoid picking same category repeatedly
  return pickRandom(pool);
}

function ensureSeen(seenSet, seenArr, id, max = 60) {
  const sid = safeStr(id);
  if (!sid) return;

  if (!seenSet.has(sid)) {
    seenSet.add(sid);
    seenArr.push(sid);
  }

  // cap size
  while (seenArr.length > max) {
    const removed = seenArr.shift();
    if (removed) seenSet.delete(removed);
  }
}

function buildTopCategories(weighted, n, dataset) {
  const w = safeArr(weighted);
  const cats = safeArr(dataset?.categories);

  // If weighted missing, fallback to categories
  const base = w.length
    ? w
    : cats.map((c, i) => ({ key: c, w: 1 - i * 0.01 }));

  const top = base.slice(0, Math.max(1, n)).map(x => ({
    key: safeStr(x.key),
    w: Number(safeNum(x.w).toFixed(3))
  }));

  // ensure at least 1 valid category
  if (!top[0]?.key && cats[0]) {
    top[0] = { key: cats[0], w: 1 };
  }

  return top;
}

/* ------------------------- PERSONA ------------------------- */

export function buildPersona(dataset, seed, weighted, seenArr) {
  const seenList = safeArr(seenArr);
  const seenSet = new Set(seenList);

  const top2 = buildTopCategories(weighted, 2, dataset);
  const primary = top2[0]?.key;
  const secondary = top2[1]?.key || primary;

  // 5 cards: 3 primary + 2 secondary
  const plan = [primary, primary, primary, secondary, secondary];

  const cards = [];
  const usedIds = new Set();

  for (const cat of plan) {
    let sc = pickFromCategory(dataset, cat, seenSet);
    if (!sc) sc = pickAny(dataset, seenSet);

    if (sc && sc.id && !usedIds.has(sc.id)) {
      cards.push(sc);
      usedIds.add(sc.id);
      ensureSeen(seenSet, seenList, sc.id);
    }
  }

  // emergency fill if still short
  while (cards.length < 5) {
    const sc = pickAny(dataset, seenSet);
    if (!sc || usedIds.has(sc.id)) break;
    cards.push(sc);
    usedIds.add(sc.id);
    ensureSeen(seenSet, seenList, sc.id);
  }

  return {
    mode: "persona",
    seed: {
      core: safeNum(seed?.core),
      sum: safeNum(seed?.sum),
      features: seed?.features || {},
      topCategories: top2
    },
    cards
  };
}

/* ---------------------- PERSONA PRO ------------------------ */

export function buildPersonaPro(dataset, seed, weighted, seenArr) {
  const seenList = safeArr(seenArr);
  const seenSet = new Set(seenList);

  const top4 = buildTopCategories(weighted, 4, dataset);

  const cards = [];
  const usedIds = new Set();

  // 8 cards: 2 per top category
  for (const tc of top4) {
    const cat = tc.key;
    for (let i = 0; i < 2; i++) {
      let sc = pickFromCategory(dataset, cat, seenSet);
      if (!sc) sc = pickAny(dataset, seenSet);

      if (sc && sc.id && !usedIds.has(sc.id)) {
        cards.push(sc);
        usedIds.add(sc.id);
        ensureSeen(seenSet, seenList, sc.id);
      }
    }
  }

  // emergency fill if still short
  while (cards.length < 8) {
    const sc = pickAny(dataset, seenSet);
    if (!sc || usedIds.has(sc.id)) break;
    cards.push(sc);
    usedIds.add(sc.id);
    ensureSeen(seenSet, seenList, sc.id);
  }

  const headCat = safeStr(top4[0]?.key).replace(/_/g, " ") || "your inner pattern";
  const headline = `Your core pattern leans toward ${headCat} — not as a flaw, but as a protective adaptation.`;
  const shadow = `When pressure rises, the same pattern can become heavy: you may over-carry, over-think, or over-protect.`;
  const healingDirection =
    `Therapeutic growth here is simple: choose small honesty + small actions. ` +
    `Not big changes. You don’t need to “fix” yourself — you need gentler consistency.`;

  const microPlan = [
    "Pick one 5-minute action today (no perfection).",
    "Share one honest sentence with a safe person.",
    "Create one recovery ritual (sleep / walk / silence)."
  ];

  return {
    mode: "persona_pro",
    seed: {
      core: safeNum(seed?.core),
      sum: safeNum(seed?.sum),
      features: seed?.features || {},
      topCategories: top4
    },
    cards,
    synthesis: { headline, shadow, healingDirection, microPlan }
  };
}

/* ------------------------- FUTURE -------------------------- */

export function buildFuture(dataset, seed, weighted, seenArr) {
  const seenList = safeArr(seenArr);
  const seenSet = new Set(seenList);

  const top3 = buildTopCategories(weighted, 3, dataset);

  const s7  = pickFromCategory(dataset, top3[0]?.key, seenSet) || pickAny(dataset, seenSet);
  if (s7?.id) ensureSeen(seenSet, seenList, s7.id);

  const s30 = pickFromCategory(dataset, top3[1]?.key, seenSet) || pickAny(dataset, seenSet);
  if (s30?.id) ensureSeen(seenSet, seenList, s30.id);

  const s90 = pickFromCategory(dataset, top3[2]?.key, seenSet) || pickAny(dataset, seenSet);
  if (s90?.id) ensureSeen(seenSet, seenList, s90.id);

  const timeline = [
    {
      label: "Next 7 days",
      insight: safeStr(s7?.present) || "A short emotional recalibration phase.",
      action: safeStr(s7?.gentle_action) || "Do one small stabilizing habit."
    },
    {
      label: "Next 30 days",
      insight: safeStr(s30?.future) || "A growth challenge appears through routine and choice.",
      action: safeStr(s30?.gentle_action) || "Commit to one small plan."
    },
    {
      label: "Next 90 days",
      insight: safeStr(s90?.future) || "A direction becomes clearer as self-trust increases.",
      action: safeStr(s90?.gentle_action) || "Choose one path and stay."
    }
  ];

  // consistent “probability bars”
  const rep = safeNum(seed?.features?.repeatScore);
  const pressure = clamp(Math.round((rep / 6) * 100), 0, 100);

  const bars = {
    Stability: clamp(Math.round((safeNum(top3[1]?.w) || 0.4) * 100), 0, 100),
    Connection: clamp(Math.round((safeNum(top3[2]?.w) || 0.35) * 100), 0, 100),
    Growth: clamp(Math.round((safeNum(top3[0]?.w) || 0.5) * 100), 0, 100),
    Pressure: pressure
  };

  return {
    mode: "future",
    seed: {
      core: safeNum(seed?.core),
      sum: safeNum(seed?.sum),
      features: seed?.features || {},
      topCategories: top3
    },
    futureTimeline: timeline,
    bars
  };
}