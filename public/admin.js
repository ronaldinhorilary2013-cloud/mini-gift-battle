const socket = io();
const $ = id => document.getElementById(id);
let photos = ["", ""];

function gifts(text) {
  return text.split("\n")
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const [name, points] = line.split("|");
      return {
        name: (name || "").trim(),
        points: Math.max(0, Number(points) || 0)
      };
    })
    .filter(g => g.name);
}

function seconds() {
  return Math.max(1,
    (Number($("hours").value) || 0) * 3600 +
    (Number($("minutes").value) || 0) * 60 +
    (Number($("seconds").value) || 0)
  );
}

function configData() {
  return {
    title: $("title").value,
    username: $("username").value,
    timerSeconds: seconds(),
    participants: [0, 1].map(i => ({
      name: $("name" + i).value,
      color: $("color" + i).value,
      command: $("command" + i).value,
      photo: photos[i],
      gifts: gifts($("gifts" + i).value)
    }))
  };
}

async function post(url, data = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });

  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Erro");
  return result;
}

async function save() {
  await post("/api/config", configData());
  $("message").textContent = "Configurações salvas!";
}

[0, 1].forEach(i => {
  $("photo" + i).onchange = event => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      $("message").textContent = "Imagem máxima: 2 MB.";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      photos[i] = reader.result;
      $("preview" + i).innerHTML =
        '<img src="' + reader.result + '" alt="Foto">';
    };
    reader.readAsDataURL(file);
  };
});

$("saveConfig").onclick = async () => {
  try {
    await save();
  } catch (error) {
    $("message").textContent = error.message;
  }
};

$("connectLive").onclick = async () => {
  try {
    await save();
    $("message").textContent = "Conectando...";
    await post("/api/connect");
    $("message").textContent = "Solicitação de conexão enviada.";
  } catch (error) {
    $("message").textContent = error.message;
  }
};

$("startTimer").onclick = async () => {
  try {
    await save();
    await post("/api/timer", {
      action: "start",
      seconds: seconds()
    });
  } catch (error) {
    $("message").textContent = error.message;
  }
};

$("pauseTimer").onclick = () =>
  post("/api/timer", { action: "pause" });

$("resumeTimer").onclick = () =>
  post("/api/timer", { action: "resume" });

$("resetTimer").onclick = () =>
  post("/api/timer", { action: "reset" });

$("resetScores").onclick = async () => {
  if (confirm("Deseja zerar a pontuação?")) {
    await post("/api/reset-scores");
  }
};

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

socket.on("state", state => {
  $("liveStatus").textContent = state.liveStatus.toUpperCase();
  $("adminTimer").textContent = formatTime(state.timer.remainingMs);
});

fetch("/api/state")
  .then(r => r.json())
  .then(state => {
    const c = state.config;

    $("title").value = c.title;
    $("username").value = c.username;
    $("hours").value = Math.floor(c.timerSeconds / 3600);
    $("minutes").value = Math.floor(c.timerSeconds % 3600 / 60);
    $("seconds").value = c.timerSeconds % 60;

    c.participants.forEach((p, i) => {
      $("name" + i).value = p.name;
      $("color" + i).value = p.color;
      $("command" + i).value = p.command;
      $("gifts" + i).value =
        p.gifts.map(g => g.name + "|" + g.points).join("\n");

      photos[i] = p.photo || "";

      if (photos[i]) {
        $("preview" + i).innerHTML =
          '<img src="' + photos[i] + '" alt="Foto">';
      }
    });
  })
  .catch(() => {
    $("message").textContent = "Erro ao carregar configurações.";
  });
