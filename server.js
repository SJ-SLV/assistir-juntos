const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const GRACE_MS = 45000;
const rooms = {};

// TURN de reserva (público, pode não ser 100% fiável) — usado apenas se
// as credenciais da Metered não estiverem configuradas.
const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

// Endpoint que devolve os servidores ICE (STUN/TURN) ao cliente.
// Usa a credencial TURN própria da Metered (dashboard.metered.ca) se estiver
// configurada nas variáveis de ambiente do Render; caso contrário usa o fallback.
app.get('/ice-servers', (req, res) => {
  const username = process.env.METERED_TURN_USERNAME;
  const credential = process.env.METERED_TURN_CREDENTIAL;

  if (!username || !credential) {
    return res.json(FALLBACK_ICE_SERVERS);
  }

  res.json([
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential }
  ]);
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
}

function scheduleRemoval(code, role) {
  const room = rooms[code];
  if (!room) return;
  room[role + 'Timer'] = setTimeout(() => {
    const r = rooms[code];
    if (!r) return;
    r[role] = null;
    const other = role === 'host' ? r.viewer : r.host;
    send(other, { type: 'peer-left' });
    if (!r.host && !r.viewer) delete rooms[code];
  }, GRACE_MS);
}

wss.on('connection', (ws) => {
  ws.room = null;
  ws.role = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'create-room': {
        const code = generateCode();
        rooms[code] = { host: ws, viewer: null, hostTimer: null, viewerTimer: null };
        ws.room = code;
        ws.role = 'host';
        send(ws, { type: 'room-created', code });
        break;
      }

      case 'join-room': {
        const code = (msg.code || '').toUpperCase().trim();
        const room = rooms[code];
        if (!room) {
          send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código ou pede um link novo.' });
          return;
        }
        if (room.viewer && room.viewer.readyState === WebSocket.OPEN) {
          send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
          return;
        }
        if (room.viewerTimer) { clearTimeout(room.viewerTimer); room.viewerTimer = null; }
        room.viewer = ws;
        ws.room = code;
        ws.role = 'viewer';
        send(ws, { type: 'room-joined', code });
        send(room.host, { type: 'peer-joined' });
        break;
      }

      case 'rejoin-room': {
        const code = (msg.code || '').toUpperCase().trim();
        const role = msg.role;
        const room = rooms[code];
        if (!room || (role !== 'host' && role !== 'viewer')) {
          send(ws, { type: 'error', message: 'A sala expirou. Cria uma nova sala.', expired: true });
          return;
        }
        // Um refresh de página cria uma ligação nova antes do servidor detetar
        // que a antiga fechou. Em vez de rejeitar, a nova ligação substitui a
        // antiga — fecha-se a antiga explicitamente para não ficar "presa".
        const existing = room[role];
        if (existing && existing !== ws) {
          try { existing.close(); } catch (e) {}
        }
        if (room[role + 'Timer']) { clearTimeout(room[role + 'Timer']); room[role + 'Timer'] = null; }
        room[role] = ws;
        ws.room = code;
        ws.role = role;
        send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', code, rejoined: true });
        const other = role === 'host' ? room.viewer : room.host;
        send(other, { type: 'peer-joined', rejoined: true });
        break;
      }

      // Saída voluntária e imediata (botão "Sair da sala") — ao contrário de uma
      // queda de rede, não há período de tolerância nem tentativa de reconexão.
      case 'leave-room': {
        const room = rooms[ws.room];
        if (room && ws.role && room[ws.role] === ws) {
          if (room[ws.role + 'Timer']) clearTimeout(room[ws.role + 'Timer']);
          const other = ws.role === 'host' ? room.viewer : room.host;
          room[ws.role] = null;
          send(other, { type: 'peer-left' });
          if (!room.host && !room.viewer) delete rooms[ws.room];
        }
        ws.room = null;
        ws.role = null;
        send(ws, { type: 'left-room' });
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate':
      case 'chat':
      case 'control': {
        const room = rooms[ws.room];
        if (!room) return;
        const target = ws.role === 'host' ? room.viewer : room.host;
        send(target, msg);
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = rooms[ws.room];
    if (!room || room[ws.role] !== ws) return;
    const other = ws.role === 'host' ? room.viewer : room.host;
    send(other, { type: 'peer-disconnected-temp' });
    scheduleRemoval(ws.room, ws.role);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
