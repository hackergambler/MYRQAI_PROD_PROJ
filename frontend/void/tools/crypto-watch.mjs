// tools/crypto-watch.mjs
import crypto from "node:crypto";

export function sha256Hex(str) {
  return crypto.createHash("sha256").update(str, "utf8").digest("hex");
}

export function randHex(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * AES-GCM + PBKDF2 format:
 * enc:v1:<base64(json)>
 * json = { v:1, salt:<b64>, iv:<b64>, ct:<b64> }
 */
export function encryptEncV1(plaintext, passphrase) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);

  const key = crypto.pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    salt,
    120000,
    32,
    "sha256"
  );

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const payload = {
    v: 1,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    ct: Buffer.concat([enc, tag]).toString("base64"),
  };

  return "enc:v1:" + Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
}

export function makeVaultValueFromFragmentText(fragmentText) {
  const block =
    "MYRQAI_VAULT_START\n" +
    fragmentText.replace(/\r/g, "") +
    "\nMYRQAI_VAULT_END\n";

  return Buffer.from(block, "utf8").toString("base64");
}