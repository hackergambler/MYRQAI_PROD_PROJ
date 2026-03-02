// frontend/config.js  (ES Module)
// ✅ Production-safe public config (NO secrets here)
// ✅ Handles local dev (wrangler dev on 8787) + production (api.myrqai.com)
// ✅ Provides both HTTP API base and WebSocket base for Ghost chat

const host = location.hostname;

// Local detection (covers localhost + 127.0.0.1 + ::1)
const isLocal =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1" ||
  host.endsWith(".local");

// ✅ Change ONLY if your local worker dev port is different
const LOCAL_WORKER_HOST = "127.0.0.1:8787";

// ✅ Your production worker domain
const PROD_WORKER_HTTP = "https://api.myrqai.com";
const PROD_WORKER_WS = "wss://api.myrqai.com";

// Local endpoints
const LOCAL_HTTP = `http://${LOCAL_WORKER_HOST}`;
const LOCAL_WS = `ws://${LOCAL_WORKER_HOST}`;

// Exported bases
export const API_BASE = isLocal ? LOCAL_HTTP : PROD_WORKER_HTTP;
export const WS_BASE = isLocal ? LOCAL_WS : PROD_WORKER_WS;

// Optional helpers (sometimes useful in UI/debug)
export const ENV = isLocal ? "local" : "prod";
export const FRONTEND_ORIGIN = location.origin;