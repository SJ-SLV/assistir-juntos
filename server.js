'use strict';
const express = require('express');
const http = require('node:http');
const path = require('node:path');
const { randomInt, randomUUID, timingSafeEqual } = require('node:crypto');
const { WebSocketServer, WebSocket } = require('ws');
const QRCode = require('qrcode');

const app = express();
app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(self)',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  next();
});

/* ---------- ICE Servers ---------- */
app.get('/ice-servers', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  const servers = [{ urls: 'stun:stun.l.google.com:19302' }];
  if (process.env.METERED_TURN_USERNAME && process.env.METERED_TURN_CREDENTIAL) {
    const urls = (process.env.TURN_URLS || 'turn:relay.metered.ca:80,turn:relay.metered.ca:443,turn:relay.metered.ca:443?transport=tcp')
      .split(',').map(x => x.trim()).filter(Boolean);
    servers.push({ urls, username: process.env.METERED_TURN_USERNAME, credential: process.env.METERED_TURN_CREDENTIAL });
  }
  res.json(servers);
});

/* ---------- QR Code ---------- */
app.get('/qr', async (req, res) => {
  const code = String(req.query.room || '');
  if (!/^[A-Z0-9]{5}$/.test(code)) return res.sendStatus(400);
  const base = process.env.PUBLIC_URL || `${req.socket.encrypted ? 'https' : 'http'}://${req.headers.host}`;
  try {
    const url = new URL(base);
    url.searchParams.set('room', code);
    url.searchParams.set('role', 'viewer');
    res.type('svg').set('Cache-Control', 'no-store');
    res.send(await QRCode.toString(url.href, { type: 'svg', margin: 2, width: 192 }));
  } catch { res.sendStatus(500); }
});

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server, maxPayload: 64 * 1024 });

/* ---------- Room store ---------- */
const rooms = new Map();
const MAX_ROOMS = 1000;
const GRACE_MS = 120_000;  // 2 min para reconectar antes de apagar a sala
const HARD_TTL = 12 * 3600_000; // 12h máximo

const send = (ws, msg) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };
const error = (ws, msg, expired = false) => send(ws, { type: 'error', message: msg, expired });
const otherRole = r => (r === 'host' ? 'viewer' : 'host');

function timingEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let c;
  do { c = Array.from({ length: 5 }, () => chars[randomInt(chars.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

function eraseRoom(room) {
  for (const role of ['host', 'viewer']) {
    const seat = room[role];
    if (seat) {
      clearTimeout(seat.timer);
      if (seat.ws) {
        seat.ws.room = null;
        send(seat.ws, { type: 'error', message: 'A sala terminou.', expired: true });
      }
    }
  }
  rooms.delete(room.code);
}

function release(ws, temporary) {
  const room = ws.room;
  if (!room) return;
  const seat = room[ws.role];
  ws.room = null;
  if (!seat || seat.ws !== ws) return;
  seat.ws = null;
  send(room[otherRole(ws.role)]?.ws, { type: temporary ? 'peer-disconnected-temp' : 'peer-left' });

  if (!temporary) {
    if (ws.role === 'host') { eraseRoom(room); } else { room.viewer = null; }
    return;
  }
  seat.timer = setTimeout(() => {
    if (seat.ws) return;
    if (ws.role === 'host') eraseRoom(room);
    else { room.viewer = null; send(room.host?.ws, { type: 'peer-left' }); }
  }, GRACE_MS);
}

function occupy(ws, room, role, seat, rejoined) {
  clearTimeout(seat.timer);
  if (seat.ws && seat.ws !== ws) { seat.ws.room = null; seat.ws.close(4000, 'Sessão substituída'); }
  seat.ws = ws;
  ws.room = room;
  ws.role = role;
  room.lastActive = Date.now();

  send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', code: room.code, token: seat.token, rejoined });

  const peer = room[otherRole(role)];
  if (peer?.ws) {
    send(peer.ws, { type: 'peer-joined', rejoined });
    send(ws, { type: 'peer-joined', rejoined });
  }

  // Replay state to late-joining viewer
  if (role === 'viewer') {
    for (const key of ['mode', 'file-kind', 'yt-load']) {
      if (room.state[key]) send(ws, room.state[key]);
    }
  }
}

/* ---------- Message validation ---------- */
const HOST_ACTIONS = new Set(['mode', 'file-kind', 'yt-load', 'yt-heartbeat', 'transfer-heartbeat', 'live-heartbeat']);
const ALL_ACTIONS = new Set([...HOST_ACTIONS, 'media-stream', 'yt-play', 'yt-pause', 'yt-sync', 'transfer-play', 'transfer-pause', 'live-play', 'live-pause']);

function validControl(m) {
  if (!ALL_ACTIONS.has(m.action)) return false;
  if (m.time != null && (!Number.isFinite(m.time) || m.time < 0 || m.time > 1e8)) return false;
  if (m.title != null && (typeof m.title !== 'string' || m.title.length > 500)) return false;
  if (m.action === 'mode' && !['file', 'transfer', 'youtube'].includes(m.mode)) return false;
  if (m.action === 'yt-load' && !/^[\w-]{11}$/.test(m.videoId)) return false;
  if (m.action === 'file-kind' && !['audio', 'video'].includes(m.kind)) return false;
  if (m.action === 'media-stream' && (typeof m.streamId !== 'string' || m.streamId.length > 100 || !['movie', 'mic'].includes(m.kind))) return false;
  return true;
}

/* ---------- WebSocket ---------- */
wss.on('connection', (ws, req) => {
  try {
    const origin = new URL(req.headers.origin);
    const allowed = process.env.PUBLIC_URL
      ? new URL(process.env.PUBLIC_URL).origin
      : `${origin.protocol}//${req.headers.host}`;
    if (origin.origin !== allowed) { ws.close(1008, 'Origem inválida'); return; }
  } catch { ws.close(1008, 'Origem obrigatória'); return; }

  ws.alive = true;
  ws.windowAt = Date.now();
  ws.count = 0;
  ws.creates = 0;

  ws.on('pong', () => { ws.alive = true; });
  ws.on('error', () => {});

  ws.on('message', (data, isBinary) => {
    if (isBinary) return ws.close(1003, 'Apenas JSON');

    // Rate-limit window
    if (Date.now() - ws.windowAt > 10_000) { ws.windowAt = Date.now(); ws.count = 0; ws.creates = 0; }
    if (++ws.count > 150) return ws.close(1008, 'Demasiadas mensagens');

    let m;
    try { m = JSON.parse(data.toString()); } catch { return error(ws, 'Mensagem inválida.'); }
    if (!m || typeof m !== 'object') return;

    /* -- create-room -- */
    if (m.type === 'create-room') {
      if (ws.room) return error(ws, 'Já estás numa sala.');
      if (++ws.creates > 5 || rooms.size >= MAX_ROOMS) return error(ws, 'Limite de salas. Tenta mais tarde.');
      const room = { code: makeCode(), state: {}, host: { token: randomUUID() }, viewer: null, lastActive: Date.now() };
      rooms.set(room.code, room);
      return occupy(ws, room, 'host', room.host, false);
    }

    /* -- join / rejoin -- */
    if (m.type === 'join-room' || m.type === 'rejoin-room') {
      if (ws.room) return error(ws, 'Já estás numa sala.');
      const room = rooms.get(String(m.code || '').toUpperCase());
      if (!room) return error(ws, 'Sala inexistente ou expirada.', true);
      const role = m.type === 'join-room' ? 'viewer' : m.role;
      if (!['viewer', 'host'].includes(role)) return error(ws, 'Papel inválido.');
      let seat = room[role];
      const rejoined = !!seat;
      if (seat && !timingEqual(m.token, seat.token)) {
        return error(ws, role === 'host' ? 'Sessão não restaurada.' : 'A sala já está ocupada.');
      }
      if (!seat) {
        if (role === 'host') return error(ws, 'Sala terminada.', true);
        seat = room[role] = { token: randomUUID() };
      }
      return occupy(ws, room, role, seat, rejoined);
    }

    /* -- leave -- */
    if (m.type === 'leave-room') { release(ws, false); return send(ws, { type: 'left-room' }); }

    /* Must be in a room beyond this point */
    const room = ws.room;
    if (!room) return error(ws, 'Entra numa sala primeiro.');
    room.lastActive = Date.now();
    const peer = room[otherRole(ws.role)]?.ws;

    /* -- chat -- */
    if (m.type === 'chat') {
      if (typeof m.text === 'string' && m.text.trim() && m.text.length <= 500) {
        send(peer, { type: 'chat', text: m.text.trim() });
      }
      return;
    }

    /* -- reaction -- */
    if (m.type === 'reaction') {
      if (typeof m.emoji === 'string' && m.emoji.length <= 5 && m.emoji.trim()) {
        send(peer, { type: 'reaction', emoji: m.emoji.trim() });
        send(ws, { type: 'reaction', emoji: m.emoji.trim() });
      }
      return;
    }

    /* -- control -- */
    if (m.type === 'control') {
      if (!validControl(m)) return;
      if (HOST_ACTIONS.has(m.action) && ws.role !== 'host') return;
      if (['mode', 'file-kind', 'yt-load'].includes(m.action)) {
        room.state[m.action] = m;
        if (m.action === 'mode' && m.mode !== 'youtube') delete room.state['yt-load'];
      }
      send(peer, m);
      return;
    }

    /* -- WebRTC signalling -- */
    if (m.type === 'offer' || m.type === 'answer') {
      const d = m[m.type];
      if (d && ['offer', 'answer'].includes(d.type) && typeof d.sdp === 'string' && d.sdp.length < 60_000) {
        send(peer, { type: m.type, [m.type]: d });
      }
      return;
    }
    if (m.type === 'ice-candidate' && m.candidate && typeof m.candidate.candidate === 'string' && m.candidate.candidate.length < 4096) {
      send(peer, { type: m.type, candidate: m.candidate });
    }
  });

  ws.on('close', () => release(ws, true));
});

/* ---------- Heartbeat + cleanup ---------- */
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false;
    ws.ping();
  }
  for (const room of rooms.values()) {
    if (Date.now() - room.lastActive > HARD_TTL) eraseRoom(room);
  }
}, 30_000);

/* ---------- Graceful shutdown ---------- */
process.on('SIGTERM', () => {
  clearInterval(heartbeat);
  for (const ws of wss.clients) ws.close(1001, 'Servidor a reiniciar');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 5000).unref();
});

const PORT = Number(process.env.PORT) || 3000;
server.listen(PORT, () => console.log(`2 on Streaming — porta ${PORT}`));