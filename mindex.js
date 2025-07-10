const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 8080 }, () => {
  console.log('WebSocket server is running');
});

let clients = [];
let blocks = [];
let pendingUpdateBlocks;

function broadcast(data) {
  for (let c of clients) {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify(data));
    }
  }
}

wss.on('connection', (ws) => {
  const id = Math.random().toString(36);
  const player = { id, x: 0, y: 0, health: 100 };
  clients.push({ ws, id, player });

  const otherPlayers = clients
    .filter(c => c.id !== id)
    .map(c => c.player);

  ws.send(JSON.stringify({
    type: 'init',
    me: id,
    blocks: blocks,
    players: otherPlayers
  }));

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch {
      return;
    }

    if (data.type === 'move') {
      const client = clients.find(c => c.id === data.id);
      if (client) {
        client.player = data.player;

        const allPlayers = clients.map(c => c.player);
        broadcast({ type: 'players', players: allPlayers });
      }
    } else if (data.type === 'block-update') {
      pendingUpdateBlocks = data.blocks;
    } else if (data.type === 'chat') {
      broadcast({ type: 'chat', message: data.message });
    }
  });

  ws.on('close', () => {
    clients = clients.filter(c => c.id !== id);
    broadcast({ type: 'leave', id });
  });
});

setInterval(() => {
  if (pendingUpdateBlocks) {
    blocks = pendingUpdateBlocks;
    broadcast({ type: 'blocks', blocks: pendingUpdateBlocks });
    pendingUpdateBlocks = null;
  }
}, 10);
