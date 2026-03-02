// frontend/config.js (ES Module)
// ✅ Production-safe public config (NO secrets here)
// ✅ Works on BOTH https://myrqai.com and https://www.myrqai.com (uses location.origin)
// ✅ Local dev support (wrangler dev default 8787)
// ✅ Exports API_BASE (HTTP) + WS_BASE (WebSocket) for Ghost chat

const host = location.hostname;
const protocol = location.protocol;

// Local detection (covers localhost + 127.0.0.1 + ::1)
const isLocal =
  host === "localhost" ||
  host === "127.0.0.1" ||
  host === "::1" ||
  host.endsWith(".local");

// Change ONLY if your local worker dev port is different
const LOCAL_WORKER_HOST = "127.0.0.1:8787";

// Local endpoints
const LOCAL_HTTP = `http://${LOCAL_WORKER_HOST}`;
const LOCAL_WS = `ws://${LOCAL_WORKER_HOST}`;

// Production endpoints (same-origin so it works on both myrqai.com and www.myrqai.com)
// NOTE: This assumes your Worker is routed on the same domain at /api*
const PROD_HTTP = location.origin; // e.g. https://myrqai.com OR https://www.myrqai.com
const PROD_WS = protocol === "https:" ? `wss://${location.host}` : `ws://${location.host}`;

// Exported bases
export const API_BASE = isLocal ? LOCAL_HTTP : PROD_HTTP;
export const WS_BASE = isLocal ? LOCAL_WS : PROD_WS;

// Optional helpers
export const ENV = isLocal ? "local" : "prod";
export const FRONTEND_ORIGIN = location.origin;
export const HOST = location.host;