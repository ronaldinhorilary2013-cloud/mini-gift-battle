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

config.participants = (config.participants || []).slice(0, 2);
while (config.participants.length < 2) {
  config.participants.push({
    name: "PARTICIPANTE",
    color: "#2878ed",
    command: "",
    photo: "",
    description: "",
    gifts: []
  });
}

config.participants = config.participants.map(p => ({
  name: p.name || "PARTICIPANTE",
  color: p.color || "#2878ed",
  command: p.command || "",
  photo: p.photo || "",
  description: p.description || "",
  gifts: Array.isArray(p.gifts) ? p.gifts : []
}));

let scores = [0, 0];
let activity = [];
let liveClient = null;
let liveStatus = "Desconectado";

let timer = {
  running: false,
  remainingMs: (Number(config.timerSeconds) || 300) * 1000,
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

// Placar básico na página principal
app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "overlay.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

app.get("/overlay", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "overlay.html"));
});

app.get("/api/state", (_req, res) => {
  res.json(state());
});

// Salvar configurações
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
      title: String(input.title || "MINI GIFT BATTLE").slice(0, 100),
      username: String(input.username || "")
        .replace(/^@/, "").trim(),
      timerSeconds: Math.max(1, Number(input.timerSeconds) || 300),

      participants: input.participants.map((p, i) => ({
        name: String(p.name || "PARTICIPANTE " + (i + 1)).slice(0, 50),

        color: /^#[0-9a-fA-F]{6}$/.test(p.color)
          ? p.color
          : (i === 0 ? "#ef4444" : "#3b82f6"),

        command: String(p.command || "").trim().slice(0, 30),

        photo: typeof p.photo === "string"
          ? p.photo.slice(0, 3000000)
          : "",

        description: String(p.description || "").slice(0, 500),

        gifts: Array.isArray(p.gifts)
          ? p.gifts.slice(0, 50).map(g => ({
              name: String(g.name || "").trim().slice(0, 60),
              points: Math.max(0, Math.min(10000, Number(g.points) || 0))
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

// Cronômetro
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

// Zerar pontos
app.post("/api/reset-scores", (_req, res) => {
  scores = [0, 0];
  activity = [];
  broadcast();
  res.json({ ok: true });
});

// Conexão com TikTok LIVE
app.post("/api/connect", async (_req, res) => {
  try {
    const username = String(config.username || "")
      .replace(/^@/, "").trim();

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
              " votou em " + p.name + " (+1)",
            "chat"
          );
        }
      });
    });

    client.on(EventType.gift, data => {
      try {
        if (timer.finished) return;

        const giftName =
          data.gift?.name ||
          data.giftName ||
          data.giftDetails?.giftName ||
          data.gift?.giftName ||
          "";

        if (!giftName) {
          log("Presente recebido, mas o nome não foi identificado.", "system");
          broadcast();
          return;
        }

        const nickname =
          data.user?.nickname ||
          data.user?.uniqueId ||
          "Usuário";

        let tracked = null;

        try {
          tracked = tracker.process(data);
        } catch {}

        // Em presentes de sequência, aguarda o evento final.
        const giftType = Number(data.gift?.type ?? data.giftType);
        if (
          giftType === 1 &&
          (data.repeatEnd === false || data.repeatEnd === 0) &&
          tracked?.eventGiftCount == null
        ) {
          return;
        }

        const quantity = Math.max(
          1,
          Number(
            tracked?.eventGiftCount ??
            tracked?.repeatCount ??
            data.repeatCount ??
            data.gift?.repeatCount ??
            1
          )
        );

        const normalizedGift = normalize(giftName);
        let awarded = false;

        for (let i = 0; i < config.participants.length; i++) {
          const p = config.participants[i];

          const gift = p.gifts.find(
            g => normalize(g.name) === normalizedGift
          );

          if (gift) {
            const points = Number(gift.points) * quantity;

            award(
              i,
              points,
              nickname + " enviou " + giftName +
                " x" + quantity + " (+" + points + ") para " + p.name,
              "gift"
            );

            awarded = true;
            break;
          }
        }

        if (!awarded) {
          log("Presente não cadastrado: " + giftName, "system");
          broadcast();
        }
      } catch (error) {
        log("Erro ao contabilizar presente: " + error.message, "system");
        broadcast();
      }
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
    log("Falha na conexão: " + error.message, "system");
    broadcast();
    res.status(500).json({ error: error.message });
  }
});

io.on("connection", socket => {
  socket.emit("state", state());
});

server.listen(PORT, "0.0.0.0", () => {
  console.log("MINI GIFT BATTLE");
  console.log("ADMIN: http://localhost:" + PORT + "/admin");
  console.log("PLACAR: http://localhost:" + PORT + "/overlay");
});
