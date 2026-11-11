import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TikTokLiveClient,
  EventType,
  GiftStreakTracker
} from "piratetok-live-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const io = new Server(server);
const PORT = Number(process.env.PORT) || 3000;
const CONFIG = path.join(__dirname, "config.json");

app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

let config = JSON.parse(fs.readFileSync(CONFIG, "utf8"));
let scores = [0, 0];
let activity = [];
let liveClient = null;
let liveStatus = "Desconectado";

let timer = {
  running: false,
  remainingMs: config.timerSeconds * 1000,
  endsAt: null,
  finished: false
};

function saveConfig() {
  fs.writeFileSync(CONFIG, JSON.stringify(config, null, 2));
}

function remaining() {
  return timer.running
    ? Math.max(0, timer.endsAt - Date.now())
    : Math.max(0, timer.remainingMs);
}

function state() {
  return {
    config,
    scores,
    activity,
    liveStatus,
    timer: {
      running: timer.running,
      remainingMs: remaining(),
      finished: timer.finished
    }
  };
}

function broadcast() {
  io.emit("state", state());
}

function log(message, type = "vote") {
  activity.unshift({
    message,
    type,
    time: new Date().toLocaleTimeString("pt-BR")
  });
  activity = activity.slice(0, 30);
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
}

function award(index, points, message, type) {
  if (timer.finished || points <= 0) return;

  scores[index] += points;
  log(message, type);
  broadcast();
}

function finishTimer() {
  timer.running = false;
  timer.remainingMs = 0;
  timer.endsAt = null;
  timer.finished = true;

  if (scores[0] === scores[1]) {
    log("DISPUTA ENCERRADA: EMPATE!", "winner");
  } else {
    const winner = scores[0] > scores[1] ? 0 : 1;
    log("VENCEDOR: " + config.participants[winner].name, "winner");
  }

  broadcast();
}

setInterval(() => {
  if (timer.running && remaining() <= 0) {
    finishTimer();
  } else if (timer.running) {
    broadcast();
  }
}, 500);

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/overlay", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "overlay.html"));
});

app.get("/api/state", (_req, res) => {
  res.json(state());
});

app.post("/api/config", (req, res) => {
  try {
    const input = req.body;

    if (!input || !Array.isArray(input.participants) ||
        input.participants.length !== 2) {
      return res.status(400).json({
        error: "São necessários dois participantes."
      });
    }

    config = {
      title: String(input.title || "GIFT BATTLE").slice(0, 100),
      username: String(input.username || "").replace(/^@/, "").trim(),
      timerSeconds: Math.max(1, Number(input.timerSeconds) || 300),
      participants: input.participants.map(p => ({
        name: String(p.name || "Participante").slice(0, 50),
        color: /^#[0-9a-fA-F]{6}$/.test(p.color)
          ? p.color : "#2878ed",
        command: String(p.command || "").trim().slice(0, 30),
        photo: typeof p.photo === "string"
          ? p.photo.slice(0, 3000000) : "",
        gifts: Array.isArray(p.gifts)
          ? p.gifts.slice(0, 30).map(g => ({
              name: String(g.name || "").trim().slice(0, 60),
              points: Math.max(0, Number(g.points) || 0)
            })).filter(g => g.name)
          : []
      }))
    };

    saveConfig();

    if (!timer.running) {
      timer.remainingMs = config.timerSeconds * 1000;
      timer.finished = false;
      timer.endsAt = null;
    }

    broadcast();
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/timer", (req, res) => {
  const action = req.body.action;

  if (action === "start") {
    const seconds = Math.max(
      1,
      Number(req.body.seconds) || config.timerSeconds
    );

    timer.remainingMs = seconds * 1000;
    timer.endsAt = Date.now() + timer.remainingMs;
    timer.running = true;
    timer.finished = false;
    log("CRONÔMETRO INICIADO", "system");
  }

  if (action === "pause" && timer.running) {
    timer.remainingMs = remaining();
    timer.running = false;
    timer.endsAt = null;
    log("CRONÔMETRO PAUSADO", "system");
  }

  if (action === "resume" && !timer.running && !timer.finished) {
    if (timer.remainingMs > 0) {
      timer.endsAt = Date.now() + timer.remainingMs;
      timer.running = true;
      log("CRONÔMETRO CONTINUADO", "system");
    }
  }

  if (action === "reset") {
    timer.running = false;
    timer.endsAt = null;
    timer.remainingMs = config.timerSeconds * 1000;
    timer.finished = false;
    log("CRONÔMETRO REINICIADO", "system");
  }

  broadcast();
  res.json({ ok: true });
});

app.post("/api/reset-scores", (_req, res) => {
  scores = [0, 0];
  activity = [];
  broadcast();
  res.json({ ok: true });
});

app.post("/api/connect", async (_req, res) => {
  try {
    const username = config.username.replace(/^@/, "").trim();

    if (!username) {
      return res.status(400).json({
        error: "Configure o usuário do TikTok."
      });
    }

    if (liveClient) {
      try {
        await liveClient.disconnect();
      } catch {}
      liveClient = null;
    }

    const client = new TikTokLiveClient(username);
    const tracker = new GiftStreakTracker();

    client.on(EventType.chat, data => {
      const message = String(data.content || "").trim();
      if (!message || timer.finished) return;

      config.participants.forEach((p, i) => {
        if (p.command && normalize(message) === normalize(p.command)) {
          award(
            i,
            1,
            (data.user?.nickname || "Usuário") +
              " votou em " + p.name,
            "chat"
          );
        }
      });
    });

    client.on(EventType.gift, data => {
      if (timer.finished) return;

      const giftName = data.gift?.name || "Presente";
      const nickname = data.user?.nickname || "Usuário";
      const streak = tracker.process(data);

      const quantity = Math.max(
        1,
        Number(streak?.eventGiftCount ?? data.repeatCount ?? 1)
      );

      config.participants.forEach((p, i) => {
        const gift = p.gifts.find(
          g => normalize(g.name) === normalize(giftName)
        );

        if (gift) {
          const points = gift.points * quantity;
          award(
            i,
            points,
            nickname + " enviou " + giftName +
              " x" + quantity + " (+" + points + ")",
            "gift"
          );
        }
      });
    });

    client.on("disconnected", () => {
      liveStatus = "Desconectado";
      broadcast();
    });

    client.on("error", error => {
      liveStatus = "Erro na conexão";
      log("Erro TikTok: " + (error?.message || error), "system");
      broadcast();
    });

    liveClient = client;
    liveStatus = "Conectando...";
    broadcast();

    await client.connect();

    liveStatus = "AO VIVO";
    log("Conectado à LIVE de @" + username, "system");
    broadcast();

    res.json({ ok: true });
  } catch (error) {
    liveStatus = "Falha na conexão";
    broadcast();
    res.status(500).json({ error: error.message });
  }
});

io.on("connection", socket => {
  socket.emit("state", state());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("MINI GIFT BATTLE");
  console.log("ADMIN: http://localhost:" + PORT);
  console.log("PLACAR: http://localhost:" + PORT + "/overlay");
});
