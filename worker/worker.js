import { handlePersona } from "./api/persona";
import { handlePersonaPro } from "./api/persona-pro";
import { handlePredictFuture } from "./api/predict-future";

const PREFIX = "securemsg:";

export default {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const country = req.cf?.country || "XX";

      /* ---------- 1. CORS PREFLIGHT ---------- */
      if (req.method === "OPTIONS") return cors();

      /* ---------- 2. HEALTH CHECK ---------- */
      if (path === "/health") {
        return json({ status: "ok", time: new Date().toISOString() });
      }

      /* ---------- 3. AI ROUTES ---------- */
      const aiRoutes = ["/api/persona", "/api/persona-pro", "/api/predict-future"];
      
      if (aiRoutes.includes(path)) {
        if (req.method !== "POST") return methodNotAllowed();
        
        let result;
        try {
          if (path === "/api/persona") result = await handlePersona(req);
          else if (path === "/api/persona-pro") result = await handlePersonaPro(req);
          else if (path === "/api/predict-future") result = await handlePredictFuture(req);
          
          return result instanceof Response ? withCors(result) : json(result);
        } catch (handlerErr) {
          console.error(`Error in ${path}:`, handlerErr);
          return json({ error: "AI Processing Error", details: handlerErr.message }, 500);
        }
      }

      /* ---------------- 4. ADMIN APIs ---------------- */

      if (path === "/api/admin/login" && req.method === "POST")
        return adminLogin(req, env);

      if (path === "/api/admin/stats" && req.method === "GET") {
        if (!verifyAdmin(req, env)) return json({ error: "Unauthorized" }, 401);
        return await adminStats(env); // Added await
      }

      if (path === "/api/admin/alerts" && req.method === "GET") {
        if (!verifyAdmin(req, env)) return json({ error: "Unauthorized" }, 401);
        return await adminAlerts(env); // Added await
      }

      if (path === "/api/admin/countries" && req.method === "GET") {
        if (!verifyAdmin(req, env)) return json({ error: "Unauthorized" }, 401);
        return await adminCountries(env); // Added await
      }

      /* ---------- 5. RATE LIMIT ---------- */
      if (await rateLimitIP(ip, env)) {
        await incr("stats:blocked", env);
        await alertAttack(ip, country, env);
        return json({ error: "Too many requests" }, 429);
      }

      /* ---------- 6. MAIN APIs ---------- */
      if (path === "/send") {
        if (req.method !== "POST") return methodNotAllowed();
        return await send(req, env, ip, country);
      }

      if (path === "/get") {
        if (req.method !== "POST") return methodNotAllowed();
        return await get(req, env, ip, country);
      }

      return json({ error: "Route not found" }, 404);

    } catch (err) {
      console.error("Worker Global Crash:", err);
      return json({ error: "Internal Server Error" }, 500);
    }
  }
};

/* ---------------- CORS & FORMATTING ---------------- */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const cors = () => new Response(null, { status: 204, headers: corsHeaders });

function withCors(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) {
    h.set(k, v);
  }
  return new Response(res.body, { status: res.status, headers: h });
}

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders
    }
  });

const methodNotAllowed = () => json({ error: "Method Not Allowed" }, 405);

/* ---------------- REDIS ---------------- */

async function redis(env, cmd) {
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/${cmd}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` }
    });
    if (!res.ok) return { result: null };
    return await res.json();
  } catch (e) {
    console.error("Redis Error:", e);
    return { result: null };
  }
}

const incr = (k, env) => redis(env, `INCR/${PREFIX}${k}`);

/* ---------------- UTILS ---------------- */

const MAX_MSG_PER_KEY = 5;
const validKey = k => /^[A-Z0-9]{6,12}$/.test(k);
const getTodayStr = () => new Date().toISOString().slice(0, 10);

/* ---------------- RATE LIMIT ---------------- */

async function rateLimitIP(ip, env) {
  const key = `rl:ip:${ip}`; 
  const r = await incr(key, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}${key}/60`);
  return count > 60;
}

async function rateLimitKey(key, env) {
  const k = `rl:key:${key}`;
  const r = await incr(k, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}${k}/300`);
  return count > 15;
}

/* ---------------- ABUSE ---------------- */

function abuseDetect(msg) {
  if (msg.length > 3000) return true;
  if (/(\bspam\b|\bhack\b|\battack\b)/i.test(msg)) return true;
  const entropy = new Set(msg).size / (msg.length || 1);
  return entropy < 0.2;
}

/* ---------------- SEND ---------------- */

async function send(req, env, ip, country) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const { key, data } = body;
  if (!validKey(key) || !data || typeof data !== "string")
    return json({ error: "Invalid input parameters" }, 400);

  if (await rateLimitKey(key, env))
    return json({ error: "Key rate limit exceeded" }, 429);

  if (abuseDetect(data)) {
    await incr("stats:abuse", env);
    return json({ error: "Content rejected by safety filters" }, 403);
  }

  const redisKey = `${PREFIX}msg:${key}`;
  const existing = await redis(env, `GET/${redisKey}`);

  let messages = [];
  if (existing.result) {
    try {
      messages = JSON.parse(atob(existing.result));
    } catch (e) {
      messages = [];
    }
  }

  if (messages.length >= MAX_MSG_PER_KEY)
    return json({ error: "Maximum message capacity reached" }, 429);

  messages.push(data);

  await redis(env, `SET/${redisKey}/${btoa(JSON.stringify(messages))}`);
  await redis(env, `EXPIRE/${redisKey}/86400`);

  await incr("stats:send", env);
  await incr(`country:${country}`, env);
  await incr(`daily:${getTodayStr()}`, env);

  return json({ success: true, total: messages.length });
}

/* ---------------- GET ---------------- */

async function get(req, env, ip, country) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: "Invalid JSON" }, 400);

  const { key } = body;
  if (!validKey(key)) return json({ error: "Invalid key format" }, 400);

  if (await rateLimitKey(key, env))
    return json({ error: "Key rate limit exceeded" }, 429);

  const redisKey = `${PREFIX}msg:${key}`;
  const res = await redis(env, `GETDEL/${redisKey}`);

  if (!res.result) return json({ found: false });

  let messages;
  try {
    messages = JSON.parse(atob(res.result));
  } catch {
    messages = [res.result];
  }

  await incr("stats:get", env);
  await incr(`daily:${getTodayStr()}`, env);

  return json({ found: true, messages });
}

/* ---------------- ALERT ---------------- */

async function alertAttack(ip, country, env) {
  const key = `${PREFIX}alerts:${getTodayStr()}`;
  const payload = btoa(JSON.stringify({ ip, country, time: Date.now() }));
  await redis(env, `LPUSH/${key}/${payload}`);
  await redis(env, `EXPIRE/${key}/172800`);
}

/* ---------------- ADMIN AUTH ---------------- */

function verifyAdmin(req, env) {
  const token = req.headers.get("x-admin-token");
  return token && token === env.ADMIN_TOKEN;
}

/* ---------------- ADMIN HANDLERS (FIXED) ---------------- */

async function adminLogin(req, env) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || !body.secret) {
      return json({ success: false, error: "Missing secret" }, 400);
    }
    if (body.secret === env.ADMIN_TOKEN) {
      return json({ success: true });
    }
    return json({ success: false }, 401);
  } catch (e) {
    return json({ success: false, error: "Server error" }, 500);
  }
}

async function adminStats(env) {
  // Fetch major keys in parallel
  const [send, get, blocked, abuse] = await Promise.all([
    redis(env, `GET/${PREFIX}stats:send`),
    redis(env, `GET/${PREFIX}stats:get`),
    redis(env, `GET/${PREFIX}stats:blocked`),
    redis(env, `GET/${PREFIX}stats:abuse`)
  ]);

  return json({
    success: true,
    stats: {
      send: parseInt(send.result || 0),
      get: parseInt(get.result || 0),
      blocked: parseInt(blocked.result || 0),
      abuse: parseInt(abuse.result || 0)
    }
  });
}

async function adminAlerts(env) {
  const key = `${PREFIX}alerts:${getTodayStr()}`;
  const res = await redis(env, `LRANGE/${key}/0/19`);
  const alerts = (res.result || []).map(a => {
    try {
      return JSON.parse(atob(a));
    } catch {
      return null;
    }
  }).filter(a => a !== null);

  return json({ success: true, alerts });
}

async function adminCountries(env) {
  // This is a simplified fetch; listing keys in Upstash Redis REST is limited.
  // In a real scenario, you'd maintain a set of country codes.
  return json({ success: true, countries: {} });
}