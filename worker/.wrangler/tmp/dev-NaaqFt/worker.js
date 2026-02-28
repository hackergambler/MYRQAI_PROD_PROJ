var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../../Users/ADMIN/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/_internal/utils.mjs
// @__NO_SIDE_EFFECTS__
function createNotImplementedError(name) {
  return new Error(`[unenv] ${name} is not implemented yet!`);
}
__name(createNotImplementedError, "createNotImplementedError");

// ../../Users/ADMIN/AppData/Roaming/npm/node_modules/wrangler/node_modules/unenv/dist/runtime/node/internal/perf_hooks/performance.mjs
var _timeOrigin = globalThis.performance?.timeOrigin ?? Date.now();
var _performanceNow = globalThis.performance?.now ? globalThis.performance.now.bind(globalThis.performance) : () => Date.now() - _timeOrigin;
var nodeTiming = {
  name: "node",
  entryType: "node",
  startTime: 0,
  duration: 0,
  nodeStart: 0,
  v8Start: 0,
  bootstrapComplete: 0,
  environment: 0,
  loopStart: 0,
  loopExit: 0,
  idleTime: 0,
  uvMetricsInfo: {
    loopCount: 0,
    events: 0,
    eventsWaiting: 0
  },
  detail: void 0,
  toJSON() {
    return this;
  }
};
var PerformanceEntry = class {
  static {
    __name(this, "PerformanceEntry");
  }
  __unenv__ = true;
  detail;
  entryType = "event";
  name;
  startTime;
  constructor(name, options) {
    this.name = name;
    this.startTime = options?.startTime || _performanceNow();
    this.detail = options?.detail;
  }
  get duration() {
    return _performanceNow() - this.startTime;
  }
  toJSON() {
    return {
      name: this.name,
      entryType: this.entryType,
      startTime: this.startTime,
      duration: this.duration,
      detail: this.detail
    };
  }
};
var PerformanceMark = class PerformanceMark2 extends PerformanceEntry {
  static {
    __name(this, "PerformanceMark");
  }
  entryType = "mark";
  constructor() {
    super(...arguments);
  }
  get duration() {
    return 0;
  }
};
var PerformanceMeasure = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceMeasure");
  }
  entryType = "measure";
};
var PerformanceResourceTiming = class extends PerformanceEntry {
  static {
    __name(this, "PerformanceResourceTiming");
  }
  entryType = "resource";
  serverTiming = [];
  connectEnd = 0;
  connectStart = 0;
  decodedBodySize = 0;
  domainLookupEnd = 0;
  domainLookupStart = 0;
  encodedBodySize = 0;
  fetchStart = 0;
  initiatorType = "";
  name = "";
  nextHopProtocol = "";
  redirectEnd = 0;
  redirectStart = 0;
  requestStart = 0;
  responseEnd = 0;
  responseStart = 0;
  secureConnectionStart = 0;
  startTime = 0;
  transferSize = 0;
  workerStart = 0;
  responseStatus = 0;
};
var PerformanceObserverEntryList = class {
  static {
    __name(this, "PerformanceObserverEntryList");
  }
  __unenv__ = true;
  getEntries() {
    return [];
  }
  getEntriesByName(_name, _type) {
    return [];
  }
  getEntriesByType(type) {
    return [];
  }
};
var Performance = class {
  static {
    __name(this, "Performance");
  }
  __unenv__ = true;
  timeOrigin = _timeOrigin;
  eventCounts = /* @__PURE__ */ new Map();
  _entries = [];
  _resourceTimingBufferSize = 0;
  navigation = void 0;
  timing = void 0;
  timerify(_fn, _options) {
    throw createNotImplementedError("Performance.timerify");
  }
  get nodeTiming() {
    return nodeTiming;
  }
  eventLoopUtilization() {
    return {};
  }
  markResourceTiming() {
    return new PerformanceResourceTiming("");
  }
  onresourcetimingbufferfull = null;
  now() {
    if (this.timeOrigin === _timeOrigin) {
      return _performanceNow();
    }
    return Date.now() - this.timeOrigin;
  }
  clearMarks(markName) {
    this._entries = markName ? this._entries.filter((e) => e.name !== markName) : this._entries.filter((e) => e.entryType !== "mark");
  }
  clearMeasures(measureName) {
    this._entries = measureName ? this._entries.filter((e) => e.name !== measureName) : this._entries.filter((e) => e.entryType !== "measure");
  }
  clearResourceTimings() {
    this._entries = this._entries.filter((e) => e.entryType !== "resource" || e.entryType !== "navigation");
  }
  getEntries() {
    return this._entries;
  }
  getEntriesByName(name, type) {
    return this._entries.filter((e) => e.name === name && (!type || e.entryType === type));
  }
  getEntriesByType(type) {
    return this._entries.filter((e) => e.entryType === type);
  }
  mark(name, options) {
    const entry = new PerformanceMark(name, options);
    this._entries.push(entry);
    return entry;
  }
  measure(measureName, startOrMeasureOptions, endMark) {
    let start;
    let end;
    if (typeof startOrMeasureOptions === "string") {
      start = this.getEntriesByName(startOrMeasureOptions, "mark")[0]?.startTime;
      end = this.getEntriesByName(endMark, "mark")[0]?.startTime;
    } else {
      start = Number.parseFloat(startOrMeasureOptions?.start) || this.now();
      end = Number.parseFloat(startOrMeasureOptions?.end) || this.now();
    }
    const entry = new PerformanceMeasure(measureName, {
      startTime: start,
      detail: {
        start,
        end
      }
    });
    this._entries.push(entry);
    return entry;
  }
  setResourceTimingBufferSize(maxSize) {
    this._resourceTimingBufferSize = maxSize;
  }
  addEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.addEventListener");
  }
  removeEventListener(type, listener, options) {
    throw createNotImplementedError("Performance.removeEventListener");
  }
  dispatchEvent(event) {
    throw createNotImplementedError("Performance.dispatchEvent");
  }
  toJSON() {
    return this;
  }
};
var PerformanceObserver = class {
  static {
    __name(this, "PerformanceObserver");
  }
  __unenv__ = true;
  static supportedEntryTypes = [];
  _callback = null;
  constructor(callback) {
    this._callback = callback;
  }
  takeRecords() {
    return [];
  }
  disconnect() {
    throw createNotImplementedError("PerformanceObserver.disconnect");
  }
  observe(options) {
    throw createNotImplementedError("PerformanceObserver.observe");
  }
  bind(fn) {
    return fn;
  }
  runInAsyncScope(fn, thisArg, ...args) {
    return fn.call(thisArg, ...args);
  }
  asyncId() {
    return 0;
  }
  triggerAsyncId() {
    return 0;
  }
  emitDestroy() {
    return this;
  }
};
var performance = globalThis.performance && "addEventListener" in globalThis.performance ? globalThis.performance : new Performance();

// ../../Users/ADMIN/AppData/Roaming/npm/node_modules/wrangler/node_modules/@cloudflare/unenv-preset/dist/runtime/polyfill/performance.mjs
globalThis.performance = performance;
globalThis.Performance = Performance;
globalThis.PerformanceEntry = PerformanceEntry;
globalThis.PerformanceMark = PerformanceMark;
globalThis.PerformanceMeasure = PerformanceMeasure;
globalThis.PerformanceObserver = PerformanceObserver;
globalThis.PerformanceObserverEntryList = PerformanceObserverEntryList;
globalThis.PerformanceResourceTiming = PerformanceResourceTiming;

// api/persona.js
async function handlePersona(req) {
  let data;
  try {
    data = await req.json();
  } catch {
    return json({ success: false, error: "Invalid JSON" }, 400);
  }
  const username = String(data?.username || "").trim();
  if (username.length < 3) {
    return json({ success: false, error: "Invalid username" }, 400);
  }
  const seed = hash(username);
  const types = [
    "Strategic Thinker",
    "Silent Observer",
    "Charismatic Leader",
    "Creative Hacker",
    "Digital Nomad",
    "Visionary Builder",
    "Rebel Mindset",
    "Logical Analyzer"
  ];
  const traits = [
    "Highly Curious",
    "Introverted",
    "Risk Taker",
    "Deep Thinker",
    "Adaptive",
    "Emotionally Intelligent",
    "Pattern Oriented",
    "Fast Learner",
    "Independent",
    "Vision Focused",
    "Precision Driven",
    "Resilient",
    "Self Motivated"
  ];
  const behaviors = [
    "Analyzes situations before acting.",
    "Prefers silent execution over loud exposure.",
    "Naturally attracts attention.",
    "Thrives in creative chaos.",
    "Seeks freedom over routine.",
    "Builds long-term strategies.",
    "Breaks rules intelligently.",
    "Optimizes everything for efficiency."
  ];
  const result = {
    success: true,
    username,
    type: pick(types, seed),
    traits: multiPick(traits, seed, 4),
    behavior: pick(behaviors, seed + 11),
    social: seed % 2 ? "Selective Socializer" : "Silent Networker",
    strength: seed % 3 ? "Extreme Focus" : "Rapid Learning",
    risk: seed % 2 ? "Overthinking" : "Impulse Decisions"
  };
  return json(result);
}
__name(handlePersona, "handlePersona");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json, "json");
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h);
}
__name(hash, "hash");
function pick(arr, seed) {
  return arr[seed % arr.length];
}
__name(pick, "pick");
function multiPick(arr, seed, count) {
  const out = [];
  let s = seed;
  while (out.length < count) {
    const val = arr[s % arr.length];
    if (!out.includes(val)) out.push(val);
    s = Math.floor(s / 7) + 17;
  }
  return out;
}
__name(multiPick, "multiPick");

// api/persona-pro.js
async function handlePersonaPro(req) {
  let data;
  try {
    data = await req.json();
  } catch {
    return json2({ success: false, error: "Invalid JSON" }, 400);
  }
  const username = String(data?.username || "").trim();
  if (username.length < 3) {
    return json2({ success: false, error: "Invalid username" }, 400);
  }
  const seed = hash2(username);
  const types = [
    "INTJ Strategist",
    "INFJ Visionary",
    "ENTP Innovator",
    "ISTP Hacker",
    "ENTJ Commander",
    "INFP Dreamer",
    "ESTJ Executor",
    "ISFJ Protector"
  ];
  const decision = [
    "Strategic",
    "Emotional",
    "Rational",
    "Adaptive",
    "Instinctive"
  ];
  const relationship = [
    "Loyal",
    "Independent",
    "Dominant",
    "Supportive",
    "Protective",
    "Selective"
  ];
  const talents = [
    "Pattern Detection",
    "Leadership",
    "Creative Design",
    "Deep Analysis",
    "Social Engineering",
    "Code Architecture",
    "Strategic Planning",
    "Psychological Insight"
  ];
  const careers = [
    "AI Engineer",
    "Cybersecurity Expert",
    "Startup Founder",
    "Product Designer",
    "Psychologist",
    "Data Scientist",
    "Quant Trader",
    "Growth Hacker",
    "Behavior Analyst"
  ];
  const future = [
    "Massive intelligence expansion and leadership growth phase approaching.",
    "Creative dominance with strong financial rise ahead.",
    "High-impact entrepreneurial curve with rapid scaling.",
    "Deep technical mastery and elite recognition cycle.",
    "Strong social influence and authority development phase.",
    "Strategic career pivot with long-term dominance trajectory."
  ];
  const result = {
    success: true,
    username,
    type: pick2(types, seed),
    mental: score(seed, 7),
    emotional: score(seed, 11),
    social: score(seed, 5),
    logic: score(seed, 9),
    decision: pick2(decision, seed + 13),
    relationship: pick2(relationship, seed + 17),
    risk: riskProfile(seed),
    talent: pick2(talents, seed + 19),
    career: pick2(careers, seed + 23),
    future: pick2(future, seed + 29),
    compatibility: pick2(types, seed + 31)
  };
  return json2(result);
}
__name(handlePersonaPro, "handlePersonaPro");
function json2(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
__name(json2, "json");
function hash2(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h);
}
__name(hash2, "hash");
function pick2(arr, seed) {
  return arr[seed % arr.length];
}
__name(pick2, "pick");
function score(seed, mod) {
  return seed * mod % 100 + 1;
}
__name(score, "score");
function riskProfile(seed) {
  if (seed % 7 === 0) return "Very High";
  if (seed % 5 === 0) return "High";
  if (seed % 3 === 0) return "Medium";
  return "Low";
}
__name(riskProfile, "riskProfile");

// api/predict-future.js
async function handlePredictFuture(req) {
  let data;
  try {
    data = await req.json();
  } catch (e) {
    return { success: false, error: "Invalid JSON body" };
  }
  const username = String(data?.username || "").trim();
  if (username.length < 3 || username.length > 32) {
    return { success: false, error: "Username must be 3-32 characters" };
  }
  const seed = hash3(username.toLowerCase());
  return {
    success: true,
    // This boolean status is what frontend checks (if (!j.success))
    username: username.charAt(0).toUpperCase() + username.slice(1),
    // Numeric Scores (1-100) used for the meters in future.js
    // FIX: Renamed 'success' score to 'prediction_score' to avoid collision with boolean
    prediction_score: score2(seed, 9),
    wealth: score2(seed, 7),
    evolution: score2(seed, 11),
    burnout: score2(seed, 5),
    // Categorical Predictions
    decision: pick3([
      "Strategic Mastermind",
      "Logical Analyst",
      "Adaptive Chameleon",
      "Instinctive Pioneer",
      "Visionary Architect",
      "Emotionally Intelligent Leader"
    ], seed + 3),
    trajectory: pick3([
      "Rapid intelligence-driven growth path",
      "Strategic slow-burn dominance curve",
      "Explosive entrepreneurial acceleration",
      "Creative mastery & influence expansion",
      "Leadership authority dominance route",
      "Deep technical mastery lifecycle"
    ], seed + 7),
    relationship: pick3([
      "Stable loyal long-term bonds",
      "Emotionally intense connections",
      "Highly selective deep bonds",
      "Independent yet strategic partnerships",
      "Low dependency high-trust relations"
    ], seed + 11),
    // Narrative Projections
    future3: pick3([
      "Skill explosion, strategic clarity, and financial acceleration.",
      "Mental discipline phase with significant long-term positioning.",
      "Major career inflection point leading to an opportunity surge.",
      "Deep mastery and recognition cycle within your field.",
      "Authority expansion and leadership scaling across networks."
    ], seed + 13),
    future10: pick3([
      "Elite authority role, massive wealth accumulation, and influence dominance.",
      "Independent empire building supported by intellectual leadership.",
      "Creative legacy creation and generational financial freedom.",
      "Global technical architect with systemic impact on industry.",
      "Strategic mastermind with industry-shaping power and high autonomy."
    ], seed + 17)
  };
}
__name(handlePredictFuture, "handlePredictFuture");
function hash3(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return Math.abs(h);
}
__name(hash3, "hash");
function pick3(arr, seed) {
  return arr[seed % arr.length];
}
__name(pick3, "pick");
function score2(seed, mod) {
  return seed * mod % 100 + 1;
}
__name(score2, "score");

// worker.js
var PREFIX = "securemsg:";
var GhostRoom = class {
  static {
    __name(this, "GhostRoom");
  }
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = /* @__PURE__ */ new Map();
    this.startTime = Date.now();
    this.ROOM_TTL = 12e4;
    this.IDLE_LIMIT = 55e3;
  }
  async fetch(request) {
    try {
      if (request.headers.get("Upgrade") !== "websocket") {
        return new Response("Expected WebSocket", { status: 426 });
      }
      const now = Date.now();
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
          "Access-Control-Allow-Methods": "GET, OPTIONS"
        }
      });
    } catch (err) {
      return new Response(err.stack, { status: 500 });
    }
  }
  async handleSession(server) {
    server.accept();
    const sessionData = {
      lastMsgTime: Date.now(),
      idleTimer: null
    };
    this.sessions.set(server, sessionData);
    const resetIdleTimeout = /* @__PURE__ */ __name(() => {
      if (sessionData.idleTimer) clearTimeout(sessionData.idleTimer);
      sessionData.idleTimer = setTimeout(() => {
        try {
          server.send(JSON.stringify({ type: "sys-err", data: "IDLE_TERMINATION" }));
          server.close(1008, "Inactivity Purge");
        } catch (e) {
        }
      }, this.IDLE_LIMIT);
    }, "resetIdleTimeout");
    resetIdleTimeout();
    server.addEventListener("message", async (msg) => {
      try {
        const now = Date.now();
        if (now - this.startTime > this.ROOM_TTL) {
          server.send(JSON.stringify({ type: "sys-err", data: "SESSION_EXPIRED" }));
          setTimeout(() => server.close(1001, "TTL_REACHED"), 50);
          return;
        }
        let packet;
        try {
          packet = JSON.parse(msg.data);
        } catch (e) {
          return;
        }
        if (packet.data && packet.data.length > 200) {
          server.send(JSON.stringify({ type: "sys-err", data: "PACKET_SIZE_VIOLATION" }));
          server.close(1008, "Policy Violation");
          return;
        }
        if (now - sessionData.lastMsgTime < 1500) {
          server.send(JSON.stringify({ type: "sys-err", data: "THROTTLED" }));
          return;
        }
        sessionData.lastMsgTime = now;
        resetIdleTimeout();
        this.broadcast(packet.data, server);
      } catch (e) {
        console.error("DO Msg Error:", e);
      }
    });
    const cleanup = /* @__PURE__ */ __name(() => {
      if (sessionData.idleTimer) clearTimeout(sessionData.idleTimer);
      this.sessions.delete(server);
    }, "cleanup");
    server.addEventListener("close", cleanup);
    server.addEventListener("error", cleanup);
  }
  broadcast(data, sender) {
    const packet = JSON.stringify({ type: "ghost-msg", data });
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
};
var worker_default = {
  async fetch(req, env) {
    try {
      const url = new URL(req.url);
      const path = url.pathname;
      const ip = req.headers.get("CF-Connecting-IP") || "0.0.0.0";
      const country = req.cf?.country || "XX";
      if (req.method === "OPTIONS") return cors();
      if (path.includes("/api/ghost/")) {
        const parts = path.split("/").filter(Boolean);
        const roomId = parts[parts.length - 1];
        if (!roomId || roomId.length < 5) return json3({ error: "Invalid Room" }, 400);
        const id = env.GHOST_ROOMS.idFromName(roomId);
        const roomObject = env.GHOST_ROOMS.get(id);
        return roomObject.fetch(req);
      }
      if (path === "/health") return json3({ status: "ok", time: (/* @__PURE__ */ new Date()).toISOString() });
      const aiRoutes = ["/api/persona", "/api/persona-pro", "/api/predict-future"];
      if (aiRoutes.includes(path)) {
        if (req.method !== "POST") return methodNotAllowed();
        let result;
        if (path === "/api/persona") result = await handlePersona(req);
        else if (path === "/api/persona-pro") result = await handlePersonaPro(req);
        else if (path === "/api/predict-future") result = await handlePredictFuture(req);
        return result instanceof Response ? withCors(result) : json3(result);
      }
      if (path.startsWith("/api/admin/")) {
        if (!verifyAdmin(req, env)) return json3({ error: "Unauthorized" }, 401);
        if (path === "/api/admin/login" && req.method === "POST") return adminLogin(req, env);
        if (path === "/api/admin/stats") return await adminStats(env);
      }
      if (await rateLimitIP(ip, env)) {
        return json3({ error: "Too many requests" }, 429);
      }
      if (path === "/send") return req.method === "POST" ? await send(req, env, ip, country) : methodNotAllowed();
      if (path === "/get") return req.method === "POST" ? await get(req, env) : methodNotAllowed();
      return json3({ error: "Route not found" }, 404);
    } catch (err) {
      console.error("Worker Global Crash:", err);
      return json3({ error: "Internal Server Error" }, 500);
    }
  }
};
var corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-token, Upgrade",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS"
};
var cors = /* @__PURE__ */ __name(() => new Response(null, { status: 204, headers: corsHeaders }), "cors");
function withCors(res) {
  const h = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders)) h.set(k, v);
  return new Response(res.body, { status: res.status, headers: h });
}
__name(withCors, "withCors");
var json3 = /* @__PURE__ */ __name((data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json", ...corsHeaders }
}), "json");
var methodNotAllowed = /* @__PURE__ */ __name(() => json3({ error: "Method Not Allowed" }, 405), "methodNotAllowed");
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
__name(redis, "redis");
var incr = /* @__PURE__ */ __name((k, env) => redis(env, `INCR/${PREFIX}${k}`), "incr");
async function rateLimitIP(ip, env) {
  const r = await incr(`rl:ip:${ip}`, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}rl:ip:${ip}/60`);
  return count > 60;
}
__name(rateLimitIP, "rateLimitIP");
async function rateLimitKey(key, env) {
  const r = await incr(`rl:key:${key}`, env);
  const count = Number(r.result);
  if (count === 1) await redis(env, `EXPIRE/${PREFIX}rl:key:${key}/300`);
  return count > 15;
}
__name(rateLimitKey, "rateLimitKey");
var validKey = /* @__PURE__ */ __name((k) => /^[A-Z0-9]{6,12}$/.test(k), "validKey");
async function send(req, env, ip, country) {
  const body = await req.json().catch(() => null);
  if (!body || !validKey(body.key) || !body.data) return json3({ error: "Invalid Data" }, 400);
  if (await rateLimitKey(body.key, env)) return json3({ error: "Limit Exceeded" }, 429);
  const redisKey = `${PREFIX}msg:${body.key}`;
  const existing = await redis(env, `GET/${redisKey}`);
  let messages = existing.result ? JSON.parse(atob(existing.result)) : [];
  if (messages.length >= 5) return json3({ error: "Full" }, 429);
  messages.push(body.data);
  await redis(env, `SET/${redisKey}/${btoa(JSON.stringify(messages))}`);
  await redis(env, `EXPIRE/${redisKey}/86400`);
  await incr("stats:send", env);
  return json3({ success: true });
}
__name(send, "send");
async function get(req, env) {
  const body = await req.json().catch(() => null);
  if (!body || !validKey(body.key)) return json3({ error: "Invalid Key" }, 400);
  const res = await redis(env, `GETDEL/${PREFIX}msg:${body.key}`);
  if (!res.result) return json3({ found: false });
  await incr("stats:get", env);
  return json3({ found: true, messages: JSON.parse(atob(res.result)) });
}
__name(get, "get");
function verifyAdmin(req, env) {
  return req.headers.get("x-admin-token") === env.ADMIN_TOKEN;
}
__name(verifyAdmin, "verifyAdmin");
async function adminLogin(req, env) {
  const body = await req.json().catch(() => null);
  return json3({ success: body?.secret === env.ADMIN_TOKEN });
}
__name(adminLogin, "adminLogin");
async function adminStats(env) {
  const [s, g] = await Promise.all([
    redis(env, `GET/${PREFIX}stats:send`),
    redis(env, `GET/${PREFIX}stats:get`)
  ]);
  return json3({ stats: { send: s.result, get: g.result } });
}
__name(adminStats, "adminStats");

// ../../Users/ADMIN/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// .wrangler/tmp/bundle-JJ9VsJ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default
];
var middleware_insertion_facade_default = worker_default;

// ../../Users/ADMIN/AppData/Roaming/npm/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-JJ9VsJ/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  GhostRoom,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
