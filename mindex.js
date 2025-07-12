const canvas = document.getElementById('Game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

window.addEventListener('resize', () => {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
});

const gridSize = 85;
const cols = canvas.width / gridSize;
const rows = canvas.height / gridSize;

const player = {
  x: 2,
  y: 0,
  width: 0.7,
  height: 0.8,
  dx: 0,
  dy: 0,
  jumping: false,
  animationFrame: 0,
  animationTimer: 0,
  facing: 1,
  health: 100
};
const playerSprites = {
  idle: new Image(),
  walk: []
};

let inventory = [];

playerSprites.idle.src = 'assets/player/idle.png';
for (let i = 1; i <= 5; i++) {
  const img = new Image();
  img.src = `assets/player/w${i}.png`;
  playerSprites.walk.push(img);
}

const invBarImg = new Image();
invBarImg.src = 'assets/gui/invbar.png';

const selectionImg = new Image();
selectionImg.src = 'assets/gui/selection.png';

let mouse = { x: 0, y: 0 };
let holdLeft = 0;
let holdRight = 0;
let time = 1;
let selectedSlot = 0;
let chats = [];
let chatMessages = [];
let isTyping = false;
let chatInput = '';
let username = prompt('username:');

let socket;
let otherPlayers = {};
let oldPosition = {x: 0, y: 0};

let currentPopup;

const gravity = 0.02;
const jumpStrength = -0.3;
const groundLevel = rows - 1;

const keys = {};
document.addEventListener('keydown', async e => {
  keys[e.key] = true;

  if (isTyping) {
    if (e.key === 'Enter') {
      if (chatInput.trim() !== '') {
        chatMessages.push({username: username, content: chatInput.trim()});
        handleCommand({username: username, content: chatInput.trim()});
        isTyping = false;
        socket.send(JSON.stringify({type: 'chat', message: {username, content: chatInput.trim()}}));
        if (chatMessages.length > 10) chatMessages.shift();
      }
      chatInput = '';
      isTyping = false;
    } else if (e.key === 'Backspace') {
      chatInput = chatInput.slice(0, -1);
    } else if (e.key.length === 1) {
      chatInput += e.key;
    }
    e.preventDefault();
    return;
  }

  if (e.key === 'Enter') {
    isTyping = true;
    chatInput = '';
    return;
  }

  if (e.key === "n") await setTime("night");
  if (e.key === "m") await setTime("day");

  if (!isNaN(parseInt(e.key))) {
    let slot = parseInt(e.key) - 1;
    if (slot >= 0 && slot < inventory.length) selectedSlot = slot;
  }
});
document.addEventListener('keyup', e => keys[e.key] = false);

let lastTime = 0;
const targetFPS = 60;
const frameDuration = 1000 / targetFPS;

const TICK_RATE = 20;
let TICK_INTERVAL = 1000 / TICK_RATE;

const blockTypes = {
  grass: { image: new Image(), src: 'assets/img/grass.jpg' },
  stone: { image: new Image(), src: 'assets/img/stone.png' },
  dirt: { image: new Image(), src: 'assets/img/dirt.jpg' },
  short_grass: { image: new Image(), src: 'assets/img/short_grass.png'},
  leaf: { image: new Image(), src: 'assets/img/leaf.jpg' },
  wood_oak: { image: new Image(), src: 'assets/img/wood_oak.jpg' },
  wood_plank: { image: new Image(), src: 'assets/img/wood_plank.jpg' },
  ladder: { image: new Image(), src: 'assets/img/ladder.jpg' },
  door: { image: new Image(), src: 'assets/img/door.jpg' },
  sand: { image: new Image(), src: 'assets/img/sand.jpg' },
  cactus: { image: new Image(), src: 'assets/img/cactus.png' }
};

for (let type in blockTypes) {
  const img = blockTypes[type].image;
  img.onerror = () => {
    img.src = 'assets/img/error.png';
  };
  img.src = blockTypes[type].src;
}

const errorImage = { image: new Image(), src: 'assets/img/error.png'}
errorImage.image.src = errorImage.src

const Blocksnc = ['short_grass', 'leaf', 'wood_oak', 'ladder', 'door', 'cactus'];

//const blocks = JSON.parse(localStorage.getItem('world') || '[]');
let blocks = [];
//inventory = JSON.parse(localStorage.getItem('inventory') || '[]');
for (let i=0; i<10; i++) {
  blocks.push({ x: i, y: 10, type: 'grass', canCollision: true})
}
let blocksPos = [];
for (block of blocks) {
  blocksPos.push(`${block.x}!${block.y}`)
};

function connectToServer() {
  //socket = new WebSocket('ws://localhost:8080');
  socket = new WebSocket('wss://testserver-iygv.onrender.com');

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.type === 'init') {
      player.id = data.me;
      blocks.push(...data.blocks);

      otherPlayers = [];
      for (let p of data.players) {
        if (p.id !== player.id) {
          otherPlayers[p.id] = p;
        }
      }
    } else if (data.type === 'chat') {
      if (data.message.username === username) return;
      chatMessages.push({ username: data.message.username, content: data.message.content });
    } else if (data.type === 'leave') {
      delete otherPlayers[data.id];
    } else if (data.type === 'blocks') {
      blocks = data.blocks;
      blocksPos = [];
      for (block of blocks) {
        blocksPos.push(`${block.x}!${block.y}`)
      };
    } else if (data.type === 'players') {
      otherPlayers = [];
      for (let p of data.players) {
        if (p.id !== player.id) {
          otherPlayers[p.id] = p;
        }
      }
    }
  };
}

function addBlock(x, y, type, canCollision = true) {
  if (blocksPos.includes(`${x}!${y}`)) return;

  blocks.push({ x, y, type, canCollision });
  blocksPos.push(`${x}!${y}`);

  if (socket?.readyState === 1) {
    socket.send(JSON.stringify({ type: 'block-update', blocks }));
  }
}
function removeBlock(x, y) {
  const index = blocks.findIndex(b => b.x === x && b.y === y);
  if (index !== -1) {
    blocks.splice(index, 1);
    const keyIndex = blocksPos.indexOf(`${x}!${y}`);
    if (keyIndex !== -1) blocksPos.splice(keyIndex, 1);
  }

  if (socket?.readyState === 1) {
    socket.send(JSON.stringify({ type: 'block-update', blocks }));
  }
}

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = e.clientX - rect.left;
  mouse.y = e.clientY - rect.top;
});

function onLeftClick() {
  const wx = Math.floor((mouse.x + player.x * gridSize - canvas.width / 2 + player.width * gridSize / 2) / gridSize);
  const wy = Math.floor((mouse.y + player.y * gridSize - canvas.height / 2 + player.height * gridSize / 2) / gridSize);

  const dx = wx + 0.5 - (player.x + player.width / 2);
  const dy = wy + 0.5 - (player.y + player.height / 2);
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= 4) {
    const blockExists = blocks.some(b => b.x === wx && b.y === wy);
    if (blockExists) return;

    if (!inventory[selectedSlot] || inventory[selectedSlot].amount <= 0) {
      const firstNonEmptyIndex = inventory.findIndex(item => item && item.amount > 0);
      if (firstNonEmptyIndex !== -1) {
        selectedSlot = firstNonEmptyIndex;
      } else {
        return;
      }
    }

    addBlock(wx, wy, inventory[selectedSlot].type, !Blocksnc.includes(inventory[selectedSlot].type));
    inventory[selectedSlot].amount -= 1;

    if (inventory[selectedSlot].amount <= 0) {
      inventory.splice(selectedSlot, 1);
      if (selectedSlot >= inventory.length) {
        selectedSlot = inventory.length - 1;
      }
    }
  }
}

function onRightClick(e) {
  if (e?.preventDefault) e.preventDefault();

  const wx = Math.floor((mouse.x + player.x * gridSize - canvas.width / 2 + player.width * gridSize / 2) / gridSize);
  const wy = Math.floor((mouse.y + player.y * gridSize - canvas.height / 2 + player.height * gridSize / 2) / gridSize);
  const dx = wx + 0.5 - (player.x + player.width / 2);
  const dy = wy + 0.5 - (player.y + player.height / 2);
  const distance = Math.sqrt(dx * dx + dy * dy);

  if (distance <= 4) {
    const blockAtPos = blocks.find(b => b.x === wx && b.y === wy);
    if (!blockAtPos) return;

    let added = false;
    for (let item of inventory) {
      if (item.type === blockAtPos.type && item.amount < 64) {
        item.amount += 1;
        added = true;
        break;
      }
    }
    if (!added && inventory.length < 9) {
      inventory.push({ type: blockAtPos.type, amount: 1 });
    }
    removeBlock(wx, wy);
  }
}

canvas.addEventListener('click', () => onLeftClick());
canvas.addEventListener('contextmenu', (e) => onRightClick(e));

function save() {
  localStorage.setItem('world', JSON.stringify(blocks));
  localStorage.setItem('inventory', JSON.stringify(inventory));
}

function gameLoop(timestamp) {
  if (timestamp - lastTime >= frameDuration) {
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    update(deltaTime);
    draw();
    save();
  }

  requestAnimationFrame(gameLoop);
}

function isColliding(a, b) {
  return (
    a.x < b.x + 1 &&
    a.x + a.width > b.x &&
    a.y < b.y + 1 &&
    a.y + a.height > b.y
  );
}

function handleCommand(message) {
  const args = message.content.trim().split(' ');

  if (message.content.startsWith('/give ')) {
    const type = args[1];
    const amount = Math.min(parseInt(args[2]) || 1, 64);

    let item = inventory.find(i => i.type === type);
    if (item) {
      item.amount = Math.min(item.amount + amount, 64);
    } else if (inventory.length < 9) {
      inventory.push({ type, amount });
    }

  } else if (message.content.startsWith('/tp ')) {
    const x = parseFloat(args[1]);
    const y = parseFloat(args[2]);
    if (!isNaN(x) || !isNaN(y)) {
      if (!isNaN(x)) player.x = x;
      if (!isNaN(y)) player.y = y;
    } else {
      chatMessages.push({ username: "system", content: `Usage: /tp <x> <y>` });
    }
  } else if (message.content === '/clear') {
    inventory = [];
  } else if (message.content === '/coords') {
    chatMessages.push({username: "system", content: `Your position is X: ${Math.ceil(player.x)} Y: ${Math.ceil(player.y)}`});
  } else if (message.content === '/day') {
    setTime('day');
  } else if (message.content === '/night') {
    setTime('night');
  } else if (message.content === '/kill') {
    player.x = 0;
    player.y = 0;
    inventory = [];

  } else if (message.content.startsWith('/setblock ')) {
    const x = parseInt(args[1]);
    const y = parseInt(args[2]);
    const type = args[3];
    if (!isNaN(x) && !isNaN(y) && type in blockTypes) {
      removeBlock(x, y);
      addBlock(x, y, type, !Blocksnc.includes(type));
      chatMessages.push({ username: "system", content: `Block set at (${x}, ${y}) to '${type}'` });
    } else {
      chatMessages.push({ username: "system", content: `Usage: /setblock <x> <y> <type>` });
    }

  } else if (message.content.startsWith('/fill ')) {
    const x1 = parseInt(args[1]);
    const y1 = parseInt(args[2]);
    const x2 = parseInt(args[3]);
    const y2 = parseInt(args[4]);
    const type = args[5];

    if (!isNaN(x1) && !isNaN(y1) && !isNaN(x2) && !isNaN(y2) && type in blockTypes) {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);

      let placed = 0;
      for (let x = minX; x <= maxX; x++) {
        for (let y = minY; y <= maxY; y++) {
          removeBlock(x, y);
          addBlock(x, y, type, !Blocksnc.includes(type));
          placed++;
        }
      }
    } else {
      chatMessages.push({ username: "system", content: `Usage: /fill <x1> <y1> <x2> <y2> <type>` });
    }
  } else if (message.content.startsWith('/nick ')) {
    const nickname = args[1];
    if (!isNaN(nickname)) {
      username = nickname;
    } else {
      chatMessages.push({ username: "system", content: `Usage: /nick <nickname>` });
    }
  } else if (message.content === '/c') {
    chatMessages = [];
  }
}

function getControl() {
  const gamepadkeys = [];
  const gamepads = navigator.getGamepads();

  try {
  for (const gp of gamepads) {
    if (!gp) continue;

    if (gp.axes[0] < -0.5) gamepadkeys.push('a');
    else if (gp.axes[0] > 0.5) gamepadkeys.push('d');
    else if (gp.axes[1] < -0.25 || gp.buttons[0].value) gamepadkeys.push('w');
    else if (gp.axes[1] > 0.25) gamepadkeys.push('s');

    if (gp.buttons[14].value) gamepadkeys.push('gpa');
    if (gp.buttons[15].value) gamepadkeys.push('gpd');
    if (gp.buttons[13].value) gamepadkeys.push('gps');
    if (gp.buttons[12].value) gamepadkeys.push('gpw');

    if (gp.buttons[6].value) onLeftClick();
    if (gp.buttons[7].value) onRightClick(null);

    if (gp.buttons[2].value) {
      let content = prompt("");
      handleCommand({ username: username, content: content });
    }

    if (gp.buttons[4].value) {
      holdLeft += 0.1;
      if (holdLeft >= 1) {
        selectedSlot = Math.max(0, Math.min(inventory.length - 1, selectedSlot - 1));
        holdLeft = 0;
      }
    } else {
      holdLeft = 1;
    }

    if (gp.buttons[5].value) {
      holdRight += 0.1;
      if (holdRight >= 1) {
        selectedSlot = Math.max(0, Math.min(inventory.length - 1, selectedSlot + 1));
        holdRight = 0;
      }
    } else {
      holdRight = 1;
    }
  }
  } catch {}

  const activeKeys = Object.keys(keys).filter(k => keys[k]);
  const combinedKeys = [...gamepadkeys, ...activeKeys];
  const result = {};
  for (const key of combinedKeys) {
    result[key] = true;
  }

  console.log(JSON.stringify(result));
  return result;
}

function update() {
  const control = getControl();
  const speed = 0.15;
  let moving = false;
  if (control['ArrowLeft'] || control['a']) {
    player.x -= speed;
    player.facing = -1;
    moving = true;
  }
  if (control['ArrowRight'] || control['d']) {
    player.x += speed;
    player.facing = 1;
    moving = true;
  }

  if (control['gpa']) {
    mouse.x += -32;
  } else if (control['gpd']) {
    mouse.x += 32;
  } else if (control['gpw']) {
    mouse.y += -32;
  } else if (control['gps']) {
    mouse.y += 32;
  }

  if (moving) {
    player.animationTimer += 1;
    if (player.animationTimer >= 4) {
      player.animationFrame = (player.animationFrame + 1) % playerSprites.walk.length;
      player.animationTimer = 0;
    }
  } else {
    player.animationFrame = 0;
    player.animationTimer = 0;
  }
  if ((control[' '] || control['w']) && !player.jumping) {
    player.dy = jumpStrength;
    player.jumping = true;
  }
  player.dy += gravity;
  player.y += player.dy;
  for (let block of blocks) {
    if (!block.canCollision) continue;
    const blockBox = { x: block.x, y: block.y, width: 1, height: 1 };
    if (isColliding(player, blockBox)) {
      if (player.dy > 0 && player.y + player.height <= block.y + player.dy) {
        player.y = block.y - player.height;
        console.log(player.dy, player.health)
        if (player.dy > 0.1) player.health += Math.round(-player.dy * 3);
        player.dy = 0;
        player.jumping = false;
      } else if (player.dy < 0 && player.y >= block.y + 1 + player.dy) {
        player.y = block.y + 1;
        player.dy = 0;
      } else {
        if (player.x + player.width > block.x && player.x < block.x + 1) {
          if (player.x < block.x) player.x = block.x - player.width;
          else player.x = block.x + 1;
        }
      }
    }
  }

  if (player.health <= 0 || player.y > 100) {
    player.x = 0;
    player.y = 0;
    player.dy = 0;
    player.health = 100;
    inventory = [];
  }

  if (socket?.readyState === 1 && oldPosition != {x: Math.ceil(player.x * 1000), y: Math.ceil(player.y * 1000)}) {
    socket.send(JSON.stringify({ type: 'move', id: player.id, player }));
  }
  oldPosition = {x: Math.ceil(player.x * 1000), y: Math.ceil(player.y * 1000)};
}     

function draw() {
  const control = getControl();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const cameraX = player.x * gridSize - canvas.width / 2 + player.width * gridSize / 2 + (mouse.x - canvas.width / 2) / 5;
  const cameraY = player.y * gridSize - canvas.height / 2 + player.height * gridSize / 2 + (mouse.y - canvas.height / 2) / 5;

  const worldMouseX = mouse.x + cameraX;
  const worldMouseY = mouse.y + cameraY;
  const hoveredBlockX = Math.floor(worldMouseX / gridSize);
  const hoveredBlockY = Math.floor(worldMouseY / gridSize);

  drawGrid(cameraX, cameraY, time);

  blocks.forEach(block => {
    const blockData = blockTypes[block.type];
    if (blockData) {
      ctx.drawImage(
        blockData.image.complete ? blockData.image : errorImage.image,
        block.x * gridSize - cameraX,
        block.y * gridSize - cameraY,
        gridSize,
        gridSize
      );
    }
  });

  const px = player.x * gridSize - cameraX;
  const py = player.y * gridSize - cameraY;
  const pw = player.width * gridSize;
  const ph = player.height * gridSize;

  let sprite = playerSprites.idle;
  if (control['ArrowLeft'] || control['ArrowRight'] || control['a'] || control['d']) {
    sprite = playerSprites.walk[player.animationFrame];
  }

  for (let id in otherPlayers) {
    //const p = otherPlayers[id];
    /*ctx.fillStyle = 'red';
    ctx.fillRect(p.x * gridSize - cameraX, p.y * gridSize - cameraY, gridSize * p.width, gridSize * p.height);*/

    const p = otherPlayers[id];
    const px = p.x * gridSize - cameraX;
    const py = p.y * gridSize - cameraY;
    const pw = p.width * gridSize;
    const ph = p.height * gridSize;

    let sprite = playerSprites.idle;
    if (p.animationFrame !== 0) {
      sprite = playerSprites.walk[p.animationFrame];
    }

    ctx.save();
    if (p.facing === -1) {
      ctx.translate(px + pw, py);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, pw, ph);
    } else {
      try {
        ctx.drawImage(sprite, px, py, pw, ph);
      } catch {}
    }
    ctx.restore();
  }

  if (sprite.complete) {
    ctx.save();
    if (player.facing === -1) {
      ctx.translate(px + pw, py);
      ctx.scale(-1, 1);
      ctx.drawImage(sprite, 0, 0, pw, ph);
    } else {
      ctx.drawImage(sprite, px, py, pw, ph);
    }
    ctx.restore();
  }

  const hoveredBlock = blocks.find(b => b.x === hoveredBlockX && b.y === hoveredBlockY);
  ctx.strokeStyle = hoveredBlock ? 'black' : '#ccc';
  ctx.lineWidth = 2;
  ctx.strokeRect(
    hoveredBlockX * gridSize - cameraX,
    hoveredBlockY * gridSize - cameraY,
    gridSize,
    gridSize
  );
  ctx.lineWidth = 1;

  drawGUI();
}

async function setTime(mode = "day") {
  const target = mode === "night" ? -2 : 1;

  for (let i = 0; i < 30; i++) {
    if (time < -Math.PI) time += Math.PI * 2;
    if (time > Math.PI) time -= Math.PI * 2;

    time += (target - time) * 0.1;

    if (Math.abs(target - time) < 0.001) {
      time = target;
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 16));
  }
}

function drawGrid(cameraX = 0, cameraY = 0, t = 0) {
  const cycle = (Math.sin(t) + 1) / 2;

  const topHue = 210;
  const bottomHue = 210;
  const topLight = 10 + 60 * cycle;
  const bottomLight = 5 + 50 * cycle;
  const topColor = `hsl(${topHue}, 100%, ${topLight}%)`;
  const bottomColor = `hsl(${bottomHue}, 100%, ${bottomLight}%)`;

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, topColor);
  gradient.addColorStop(1, bottomColor);

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const alpha = 0.1 + 0.3 * cycle;
  ctx.strokeStyle = `hsla(210, 100%, 70%, ${alpha})`;

  const startX = -cameraX % gridSize;
  const startY = -cameraY % gridSize;

  for (let x = startX; x <= canvas.width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  for (let y = startY; y <= canvas.height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawGUI() {
  const slotSize = 64;
  const padding = 4;
  const invWidth = slotSize * 9 + padding * 2;
  const invHeight = slotSize + padding * 2;

  const x = canvas.width / 2 - invWidth / 2;
  const y = canvas.height - invHeight - 20;

  if (invBarImg.complete) {
    ctx.drawImage(invBarImg, x, y, invWidth, invHeight);
  }

  if (currentPopup) {
    const { name, description, timer } = currentPopup;
    const fullDuration = 200;
    const fadeDuration = 30;

    let alpha = 1;
    if (timer > fullDuration - fadeDuration) {
      alpha = 1 - (timer - (fullDuration - fadeDuration)) / fadeDuration;
    } else if (timer < fadeDuration) {
      alpha = timer / fadeDuration;
    }

    const offsetX = (1 - alpha) * -100;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(20 + offsetX, 20, 300, 60);
    ctx.fillStyle = 'white';
    ctx.font = '20px Silkscreen';
    ctx.fillText(name, 30 + offsetX, 45);
    ctx.fillText(description, 30 + offsetX, 65);
    ctx.restore();

    currentPopup.timer--;
    if (currentPopup.timer <= 0) {
      currentPopup = null;
    }
  }

  for (let i = 0; i < 9; i++) {
    const slotX = x + padding + i * slotSize;
    const slotY = y + padding - 1;
    const item = inventory[i];
    if (item) {
      const blockData = blockTypes[item.type];
      if (blockData && blockData.image.complete) {
        ctx.drawImage(blockData.image, slotX + 4, slotY + 8, slotSize - 12, slotSize - 12);
      }

      ctx.fillStyle = 'white';
      ctx.font = '20px Silkscreen';
      ctx.textAlign = 'right';
      ctx.fillText(item.amount, slotX + slotSize - 7, slotY + slotSize - 9);
    }
  }

  if (selectionImg.complete && selectedSlot !== -1) {
    const selX = x + padding + selectedSlot * slotSize;
    const selY = y + padding;
    ctx.drawImage(selectionImg, selX, selY, slotSize, slotSize);
  }
  ctx.font = '20px Silkscreen';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'white';

  const chatX = 10;
  let chatY = 34;

  for (let i = 0; i < chatMessages.length; i++) {
    ctx.fillText(`[${chatMessages[i].username}] ${chatMessages[i].content}`, chatX, chatY);
    chatY += 24;
  }

  if (isTyping) {
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(chatX - 5, canvas.height - 40, canvas.width - 10, 30);
    ctx.fillStyle = 'white';
    const cursor = Math.floor(Date.now() / 500) % 2 === 0 ? '|' : '';
    ctx.fillText('> ' + chatInput + cursor, chatX, canvas.height - 20);
  }
}

setInterval(() => {
  const control = getControl();
  const nextType = {};

  blocks.forEach((block, i) => {
    const above = blocks.find(b => b.x === block.x && b.y === block.y - 1);

    if (block.type === "grass") {
      if (above && !Blocksnc.includes(above.type)) {
        nextType[i] = "dirt";
      } else if (Math.random() < 0.0001 && block.x % 3 === 0 && !above) {
        addBlock(block.x, block.y - 1, 'short_grass', false);
      }
    } else if (block.type === "dirt") {
      if (!above) {
        nextType[i] = "grass";
      }
    } else if (block.type === "ladder") {
      const blockBox = { x: block.x, y: block.y, width: 1, height: 1 };
      if (isColliding(blockBox, player)) {
        player.dy = -gravity
        if (control['e'] || control['w']) {
          player.dy += -0.1
        } else if (control['q'] || control['s']) {
          player.dy += 0.1
        }
      }
    }
  });

  for (let i in nextType) {
    blocks[i].type = nextType[i];
  }
}, TICK_INTERVAL);

if (window.location.hash.includes("multiplayer")) {
  connectToServer();
}
requestAnimationFrame(gameLoop);
