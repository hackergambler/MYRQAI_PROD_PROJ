# 💀 MYRQAI | GHOST_TRACE
**Secure, Zero-Trace, Edge-Network Ephemeral Messaging.**

GHOST_TRACE is a high-security, ephemeral communication protocol designed for 100% privacy. Built on Cloudflare Workers and Durable Objects, it enforces a "Zero-Trace" architecture where data exists only in-memory and self-destructs based on physical time-elapsed policies.

---

## 🛡️ The Secret Policy
The system operates under four non-negotiable security constraints:

1. **Room Life (TTL):** Every room has a hard 5-minute lifespan. After 300 seconds, the Durable Object instance is purged from the Cloudflare Edge, and all connections are severed.
2. **Message Persistence:** Once decrypted on a client device, a message exists for exactly **8 seconds** before being wiped from the DOM (Document Object Model).
3. **Bot Defense:** A hardware-level 1.5s cooldown is enforced per user to prevent automated scraping or flooding.
4. **No Database:** Messages are never written to disk. They are relayed through memory-only WebSockets.

---

## 🔐 Cryptography: XOR + Base64
GHOST_TRACE uses client-side **XOR Cipher** encryption. The server never sees the "Secret Key," as it is stored only in the URL fragment (`#`), which is never sent to the server.

### The Math
The encryption follows the principle: 
$$P \oplus K = C$$
Where:
* $P$ = Plaintext (Your message)
* $K$ = Key (The Secret Hash in your URL)
* $C$ = Ciphertext (What the server sees)

Because $C \oplus K = P$, only users with the specific URL hash can reconstruct the original data. To the Cloudflare Edge, your messages look like randomized Base64 noise.



---

## 🏗️ Architecture
* **Engine:** Cloudflare Workers (V8 Isolation)
* **State Management:** Durable Objects (In-Memory Room Instances)
* **Frontend:** Vanilla JS / Native WebSockets
* **Encryption:** Client-side XOR + Base64 Encoding



---

## 🚀 Deployment
1. **Worker:** `wrangler deploy --env prod`
2. **Secrets:** - `ADMIN_TOKEN`: For dashboard access.
   - `UPSTASH_REDIS_URL`: For standard API rate-limiting.
3. **Hardware:** Automatically scales to 100k+ concurrent users via Cloudflare's global anycast network.

---

## 📜 Disclaimer
Messages are purged automatically. Once the 8-second "Fuel Bar" hits zero, or the 5-minute Room TTL expires, the data is unrecoverable. **Burn before reading.**