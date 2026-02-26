import { writeFileSync } from "node:fs";
import { createHash, randomBytes } from "node:crypto";

function sha256Hex(s) {
  return createHash("sha256").update(s).digest("hex");
}

function hexId(n) {
  return "0x" + n.toString(16);
}

/**
 * Build 100 real-ish riddles with non-predictable answers.
 * You SHOULD replace answers with your own puzzle logic later.
 */
const baseId = 0x100;
const puzzles = [];

const PACK = [
  {
    prompt: "The first signal echoes silence.\nThe code begins where nothing begins.",
    answer: "ZERO",
    hint: "Think: the origin of counting."
  },
  {
    prompt: "A mirror shows truth only when you stop looking.\nEnter the word that means 'nothing said'.",
    answer: "SILENCE",
    hint: "No sound. No voice."
  },
  {
    prompt: "The vault opens for those who read between lines.\nWhat do you call hidden writing?",
    answer: "CIPHERTEXT",
    hint: "Not plaintext."
  }
];

// Fill 100 with a mix: your first puzzles + generated ones
for (let i = 0; i < 100; i++) {
  const signal_id = hexId(baseId + i);
  const salt = randomBytes(8).toString("hex");

  // pick from PACK for first few, then generate
  let prompt, answer, hint;
  if (i < PACK.length) {
    ({ prompt, answer, hint } = PACK[i]);
  } else {
    // simple themed generated puzzle (replace later with your real riddles)
    prompt =
      `Signal ${String(i + 1).padStart(3, "0")}:\n` +
      `A gate of neon hums at midnight.\n` +
      `Speak the passphrase: the color of the protocol (one word).`;
    answer = "NEON";
    hint = "It glows. It’s the theme color.";
  }

  const material = `${signal_id}:${answer.toUpperCase()}:${salt}`;
  const answer_hash = sha256Hex(material);

  puzzles.push({
    signal_id,
    title: `Signal Fragment ${String(i + 1).padStart(3, "0")}`,
    difficulty: 1 + (i % 5),
    transmission_type: "RIDDLE",
    secret_payload: `${signal_id}::TVlSUUFJX1ZBVUxUX1NUQVJUCkZS${String(i + 1).padStart(3, "0")}\nTVlSUUFJX1ZBVUxUX0VORA==`,
    hint_mask: hint,
    synchronicity_weight: 1,
    unlock_fragment: `Fragment ${i + 1}/100 aligned.`,
    prompt,
    salt,
    answer_hash
  });
}

writeFileSync("puzzles.master.json", JSON.stringify(puzzles, null, 2));
console.log("✅ wrote puzzles.master.json (100 puzzles, hashed answers)");