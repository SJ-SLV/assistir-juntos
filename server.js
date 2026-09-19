const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), geolocation=(), payment=(), usb=()');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { etag:true, maxAge:'1h' }));
app.get('/', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 256 * 1024 });

const rooms = new Map();
const GRACE_MS = 5 * 60 * 1000;
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const MAX_MSG = 1200;
const RATE_WINDOW_MS = 10_000;
const MAX_NORMAL_MESSAGES = 60;

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(data)); } catch (_) {}
  }
}

function cleanName(value, fallback) {
  const s = String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24);
  return s || fallback;
}

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001f]/g, '').slice(0, MAX_MSG);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    const bytes = crypto.randomBytes(5);
    code = Array.from(bytes, b => chars[b % chars.length]).join('');
  } while (rooms.has(code));
  return code;
}

function roomState(room) {
  return {
    code: room.code,
    hostName: room.hostName,
    viewerName: room.viewerName,
    hasViewer: !!room.viewer,
    createdAt: room.createdAt
  };
}

function touch(room) {
  room.lastActivity = Date.now();
}

function notifyPresence(room) {
  const state = roomState(room);
  send(room.host, { type: 'presence', ...state });
  send(room.viewer, { type: 'presence', ...state });
}

function scheduleRemoval(room, role) {
  clearTimeout(room.timers[role]);
  room.timers[role] = setTimeout(() => {
    if (!rooms.has(room.code)) return;
    room[role] = null;
    room[role + 'Name'] = null;
    touch(room);
    notifyPresence(room);
    const other = role === 'host' ? room.viewer : room.host;
    send(other, { type: 'peer-left', reason: 'timeout' });
    if (!room.host && !room.viewer) rooms.delete(room.code);
  }, GRACE_MS);
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: '2-on-streaming', version: '4.0.0', rooms: rooms.size });
});

app.get('/ice-servers', (_req, res) => {
  const username = process.env.METERED_TURN_USERNAME;
  const credential = process.env.METERED_TURN_CREDENTIAL;
  if (!username || !credential) return res.json(FALLBACK_ICE_SERVERS);
  res.json([
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential }
  ]);
});

wss.on('connection', ws => {
  ws.room = null;
  ws.role = null;
  ws.isAlive = true;
  ws.msgWindow = [];

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
    if (!msg || typeof msg.type !== 'string') return;

    const now = Date.now();
    ws.msgWindow = ws.msgWindow.filter(t => now - t < RATE_WINDOW_MS);
    const exempt = new Set(['ice-candidate', 'offer', 'answer', 'app-ping']);
    if (!exempt.has(msg.type)) {
      if (ws.msgWindow.length >= MAX_NORMAL_MESSAGES) return;
      ws.msgWindow.push(now);
    }

    if (msg.type === 'app-ping') return send(ws, { type: 'app-pong', t: msg.t });

    if (msg.type === 'create-room') {
      if (ws.room) return send(ws, { type: 'error', message: 'Já estás numa sala.' });
      const code = generateCode();
      const room = {
        code, host: ws, viewer: null,
        hostName: cleanName(msg.name, 'Anfitrião'), viewerName: null,
        timers: { host: null, viewer: null },
        createdAt: Date.now(), lastActivity: Date.now()
      };
      rooms.set(code, room);
      ws.room = code;
      ws.role = 'host';
      return send(ws, { type: 'room-created', ...roomState(room) });
    }

    if (msg.type === 'join-room') {
      const code = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código ou pede um link novo.' });
      if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        return send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
      }
      clearTimeout(room.timers.viewer);
      room.viewer = ws;
      room.viewerName = cleanName(msg.name, 'Convidado');
      ws.room = code;
      ws.role = 'viewer';
      touch(room);
      send(ws, { type: 'room-joined', ...roomState(room) });
      send(room.host, { type: 'peer-joined', ...roomState(room) });
      notifyPresence(room);
      return;
    }

    if (msg.type === 'rejoin-room') {
      const code = String(msg.code || '').toUpperCase().trim();
      const role = msg.role;
      const room = rooms.get(code);
      if (!room || !['host', 'viewer'].includes(role)) {
        return send(ws, { type: 'error', expired: true, message: 'A sala expirou. Cria uma nova sala.' });
      }
      const old = room[role];
      if (old && old !== ws) {
        try { old.close(); } catch (_) {}
      }
      clearTimeout(room.timers[role]);
      room[role] = ws;
      room[role + 'Name'] = cleanName(msg.name, role === 'host' ? 'Anfitrião' : 'Convidado');
      ws.room = code;
      ws.role = role;
      touch(room);
      send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', rejoined: true, ...roomState(room) });
      send(role === 'host' ? room.viewer : room.host, { type: 'peer-joined', rejoined: true, ...roomState(room) });
      notifyPresence(room);
      return;
    }

    const room = rooms.get(ws.room);
    if (!room) return;
    touch(room);

    if (msg.type === 'leave-room') {
      if (room[ws.role] === ws) {
        clearTimeout(room.timers[ws.role]);
        room[ws.role] = null;
        room[ws.role + 'Name'] = null;
        const other = ws.role === 'host' ? room.viewer : room.host;
        send(other, { type: 'peer-left', reason: 'left' });
        notifyPresence(room);
        if (!room.host && !room.viewer) rooms.delete(room.code);
      }
      ws.room = null;
      ws.role = null;
      return send(ws, { type: 'left-room' });
    }

    if (['offer', 'answer', 'ice-candidate', 'chat', 'reaction', 'control', 'typing'].includes(msg.type)) {
      if (msg.type === 'chat') {
        msg.text = cleanText(msg.text);
        msg.name = cleanName(msg.name, room[ws.role + 'Name'] || 'Pessoa');
        if (!msg.text) return;
      }
      if (msg.type === 'typing') msg.name = cleanName(msg.name, room[ws.role + 'Name'] || 'Pessoa');
      const target = ws.role === 'host' ? room.viewer : room.host;
      return send(target, msg);
    }
  });

  ws.on('close', () => {
    const room = rooms.get(ws.room);
    if (!room || room[ws.role] !== ws) return;
    const other = ws.role === 'host' ? room.viewer : room.host;
    send(other, { type: 'peer-disconnected-temp' });
    scheduleRemoval(room, ws.role);
  });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if ((!room.host && !room.viewer) || now - room.lastActivity > ROOM_TTL_MS) {
      clearTimeout(room.timers.host);
      clearTimeout(room.timers.viewer);
      rooms.delete(code);
    }
  }
  wss.clients.forEach(ws => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30_000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`2 on Streaming 4.0 a correr na porta ${PORT}`));
