'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

const APP_NAME = '2 ON Platform';
const APP_VERSION = '1.4.0';
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
const RECONNECT_GRACE_MS = 5 * 60 * 1000;
const MAX_MESSAGE = 32 * 1024;
const TURN_SECONDS = 20;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'games.json');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=*, microphone=*, geolocation=()');
  next();
});
const PUBLIC = path.join(__dirname, 'public');
app.use(express.static(PUBLIC, { setHeaders: res => res.setHeader('Cache-Control', 'no-store') }));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server, maxPayload: MAX_MESSAGE });

const FALLBACK_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
  { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

const streamRooms = new Map();
const gameRooms = new Map();
const stats = new Map();
let championships = [];
function loadPersistentData(){
  try {
    fs.mkdirSync(DATA_DIR, {recursive:true});
    if (!fs.existsSync(DATA_FILE)) return;
    const data=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    for(const item of (data.stats||[])) if(item.playerId) stats.set(item.playerId,item);
    championships=Array.isArray(data.championships)?data.championships:[];
  } catch(e){ console.error('Falha ao carregar dados:', e.message); }
}
function savePersistentData(){
  try {
    fs.mkdirSync(DATA_DIR,{recursive:true});
    const tmp=DATA_FILE+'.tmp';
    fs.writeFileSync(tmp, JSON.stringify({version:1,stats:[...stats.values()],championships},null,2));
    fs.renameSync(tmp,DATA_FILE);
  } catch(e){ console.error('Falha ao guardar dados:', e.message); }
}
loadPersistentData();

const clean = (value, max = 80) => String(value ?? '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, max);
const makeId = prefix => `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
const send = (ws, payload) => {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify(payload)); return true; } catch (_) { return false; }
  }
  return false;
};
function roomCode() {
  let code;
  do {
    code = crypto.randomBytes(4).toString('hex').toUpperCase().replace(/[01]/g, '').slice(0, 5);
  } while (code.length < 5 || streamRooms.has(code) || gameRooms.has(code));
  return code;
}

app.get('/health', (req, res) => res.json({
  ok: true,
  service: '2-on-platform',
  version: APP_VERSION,
  uptime: Math.round(process.uptime()),
  streamRooms: streamRooms.size,
  gameRooms: gameRooms.size,
  websocketClients: wss.clients.size
}));
app.get('/api/status', (req, res) => res.json({ ok: true, name: APP_NAME, version: APP_VERSION, modules: { games: true, streaming: true } }));
app.get('/ice-servers', (req, res) => {
  const username = process.env.METERED_TURN_USERNAME;
  const credential = process.env.METERED_TURN_CREDENTIAL;
  res.json(username && credential ? [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:global.relay.metered.ca:80', username, credential },
    { urls: 'turn:global.relay.metered.ca:443', username, credential },
    { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username, credential }
  ] : FALLBACK_ICE);
});

// ---------------- Games ----------------
function winner(board) {
  const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
  for (const line of lines) {
    const [a,b,c] = line;
    if (board[a] && board[a] === board[b] && board[b] === board[c]) return { winner: board[a], line };
  }
  return board.every(Boolean) ? { winner: 'draw', line: [] } : null;
}
function publicGame(room) {
  const opponentFor = symbol => symbol === 'X' ? 'O' : 'X';
  return {
    code: room.code, board: room.board, turn: room.turn, winner: room.winner, winningLine: room.winningLine,
    names: { X: room.names.X || null, O: room.names.O || null },
    players: { X: !!room.players.X, O: !!room.players.O }, score: room.score,
    matchNumber: room.matchNumber || 1, turnStartedAt: room.turnStartedAt || null, turnSeconds: TURN_SECONDS,
    disconnected: room.disconnected || null,
    teams: room.teams || {X:null,O:null}
  };
}
function broadcastGame(room, payload) {
  Object.values(room.players).forEach(ws => send(ws, payload));
}
function updateStats(playerId, name, result) {
  if (!playerId) return;
  const current = stats.get(playerId) || { playerId, name: 'Jogador', wins: 0, losses: 0, draws: 0, games: 0, history: [] };
  if (!Array.isArray(current.history)) current.history=[];
  current.name = name || current.name;
  current.games += 1;
  if (result === 'win') current.wins += 1;
  if (result === 'loss') current.losses += 1;
  if (result === 'draw') current.draws += 1;
  current.history.unshift({at:Date.now(),result}); current.history=current.history.slice(0,50);
  stats.set(playerId, current);
  savePersistentData();
}
function createGameRoom(ws, message) {
  if (ws.gameRoom) return send(ws, { type: 'game-error', message: 'Já estás numa partida.' });
  const code = roomCode();
  const name = clean(message.name, 24) || 'Jogador';
  const playerId = clean(message.playerId, 80) || makeId('player');
  const room = {
    code, players: { X: ws, O: null }, names: { X: name, O: null }, ids: { X: playerId, O: null },
    board: Array(9).fill(null), turn: null, winner: null, winningLine: [], turnStartedAt: null, lastActivity: Date.now(), score: { X: 0, O: 0 }, matchNumber: 1, disconnected: null, teams:{X: clean(message.teamName,40) || null, O:null}
  };
  gameRooms.set(code, room);
  ws.gameRoom = code; ws.gameSymbol = 'X'; ws.gamePlayerId = playerId;
  send(ws, { type: 'game-created', roomCode: code, symbol: 'X', state: publicGame(room) });
}
function rejoinGameRoom(ws, message) {
  const code = clean(message.roomCode, 10).toUpperCase();
  const room = gameRooms.get(code);
  const playerId = clean(message.playerId, 80);
  if (!room || !playerId) return send(ws, { type: 'game-error', message: 'A partida já não está disponível.' });
  const symbol = room.ids.X === playerId ? 'X' : room.ids.O === playerId ? 'O' : null;
  if (!symbol) return send(ws, { type: 'game-error', message: 'Jogador não reconhecido nesta partida.' });
  if (ws.gameRoom && ws.gameRoom !== code) leaveGame(ws, false);
  const old = room.players[symbol];
  if (old && old !== ws) { old.gameRoom = null; old.gameSymbol = null; old.gamePlayerId = null; try { old.close(); } catch (_) {} }
  room.players[symbol] = ws;
  room.names[symbol] = clean(message.name, 24) || room.names[symbol] || 'Jogador';
  room.lastActivity = Date.now(); room.disconnected = null;
  ws.gameRoom = code; ws.gameSymbol = symbol; ws.gamePlayerId = playerId;
  send(ws, { type: 'game-rejoined', roomCode: code, symbol, state: publicGame(room) });
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
}
function joinGameRoom(ws, message) {
  const code = clean(message.roomCode, 10).toUpperCase();
  const room = gameRooms.get(code);
  if (!room) return send(ws, { type: 'game-error', message: 'Sala não encontrada.' });
  if (room.players.X === ws || room.players.O === ws) return;
  if (room.disconnected && !room.players[room.disconnected]) return send(ws, { type:'game-error', message:'O teu adversário está a tentar reconectar. Aguarda um momento.' });
  const symbol = !room.players.X ? 'X' : !room.players.O ? 'O' : null;
  if (!symbol) return send(ws, { type: 'game-error', message: 'A sala já está completa.' });
  if (ws.gameRoom) leaveGame(ws, false);
  const name = clean(message.name, 24) || 'Jogador';
  const playerId = clean(message.playerId, 80) || makeId('player');
  room.players[symbol] = ws; room.names[symbol] = name; room.ids[symbol] = playerId; room.teams[symbol] = clean(message.teamName,40) || null;
  room.lastActivity = Date.now(); ws.gameRoom = code; ws.gameSymbol = symbol; ws.gamePlayerId = playerId;
  send(ws, { type: 'game-joined', roomCode: code, symbol, state: publicGame(room) });
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
}
function gameMove(ws, message) {
  const room = gameRooms.get(ws.gameRoom);
  if (!room || room.winner) return;
  if (!room.players.X || !room.players.O) return send(ws, { type: 'game-error', message: 'Aguarda o segundo jogador.' });
  const cell = Number(message.cell);
  if (!Number.isInteger(cell) || cell < 0 || cell > 8 || room.board[cell]) return send(ws, { type: 'game-error', message: 'Essa casa já não está disponível.' });
  if (room.turn && ws.gameSymbol !== room.turn) return send(ws, { type: 'game-error', message: 'Espera pela tua vez.' });
  if (!room.turn) room.turn = ws.gameSymbol;
  room.board[cell] = ws.gameSymbol;
  const result = winner(room.board);
  if (result) {
    room.winner = result.winner; room.winningLine = result.line; room.turnStartedAt = null;
    if (result.winner === 'X' || result.winner === 'O') {
      room.score[result.winner] += 1;
      const loser = result.winner === 'X' ? 'O' : 'X';
      updateStats(room.ids[result.winner], room.names[result.winner], 'win');
      updateStats(room.ids[loser], room.names[loser], 'loss');
    } else {
      updateStats(room.ids.X, room.names.X, 'draw'); updateStats(room.ids.O, room.names.O, 'draw');
    }
  } else {
    room.turn = room.turn === 'X' ? 'O' : 'X';
    room.turnStartedAt = Date.now();
  }
  room.lastActivity = Date.now();
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
}
function resetGame(ws) {
  const room = gameRooms.get(ws.gameRoom);
  if (!room || !room.winner) return send(ws, { type: 'game-error', message: 'A revanche só pode começar depois de uma partida.' });
  if (!room.players.X || !room.players.O) return send(ws, { type: 'game-error', message: 'Aguarda os dois jogadores.' });
  room.board = Array(9).fill(null);
  room.turn = null;
  room.winner = null;
  room.winningLine = [];
  room.turnStartedAt = null;
  room.matchNumber = (room.matchNumber || 1) + 1;
  room.lastActivity = Date.now();
  // Uma única confirmação é suficiente: quem clicar em Revanche inicia imediatamente a nova partida.
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
  broadcastGame(room, { type: 'game-info', message: `${room.names[ws.gameSymbol] || 'Um jogador'} iniciou a revanche.` });
}
function gameRematchResponse(ws) {
  // Mantido apenas para compatibilidade com clientes antigos.
  resetGame(ws);
}
function leaveGame(ws, announce = true) {
  const room = gameRooms.get(ws.gameRoom);
  if (!room) return;
  const symbol = ws.gameSymbol;
  if (room.players[symbol] === ws) { room.players[symbol] = null; room.names[symbol] = null; room.ids[symbol] = null; }
  ws.gameRoom = null; ws.gameSymbol = null; ws.gamePlayerId = null;
  if (announce) broadcastGame(room, { type: 'game-left', symbol });
  if (!room.players.X && !room.players.O) gameRooms.delete(room.code);
}

app.post('/api/games/rooms', (req, res) => {
  // Kept for API compatibility. The actual room is attached to the WebSocket via game-create.
  res.status(410).json({ error: 'Use a ligação em tempo real para criar a sala.' });
});
app.get('/api/games/ranking', (req, res) => {
  const ranking = [...stats.values()].sort((a,b) => b.wins-a.wins || b.games-a.games || a.name.localeCompare(b.name, 'pt'))
    .map(s => ({ name: s.name, wins: s.wins, losses: s.losses, draws: s.draws, games: s.games, rate: s.games ? Math.round(s.wins/s.games*100) : 0 }));
  res.json({ ranking });
});
app.get('/api/games/championships', (req, res) => {
  const publicCups = championships.map(c => ({
    id:c.id, name:c.name, status:c.status, format:c.format, participantCount:c.participantCount,
    teams:c.teams.map(t => ({id:t.id,name:t.name,capacity:t.capacity,players:t.players.length}))
  }));
  res.json({ championships: publicCups });
});
app.get('/api/games/championships/:id', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  const pid=clean(req.query?.playerId,80);
  const isMember=c.teams.some(t=>t.players.some(p=>p.playerId===pid));
  res.json({championship:{...c,teams:c.teams.map(t=>({...t,joinCode:isMember?t.joinCode:undefined}))}});
});
app.post('/api/games/championships', (req, res) => {
  const name = clean(req.body?.name, 80);
  const participantCount = Number(req.body?.participantCount);
  const teamAName = clean(req.body?.teamAName, 50);
  const teamBName = clean(req.body?.teamBName, 50);
  if(!name || !Number.isInteger(participantCount) || participantCount < 2 || participantCount > 32 || participantCount % 2 !== 0) return res.status(400).json({error:'O número de participantes deve ser par, entre 2 e 32.'});
  if(!teamAName || !teamBName) return res.status(400).json({error:'Indica o nome das duas equipas.'});
  const capacity=participantCount/2;
  const ownerName=clean(req.body?.ownerName,24)||'Jogador';
  const ownerPlayerId=clean(req.body?.ownerPlayerId,80)||makeId('player');
  const championship={id:makeId('cup'),name,format:'team-match',status:'open',participantCount,createdAt:Date.now(),teams:[
    {id:makeId('team'),name:teamAName,capacity,joinCode:'A-'+crypto.randomBytes(3).toString('hex').toUpperCase(),players:[{playerId:ownerPlayerId,name:ownerName,joinedAt:Date.now()}]},
    {id:makeId('team'),name:teamBName,capacity,joinCode:'B-'+crypto.randomBytes(3).toString('hex').toUpperCase(),players:[]}
  ]};
  championships.push(championship); savePersistentData();
  res.status(201).json({championship,creatorTeam:'A',message:'Campeonato criado. O criador fica associado à Equipa A.'});
});
app.post('/api/games/championships/join', (req,res)=>{
  const code=clean(req.body?.code,20).toUpperCase(); const name=clean(req.body?.name,24)||'Jogador'; const playerId=clean(req.body?.playerId,80)||makeId('player');
  const c=championships.find(x=>x.status==='open'&&x.teams.some(t=>t.joinCode===code));
  if(!c)return res.status(404).json({error:'Código de equipa inválido ou campeonato encerrado.'});
  const team=c.teams.find(t=>t.joinCode===code);
  if(team.players.some(p=>p.playerId===playerId))return res.json({championship:c,team});
  if(team.players.length>=team.capacity)return res.status(409).json({error:'Esta equipa já atingiu o limite de participantes.'});
  const other=c.teams.find(t=>t.id!==team.id);
  if(other?.players.some(p=>p.playerId===playerId))return res.status(409).json({error:'Já estás associado à outra equipa deste campeonato.'});
  team.players.push({playerId,name,joinedAt:Date.now()}); savePersistentData();
  res.status(201).json({championship:c,team:{id:team.id,name:team.name,capacity:team.capacity,players:team.players},message:`Entraste automaticamente na equipa ${team.name}.`});
});
app.post('/api/games/championships/:id/start', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  if(c.teams.some(t=>t.players.length===0))return res.status(409).json({error:'As duas equipas precisam de pelo menos um jogador.'});
  c.status='ready'; c.startedAt=Date.now(); savePersistentData();
  res.json({championship:c,message:'Confronto pronto para começar.'});
});

// ---------------- Streaming ----------------
function streamState(room) {
  return {
    code: room.code, hostName: room.hostName, viewerName: room.viewerName,
    hasViewer: !!room.viewer, createdAt: room.createdAt,
    controlGranted: !!room.controlGranted, controlRequestPending: !!room.controlRequestPending
  };
}
function streamNotify(room) {
  const state = streamState(room);
  send(room.host, { type: 'presence', ...state });
  send(room.viewer, { type: 'presence', ...state });
}
function streamForward(room, from, message) {
  const target = from.streamRole === 'host' ? room.viewer : room.host;
  if (target) send(target, message);
}
function createStream(ws, message) {
  if (ws.streamRoom) return send(ws, { type: 'error', message: 'Já estás numa sessão.' });
  const code = roomCode();
  const room = { code, host: ws, viewer: null, hostName: clean(message.name, 24) || 'Anfitrião', viewerName: null, controlGranted: false, controlRequestPending: false, createdAt: Date.now(), lastActivity: Date.now(), reconnectTimers: { host: null, viewer: null } };
  streamRooms.set(code, room); ws.streamRoom = code; ws.streamRole = 'host';
  send(ws, { type: 'room-created', ...streamState(room) });
}
function attachStreamRole(room, ws, role, name, rejoined = false) {
  const old = room[role];
  if (room.reconnectTimers[role]) { clearTimeout(room.reconnectTimers[role]); room.reconnectTimers[role] = null; }
  if (old && old !== ws) { old.streamRoom = null; old.streamRole = null; try { old.close(); } catch (_) {} }
  room[role] = ws;
  room[role + 'Name'] = clean(name, 24) || (role === 'host' ? 'Anfitrião' : 'Convidado');
  ws.streamRoom = room.code; ws.streamRole = role;
  room.lastActivity = Date.now();
  if (role === 'viewer' && !rejoined) { room.controlGranted = false; room.controlRequestPending = false; }
  send(ws, { type: role === 'host' ? 'room-created' : 'room-joined', ...streamState(room), rejoined });
  const other = role === 'host' ? room.viewer : room.host;
  if (other) send(other, { type: 'peer-joined', ...streamState(room), rejoined });
  streamNotify(room);
  if (role === 'viewer' && room.controlGranted) send(ws, { type: 'control-granted' });
}
function joinStream(ws, message) {
  const code = clean(message.code, 10).toUpperCase();
  const room = streamRooms.get(code);
  if (!room) return send(ws, { type: 'error', message: 'Sala não encontrada. Confirma o código.', expired: true });
  if (ws.streamRoom) leaveStream(ws, false);
  if (room.viewer && room.viewer.readyState === WebSocket.OPEN && room.viewer !== ws) return send(ws, { type: 'error', message: 'Esta sala já tem duas pessoas.' });
  attachStreamRole(room, ws, 'viewer', message.name, false);
}
function rejoinStream(ws, message) {
  const code = clean(message.code, 10).toUpperCase();
  const role = message.role === 'viewer' ? 'viewer' : 'host';
  const room = streamRooms.get(code);
  if (!room) return send(ws, { type: 'error', message: 'A sessão expirou ou não existe.', expired: true });
  if (ws.streamRoom && ws.streamRoom !== code) leaveStream(ws, false);
  if (role === 'viewer' && !room.host) return send(ws, { type: 'error', message: 'O anfitrião ainda não está ligado.', expired: false });
  attachStreamRole(room, ws, role, message.name, true);
}
function leaveStream(ws, announce = true) {
  const room = streamRooms.get(ws.streamRoom);
  if (!room) return;
  const role = ws.streamRole;
  if (room[role] !== ws) return;
  room[role] = null; room[role + 'Name'] = null; room.lastActivity = Date.now();
  if (room.reconnectTimers[role]) clearTimeout(room.reconnectTimers[role]);
  room.reconnectTimers[role] = null;
  if (role === 'viewer') { room.controlGranted = false; room.controlRequestPending = false; }
  const other = role === 'host' ? room.viewer : room.host;
  if (announce) send(other, { type: 'peer-left', reason: 'left' });
  streamNotify(room);
  ws.streamRoom = null; ws.streamRole = null;
  if (!room.host && !room.viewer) streamRooms.delete(room.code);
}
function handleStream(ws, message) {
  const type = message.type;
  if (type === 'app-ping') return send(ws, { type: 'app-pong', t: message.t });
  if (type === 'create-room') return createStream(ws, message);
  if (type === 'join-room') return joinStream(ws, message);
  if (type === 'rejoin-room') return rejoinStream(ws, message);
  if (type === 'leave-room') return leaveStream(ws, true);

  const room = streamRooms.get(ws.streamRoom);
  if (!room) return;
  room.lastActivity = Date.now();

  if (type === 'control-request') {
    if (ws.streamRole !== 'viewer' || room.controlGranted || room.controlRequestPending) return;
    room.controlRequestPending = true;
    return send(room.host, { type: 'control-request', name: clean(message.name, 24) || room.viewerName });
  }
  if (type === 'control-granted' || type === 'control-denied') {
    if (ws.streamRole !== 'host') return;
    room.controlRequestPending = false;
    room.controlGranted = type === 'control-granted';
    streamNotify(room);
    return send(room.viewer, { type });
  }
  if (type === 'control-revoked') {
    if (ws.streamRole !== 'host') return;
    room.controlGranted = false; room.controlRequestPending = false;
    streamNotify(room); return send(room.viewer, { type: 'control-revoked' });
  }
  if (type === 'control') {
    if (ws.streamRole !== 'host' && !room.controlGranted) return;
    return streamForward(room, ws, message);
  }
  if (['offer','answer','ice-candidate','chat','reaction','typing'].includes(type)) {
    if (type === 'chat') { message.text = clean(message.text, 1200); message.name = clean(message.name, 24) || (ws.streamRole === 'host' ? room.hostName : room.viewerName); }
    if (type === 'reaction' && !['👍','❤️','😂','🔥','😮','👏','🎉','😢'].includes(message.emoji)) return;
    return streamForward(room, ws, message);
  }
}

wss.on('connection', ws => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', raw => {
    if (raw.length > MAX_MESSAGE) return;
    let message;
    try { message = JSON.parse(raw.toString()); } catch (_) { return send(ws, { type: 'error', message: 'Mensagem inválida.' }); }
    if (!message || typeof message.type !== 'string' || message.type.length > 40) return;
    try {
      if (message.type.startsWith('game-')) {
        if (message.type === 'game-create') createGameRoom(ws, message);
        else if (message.type === 'game-join') joinGameRoom(ws, message);
        else if (message.type === 'game-rejoin') rejoinGameRoom(ws, message);
        else if (message.type === 'game-move') gameMove(ws, message);
        else if (message.type === 'game-reset') resetGame(ws);
        else if (message.type === 'game-rematch-response') gameRematchResponse(ws, message);
        else if (message.type === 'game-voice') { const room=gameRooms.get(ws.gameRoom); if(room) Object.values(room.players).forEach(target=>{ if(target && target!==ws) send(target,{type:'game-voice',from:ws.gameSymbol,signal:message.signal}); }); }
        else if (message.type === 'game-chat') {
          const room = gameRooms.get(ws.gameRoom); if (!room) return;
          const text = clean(message.text, 300); if (!text) return;
          const chatId=makeId('msg'); const name=clean(message.name,24)||room.names[ws.gameSymbol]||'Jogador';
          if(message.scope==='team'){ const team=room.teams[ws.gameSymbol]; if(!team) return send(ws,{type:'game-error',message:'Ainda não estás associado a uma equipa.'}); Object.entries(room.players).forEach(([sym,target])=>{if(target&&room.teams[sym]===team) send(target,{type:'game-chat',messageId:chatId,name,text,from:ws.gameSymbol,scope:'team'});}); }
          else broadcastGame(room, { type: 'game-chat', messageId: chatId, name, text, from: ws.gameSymbol, scope:'general' });
        } else if (message.type === 'game-rematch-response') gameRematchResponse(ws,message);
        else if (message.type === 'game-voice') { const room=gameRooms.get(ws.gameRoom); if(room) Object.values(room.players).forEach(target=>{ if(target && target!==ws) send(target,{type:'game-voice',from:ws.gameSymbol,signal:message.signal}); }); }
        else if (message.type === 'game-leave') leaveGame(ws, true);
      } else handleStream(ws, message);
    } catch (error) { console.error('WS handler:', error); send(ws, { type: 'error', message: 'Ocorreu um erro ao processar a ação.' }); }
  });
  ws.on('close', () => {
    const room = gameRooms.get(ws.gameRoom);
    if (room && room.players[ws.gameSymbol] === ws) {
      const symbol=ws.gameSymbol; room.players[symbol]=null; room.disconnected=symbol; room.lastActivity=Date.now();
      broadcastGame(room,{type:'game-disconnected',symbol,state:publicGame(room)});
      setTimeout(()=>{ if(gameRooms.get(room.code)===room && room.disconnected===symbol && !room.players[symbol]) { room.ids[symbol]=null; room.names[symbol]=null; room.disconnected=null; if(!room.players.X&&!room.players.O) gameRooms.delete(room.code); else broadcastGame(room,{type:'game-left',symbol}); } }, RECONNECT_GRACE_MS);
    }

    const stream = streamRooms.get(ws.streamRoom);
    if (!stream || stream[ws.streamRole] !== ws) return;
    const role = ws.streamRole;
    if (stream.reconnectTimers[role]) clearTimeout(stream.reconnectTimers[role]);
    stream.reconnectTimers[role] = setTimeout(() => {
      if (streamRooms.has(stream.code) && stream[role] === ws) {
        stream[role] = null; stream[role + 'Name'] = null;
        if (role === 'viewer') { stream.controlGranted = false; stream.controlRequestPending = false; }
        streamNotify(stream);
        if (!stream.host && !stream.viewer) streamRooms.delete(stream.code);
      }
    }, RECONNECT_GRACE_MS);
    send(role === 'host' ? stream.viewer : stream.host, { type: 'peer-disconnected-temp' });
  });
});

setInterval(() => {
  const now=Date.now();
  for (const room of gameRooms.values()) {
    if(room.turn && !room.winner && room.players.X && room.players.O && room.turnStartedAt && now-room.turnStartedAt >= TURN_SECONDS*1000){
      room.turn = room.turn==='X'?'O':'X'; room.turnStartedAt=now; room.lastActivity=now; broadcastGame(room,{type:'game-timeout',state:publicGame(room)});
    }
  }
},1000);

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [key, room] of streamRooms) if (!room.host && !room.viewer && room.lastActivity < cutoff) streamRooms.delete(key);
  for (const [key, room] of gameRooms) if (!room.players.X && !room.players.O || room.lastActivity < cutoff) gameRooms.delete(key);
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { try { ws.terminate(); } catch (_) {} } else { ws.isAlive = false; try { ws.ping(); } catch (_) {} }
  }
}, 30000);

const listener = server.listen(PORT, HOST, () => console.log(`${APP_NAME} v${APP_VERSION} em http://${HOST}:${PORT}`));
function shutdown(signal) {
  console.log(`${signal}: a encerrar...`);
  for (const ws of wss.clients) { try { ws.close(1001, 'Server shutdown'); } catch (_) {} }
  listener.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
