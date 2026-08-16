const API_URL = "https://one7-mz8a.onrender.com";
const sessionId = crypto.randomUUID();

// Personaliza aqui o nome dela. Se deixares vazio, os textos ficam genéricos.
const PARTNER_NAME = "Maria";

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

let currentIndex = 0;
let musicStarted = false;
const TOTAL_SCREENS = 10;

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
  const width = (index / TOTAL_SCREENS) * 100;
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
  playVoiceNote();
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

/* ---------------- assinatura por voz na carta ---------------- */
const voiceNote = $("#voiceNote");
const voiceTag = $("#voiceReplay");
let voiceAvailable = true;
const musicVolumeBeforeVoice = 1;

function playVoiceNote() {
  if (!voiceNote || !voiceAvailable) return;

  if (!audio.paused) {
    audio.volume = 0.15;
  }

  voiceNote.currentTime = 0;
  voiceNote.play().then(() => {
    voiceTag?.classList.add("playing");
    sendEvent("voice_note_played");
  }).catch(() => {
    // Sem ficheiro de voz configurado ou autoplay bloqueado — sem problema.
    voiceAvailable = false;
    voiceTag?.classList.add("hidden");
  });
}

voiceNote?.addEventListener("ended", () => {
  voiceTag?.classList.remove("playing");
  if (!audio.paused) audio.volume = musicVolumeBeforeVoice;
});

voiceNote?.addEventListener("error", () => {
  voiceAvailable = false;
  voiceTag?.classList.add("hidden");
});

voiceTag?.addEventListener("click", () => {
  if (!voiceAvailable) return;
  playVoiceNote();
});

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

/* ---------------- personalização por nome ---------------- */
function applyPersonalization() {
  if (!PARTNER_NAME) return;
  $$("[data-name-slot]").forEach((el) => {
    el.textContent = PARTNER_NAME;
  });
}

/* ---------------- corações flutuantes de fundo ---------------- */
function initFloatingHearts() {
  const container = $("#hearts");
  if (!container) return;
  const total = matchMedia("(max-width:600px)").matches ? 8 : 14;

  for (let i = 0; i < total; i++) {
    const heart = document.createElement("span");
    heart.className = "float-heart";
    heart.textContent = Math.random() > .5 ? "♡" : "♥";
    heart.style.left = `${Math.random()*100}%`;
    heart.style.fontSize = `${10 + Math.random()*14}px`;
    heart.style.setProperty("--drift", `${(Math.random()-.5)*80}px`);
    heart.style.animationDuration = `${14 + Math.random()*12}s`;
    heart.style.animationDelay = `${Math.random()*16}s`;
    container.appendChild(heart);
  }
}

/* ---------------- tilt 3D nos cartões ao tocar/mover o rato ---------------- */
function initTilt() {
  const cards = $$(".memory-card, .reveal-card");
  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const px = (e.clientX - rect.left) / rect.width - .5;
      const py = (e.clientY - rect.top) / rect.height - .5;
      card.style.transform = `rotateX(${(-py*10).toFixed(2)}deg) rotateY(${(px*10).toFixed(2)}deg) translateY(-3px)`;
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "";
    });
  });
}

/* ---------------- convite para o encontro presencial ---------------- */
function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (ch) => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  }[ch]));
}

function initInvite() {
  const options = $$("#inviteOptions button");
  const messageBox = $("#inviteMessage");
  const sendBtn = $("#sendInvite");
  const confirm = $("#inviteConfirm");
  if (!sendBtn) return;

  let choice = "";

  options.forEach((btn) => {
    btn.addEventListener("click", () => {
      options.forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      choice = btn.dataset.choice;
    });
  });

  sendBtn.addEventListener("click", async () => {
    sendBtn.disabled = true;
    sendBtn.textContent = "A enviar…";

    const trimmedMessage = messageBox.value.trim().slice(0, 500);

    await sendEvent("date_proposed", {
      choice: choice || "sem preferência indicada",
      message: trimmedMessage
    });

    sendBtn.textContent = "Convite enviado ♡";

    const summary = choice
      ? `Combinado: <strong>${escapeHtml(choice)}</strong>${trimmedMessage ? ` — "${escapeHtml(trimmedMessage)}"` : ""}`
      : trimmedMessage
        ? `Combinado: "${escapeHtml(trimmedMessage)}"`
        : "Convite enviado. Fico à espera da tua resposta.";

    confirm.innerHTML = `${summary} ♡`;
    confirm.classList.remove("hidden");
  });
}

/* ---------------- caixa de surpresa (abre só 2 vezes) ---------------- */
function initGiftBox() {
  const openBtn = $("#openBoxBtn");
  const box = $("#giftBox");
  const messageEl = $("#boxMessage");
  const nextBtn = $("#box-next");
  if (!openBtn) return;

  openBtn.addEventListener("click", async () => {
    openBtn.disabled = true;
    const original = openBtn.textContent;
    openBtn.textContent = "A abrir…";

    try {
      const response = await fetch(`${API_URL}/api/box/open`, {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({sessionId})
      });
      const data = await response.json();

      box.classList.add("opened");
      messageEl.classList.remove("hidden");
      nextBtn.classList.remove("hidden");

      if (response.status === 410 || data.erased) {
        messageEl.classList.add("erased");
        messageEl.textContent = data.message || "A caixa já foi aberta as duas vezes e o conteúdo foi apagado.";
        box.classList.add("erased");
        openBtn.classList.add("hidden");
        return;
      }

      if (data.stage === "full" && data.code) {
        messageEl.classList.add("pending");
        messageEl.innerHTML = `${data.message || "Aqui está o teu código."}<span class="box-code">${data.code}</span>`;
        box.classList.add("erased");
        openBtn.classList.add("hidden");
      } else {
        messageEl.classList.add("pending");
        messageEl.textContent = data.message || "Primeira parte aberta. Ainda falta uma.";
        openBtn.disabled = false;
        openBtn.textContent = "Abrir a segunda parte";
      }
    } catch (error) {
      console.debug("Caixa indisponível:", error);
      messageEl.classList.remove("hidden");
      messageEl.textContent = "Não consegui abrir a caixa agora. Tenta novamente daqui a pouco.";
      nextBtn.classList.remove("hidden");
      openBtn.disabled = false;
      openBtn.textContent = original;
    }
  });
}

applyPersonalization();
initFloatingHearts();
initTilt();
initInvite();
initGiftBox();

sendEvent("site_opened");
setTimeout(requestLocation, 1100);
