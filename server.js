'use strict';

const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: 64 * 1024 });

const PORT = Number(process.env.PORT) || 3000;
const GRACE_MS = Math.max(15_000, Number(process.env.GRACE_MS) || 45_000);
const ROOM_TTL_MS = Math.max(30 * 60_000, Number(process.env.ROOM_TTL_MS) || 6 * 60 * 60_000);
const MAX_ROOMS = Math.max(100, Number(process.env.MAX_ROOMS) || 5000);
const MAX_CHAT_LENGTH = 500;
const RATE_WINDOW_MS = 10_000;
const MAX_MESSAGES_PER_WINDOW = 80;

const rooms = new Map();

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

app.disable('x-powered-by');
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  next();
});
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', etag: true }));

app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, uptime: Math.round(process.uptime()) }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.get('/ice-servers', (_req, res) => {
  const username = process.env.METERED_TURN_USERNAME;
  const credential = process.env.METERED_TURN_CREDENTIAL;
  res.setHeader('Cache-Control', 'no-store');
  if (!username || !credential) return res.json(FALLBACK_ICE_SERVERS);
  return res.json([
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential }
  ]);
});

function send(ws, data) {
  if (!ws || ws.readyState !== WebSocket.OPEN) return false;
  try { ws.send(JSON.stringify(data)); return true; } catch { return false; }
}

function cleanCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 100; attempt++) {
    const bytes = crypto.randomBytes(5);
    let code = '';
    for (const b of bytes) code += chars[b % chars.length];
    if (!rooms.has(code)) return code;
  }
  throw new Error('Não foi possível gerar um código de sala.');
}

function createRoom() {
  if (rooms.size >= MAX_ROOMS) return null;
  const code = generateCode();
  const room = { code, host: null, viewer: null, hostTimer: null, viewerTimer: null, createdAt: Date.now(), lastActivity: Date.now() };
  rooms.set(code, room);
  return room;
}

function touch(room) { room.lastActivity = Date.now(); }

function cancelTimer(room, role) {
  const key = role + 'Timer';
  if (room[key]) clearTimeout(room[key]);
  room[key] = null;
}

function maybeDeleteRoom(room) {
  if (!room.host && !room.viewer) {
    cancelTimer(room, 'host');
    cancelTimer(room, 'viewer');
    rooms.delete(room.code);
  }
}

function scheduleRemoval(room, role) {
  cancelTimer(room, role);
  room[role + 'Timer'] = setTimeout(() => {
    const current = room[role];
    if (current && current.readyState === WebSocket.OPEN) return;
    if (room[role] === current) room[role] = null;
    const other = role === 'host' ? room.viewer : room.host;
    send(other, { type: 'peer-left' });
    maybeDeleteRoom(room);
  }, GRACE_MS);
}

function detachSocket(ws, voluntary = false) {
  const room = ws.room ? rooms.get(ws.room) : null;
  const role = ws.role;
  if (!room || !role || room[role] !== ws) return;
  cancelTimer(room, role);
  room[role] = null;
  touch(room);
  const other = role === 'host' ? room.viewer : room.host;
  if (voluntary) send(other, { type: 'peer-left' });
  else {
    send(other, { type: 'peer-disconnected-temp' });
    scheduleRemoval(room, role);
  }
  ws.room = null;
  ws.role = null;
  maybeDeleteRoom(room);
}

function validRole(role) { return role === 'host' || role === 'viewer'; }
function getPeer(room, role) { return role === 'host' ? room.viewer : room.host; }

function allowedMessage(ws) {
  const now = Date.now();
  if (!ws.rate || now - ws.rate.startedAt >= RATE_WINDOW_MS) ws.rate = { startedAt: now, count: 0 };
  ws.rate.count++;
  return ws.rate.count <= MAX_MESSAGES_PER_WINDOW;
}

function validateMessage(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') return false;
  return msg.type.length <= 40;
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;
  ws.isAlive = true;
  ws.rate = { startedAt: Date.now(), count: 0 };

  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    if (!allowedMessage(ws)) return send(ws, { type: 'error', message: 'Muitas mensagens. Aguarda alguns segundos e tenta novamente.' });

    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return send(ws, { type: 'error', message: 'Mensagem inválida.' }); }
    if (!validateMessage(msg)) return send(ws, { type: 'error', message: 'Pedido inválido.' });

    switch (msg.type) {
      case 'create-room': {
        if (ws.room) detachSocket(ws, true);
        const room = createRoom();
        if (!room) return send(ws, { type: 'error', message: 'O servidor atingiu o limite de salas. Tenta novamente mais tarde.' });
        room.host = ws;
        ws.room = room.code;
        ws.role = 'host';
        send(ws, { type: 'room-created', code: room.code });
        break;
      }

      case 'join-room': {
        const code = cleanCode(msg.code);
        if (code.length !== 5) return send(ws, { type: 'error', message: 'O código da sala deve ter 5 caracteres.' });
        const room = rooms.get(code);
        if (!room) return send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código ou pede um link novo.' });
        if (!room.host || room.host.readyState !== WebSocket.OPEN) return send(ws, { type: 'error', message: 'O anfitrião ainda não está ligado. Tenta novamente em instantes.' });
        if (room.viewer && room.viewer.readyState === WebSocket.OPEN) return send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
        if (ws.room) detachSocket(ws, true);
        cancelTimer(room, 'viewer');
        room.viewer = ws;
        ws.room = code;
        ws.role = 'viewer';
        touch(room);
        send(ws, { type: 'room-joined', code });
        send(room.host, { type: 'peer-joined' });
        break;
      }

      case 'rejoin-room': {
        const code = cleanCode(msg.code);
        const role = msg.role;
        const room = rooms.get(code);
        if (!room || !validRole(role)) return send(ws, { type: 'error', message: 'A sala expirou. Cria uma nova sala.', expired: true });
        if (role === 'viewer' && !room.host) return send(ws, { type: 'error', message: 'O anfitrião saiu da sala.', expired: true });
        if (ws.room && (ws.room !== code || ws.role !== role)) detachSocket(ws, true);
        const existing = room[role];
        if (existing && existing !== ws) { try { existing.close(1000, 'Sessão substituída'); } catch {} }
        cancelTimer(room, role);
        room[role] = ws;
        ws.room = code;
        ws.role = role;
        touch(room);
        send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', code, rejoined: true });
        const other = getPeer(room, role);
        if (other) send(other, { type: 'peer-joined', rejoined: true });
        break;
      }

      case 'leave-room': {
        if (!ws.room) return send(ws, { type: 'left-room' });
        detachSocket(ws, true);
        send(ws, { type: 'left-room' });
        break;
      }

      case 'chat': {
        if (!ws.room || !ws.role) return;
        const room = rooms.get(ws.room);
        const peer = room && getPeer(room, ws.role);
        const text = typeof msg.text === 'string' ? msg.text.trim().slice(0, MAX_CHAT_LENGTH) : '';
        if (!room || !text) return;
        touch(room);
        send(peer, { type: 'chat', text });
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'control': {
        if (!ws.room || !ws.role) return;
        const room = rooms.get(ws.room);
        const peer = room && getPeer(room, ws.role);
        if (!room || !peer) return;
        touch(room);
        if (msg.type === 'control' && typeof msg.action === 'string' && msg.action.length > 60) return;
        send(peer, msg);
        break;
      }

      default:
        send(ws, { type: 'error', message: 'Tipo de mensagem não suportado.' });
    }
  });

  ws.on('close', () => detachSocket(ws, false));
  ws.on('error', () => {});
});

const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch {} continue; }
    ws.isAlive = false;
    try { ws.ping(); } catch { try { ws.terminate(); } catch {} }
  }
  const now = Date.now();
  for (const room of rooms.values()) {
    if (!room.host && !room.viewer) rooms.delete(room.code);
    else if (now - room.lastActivity > ROOM_TTL_MS && (!room.host || room.host.readyState !== WebSocket.OPEN) && (!room.viewer || room.viewer.readyState !== WebSocket.OPEN)) {
      rooms.delete(room.code);
    }
  }
}, 30_000);
heartbeat.unref();

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.listen(PORT, '0.0.0.0', () => console.log(`Assistir Juntos a correr na porta ${PORT}`));

function shutdown(signal) {
  console.log(`${signal}: a encerrar...`);
  clearInterval(heartbeat);
  for (const ws of wss.clients) { try { ws.close(1001, 'Servidor a encerrar'); } catch {} }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
