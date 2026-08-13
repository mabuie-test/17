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
  location: z.object({
    latitude: z.number().gte(-90).lte(90),
    longitude: z.number().gte(-180).lte(180),
    accuracyMeters: z.number().nonnegative().max(100000).optional()
  }).optional()
});

const events = [];

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

async function notifyEmail(event) {
  if (!transporter || !process.env.NOTIFY_EMAIL) return;

  const gps = event.location
    ? `GPS: ${event.location.latitude}, ${event.location.longitude} | precisão: ±${event.location.accuracyMeters ?? "?"} m`
    : "GPS: não partilhado";

  await transporter.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_EMAIL,
    subject: `❤️ 17 — ${event.event}`,
    text:
`Novo evento no presente "17 — O começo de uma história".

Evento: ${event.event}
Data/hora UTC: ${event.createdAt}
IP observado pelo servidor: ${event.ip}
${gps}
Sessão: ${event.sessionId}
User-Agent: ${event.userAgent || "desconhecido"}
Referer: ${event.referrer || "nenhum"}`
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
