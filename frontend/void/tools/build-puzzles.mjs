// tools/build-puzzles.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sha256Hex, randHex, encryptEncV1, makeVaultValueFromFragmentText } from "./crypto-watch.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const blueprintPath = path.resolve(__dirname, "../watcher.blueprint.100.json");
const outPath = path.resolve(__dirname, "../puzzles.master.json");

// Build rules (tweak if you want)
const HASH_ITER = 1; // your app uses sha256(salt:ANSWER) once

function normalizeAnswer(a) {
  return String(a || "").trim().toUpperCase();
}

function mustHave(x, name) {
  if (!x) throw new Error(`Missing required field: ${name}`);
}

import { parse } from "jsonc-parser";

const blueprintText = fs.readFileSync(blueprintPath, "utf8");
const blueprint = parse(blueprintText);
if (!Array.isArray(blueprint)) throw new Error("Blueprint must be an array.");

const out = blueprint.map((b, idx) => {
  mustHave(b.signal_id, "signal_id");
  mustHave(b.prompt, "prompt");
  mustHave(b.hint_mask, "hint_mask");
  mustHave(b.dev_answer, "dev_answer");
  mustHave(b.fragment_text, "fragment_text");

  const answer = normalizeAnswer(b.dev_answer);
  const salt = b.salt || randHex(12);

  // sha256(`${salt}:${ANSWER}`)
  let h = `${salt}:${answer}`;
  let digest = sha256Hex(h);
  for (let i = 1; i < HASH_ITER; i++) digest = sha256Hex(digest);

  // fragment pipeline
  let fragmentPayloadText = b.fragment_text;

  // optional AES encryption
  if (b.fragment_mode === "enc") {
    const pass = String(b.dev_passphrase || "").trim();
    if (!pass) throw new Error(`Missing dev_passphrase for encrypted fragment: ${b.signal_id}`);
    fragmentPayloadText = encryptEncV1(fragmentPayloadText, pass);
  }

  // vault value is base64("MYRQAI_VAULT_START\n...\nMYRQAI_VAULT_END\n")
  const vaultValueB64 = makeVaultValueFromFragmentText(fragmentPayloadText);

  // secret_payload line that vault-engine expects (KEY::VALUE)
  const secret_payload = `${String(b.signal_id).toLowerCase()}::${vaultValueB64}`;

  // final object for your live site (strip dev fields)
  return {
    signal_id: String(b.signal_id).toLowerCase(),
    title: b.title || `Signal Fragment ${idx + 1}`,
    difficulty: Number(b.difficulty || 1),
    transmission_type: b.transmission_type || "RIDDLE",
    secret_payload,
    hint_mask: String(b.hint_mask),
    synchronicity_weight: Number(b.synchronicity_weight || 1),
    unlock_fragment: String(b.unlock_fragment || ""),
    prompt: String(b.prompt),

    // verification fields used by app.js
    salt,
    answer_hash: String(digest).toLowerCase(),
  };
});

fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");
console.log(`✅ Built ${out.length} puzzles -> ${path.relative(process.cwd(), outPath)}`);