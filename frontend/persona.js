const API = "https://myrqai-prod.tibco-tibco-8.workers.dev";

async function scan(){

  const username = document.getElementById("username").value.trim();

  if(!username || username.length < 3){
    return alert("Enter valid username");
  }

  const box = document.getElementById("result");
  box.style.display="block";
  box.innerHTML="⏳ Scanning neural patterns...";

  try{
    const r = await fetch(API + "/api/persona",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({ username })
    });

    const j = await r.json();

    if(!j.success){
      box.innerHTML="⚠️ Analysis failed.";
      return;
    }

    let html = `
      <h3>👤 ${j.username}</h3>
      <p><b>Personality Type:</b> ${j.type}</p>
      <p><b>Core Traits:</b></p>
      ${j.traits.map(t=>`<span class="tag">${t}</span>`).join("")}
      <p><b>Behavior Prediction:</b></p>
      <p>${j.behavior}</p>
      <p><b>Social Style:</b> ${j.social}</p>
      <p><b>Hidden Strength:</b> ${j.strength}</p>
      <p><b>Risk Factor:</b> ${j.risk}</p>
    `;

    box.innerHTML = html;

  }catch(err){
    console.error(err);
    box.innerHTML="⚠️ Network error. Try again.";
  }
}