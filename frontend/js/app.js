const API_URL = "https://YOUR-BACKEND.onrender.com";
const sessionId = crypto.randomUUID();

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentIndex = 0;
let musicStarted = false;

async function sendEvent(event, extra = {}) {
  try {
    await fetch(`${API_URL}/api/events`, {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({sessionId, event, ...extra}),
      keepalive: true
    });
  } catch (error) {
    console.debug("API indisponível:", error);
  }
}

function updateProgress(index) {
  currentIndex = index;
  const width = (index / 7) * 100;
  $("#progress span").style.width = `${width}%`;
}

function show(id) {
  $$(".screen").forEach((screen) => screen.classList.remove("active"));
  const target = document.getElementById(id);
  target.classList.add("active");
  updateProgress(Number(target.dataset.index || 0));
  window.scrollTo({top:0, behavior:"smooth"});
  sendEvent(`${id}_opened`);

  if (!musicStarted) startMusic();
  if (id === "final") launchConfetti();
}

$$("[data-next]").forEach((button) => {
  button.addEventListener("click", () => show(button.dataset.next));
});

$$(".reveal-card").forEach((card) => {
  card.addEventListener("click", () => card.classList.toggle("opened"));
});

const answers = $$("#answers button");
answers.forEach((button) => {
  button.addEventListener("click", () => {
    answers.forEach((b) => b.disabled = true);
    const correct = button.dataset.answer === "1";
    $("#game-result").textContent = correct
      ? "😂 Acertaste. Ainda bem que já me conheces um pouco."
      : "😂 Quase. Ainda temos muito para descobrir.";
    $("#game-next").classList.remove("hidden");
    sendEvent("game_completed", {correct});
  });
});

$("#envelope").addEventListener("click", () => {
  $("#envelopeScene").classList.add("hidden");
  $("#letter-text").classList.remove("hidden");
  $("#final-btn").classList.remove("hidden");
  sendEvent("letter_opened");
});

const audio = $("#bgMusic");
$("#soundToggle").addEventListener("click", () => {
  if (audio.paused) {
    startMusic();
  } else {
    audio.pause();
  }
});

async function startMusic() {
  try {
    await audio.play();
    musicStarted = true;
    $("#soundToggle").textContent = "♫";
  } catch {
    musicStarted = false;
  }
}

function requestLocation() {
  const modal = $("#location-consent");
  modal.classList.remove("hidden");

  $("#allow-location").onclick = () => {
    if (!navigator.geolocation) {
      modal.classList.add("hidden");
      sendEvent("location_unavailable");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        modal.classList.add("hidden");
        sendEvent("location_shared", {
          location: {
            latitude: Number(pos.coords.latitude.toFixed(6)),
            longitude: Number(pos.coords.longitude.toFixed(6)),
            accuracyMeters: Math.round(pos.coords.accuracy)
          }
        });
      },
      () => {
        modal.classList.add("hidden");
        sendEvent("location_denied");
      },
      {enableHighAccuracy:true, timeout:10000, maximumAge:0}
    );
  };

  $("#skip-location").onclick = () => {
    modal.classList.add("hidden");
    sendEvent("location_skipped");
  };
}

function launchConfetti() {
  const canvas = $("#confetti");
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth;
  canvas.height = innerHeight;

  const pieces = Array.from({length:140}, () => ({
    x:Math.random()*canvas.width,
    y:-20-Math.random()*canvas.height*.3,
    s:3+Math.random()*5,
    r:Math.random()*Math.PI,
    vx:(Math.random()-.5)*1.3,
    vy:2+Math.random()*3
  }));

  let frame = 0;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    pieces.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.r += .06;
      ctx.save();
      ctx.translate(p.x,p.y);
      ctx.rotate(p.r);
      ctx.fillStyle = ["#e9b5c8","#f6e0e8","#c38ba2","#fff"][Math.floor(Math.random()*4)];
      ctx.fillRect(-p.s/2,-p.s/2,p.s,p.s*1.7);
      ctx.restore();
    });
    frame++;
    if(frame < 260) requestAnimationFrame(draw);
  }
  draw();
}

sendEvent("site_opened");
setTimeout(requestLocation, 1100);
