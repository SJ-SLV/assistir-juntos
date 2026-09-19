const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const app = express();
app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// ---------- Configuração ----------
const GRACE_MS = 5 * 60 * 1000;        // tolerância antes de expulsar alguém que desligou
const ROOM_TTL_MS = 6 * 60 * 60 * 1000; // salas inativas há mais de 6h são limpas
const MAX_MSG_LEN = 1200;               // tamanho máximo de uma mensagem de chat
const RATE_LIMIT_WINDOW_MS = 10000;     // 10s
const RATE_LIMIT_MAX_MSGS = 60;         // até 60 mensagens por janela (exceto sinalização)

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

// rooms: code -> { code, host, viewer, hostName, viewerName, timers:{host,viewer}, createdAt, lastActivity }
const rooms = new Map();

// ---------- Utilitários ----------
function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
}

function cleanName(value, fallback) {
  return String(value || fallback).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 24) || fallback;
}

function cleanText(value) {
  return String(value || '').replace(/[<>\u0000-\u001f]/g, '').slice(0, MAX_MSG_LEN);
}

function generateCode() {
  let code;
  do {
    code = crypto.randomBytes(8).toString('hex').toUpperCase().replace(/[01]/g, '').slice(0, 5);
  } while (code.length < 5 || rooms.has(code));
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

function forwardToPeer(room, ws, msg) {
  const target = ws.role === 'host' ? room.viewer : room.host;
  if (!target) return;
  if (msg.type === 'chat') msg.text = cleanText(msg.text);
  send(target, msg);
}

// ---------- Rotas HTTP ----------
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'assistir-juntos', rooms: rooms.size });
});

app.get('/ice-servers', (req, res) => {
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

// ---------- WebSocket ----------
wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;
  ws.isAlive = true;
  ws.msgWindow = [];

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }
    if (!msg || typeof msg.type !== 'string') return;

    // Limite de taxa: protege o servidor de flood (sinalização fica isenta)
    const now = Date.now();
    ws.msgWindow = ws.msgWindow.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    const exemptFromLimit = ['ice-candidate', 'offer', 'answer', 'app-ping'].includes(msg.type);
    if (!exemptFromLimit) {
      if (ws.msgWindow.length >= RATE_LIMIT_MAX_MSGS) return;
      ws.msgWindow.push(now);
    }

    if (msg.type === 'app-ping') {
      send(ws, { type: 'app-pong', t: msg.t });
      return;
    }

    if (msg.type === 'create-room') {
      const roomCode = generateCode();
      const room = {
        code: roomCode,
        host: ws,
        viewer: null,
        hostName: cleanName(msg.name, 'Anfitrião'),
        viewerName: null,
        timers: { host: null, viewer: null },
        createdAt: Date.now(),
        lastActivity: Date.now()
      };
      rooms.set(roomCode, room);
      ws.room = roomCode;
      ws.role = 'host';
      send(ws, { type: 'room-created', ...roomState(room) });
      return;
    }

    if (msg.type === 'join-room') {
      const roomCode = String(msg.code || '').toUpperCase().trim();
      const room = rooms.get(roomCode);
      if (!room) return send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código.' });
      if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
        return send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
      }
      clearTimeout(room.timers.viewer);
      room.viewer = ws;
      room.viewerName = cleanName(msg.name, 'Convidado');
      ws.room = roomCode;
      ws.role = 'viewer';
      touch(room);
      send(ws, { type: 'room-joined', ...roomState(room) });
      send(room.host, { type: 'peer-joined', ...roomState(room) });
      notifyPresence(room);
      return;
    }

    if (msg.type === 'rejoin-room') {
      const roomCode = String(msg.code || '').toUpperCase().trim();
      const role = msg.role;
      const room = rooms.get(roomCode);
      if (!room || (role !== 'host' && role !== 'viewer')) {
        return send(ws, { type: 'error', expired: true, message: 'A sala expirou. Cria uma nova sala.' });
      }
      const existing = room[role];
      if (existing && existing !== ws) {
        try { existing.close(); } catch (e) {}
      }
      clearTimeout(room.timers[role]);
      room[role] = ws;
      ws.room = roomCode;
      ws.role = role;
      if (msg.name) room[role + 'Name'] = cleanName(msg.name, role === 'host' ? 'Anfitrião' : 'Convidado');
      touch(room);
      send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', rejoined: true, ...roomState(room) });
      const other = role === 'host' ? room.viewer : room.host;
      send(other, { type: 'peer-joined', rejoined: true, ...roomState(room) });
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
      send(ws, { type: 'left-room' });
      return;
    }

    if (['offer', 'answer', 'ice-candidate', 'chat', 'reaction', 'control', 'typing'].includes(msg.type)) {
      if (msg.type === 'chat') msg.name = cleanName(msg.name, 'Pessoa');
      forwardToPeer(room, ws, msg);
      return;
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

// Limpeza periódica de salas abandonadas + heartbeat das ligações WebSocket
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    if ((!room.host && !room.viewer) || now - room.lastActivity > ROOM_TTL_MS) {
      rooms.delete(code);
    }
  }
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Assistir Juntos a correr na porta ${PORT}`);
});
