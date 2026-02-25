export default {
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    if (req.method === "OPTIONS") return options();

    try {

      if (path === "/api/persona-pro") {
        return personaPro(req);
      }

      if (path === "/api/persona") {
        return persona(req);
      }

      if (path === "/api/predict-future") {
        return future(req);
      }

      return json({ error: "Not Found", path });

    } catch (e) {
      return json({ error: "Worker crashed", detail: e.message }, 500);
    }
  }
};

function cors() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  };
}

function options() {
  return new Response(null, { status: 204, headers: cors() });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cors() });
}

/* ------------------ APIs ------------------- */

async function personaPro(req) {
  const { username } = await req.json();

  if (!username || username.length < 3) {
    return json({ success: false, error: "Invalid username" }, 400);
  }

  const seed = [...username].reduce((a,b)=>a+b.charCodeAt(0),0);
  const pick = arr => arr[seed % arr.length];
  const score = m => (seed * m) % 100 + 1;

  return json({
    success:true,
    username,
    type: pick(["INTJ Strategist","INFJ Visionary","ENTP Innovator","ISTP Hacker","ENTJ Commander","INFP Dreamer"]),
    mental: score(7),
    emotional: score(11),
    social: score(5),
    logic: score(9),
    decision: pick(["Strategic","Emotional","Rational","Adaptive"]),
    relationship: pick(["Loyal","Independent","Dominant","Supportive"]),
    risk: pick(["Low","Medium","High"]),
    talent: pick(["Pattern Detection","Leadership","Creative Design","Deep Analysis","Social Engineering","Code Architecture"]),
    career: pick(["AI Engineer","Cybersecurity Expert","Startup Founder","Product Designer","Psychologist","Data Scientist","Quant Trader"]),
    future: pick([
      "Major intelligence expansion and leadership growth expected.",
      "Creative dominance and financial rise ahead.",
      "Strong entrepreneurial path with high impact.",
      "Technical mastery phase approaching.",
      "Social influence and recognition growth."
    ]),
    compatibility: pick(["ENTP Innovator","INFJ Visionary","INTJ Strategist","ISFP Artist","ENTJ Commander"])
  });
}

async function persona(req) {
  const { username } = await req.json();
  if(!username || username.length < 3){
    return json({success:false},400);
  }

  const seed=[...username].reduce((a,b)=>a+b.charCodeAt(0),0);
  const pick=arr=>arr[seed%arr.length];

  return json({
    success:true,
    username,
    type: pick(["Strategic Thinker","Silent Observer","Creative Hacker","Visionary Builder"]),
    traits: ["Curious","Analytical","Adaptive"],
    behavior: pick(["Deep thinker","Fast learner","Silent executor"])
  });
}

async function future(req) {
  const { username } = await req.json();
  if(!username || username.length<3){
    return json({success:false,error:"Invalid username"},400);
  }

  const seed=[...username].reduce((a,b)=>a+b.charCodeAt(0),0);
  const pick=arr=>arr[seed%arr.length];
  const score=m=>(seed*m)%100+1;

  return json({
    success:true,
    username,
    confidence:score(9),
    wealth:score(7),
    evolution:score(11),
    burnout:score(5),
    trajectory:pick(["Leadership","Technical Mastery","Entrepreneurial Rise"])
  });
}