import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import nodemailer from "nodemailer";
import { z } from "zod";

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT || 10000);

app.set("trust proxy", 1);
app.disable("x-powered-by");

const origin = process.env.FRONTEND_ORIGIN || "http://localhost:5500";

app.use(helmet({
  crossOriginResourcePolicy: {policy:"cross-origin"}
}));

app.use(cors({
  origin,
  methods:["GET","POST"],
  allowedHeaders:["Content-Type","X-Admin-Key"]
}));

app.use(express.json({limit:"12kb"}));

const eventLimiter = rateLimit({
  windowMs: 60_000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false
});

const eventSchema = z.object({
  sessionId: z.string().uuid(),
  event: z.string().regex(/^[a-z0-9_]{2,80}$/),
  correct: z.boolean().optional(),
  choice: z.string().max(120).optional(),
  message: z.string().max(500).optional(),
  location: z.object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    accuracyMeters: z.number().nonnegative().max(100000).optional()
  }).optional()
});

const boxOpenSchema = z.object({
  sessionId: z.string().uuid()
});

const events = [];

// Estado da caixa de surpresa: só permite 2 aberturas, depois o código
// desaparece da memória do servidor para sempre (não fica gravado em disco).
//
// BOX_ERASE_ENABLED controla se esse apagamento definitivo acontece.
// Em desenvolvimento, define BOX_ERASE_ENABLED=false no .env para poderes
// abrir a caixa quantas vezes quiseres sem perderes o código real.
// Antes de publicares para ela, muda para "true" (ou remove a variável).
const BOX_ERASE_ENABLED = String(process.env.BOX_ERASE_ENABLED ?? "true") !== "false";

const boxState = {
  opens: 0,
  maxOpens: 2,
  code: process.env.TMCEL_CODE || null,
  erased: false
};

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

const transporter =
  process.env.SMTP_HOST && process.env.SMTP_USER
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 465),
        secure: String(process.env.SMTP_SECURE) !== "false",
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      })
    : null;

const EVENT_LABELS = {
  convite_opened: "Ela abriu a página do convite",
  distance_opened: "Ela chegou à página sobre estarem mais calados",
  letter_opened: "Ela abriu a carta",
  box_opened_1: "Ela abriu a caixa de surpresa pela 1ª vez (teaser)",
  box_opened_2: "Ela abriu a caixa de surpresa pela 2ª vez (revelou o código)",
  date_proposed: "Ela respondeu ao convite para o encontro presencial"
};

function formatLocalTime(isoString) {
  try {
    return new Intl.DateTimeFormat("pt-PT", {
      timeZone:"Africa/Maputo",
      dateStyle:"short",
      timeStyle:"medium"
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

async function notifyEmail(event) {
  if (!transporter || !process.env.NOTIFY_EMAIL) return;

  const gps = event.location
    ? `GPS: ${event.location.latitude}, ${event.location.longitude} | precisão: ±${event.location.accuracyMeters ?? "?"} m`
    : "GPS: não partilhado";

  const extras = [
    event.choice ? `Escolha: ${event.choice}` : null,
    event.message ? `Mensagem: ${event.message}` : null
  ].filter(Boolean).join("\n");

  const label = EVENT_LABELS[event.event];
  const localTime = formatLocalTime(event.createdAt);
  const subject = label
    ? `❤️ 17 — ${label} às ${formatLocalTime(event.createdAt).split(", ")[1] || localTime}`
    : `❤️ 17 — ${event.event}`;

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject,
    text:
`Novo evento no presente "17 — O começo de uma história".
${label ? `\n${label}\n` : ""}
🕒 Hora em Moçambique: ${localTime}
Evento: ${event.event}
Data/hora UTC: ${event.createdAt}
IP observado pelo servidor: ${event.ip}
${gps}
Sessão: ${event.sessionId}
User-Agent: ${event.userAgent || "desconhecido"}
Referer: ${event.referrer || "nenhum"}${extras ? `\n${extras}` : ""}`
  });
}

app.get("/api/health", (req, res) => {
  res.json({ok:true, service:"17-aniversario-api", version:"2.0.0"});
});

app.post("/api/events", eventLimiter, async (req, res) => {
  const parsed = eventSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      ok:false,
      error:"Evento inválido"
    });
  }

  const event = {
    ...parsed.data,
    ip:getClientIp(req),
    userAgent:req.get("user-agent") || "",
    referrer:req.get("referer") || "",
    createdAt:new Date().toISOString()
  };

  events.push(event);

  // A resposta ao site não fica bloqueada pelo envio do email.
  notifyEmail(event).catch((error) => {
    console.error("Falha ao enviar email:", error.message);
  });

  res.status(201).json({ok:true});
});

app.get("/api/box/state", (req, res) => {
  res.json({
    ok:true,
    opens:boxState.opens,
    maxOpens:boxState.maxOpens,
    erased:boxState.erased
  });
});

app.post("/api/box/open", eventLimiter, async (req, res) => {
  const parsed = boxOpenSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({ok:false, error:"Pedido inválido"});
  }

  if (boxState.erased) {
    return res.status(410).json({
      ok:false,
      erased:true,
      message:"A caixa já foi aberta as duas vezes e o conteúdo foi apagado."
    });
  }

  if (!boxState.code) {
    return res.status(500).json({
      ok:false,
      message:"A caixa ainda não tem surpresa configurada."
    });
  }

  boxState.opens += 1;

  let payload;
  if (boxState.opens < boxState.maxOpens) {
    payload = {
      ok:true,
      opens:boxState.opens,
      maxOpens:boxState.maxOpens,
      stage:"teaser",
      message:"Dentro desta caixa há um mimo prático para ti. Ainda falta abrir mais uma vez."
    };
  } else {
    payload = {
      ok:true,
      opens:boxState.opens,
      maxOpens:boxState.maxOpens,
      stage:"full",
      message:"Aqui está: um saldo Tmcel só teu. Guarda o código já, porque a caixa fecha-se para sempre a seguir.",
      code:boxState.code
    };

    if (BOX_ERASE_ENABLED) {
      // Apagamento real e definitivo — usado quando o site já está com ela.
      boxState.code = null;
      boxState.erased = true;
    } else {
      // Modo de desenvolvimento: não apaga nada, só reinicia a contagem
      // para poderes testar o ciclo completo (teaser → completo) de novo.
      boxState.opens = 0;
      payload.devMode = true;
    }
  }

  notifyEmail({
    event:`box_opened_${boxState.opens}`,
    ip:getClientIp(req),
    userAgent:req.get("user-agent") || "",
    referrer:req.get("referer") || "",
    createdAt:new Date().toISOString(),
    sessionId:parsed.data.sessionId
  }).catch((error) => {
    console.error("Falha ao enviar email:", error.message);
  });

  res.json(payload);
});

app.get("/api/admin/events", (req, res) => {
  const provided = req.get("X-Admin-Key");

  if (!process.env.ADMIN_KEY || provided !== process.env.ADMIN_KEY) {
    return res.status(401).json({ok:false, error:"Não autorizado"});
  }

  res.json({
    ok:true,
    count:events.length,
    events
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`17 API running on 0.0.0.0:${PORT}`);
});
