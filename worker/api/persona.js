export async function handlePersona(req){

  let data;
  try{
    data = await req.json();
  }catch{
    return json({ success:false, error:"Invalid JSON" },400);
  }

  const username = String(data?.username || "").trim();

  if(username.length < 3){
    return json({ success:false, error:"Invalid username" },400);
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
    "Highly Curious","Introverted","Risk Taker","Deep Thinker","Adaptive",
    "Emotionally Intelligent","Pattern Oriented","Fast Learner","Independent",
    "Vision Focused","Precision Driven","Resilient","Self Motivated"
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
    success:true,
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

/* ---------- Utilities ---------- */

function json(obj,status=200){
  return new Response(JSON.stringify(obj),{
    status,
    headers:{ "Content-Type":"application/json" }
  });
}

function hash(str){
  let h = 2166136261;
  for(let i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h += (h<<1) + (h<<4) + (h<<7) + (h<<8) + (h<<24);
  }
  return Math.abs(h);
}

function pick(arr,seed){
  return arr[ seed % arr.length ];
}

function multiPick(arr,seed,count){
  const out=[];
  let s=seed;
  while(out.length<count){
    const val = arr[s % arr.length];
    if(!out.includes(val)) out.push(val);
    s = Math.floor(s / 7) + 17;
  }
  return out;
}