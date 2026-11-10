const socket = io();

let total = 0;
let coins = 0;
const supporters = {};
const received = new Set();

const status = document.getElementById('status');

document.getElementById('connect').onclick = () => {
  const username = document.getElementById('username').value.trim();

  if (!username) {
    alert('Digite o @ do criador!');
    return;
  }

  status.textContent = '● Conectando...';
  socket.emit('connectTikTok', username);
};

socket.on('status', message => {
  status.textContent = '● ' + message;
});

socket.on('presente', gift => {
  total += gift.quantidade;
  coins += gift.moedas * gift.quantidade;

  supporters[gift.usuario] =
    (supporters[gift.usuario] || 0) + gift.moedas * gift.quantidade;

  document.getElementById('total').textContent = total;
  document.getElementById('coins').textContent = coins;
  document.getElementById('senders').textContent =
    Object.keys(supporters).length;

  const gifts = document.getElementById('gifts');

  if (received.size === 0) gifts.innerHTML = '';

  const row = document.createElement('div');
  row.className = 'gift';

  const name = document.createElement('span');
  name.textContent = `${gift.usuario} enviou ${gift.presente} x${gift.quantidade}`;

  const value = document.createElement('span');
  value.className = 'value';
  value.textContent = `${gift.moedas * gift.quantidade} moedas`;

  row.append(name, value);
  gifts.prepend(row);

  received.add(gift.usuario + gift.presente + Date.now());

  const ranking = document.getElementById('ranking');
  ranking.innerHTML = '';

  Object.entries(supporters)
    .sort((a, b) => b[1] - a[1])
    .forEach(([user, amount], index) => {
      const item = document.createElement('div');
      item.className = 'rank';

      const position = document.createElement('span');
      position.textContent = `${index + 1}º — ${user}`;

      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = `${amount} moedas`;

      item.append(position, value);
      ranking.appendChild(item);
    });
});
