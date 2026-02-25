export async function handlePersonaPro(req){

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
    success:true,
    username,
    type: pick(types, seed),
    mental: score(seed,7),
    emotional: score(seed,11),
    social: score(seed,5),
    logic: score(seed,9),
    decision: pick(decision, seed+13),
    relationship: pick(relationship, seed+17),
    risk: riskProfile(seed),
    talent: pick(talents, seed+19),
    career: pick(careers, seed+23),
    future: pick(future, seed+29),
    compatibility: pick(types, seed+31)
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

function score(seed,mod){
  return ((seed * mod) % 100) + 1;
}

function riskProfile(seed){
  if(seed % 7 === 0) return "Very High";
  if(seed % 5 === 0) return "High";
  if(seed % 3 === 0) return "Medium";
  return "Low";
}