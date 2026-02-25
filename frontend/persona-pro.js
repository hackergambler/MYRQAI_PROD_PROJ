const API = "https://myrqai-prod.tibco-tibco-8.workers.dev";

async function scan(){

  const username=document.getElementById("username").value.trim();

  if(username.length<3) return alert("Enter valid username");

  const box=document.getElementById("result");
  box.style.display="block";
  box.innerHTML="⏳ Running deep neural scan...";

  try{

    const r=await fetch("/api/persona-pro",{
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body:JSON.stringify({ username })
    });

    const j=await r.json();

    box.innerHTML=`
      <h3>👤 ${j.username}</h3>
      <p><b>Personality Type:</b> ${j.type}</p>

      <div class="grid">
        ${meter("Mental Strength",j.mental)}
        ${meter("Emotional IQ",j.emotional)}
        ${meter("Social Intelligence",j.social)}
        ${meter("Logical Processing",j.logic)}
      </div>

      <p><b>Decision Style:</b> ${j.decision}</p>
      <p><b>Relationship Style:</b> ${j.relationship}</p>
      <p><b>Risk Profile:</b> ${j.risk}</p>
      <p><b>Hidden Talent:</b> ${j.talent}</p>
      <p><b>Career Match:</b> ${j.career}</p>

      <p><b>Future Pattern:</b></p>
      <p>${j.future}</p>

      <p><b>Compatibility With:</b> ${j.compatibility}</p>
    `;

  }catch(err){
    console.error(err);
    box.innerHTML="❌ Server unreachable.";
  }
}

function meter(label,val){
  return `<div class="card">
      <small>${label}: ${val}%</small>
      <div class="bar" style="width:${val}%"></div>
  </div>`;
}