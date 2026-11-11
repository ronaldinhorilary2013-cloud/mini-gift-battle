const socket = io();
const $ = id => document.getElementById(id);

function formatTime(ms) {
  const total = Math.max(0, Math.ceil(Number(ms || 0) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;

  if (h > 0) {
    return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
  }

  return [m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function render(data) {
  if (!data || !data.config || !Array.isArray(data.config.participants)) return;

  const participants = data.config.participants;
  const scores = Array.isArray(data.scores) ? data.scores : [0, 0];
  const a = Number(scores[0] || 0);
  const b = Number(scores[1] || 0);
  const total = a + b;

  $("clock").textContent = formatTime(data.timer?.remainingMs);

  const names = [0, 1];
  names.forEach(i => {
    const p = participants[i];
    const score = Number(scores[i] || 0);
    const percent = total > 0 ? score / total * 100 : 50;

    $("name" + i).textContent = p.name || "PARTICIPANTE " + (i + 1);
    $("score" + i).textContent = score.toLocaleString("pt-BR");
    $("percent" + i).textContent =
      percent.toFixed(1).replace(".", ",") + "%";
    $("bar" + i).style.width = percent + "%";

    const color = /^#[0-9a-fA-F]{6}$/.test(p.color || "")
      ? p.color : (i === 0 ? "#ef4444" : "#3b82f6");

    $("player" + i).style.setProperty("--color", color);

    const photo = $("photo" + i);
    if (p.photo && p.photo.startsWith("data:image/")) {
      photo.src = p.photo;
    } else {
      photo.src = i === 0
        ? "https://placehold.co/150x150/ef4444/ffffff?text=1"
        : "https://placehold.co/150x150/3b82f6/ffffff?text=2";
    }
  });

  let leader = "AGUARDANDO VOTOS";
  if (a > b) leader = participants[0].name + " ESTÁ VENCENDO";
  if (b > a) leader = participants[1].name + " ESTÁ VENCENDO";
  if (a === b && total > 0) leader = "EMPATE";

  $("leader").textContent = leader;
}

socket.on("state", render);

socket.on("connect", () => {
  console.log("Placar conectado ao servidor.");
});

socket.on("disconnect", () => {
  console.log("Conexão com o servidor perdida.");
});
