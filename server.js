const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// rooms[code] = { host: ws|null, viewer: ws|null }
const rooms = {};

function send(ws, data) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sem chars ambíguos (0/O, 1/I)
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms[code]);
  return code;
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
        rooms[code] = { host: ws, viewer: null };
        ws.room = code;
        ws.role = 'host';
        send(ws, { type: 'room-created', code });
        break;
      }

      case 'join-room': {
        const room = rooms[msg.code];
        if (!room) {
          send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código.' });
          return;
        }
        if (room.viewer) {
          send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
          return;
        }
        room.viewer = ws;
        ws.room = msg.code;
        ws.role = 'viewer';
        send(ws, { type: 'room-joined', code: msg.code });
        send(room.host, { type: 'peer-joined' });
        break;
      }

      case 'offer':
      case 'answer':
      case 'ice-candidate':
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
    if (!room) return;
    const other = ws.role === 'host' ? room.viewer : room.host;
    send(other, { type: 'peer-left' });

    if (ws.role === 'host') {
      delete rooms[ws.room];
    } else if (room) {
      room.viewer = null;
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Servidor a correr na porta ${PORT}`);
});
