// worker.js — ONLY persona-related parts removed (nothing else touched)

// ❌ REMOVED persona imports
// import { handlePersona } from "./api/persona";
// import { handlePersonaPro } from "./api/persona-pro";
// import { handlePredictFuture } from "./api/predict-future";

const PREFIX = "securemsg:";

/* ---------------- 1. DURABLE OBJECT CLASS (GHOST ROOMS) ---------------- */
export class GhostRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); 
    this.startTime = Date.now();
    this.ROOM_TTL = 120000; // 2 Minutes (120,000ms)
    this.IDLE_LIMIT = 55000; // 55 Seconds (gives frontend 5s headstart to redirect)
  }

  async fetch(request) {
    try {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }

      const now = Date.now();
      // If room is older than 2 mins, deny any new entry
      if (now - this.startTime > this.ROOM_TTL) {
        return new Response("ROOM_EXPIRED", { status: 410, headers: corsHeaders });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server);

      return new Response(null, { 
        status: 101, 
        webSocket: client,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        }
      });
    } catch (err) {
      return new Response(err.stack, { status: 500 });
    }
  }

  async handleSession(server) {
    server.accept();
    
    // Session state with individual idle timer
    const sessionData = { 
      lastMsgTime: Date.now(),
      idleTimer: null 
    };
    
    this.sessions.set(server, sessionData);

    // Function to handle inactivity kill-switch
    const resetIdleTimeout = () => {
      if (sessionData.idleTimer) clearTimeout(sessionData.idleTimer);
      sessionData.idleTimer = setTimeout(() => {
        try {
          server.send(JSON.stringify({ type: "sys-err", data: "IDLE_TERMINATION" }));
          server.close(1008, "Inactivity Purge");
        } catch (e) {}
      }, this.IDLE_LIMIT);
    };

    resetIdleTimeout(); // Start idle clock on connection

    server.addEventListener("message", async (msg) => {
      try {
        const now = Date.now();
        
        // 1. Room Lifetime Check (The 2-Minute Wall)
        if (now - this.startTime > this.ROOM_TTL) {
          server.send(JSON.stringify({ type: "sys-err", data: "SESSION_EXPIRED" }));
          setTimeout(() => server.close(1001, "TTL_REACHED"), 50);
          return;
        }

        // 2. Data Validation (JSON Check)
        let packet;
        try {
          packet = JSON.parse(msg.data);
        } catch(e) {
          return; // Ignore malformed raw data
        }

        // 3. Character Limit (Base64 check)
        // A 100-char message in Base64 is roughly 136 chars.
        if (packet.data && packet.data.length > 200) {
          server.send(JSON.stringify({ type: "sys-err", data: "PACKET_SIZE_VIOLATION" }));
          server.close(1008, "Policy Violation");
          return;
        }

        // 4. Spam Throttling (1.5s)
        if (now - sessionData.lastMsgTime < 1500) {
          server.send(JSON.stringify({ type: "sys-err", data: "THROTTLED" }));
          return;
        }

        // Success: Update activity and reset idle clock
        sessionData.lastMsgTime = now;
        resetIdleTimeout();

        // Broadcast to others
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

      if (req.method === "OPTIONS") return cors();

      /* ---------- GHOST CHAT (DURABLE OBJECTS) ---------- */
      if (path.includes("/api/ghost/")) {
        const parts = path.split("/").filter(Boolean);
        const roomId = parts[parts.length - 1];
        
        if (!roomId || roomId.length < 5) return json({ error: "Invalid Room" }, 400);

        const id = env.GHOST_ROOMS.idFromName(roomId);
        const roomObject = env.GHOST_ROOMS.get(id);

        return roomObject.fetch(req);
      }

      /* ---------- AI & REMAINING ROUTES ---------- */
      if (path === "/health") return json({ status: "ok", time: new Date().toISOString() });

      // ❌ REMOVED persona AI routes block:
      // const aiRoutes = ["/api/persona", "/api/persona-pro", "/api/predict-future"];
      // if (aiRoutes.includes(path)) {
      //   if (req.method !== "POST") return methodNotAllowed();
      //   let result;
      //   if (path === "/api/persona") result = await handlePersona(req);
      //   else if (path === "/api/persona-pro") result = await handlePersonaPro(req);
      //   else if (path === "/api/predict-future") result = await handlePredictFuture(req);
      //   return result instanceof Response ? withCors(result) : json(result);
      // }

      if (path.startsWith("/api/admin/")) {
        if (!verifyAdmin(req, env)) return json({ error: "Unauthorized" }, 401);
        if (path === "/api/admin/login" && req.method === "POST") return adminLogin(req, env);
        if (path === "/api/admin/stats") return await adminStats(env);
      }

      if (await rateLimitIP(ip, env)) {
        return json({ error: "Too many requests" }, 429);
      }

      if (path === "/send") return req.method === "POST" ? await send(req, env, ip, country) : methodNotAllowed();
      if (path === "/get") return req.method === "POST" ? await get(req, env) : methodNotAllowed();

      return json({ error: "Route not found" }, 404);

    } catch (err) {
      console.error("Worker Global Crash:", err);
      return json({ error: "Internal Server Error" }, 500);
    }
  }
};

/* ---------------- 3. HELPERS ---------------- */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token, Upgrade",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const cors = () => new Response(null, { status: 204, headers: corsHeaders });

function withCors(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders }
  });

const methodNotAllowed = () => json({ error: "Method Not Allowed" }, 405);

async function redis(env, cmd) {
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/${cmd}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    return res.ok ? await res.json() : { result: null };
  } catch (e) {
    return { result: null };
  }
}

const incr = (k, env) => redis(env, `INCR/${PREFIX}${k}`);

async function rateLimitIP(ip, env) {
  const r = await incr(`rl:ip:${ip}`, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}rl:ip:${ip}/60`);
  return count > 60;
}

async function rateLimitKey(key, env) {
  const r = await incr(`rl:key:${key}`, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}rl:key:${key}/300`);
  return count > 15;
}

const validKey = k => /^[A-Z0-9]{6,12}$/.test(k);

async function send(req, env, ip, country) {
  const body = await req.json().catch(() => null);
  if (!body || !validKey(body.key) || !body.data) return json({ error: "Invalid Data" }, 400);
  if (await rateLimitKey(body.key, env)) return json({ error: "Limit Exceeded" }, 429);

  const redisKey = `${PREFIX}msg:${body.key}`;
  const existing = await redis(env, `GET/${redisKey}`);
  let messages = existing.result ? JSON.parse(atob(existing.result)) : [];
  if (messages.length >= 5) return json({ error: "Full" }, 429);

  messages.push(body.data);
  await redis(env, `SET/${redisKey}/${btoa(JSON.stringify(messages))}`);
  await redis(env, `EXPIRE/${redisKey}/86400`);
  await incr("stats:send", env);
  return json({ success: true });
}

async function get(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || !validKey(body.key)) return json({ error: "Invalid Key" }, 400);
  const res = await redis(env, `GETDEL/${PREFIX}msg:${body.key}`);
  if (!res.result) return json({ found: false });
  await incr("stats:get", env);
  return json({ found: true, messages: JSON.parse(atob(res.result)) });
}

function verifyAdmin(req, env) {
  return req.headers.get("x-admin-token") === env.ADMIN_TOKEN;
}

async function adminLogin(req, env) {
  const body = await req.json().catch(() => null);
  return json({ success: body?.secret === env.ADMIN_TOKEN });
}

async function adminStats(env) {
  const [s, g] = await Promise.all([
    redis(env, `GET/${PREFIX}stats:send`),
    redis(env, `GET/${PREFIX}stats:get`)
  ]);
  return json({ stats: { send: s.result, get: g.result } });
}