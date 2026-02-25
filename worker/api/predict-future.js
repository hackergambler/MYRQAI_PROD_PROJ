/**
 * API Handler: predict-future
 * Handles the logic for the Future AI Predictor.
 * This module returns a raw object which is then wrapped by worker.js.
 */

export async function handlePredictFuture(req) {
  let data;
  try {
    // We only try to parse the JSON. No Response objects are created here.
    data = await req.json();
  } catch (e) {
    return { success: false, error: "Invalid JSON body" };
  }

  const username = String(data?.username || "").trim();

  // 1. Validation Logic
  if (username.length < 3 || username.length > 32) {
    return { success: false, error: "Username must be 3-32 characters" };
  }

  // 2. Deterministic Seed Generation
  const seed = hash(username.toLowerCase());

  // 3. Return Plain Object (worker.js will handle the Response creation)
  return {
    success: true, // This boolean status is what frontend checks (if (!j.success))
    username: username.charAt(0).toUpperCase() + username.slice(1),

    // Numeric Scores (1-100) used for the meters in future.js
    // FIX: Renamed 'success' score to 'prediction_score' to avoid collision with boolean
    prediction_score: score(seed, 9), 
    wealth: score(seed, 7),
    evolution: score(seed, 11),
    burnout: score(seed, 5),

    // Categorical Predictions
    decision: pick([
      "Strategic Mastermind",
      "Logical Analyst",
      "Adaptive Chameleon",
      "Instinctive Pioneer",
      "Visionary Architect",
      "Emotionally Intelligent Leader"
    ], seed + 3),

    trajectory: pick([
      "Rapid intelligence-driven growth path",
      "Strategic slow-burn dominance curve",
      "Explosive entrepreneurial acceleration",
      "Creative mastery & influence expansion",
      "Leadership authority dominance route",
      "Deep technical mastery lifecycle"
    ], seed + 7),

    relationship: pick([
      "Stable loyal long-term bonds",
      "Emotionally intense connections",
      "Highly selective deep bonds",
      "Independent yet strategic partnerships",
      "Low dependency high-trust relations"
    ], seed + 11),

    // Narrative Projections
    future3: pick([
      "Skill explosion, strategic clarity, and financial acceleration.",
      "Mental discipline phase with significant long-term positioning.",
      "Major career inflection point leading to an opportunity surge.",
      "Deep mastery and recognition cycle within your field.",
      "Authority expansion and leadership scaling across networks."
    ], seed + 13),

    future10: pick([
      "Elite authority role, massive wealth accumulation, and influence dominance.",
      "Independent empire building supported by intellectual leadership.",
      "Creative legacy creation and generational financial freedom.",
      "Global technical architect with systemic impact on industry.",
      "Strategic mastermind with industry-shaping power and high autonomy."
    ], seed + 17)
  };
}

/* -------- Pure Utilities -------- */

/**
 * Deterministic hash (FNV-1a inspired)
 */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h);
}

/**
 * Selects an item from an array based on the seed
 */
function pick(arr, seed) {
  return arr[seed % arr.length];
}

/**
 * Generates a deterministic score between 1 and 100
 */
function score(seed, mod) {
  return ((seed * mod) % 100) + 1;
}