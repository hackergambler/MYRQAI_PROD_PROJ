# MyrqAI Void Vault (End-to-End)

## What this includes
- **Frontend**: hacker-style Void Vault UI + puzzle unlocks + AES message creator
- **Backend**: Cloudflare Worker API to store encrypted fragments in Redis (one-time read)
- **Tooling**: script to append your vault text into encode.png automatically

---

## 1) Frontend run
Open `frontend/void.html` (best via VSCode Live Server).

### Set backend URL
In `frontend/void.html`:
```js
window.__API_BASE__ = "https://<your-worker>.workers.dev";
```

---

## 2) Backend deploy (Cloudflare Worker)
### Prereqs
- Cloudflare account + Wrangler installed
- Upstash Redis (REST URL + token)

### Steps
```bash
cd backend
wrangler login
wrangler secret put UPSTASH_REDIS_REST_URL
wrangler secret put UPSTASH_REDIS_REST_TOKEN
wrangler deploy
```

---

## 3) Rebuild encode.png automatically
Use the script:

```bash
python3 tools/append_vault.py frontend/assets/encode_base.png vault.txt frontend/assets/encode.png
```

Your frontend already ships with a rebuilt `encode.png`.

---

## Safety note
This project is designed as a puzzle-style vault + privacy tool. Do not use for abuse.
