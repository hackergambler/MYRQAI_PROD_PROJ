// js/username-seed.js (FIXED + HARDENED)
// ✅ Normalizes username consistently (keeps A-Z 0-9 _ .)
// ✅ Stable numeric seed (A1Z26 + digits)
// ✅ Extra safe guards (empty string handling)
// ✅ Keeps output shape used by persona-app.js

export function normalizeUsername(raw) {
  const s = String(raw ?? "").trim();

  // keep A-Z 0-9 _ . (optional), everything else removed
  // NOTE: do NOT store this value anywhere—only used for current computation
  return s.toUpperCase().replace(/[^A-Z0-9_.]/g, "");
}

function digitalRoot(n) {
  // returns 1..9 (0 becomes 9)
  let x = Math.abs(Number(n) || 0);

  // if sum is 0 (e.g. username empty after cleanup), return 9 as fallback vibe
  if (x === 0) return 9;

  while (x > 9) {
    let acc = 0;
    const str = String(x);
    for (let i = 0; i < str.length; i++) acc += (str.charCodeAt(i) - 48);
    x = acc;
  }
  return x;
}

function a1z26(ch) {
  const code = ch.charCodeAt(0);

  // A..Z => 1..26
  if (code >= 65 && code <= 90) return code - 64;

  // 0..9 => 0..9
  if (code >= 48 && code <= 57) return code - 48;

  return 0;
}

function countRepeats(s) {
  if (!s) return 0;

  const m = new Map();
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    m.set(c, (m.get(c) || 0) + 1);
  }

  // count extra occurrences beyond the first
  let repeats = 0;
  for (const v of m.values()) if (v > 1) repeats += (v - 1);
  return repeats;
}

function rareLetterScore(s) {
  if (!s) return 0;

  // rare-ish letters for "identity vibe"
  const rare = new Set(["J", "Q", "X", "Z", "V", "K"]);
  let c = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (rare.has(ch)) c++;
  }
  return c;
}

function entropyScore(s) {
  // simple entropy-ish: how varied characters are
  if (!s) return 0;

  const set = new Set(s.split(""));
  return set.size / Math.max(1, s.length);
}

export function calcSeed(rawUsername) {
  const u = normalizeUsername(rawUsername);

  let sum = 0;
  let digitCount = 0;
  let symbolScore = 0;

  for (let i = 0; i < u.length; i++) {
    const ch = u[i];

    if (ch >= "0" && ch <= "9") digitCount++;
    if (ch === "_" || ch === ".") symbolScore++;

    sum += a1z26(ch);
  }

  const core = digitalRoot(sum);

  const features = {
    len: u.length,
    digitCount,
    repeatScore: countRepeats(u),
    rareLetterScore: rareLetterScore(u),
    symbolScore,
    entropy: entropyScore(u),
  };

  return { username: u, sum, core, features };
}