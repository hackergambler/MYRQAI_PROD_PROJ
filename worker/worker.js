// worker.js — PROD-HARDENED (persona parts removed) + SAFE CORS + DO ORIGIN CHECK + NO STACK LEAKS
// ✅ Supports multiple allowed origins via env.ALLOWED_ORIGINS (comma-separated)
// ✅ Durable Object WebSocket Origin check (same allowlist)
// ✅ /api/send, /api/get, /api/ghost/* (for route myrqai.com/api*)
// ✅ URL-encodes Upstash REST path parts to prevent ciphertext corruption
// ✅ Removes /api/admin/login (do NOT do admin login from browser)
// ✅ Admin route uses x-admin-token header (server-side only)
// ✅ Request body size limits + safe JSON parsing
// ✅ Safe Redis decode (no crash on bad data)
// ✅ Message size limits
//
// ENV REQUIRED:
// - ALLOWED_ORIGINS = "https://myrqai.com,https://www.myrqai.com,https://myrqai-prod.tibco-tibco-8.pages.dev"
// - ADMIN_TOKEN (secret)
// - UPSTASH_REDIS_REST_URL (secret)
// - UPSTASH_REDIS_REST_TOKEN (secret)

const PREFIX = "securemsg:";

/* ---------------- 0. ORIGIN / CORS ---------------- */

function parseAllowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(origin, env) {
  if (!origin) return false;
  const allowed = parseAllowedOrigins(env);
  return allowed.length === 0 ? false : allowed.includes(origin);
}

function corsHeaders(req, env) {
  const origin = req.headers.get("Origin") || "";
  const allowed = parseAllowedOrigins(env);

  // If you want "same-origin only" behavior, keep this strict.
  const ok = origin && allowed.includes(origin);

  return {
    "Access-Control-Allow-Origin": ok ? origin : "null",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "Content-Type", // keep minimal
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  };
}

const cors = (req, env) => new Response(null, { status: 204, headers: corsHeaders(req, env) });

const json = (req, env, data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req, env) },
  });

const methodNotAllowed = (req, env) => json(req, env, { error: "Method Not Allowed" }, 405);

async function readJson(req, maxBytes = 10_000) {
  const len = Number(req.headers.get("Content-Length") || "0");
  if (len && len > maxBytes) return null;
  try {
    return await req.json();
  } catch {
    return null;
  }
}

/* ---------------- 1. DURABLE OBJECT CLASS (GHOST ROOMS) ---------------- */
export class GhostRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.startTime = Date.now();
    this.ROOM_TTL = 120000; // 2 Minutes
    this.IDLE_LIMIT = 55000; // 55 Seconds
  }

  async fetch(request) {
    try {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      // ✅ Origin allowlist for WebSocket
      const origin = request.headers.get("Origin") || "";
      if (!isOriginAllowed(origin, this.env)) {
        return new Response("Forbidden", { status: 403 });
      }

      const now = Date.now();
      if (now - this.startTime > this.ROOM_TTL) {
        return new Response("ROOM_EXPIRED", { status: 410 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      // ✅ Do NOT attach CORS headers to WS upgrade response
      return new Response(null, { status: 101, webSocket: client });
    } catch (err) {
      console.error("GhostRoom crash:", err);
      return new Response("Internal Error", { status: 500 });
    }
  }

  async handleSession(server) {
    server.accept();

    const sessionData = {
      lastMsgTime: Date.now(),
      idleTimer: null,
    };

    this.sessions.set(server, sessionData);

    const resetIdleTimeout = () => {
      if (sessionData.idleTimer) clearTimeout(sessionData.idleTimer);
      sessionData.idleTimer = setTimeout(() => {
        try {
          server.send(JSON.stringify({ type: "sys-err", data: "IDLE_TERMINATION" }));
          server.close(1008, "Inactivity Purge");
        } catch (e) {}
      }, this.IDLE_LIMIT);
    };

    resetIdleTimeout();

    server.addEventListener("message", async (msg) => {
      try {
        const now = Date.now();

        // 1) Room TTL
        if (now - this.startTime > this.ROOM_TTL) {
          try {
            server.send(JSON.stringify({ type: "sys-err", data: "SESSION_EXPIRED" }));
          } catch {}
          setTimeout(() => {
            try {
              server.close(1001, "TTL_REACHED");
            } catch {}
          }, 50);
          return;
        }

        // 2) JSON validation
        let packet;
        try {
          packet = JSON.parse(msg.data);
        } catch {
          return;
        }

        // 3) Packet size limit
        if (packet?.data && String(packet.data).length > 200) {
          try {
            server.send(JSON.stringify({ type: "sys-err", data: "PACKET_SIZE_VIOLATION" }));
          } catch {}
          try {
            server.close(1008, "Policy Violation");
          } catch {}
          return;
        }

        // 4) Spam throttling (1.5s)
        if (now - sessionData.lastMsgTime < 1500) {
          try {
            server.send(JSON.stringify({ type: "sys-err", data: "THROTTLED" }));
          } catch {}
          return;
        }

        sessionData.lastMsgTime = now;
        resetIdleTimeout();

        this.broadcast(packet.data, server);
      } catch (e) {
        console.error("DO Msg Error:", e);
      }
    });

    const cleanup = () => {
      if (sessionData.idleTimer) clearTimeout(sessionData.idleTimer);
      this.sessions.delete(server);
    };

    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
  }

  broadcast(data, sender) {
    const packet = JSON.stringify({ type: "ghost-msg", data: data });
    for (const [socket] of this.sessions) {
      if (socket !== sender && socket.readyState === 1) {
        try {
          socket.send(packet);
        } catch (e) {
          this.sessions.delete(socket);
        }
      }
    }
  }
}

/* ---------------- 2. MAIN WORKER HANDLER ---------------- */
export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const country = req.cf?.country || "XX";

      // OPTIONS preflight
      if (req.method === "OPTIONS") return cors(req, env);

      /* ---------- GHOST CHAT (DURABLE OBJECTS) ---------- */
      if (path.startsWith("/api/ghost/")) {
        const parts = path.split("/").filter(Boolean);
        const roomId = parts[parts.length - 1];

        if (!roomId || roomId.length < 5) return json(req, env, { error: "Invalid Room" }, 400);

        const id = env.GHOST_ROOMS.idFromName(roomId);
        const roomObject = env.GHOST_ROOMS.get(id);
        return roomObject.fetch(req);
      }

      /* ---------- HEALTH ---------- */
      if (path === "/health") return json(req, env, { status: "ok", time: new Date().toISOString() });

      /* ---------- ADMIN ---------- */
      if (path === "/api/admin/stats") {
        if (!verifyAdmin(req, env)) return json(req, env, { error: "Unauthorized" }, 401);
        return await adminStats(req, env);
      }

      /* ---------- RATE LIMIT (GLOBAL) ---------- */
      if (await rateLimitIP(ip, env)) {
        return json(req, env, { error: "Too many requests" }, 429);
      }

      /* ---------- SECURE MSG ROUTES ---------- */
      if (path === "/api/send") return req.method === "POST" ? await send(req, env, ip, country) : methodNotAllowed(req, env);
      if (path === "/api/get") return req.method === "POST" ? await get(req, env) : methodNotAllowed(req, env);

      return json(req, env, { error: "Route not found" }, 404);
    } catch (err) {
      console.error("Worker Global Crash:", err);
      // best-effort CORS
      return json(req, env, { error: "Internal Server Error" }, 500);
    }
  },
};

/* ---------------- 3. UPSTASH REDIS HELPERS (URL-ENCODE PATH) ---------------- */

function encPart(s) {
  // Upstash REST uses path segments; encode to prevent corruption
  return encodeURIComponent(String(s));
}

async function redis(env, cmd) {
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/${cmd}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
    });
    return res.ok ? await res.json() : { result: null };
  } catch (e) {
    return { result: null };
  }
}

const incr = (k, env) => redis(env, `INCR/${encPart(PREFIX + k)}`);

async function rateLimitIP(ip, env) {
  const key = `rl:ip:${ip}`;
  const r = await incr(key, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${encPart(PREFIX + key)}/60`);
  return count > 60;
}

async function rateLimitKey(key, env) {
  const k = `rl:key:${key}`;
  const r = await incr(k, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${encPart(PREFIX + k)}/300`);
  return count > 15;
}

const validKey = (k) => /^[A-Z0-9]{6,12}$/.test(k);

/* ---------------- 4. ROUTE HANDLERS ---------------- */

async function send(req, env, ip, country) {
  const body = await readJson(req, 15_000);
  if (!body || !validKey(body.key) || typeof body.data !== "string") {
    return json(req, env, { error: "Invalid Data" }, 400);
  }

  // message size limit (client-encrypted payload)
  if (body.data.length > 5000) return json(req, env, { error: "Message too large" }, 413);

  if (await rateLimitKey(body.key, env)) return json(req, env, { error: "Limit Exceeded" }, 429);

  const redisKey = `${PREFIX}msg:${body.key}`;
  const existing = await redis(env, `GET/${encPart(redisKey)}`);

  let messages = [];
  if (existing.result) {
    try {
      messages = JSON.parse(atob(existing.result));
      if (!Array.isArray(messages)) messages = [];
    } catch {
      messages = [];
    }
  }

  if (messages.length >= 5) return json(req, env, { error: "Full" }, 429);

  messages.push(body.data);

  const payload = btoa(JSON.stringify(messages));
  await redis(env, `SET/${encPart(redisKey)}/${encPart(payload)}`);
  await redis(env, `EXPIRE/${encPart(redisKey)}/86400`);
  await incr("stats:send", env);

  return json(req, env, { success: true });
}

async function get(req, env) {
  const body = await readJson(req, 5_000);
  if (!body || !validKey(body.key)) return json(req, env, { error: "Invalid Key" }, 400);

  const redisKey = `${PREFIX}msg:${body.key}`;
  const res = await redis(env, `GETDEL/${encPart(redisKey)}`);

  if (!res.result) return json(req, env, { found: false });

  let decoded = [];
  try {
    decoded = JSON.parse(atob(res.result));
    if (!Array.isArray(decoded)) decoded = [];
  } catch {
    decoded = [];
  }

  await incr("stats:get", env);
  return json(req, env, { found: true, messages: decoded });
}

/* ---------------- 5. ADMIN ---------------- */

function verifyAdmin(req, env) {
  return req.headers.get("x-admin-token") === env.ADMIN_TOKEN;
}

async function adminStats(req, env) {
  const [s, g] = await Promise.all([
    redis(env, `GET/${encPart(PREFIX + "stats:send")}`),
    redis(env, `GET/${encPart(PREFIX + "stats:get")}`),
  ]);

  const send = Number(s.result || 0);
  const get = Number(g.result || 0);

  return json(req, env, { stats: { send, get } });
}