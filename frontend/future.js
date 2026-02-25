const API = "https://myrqai-prod.tibco-tibco-8.workers.dev";

let running = false;

async function predict() {
  if (running) return;
  running = true;

  const usernameInput = document.getElementById("username");
  const box = document.getElementById("result");

  const username = usernameInput.value.trim();

  if (!username || username.length < 3) {
    running = false;
    return alert("Enter valid username (min 3 characters)");
  }

  box.style.display = "block";
  box.innerHTML = "⏳ Running quantum future analysis...";

  try {
    // Abort controller (10s timeout safety)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(`${API}/api/predict-future`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Server Error (${response.status}) ${text}`);
    }

    let data;
    try {
      data = await response.json();
    } catch {
      throw new Error("Invalid JSON response");
    }

    if (!data || data.success !== true) {
      throw new Error(data?.error || "Analysis failed");
    }

    // Render UI
    box.innerHTML = `
      <h3>🧬 ${escapeHTML(data.username)}</h3>

      ${meter("Success Probability", data.prediction_score)}
      ${meter("Wealth Growth Index", data.wealth)}
      ${meter("Mental Evolution", data.evolution)}
      ${meter("Burnout Risk", data.burnout)}

      <div class="card"><b>Decision Bias:</b> ${escapeHTML(data.decision)}</div>
      <div class="card"><b>Life Trajectory:</b> ${escapeHTML(data.trajectory)}</div>
      <div class="card"><b>Relationship Outcome:</b> ${escapeHTML(data.relationship)}</div>
      <div class="card"><b>3 Year Projection:</b><br>${escapeHTML(data.future3)}</div>
      <div class="card"><b>10 Year Projection:</b><br>${escapeHTML(data.future10)}</div>
    `;

  } catch (err) {
    console.error("Future AI Error:", err);

    box.innerHTML = `
      <div class="card">
        ⚠️ AI neural scan failed.<br>
        <small>${escapeHTML(err.message)}</small><br>
        Please retry in a few seconds.
      </div>
    `;
  }

  running = false;
}

/* ---------------- UI Helpers ---------------- */

function meter(label, val) {
  val = Math.min(100, Math.max(1, Number(val) || 1));

  return `
    <div class="card">
      <div style="display:flex; justify-content:space-between;">
        <small>${label}</small>
        <small>${val}%</small>
      </div>
      <div style="background:rgba(0,255,65,0.1); border-radius:10px; height:6px; margin-top:6px;">
        <div class="bar" 
          style="
            width:${val}%;
            height:100%;
            border-radius:6px;
            background:var(--neon);
            box-shadow:0 0 10px var(--neon);
            transition:width .6s ease;
          ">
        </div>
      </div>
    </div>
  `;
}

// Prevent HTML injection
function escapeHTML(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[m];
  });
}