const socket = io();
const $ = id => document.getElementById(id);

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return h > 0
    ? [h,m,s].map(n => String(n).padStart(2,"0")).join(":")
    : [m,s].map(n => String(n).padStart(2,"0")).join(":");
}

socket.on("state", data => {
  if (!data || !data.config || !data.config.participants) return;

  const p = data.config.participants;
  const scores = data.scores || [0,0];
  const total = Number(scores[0]) + Number(scores[1]);

  for (let i = 0; i < 2; i++) {
    const percent = total ? Number(scores[i]) / total * 100 : 50;

    $("name" + i).textContent = p[i].name;
    $("score" + i).textContent = Number(scores[i]).toLocaleString("pt-BR");
    $("bar" + i).style.width = percent + "%";
    $("percent" + i).textContent =
      percent.toFixed(1).replace(".",",") + "%";

    $("player" + i).style.setProperty("--color", p[i].color);

    if (p[i].photo && p[i].photo.startsWith("data:image/")) {
      $("photo" + i).src = p[i].photo;
    }
  }

  $("clock").textContent = formatTime(data.timer.remainingMs);

  $("leader").textContent = scores[0] === scores[1]
    ? (total === 0 ? "AGUARDANDO VOTOS" : "EMPATE")
    : scores[0] > scores[1]
      ? p[0].name + " ESTÁ VENCENDO"
      : p[1].name + " ESTÁ VENCENDO";
});
