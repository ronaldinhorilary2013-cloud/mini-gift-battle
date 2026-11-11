const socket = io();
const $ = id => document.getElementById(id);

let photos = ["", ""];
const pointOptions = [1,2,3,4,5,6,8,10,15,20,25,30,50,75,100];

function message(text) {
  $("message").textContent = text;
}

function showError(error) {
  message("ERRO: " + error.message);
}

function addGiftRow(index, gift = {}) {
  const container = $("giftsEditor" + index);

  const row = document.createElement("div");
  row.className = "gift-row";

  const name = document.createElement("input");
  name.type = "text";
  name.maxLength = 60;
  name.placeholder = "Ex.: Rosa 🌹";
  name.value = gift.name || "";

  const points = document.createElement("select");

  pointOptions.forEach(value => {
    const option = document.createElement("option");
    option.value = String(value);
    option.textContent = value + (value === 1 ? " ponto" : " pontos");
    points.appendChild(option);
  });

  const current = Number(gift.points) || 1;
  if (!pointOptions.includes(current)) {
    const option = document.createElement("option");
    option.value = String(current);
    option.textContent = current + " pontos";
    points.appendChild(option);
  }
  points.value = String(current);

  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "X";
  remove.title = "Remover presente";
  remove.onclick = () => row.remove();

  row.append(name, points, remove);
  container.appendChild(row);
}

function readGifts(index) {
  return Array.from(
    $("giftsEditor" + index).querySelectorAll(".gift-row")
  ).map(row => ({
    name: row.querySelector("input").value.trim(),
    points: Number(row.querySelector("select").value) || 1
  })).filter(g => g.name);
}

function seconds() {
  const h = Math.max(0, Number($("hours").value) || 0);
  const m = Math.max(0, Number($("minutes").value) || 0);
  const s = Math.max(0, Number($("seconds").value) || 0);
  return Math.max(1, h * 3600 + m * 60 + s);
}

function configData() {
  return {
    title: $("title").value,
    username: $("username").value,
    timerSeconds: seconds(),

    participants: [0,1].map(i => ({
      name: $("name" + i).value,
      color: $("color" + i).value,
      command: $("command" + i).value,
      photo: photos[i],
      description: $("description" + i).value,
      gifts: readGifts(i)
    }))
  };
}

async function post(url, data = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(data)
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error || "Erro na solicitação");
  }

  return result;
}

[0,1].forEach(i => {
  $("addGift" + i).onclick = () => addGiftRow(i);

  $("photo" + i).onchange = event => {
    const file = event.target.files[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      message("A foto deve ter no máximo 2 MB.");
      event.target.value = "";
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      photos[i] = reader.result;
      $("preview" + i).src = reader.result;
    };

    reader.readAsDataURL(file);
  };
});

async function save() {
  await post("/api/config", configData());
  message("Configurações salvas com sucesso!");
}

$("saveConfig").onclick = async () => {
  try {
    await save();
  } catch (error) {
    showError(error);
  }
};

$("connectLive").onclick = async () => {
  try {
    await save();
    message("Solicitando conexão com o TikTok...");
    await post("/api/connect");
    message("Conexão solicitada. Confira o status da LIVE.");
  } catch (error) {
    showError(error);
  }
};

$("startTimer").onclick = async () => {
  try {
    await save();
    await post("/api/timer", {
      action: "start",
      seconds: seconds()
    });
    message("Cronômetro iniciado.");
  } catch (error) {
    showError(error);
  }
};

$("pauseTimer").onclick = async () => {
  try {
    await post("/api/timer", {action:"pause"});
    message("Cronômetro pausado.");
  } catch (error) {
    showError(error);
  }
};

$("resumeTimer").onclick = async () => {
  try {
    await post("/api/timer", {action:"resume"});
    message("Cronômetro continuado.");
  } catch (error) {
    showError(error);
  }
};

$("resetTimer").onclick = async () => {
  try {
    await post("/api/timer", {action:"reset"});
    message("Cronômetro reiniciado.");
  } catch (error) {
    showError(error);
  }
};

$("resetScores").onclick = async () => {
  if (!confirm("Deseja zerar a pontuação dos dois participantes?")) return;

  try {
    await post("/api/reset-scores");
    message("Pontuação zerada.");
  } catch (error) {
    showError(error);
  }
};

function formatTime(ms) {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;

  return [h,m,s].map(n => String(n).padStart(2,"0")).join(":");
}

socket.on("state", state => {
  $("liveStatus").textContent =
    String(state.liveStatus || "Desconectado").toUpperCase();

  $("adminTimer").textContent = formatTime(state.timer.remainingMs);
});

fetch("/api/state")
  .then(response => {
    if (!response.ok) throw new Error("Falha ao carregar configurações.");
    return response.json();
  })
  .then(state => {
    const c = state.config;

    $("title").value = c.title || "";
    $("username").value = c.username || "";

    $("hours").value = Math.floor(c.timerSeconds / 3600);
    $("minutes").value = Math.floor(c.timerSeconds % 3600 / 60);
    $("seconds").value = c.timerSeconds % 60;

    c.participants.forEach((p, i) => {
      $("name" + i).value = p.name || "";
      $("color" + i).value = p.color || (i === 0 ? "#ef4444" : "#3b82f6");
      $("command" + i).value = p.command || "";
      $("description" + i).value = p.description || "";

      photos[i] = p.photo || "";

      if (photos[i]) {
        $("preview" + i).src = photos[i];
      }

      $("giftsEditor" + i).innerHTML = "";

      (p.gifts || []).forEach(gift => addGiftRow(i, gift));

      if (!p.gifts || p.gifts.length === 0) {
        addGiftRow(i);
      }
    });

    message("Configurações carregadas.");
  })
  .catch(showError);
