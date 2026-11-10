const socket = io();
const $ = id => document.getElementById(id);

function formatTime(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor(total % 3600 / 60);
  const s = total % 60;
  return [h, m, s].map(n => String(n).padStart(2, "0")).join(":");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[c]);
}

function render(state) {
  const c = state.config;
  const scores = state.scores;
  const total = scores[0] + scores[1];

  $("boardTitle").textContent = c.title;
  $("timer").textContent = formatTime(state.timer.remainingMs);
  $("timer").classList.toggle("finished", state.timer.finished);

  $("total").textContent = total.toLocaleString("pt-BR");
  $("difference").textContent =
    Math.abs(scores[0] - scores[1]).toLocaleString("pt-BR");

  let leader = "EMPATE";
  if (scores[0] > scores[1]) leader = c.participants[0].name;
  if (scores[1] > scores[0]) leader = c.participants[1].name;
  $("leader").textContent = leader;

  [0, 1].forEach(i => {
    const p = c.participants[i];
    const percent = total ? scores[i] / total * 100 : 0;

    $("name" + i).textContent = p.name;
    $("command" + i).textContent = p.command;
    $("score" + i).textContent = scores[i].toLocaleString("pt-BR");
    $("percent" + i).textContent =
      percent.toFixed(1).replace(".", ",") + "%";

    $("bar" + i).style.width = percent + "%";
    $("bar" + i).style.background = p.color;
    $("card" + i).style.setProperty("--candidate-color", p.color);

    const photo = $("photo" + i);

    if (p.photo) {
      photo.innerHTML =
        '<img src="' + p.photo + '" alt="Participante">';
    } else {
      photo.textContent = String(i + 1);
    }

    $("gifts" + i).innerHTML = p.gifts.map(g =>
      '<div class="gift-item"><span>' +
      escapeHtml(g.name) +
      '</span><b>+' + Number(g.points) + '</b></div>'
    ).join("");

    $("card" + i).classList.toggle(
      "leading",
      scores[i] > scores[1 - i]
    );
  });

  $("connectionStatus").textContent = state.liveStatus.toUpperCase();

  $("activity").innerHTML = state.activity.length
    ? state.activity.map(item =>
      '<div class="activity-item ' + item.type + '">' +
      '<span class="activity-dot"></span>' +
      '<div><b>' + escapeHtml(item.message) + '</b>' +
      '<small>' + escapeHtml(item.time) + '</small></div></div>'
    ).join("")
    : '<div class="empty">Aguardando votos e presentes...</div>';
}

socket.on("state", render);
