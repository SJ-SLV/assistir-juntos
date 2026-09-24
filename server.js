'use strict';
const express = require('express');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const WebSocket = require('ws');

const APP_NAME = '2 ON Platform';
const APP_VERSION = '2.2.1';
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
const championshipSockets = new Map();
const playerSockets = new Map();

function normalizeStatsRecord(raw){
  const playerId=cleanBasic(raw?.playerId,80);
  if(!playerId)return null;
  const wins=Math.max(0,Number(raw?.wins)||0), losses=Math.max(0,Number(raw?.losses)||0), draws=Math.max(0,Number(raw?.draws)||0);
  const games=wins+losses+draws;
  return {playerId,name:cleanBasic(raw?.name,24)||'Jogador',wins,losses,draws,games,history:Array.isArray(raw?.history)?raw.history.slice(0,50):[]};
}
function cleanBasic(value,max=80){return String(value??'').replace(/[<>\u0000-\u001f]/g,'').trim().slice(0,max)}
function normalizeChampionship(raw){
  if(!raw||typeof raw!=='object')return null;
  const teams=Array.isArray(raw.teams)?raw.teams.slice(0,2):[];
  if(teams.length!==2)return null;
  let participantCount=Math.max(2,Math.min(32,Number(raw.participantCount)||2)); if(participantCount%2)participantCount--; if(participantCount<2)participantCount=2;
  const capacity=Math.floor(participantCount/2);
  const normalizedTeams=teams.map((t,i)=>({
    id:cleanBasic(t.id,80)||`team_${crypto.randomBytes(8).toString('hex')}`, name:cleanBasic(t.name,50)||`Equipa ${i===0?'A':'B'}`, capacity,
    joinCode:cleanBasic(t.joinCode,20).toUpperCase()||`${i===0?'A':'B'}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
    players:Array.isArray(t.players)?t.players.slice(0,capacity).map(p=>({playerId:cleanBasic(p?.playerId,80),name:cleanBasic(p?.name,24)||'Jogador',joinedAt:Number(p?.joinedAt)||Date.now()})).filter(p=>p.playerId):[]
  }));
  const fixtures=Array.isArray(raw.fixtures)?raw.fixtures.map((f,i)=>({
    id:cleanBasic(f?.id,80)||`fx_${crypto.randomBytes(8).toString('hex')}`,order:Number(f?.order)||i+1,
    status:['locked','ready','playing','finished'].includes(f?.status)?f.status:(f?.status==='scheduled'?'ready':'locked'),
    homeTeamId:cleanBasic(f?.homeTeamId,80),awayTeamId:cleanBasic(f?.awayTeamId,80),
    homePlayerId:cleanBasic(f?.homePlayerId,80),awayPlayerId:cleanBasic(f?.awayPlayerId,80),
    homePlayerName:cleanBasic(f?.homePlayerName,24)||'Jogador',awayPlayerName:cleanBasic(f?.awayPlayerName,24)||'Jogador',
    homeScore:Number.isFinite(Number(f?.homeScore))?Number(f.homeScore):null,awayScore:Number.isFinite(Number(f?.awayScore))?Number(f.awayScore):null,
    roomCode:cleanBasic(f?.roomCode,10).toUpperCase()||null,finishedAt:f?.finishedAt?Number(f.finishedAt):null,
    finalBoard:Array.isArray(f?.finalBoard)&&f.finalBoard.length===9?f.finalBoard.map(v=>v==='X'||v==='O'?v:null):null,
    result:f?.result==='X'||f?.result==='O'||f?.result==='draw'?f.result:null
  })).filter(f=>f.homePlayerId&&f.awayPlayerId):[];
  // As salas WebSocket são voláteis. Depois de reiniciar o servidor, apenas a primeira
  // partida ainda não concluída pode voltar a ficar disponível; todas as seguintes
  // permanecem bloqueadas até a anterior terminar.
  for(const f of fixtures){if(f.status==='playing'){f.status='ready';f.roomCode=null;}}
  const firstPending=fixtures.find(f=>f.status!=='finished');
  for(const f of fixtures){if(f!==firstPending && f.status!=='finished')f.status='locked';}
  if(firstPending && firstPending.status==='locked')firstPending.status='ready';
  const full=normalizedTeams.every(t=>t.players.length===t.capacity);
  let status=['waiting','ready','in_progress','finished'].includes(raw.status)?raw.status:'waiting';
  if(status==='waiting'&&full)status='ready';
  if(status==='ready'&&!full)status='waiting';
  if(status==='in_progress'&&!fixtures.length)status=full?'ready':'waiting';
  const plannedMatches=Math.max(1,Math.min(15,Number(raw.plannedMatches)||Math.max(1,fixtures.length||1)));
  const chat=Array.isArray(raw.chat)?raw.chat.slice(-200).map(m=>({id:cleanBasic(m?.id,80)||`msg_${crypto.randomBytes(8).toString('hex')}`,name:cleanBasic(m?.name,24)||'Jogador',text:cleanBasic(m?.text,300),playerId:cleanBasic(m?.playerId,80),scope:m?.scope==='team'?'team':'general',at:Number(m?.at)||Date.now()})).filter(m=>m.text):[];
  return {id:cleanBasic(raw.id,80)||`cup_${crypto.randomBytes(8).toString('hex')}`,name:cleanBasic(raw.name,80)||'Campeonato 2 ON',status,participantCount:capacity*2,plannedMatches,createdAt:Number(raw.createdAt)||Date.now(),ownerPlayerId:cleanBasic(raw.ownerPlayerId,80)||normalizedTeams[0].players[0]?.playerId||`player_${crypto.randomBytes(8).toString('hex')}`,ownerName:cleanBasic(raw.ownerName,24)||normalizedTeams[0].players[0]?.name||'Jogador',startedAt:raw.startedAt?Number(raw.startedAt):null,finishedAt:raw.finishedAt?Number(raw.finishedAt):null,winnerTeamId:raw.winnerTeamId||null,fixtures,chat,teams:normalizedTeams};
}
function normalizePersistentData(data){
  stats.clear();
  for(const raw of Array.isArray(data?.stats)?data.stats:[]){const item=normalizeStatsRecord(raw);if(item)stats.set(item.playerId,item)}
  championships=(Array.isArray(data?.championships)?data.championships:[]).map(normalizeChampionship).filter(Boolean);
}
function loadPersistentData(){
  try {
    fs.mkdirSync(DATA_DIR, {recursive:true});
    if (!fs.existsSync(DATA_FILE)) return;
    const data=JSON.parse(fs.readFileSync(DATA_FILE,'utf8'));
    normalizePersistentData(data);
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
    teams: room.teams || {X:null,O:null}, championshipFixture: room.championshipFixture ? {championshipId:room.championshipFixture.championshipId,fixtureId:room.championshipFixture.fixtureId} : null, spectatorCount: room.spectators?.size || 0
  };
}
function broadcastGame(room, payload) {
  Object.values(room.players).forEach(ws => send(ws, payload));
  if(room.spectators) for(const ws of room.spectators) send(ws, payload);
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
    board: Array(9).fill(null), turn: null, winner: null, winningLine: [], turnStartedAt: null, lastActivity: Date.now(), score: { X: 0, O: 0 }, matchNumber: 1, disconnected: null, teams:{X: clean(message.teamName,40) || null, O:null}, spectators:new Set(), championshipFixture:null
  };
  gameRooms.set(code, room);
  ws.gameRoom = code; ws.gameSymbol = 'X'; ws.gamePlayerId = playerId; ws.gameSpectator=false;
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
  if(room.championshipFixture){const c=championships.find(x=>x.id===room.championshipFixture.championshipId);if(c)addChampSocket(c,ws,playerId);}
  room.players[symbol] = ws;
  room.names[symbol] = clean(message.name, 24) || room.names[symbol] || 'Jogador';
  room.lastActivity = Date.now(); room.disconnected = null;
  ws.gameRoom = code; ws.gameSymbol = symbol; ws.gamePlayerId = playerId; ws.gameSpectator=false;
  send(ws, { type: 'game-rejoined', roomCode: code, symbol, state: publicGame(room) });
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
}
function joinGameRoom(ws, message) {
  const code = clean(message.roomCode, 10).toUpperCase();
  const room = gameRooms.get(code);
  if (!room) return send(ws, { type: 'game-error', message: 'Sala não encontrada.' });
  if (room.players.X === ws || room.players.O === ws || room.spectators?.has(ws)) return;
  const name = clean(message.name, 24) || 'Jogador';
  const playerId = clean(message.playerId, 80) || makeId('player');
  if(room.championshipFixture){
    const allowed = room.championshipFixture;
    const c=championships.find(x=>x.id===allowed.championshipId);
    if(!c)return send(ws,{type:'game-error',message:'Campeonato não encontrado.'});
    const fixture=c.fixtures?.find(x=>x.id===allowed.fixtureId);
    const current=firstOpenFixture(c);
    const isReplay=fixture?.status==='finished' && Array.isArray(fixture.finalBoard);
    if(!fixture || (!isReplay && (!current || current.id!==fixture.id || !['ready','playing'].includes(fixture.status)))) return send(ws,{type:'game-error',message:'Esta partida ainda está bloqueada. Aguarda a conclusão da partida anterior.'});
    if(ws.gameRoom) leaveGame(ws,false);
    addChampSocket(c,ws,playerId);
    if(playerId!==allowed.homePlayerId && playerId!==allowed.awayPlayerId){
      room.spectators.add(ws); ws.gameRoom=code; ws.gameSymbol=null; ws.gamePlayerId=playerId; ws.gameSpectator=true; room.lastActivity=Date.now();
      send(ws,{type:'game-joined',roomCode:code,symbol:null,spectator:true,state:publicGame(room),championship:publicChampionship(c,playerId)}); broadcastGame(room,{type:'game-state',state:publicGame(room)}); return;
    }
    const forced = playerId===allowed.homePlayerId ? 'X' : 'O';
    if(room.players[forced]) return send(ws,{type:'game-error',message:'Este jogador já está conectado à partida.'});
    room.players[forced] = ws; room.names[forced] = forced==='X'?allowed.homePlayerName:allowed.awayPlayerName; room.ids[forced]=playerId; room.teams[forced]=clean(message.teamName,40)||room.teams[forced]; ws.gameRoom=code; ws.gameSymbol=forced; ws.gamePlayerId=playerId; ws.gameSpectator=false; room.lastActivity=Date.now();
    if(!isReplay && fixture.status==='ready')fixture.status='playing';
    savePersistentData();
    send(ws,{type:'game-joined',roomCode:code,symbol:forced,state:publicGame(room),championship:publicChampionship(c,playerId)}); broadcastGame(room,{type:'game-state',state:publicGame(room)}); if(room.players.X&&room.players.O)broadcastGame(room,{type:'game-voice-ready',from:forced}); return;
  }
  if (room.disconnected && !room.players[room.disconnected]) return send(ws, { type:'game-error', message:'O teu adversário está a tentar reconectar. Aguarda um momento.' });
  const symbol = !room.players.X ? 'X' : !room.players.O ? 'O' : null;
  if (!symbol) return send(ws, { type: 'game-error', message: 'A sala já está completa.' });
  if (ws.gameRoom) leaveGame(ws, false);
  room.players[symbol] = ws; room.names[symbol] = name; room.ids[symbol] = playerId; room.teams[symbol] = clean(message.teamName,40) || null;
  room.lastActivity = Date.now(); ws.gameRoom = code; ws.gameSymbol = symbol; ws.gamePlayerId = playerId; ws.gameSpectator=false;
  send(ws, { type: 'game-joined', roomCode: code, symbol, state: publicGame(room) });
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
  if(room.players.X&&room.players.O)broadcastGame(room,{type:'game-voice-ready',from:symbol});
}
function gameMove(ws, message) {
  const room = gameRooms.get(ws.gameRoom);
  if (!room || room.winner || ws.gameSpectator) return send(ws,{type:'game-error',message:'Estás a acompanhar como espectador.'});
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
  if (result && room.championshipFixture) {
    const meta = room.championshipFixture;
    const c = championships.find(x => x.id === meta.championshipId);
    const f = c?.fixtures.find(x => x.id === meta.fixtureId);
    if (c && f && f.status !== 'finished') {
      f.homeScore = result.winner === 'X' ? 1 : 0;
      f.awayScore = result.winner === 'O' ? 1 : 0;
      f.result = result.winner;
      f.finalBoard = [...room.board];
      f.status = 'finished';
      f.finishedAt = Date.now();
      if(!maybeFinishChampionship(c)){
        const next=firstOpenFixture(c);
        if(next)notifyFixtureReady(c,next);
      }
      savePersistentData();
      broadcastChampionship(c,{type:'championship-updated',championshipId:c.id,fixtureId:f.id});
    }
  }
  room.lastActivity = Date.now();
  broadcastGame(room, { type: 'game-state', state: publicGame(room) });
}
function resetGame(ws) {
  const room = gameRooms.get(ws.gameRoom);
  if (!room || !room.winner) return send(ws, { type: 'game-error', message: 'A revanche só pode começar depois de uma partida.' });
  if (room.championshipFixture) return send(ws, { type: 'game-error', message: 'Este jogo faz parte do campeonato e já foi encerrado.' });
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
  if (!room) { removeChampSocket(ws); ws.gameRoom=null; ws.gameSymbol=null; ws.gamePlayerId=null; ws.gameSpectator=false; return; }
  const symbol = ws.gameSymbol;
  if(ws.gameSpectator){room.spectators?.delete(ws); ws.gameRoom=null; ws.gameSymbol=null; ws.gamePlayerId=null; ws.gameSpectator=false; removeChampSocket(ws); if(announce)broadcastGame(room,{type:'game-info',message:'Um espectador saiu.'}); return;}
  if (room.players[symbol] === ws) { room.players[symbol] = null; room.names[symbol] = null; if(!room.winner)room.ids[symbol] = null; }
  ws.gameRoom = null; ws.gameSymbol = null; ws.gamePlayerId = null; ws.gameSpectator=false;
  if (announce) broadcastGame(room, { type: 'game-left', symbol });
  if (!room.players.X && !room.players.O && !room.spectators?.size) {
    if (room.championshipFixture) {
      const meta=room.championshipFixture; const c=championships.find(x=>x.id===meta.championshipId); const f=c?.fixtures?.find(x=>x.id===meta.fixtureId);
      if (f && f.status!=='finished') { f.roomCode=null; f.status='ready'; savePersistentData(); gameRooms.delete(room.code); }
      else if(f?.status==='finished'){ room.lastActivity=Date.now(); }
    } else gameRooms.delete(room.code);
  }
  removeChampSocket(ws);
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
app.get('/api/games/profile/:playerId', (req, res) => {
  const playerId = clean(req.params.playerId, 80);
  const profile = stats.get(playerId) || { playerId, name: 'Jogador', wins: 0, losses: 0, draws: 0, games: 0, history: [] };
  res.json({
    name: profile.name || 'Jogador',
    wins: Number(profile.wins) || 0,
    losses: Number(profile.losses) || 0,
    draws: Number(profile.draws) || 0,
    games: Number(profile.games) || 0,
    history: Array.isArray(profile.history) ? profile.history.slice(0, 50) : []
  });
});
app.get('/api/games/championships', (req, res) => {
  const publicCups = championships.map(c => ({
    id:c.id, name:c.name, status:c.status, participantCount:c.participantCount,
    ownerPlayerId:c.ownerPlayerId, ownerName:c.ownerName, startedAt:c.startedAt||null, finishedAt:c.finishedAt||null,
    teams:c.teams.map(t => ({id:t.id,name:t.name,capacity:t.capacity,players:t.players.length}))
  }));
  res.json({ championships: publicCups });
});

function publicChampionship(c, playerId='') {
  const member = c.teams.find(t => t.players.some(p => p.playerId===playerId));
  return {
    id:c.id,name:c.name,status:c.status,participantCount:c.participantCount,plannedMatches:c.plannedMatches,ownerPlayerId:c.ownerPlayerId,ownerName:c.ownerName,
    createdAt:c.createdAt,startedAt:c.startedAt||null,finishedAt:c.finishedAt||null,winnerTeamId:c.winnerTeamId||null,
    teams:c.teams.map(t=>({id:t.id,name:t.name,capacity:t.capacity,players:t.players.map(p=>({playerId:p.playerId,name:p.name})),joinCode:(playerId===c.ownerPlayerId||member?.id===t.id)?t.joinCode:undefined})),
    teamScores:championshipScores(c),
    fixtures:(c.fixtures||[]).map(f=>({id:f.id,order:f.order,status:f.status,homeTeamId:f.homeTeamId,awayTeamId:f.awayTeamId,homePlayerId:f.homePlayerId,awayPlayerId:f.awayPlayerId,homePlayerName:f.homePlayerName,awayPlayerName:f.awayPlayerName,homeScore:f.homeScore,awayScore:f.awayScore,roomCode:f.roomCode||null,result:f.result||null})),
    chat:c.chat||[], memberTeamId:member?.id||null
  };
}

app.get('/api/games/championships/:id', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  res.json({championship:publicChampionship(c,clean(req.query?.playerId,80))});
});

app.post('/api/games/championships', (req, res) => {
  const name = clean(req.body?.name, 80);
  const participantCount = Number(req.body?.participantCount);
  const teamAName = clean(req.body?.teamAName, 50);
  const teamBName = clean(req.body?.teamBName, 50);
  const plannedMatches = req.body?.plannedMatches==null ? 1 : Number(req.body?.plannedMatches);
  if(!name || !Number.isInteger(participantCount) || participantCount < 2 || participantCount > 32 || participantCount % 2 !== 0) return res.status(400).json({error:'O número de participantes deve ser par, entre 2 e 32.'});
  if(!Number.isInteger(plannedMatches) || plannedMatches < 1 || plannedMatches > 15) return res.status(400).json({error:'O número de partidas deve ser um inteiro entre 1 e 15.'});
  if(!teamAName || !teamBName) return res.status(400).json({error:'Indica o nome das duas equipas.'});
  const capacity=participantCount/2;
  const ownerName=clean(req.body?.ownerName,24)||'Jogador';
  const ownerPlayerId=clean(req.body?.ownerPlayerId,80)||makeId('player');
  const championship={id:makeId('cup'),name,status:'waiting',participantCount,plannedMatches,createdAt:Date.now(),ownerPlayerId,ownerName,startedAt:null,finishedAt:null,winnerTeamId:null,fixtures:[],teams:[
    {id:makeId('team'),name:teamAName,capacity,joinCode:'A-'+crypto.randomBytes(3).toString('hex').toUpperCase(),players:[{playerId:ownerPlayerId,name:ownerName,joinedAt:Date.now()}]},
    {id:makeId('team'),name:teamBName,capacity,joinCode:'B-'+crypto.randomBytes(3).toString('hex').toUpperCase(),players:[]}
  ]};
  championships.push(championship); savePersistentData();
  res.status(201).json({championship:publicChampionship(championship,ownerPlayerId),creatorTeam:'A',message:'Campeonato criado. Ficaste associado à Equipa A.'});
});

app.post('/api/games/championships/join', (req,res)=>{
  const code=clean(req.body?.code,20).toUpperCase(); const name=clean(req.body?.name,24)||'Jogador'; const playerId=clean(req.body?.playerId,80)||makeId('player');
  const c=championships.find(x=>x.status==='waiting'&&x.teams.some(t=>t.joinCode===code));
  if(!c)return res.status(404).json({error:'Código de equipa inválido ou campeonato que já começou.'});
  const team=c.teams.find(t=>t.joinCode===code);
  if(team.players.some(p=>p.playerId===playerId))return res.json({championship:publicChampionship(c,playerId),team});
  if(team.players.length>=team.capacity)return res.status(409).json({error:'Esta equipa já atingiu o limite de participantes.'});
  const other=c.teams.find(t=>t.id!==team.id);
  if(other?.players.some(p=>p.playerId===playerId))return res.status(409).json({error:'Já estás associado à outra equipa deste campeonato.'});
  team.players.push({playerId,name,joinedAt:Date.now()});
  if(c.teams.every(t=>t.players.length===t.capacity)) c.status='ready';
  savePersistentData();
  res.status(201).json({championship:publicChampionship(c,playerId),team:{id:team.id,name:team.name,capacity:team.capacity,players:team.players},message:`Entraste automaticamente na equipa ${team.name}.`});
});

function createChampionshipFixtures(c){
  const a=c.teams[0], b=c.teams[1], total=Math.max(1,Math.min(15,c.plannedMatches||1));
  const fixtures=[];
  for(let i=0;i<total;i++){
    const pa=a.players[i % a.players.length], pb=b.players[i % b.players.length];
    fixtures.push({id:makeId('fx'),order:i+1,status:i===0?'ready':'locked',homeTeamId:a.id,awayTeamId:b.id,homePlayerId:pa.playerId,awayPlayerId:pb.playerId,homePlayerName:pa.name,awayPlayerName:pb.name,homeScore:null,awayScore:null,roomCode:null,finishedAt:null,finalBoard:null,result:null});
  }
  return fixtures;
}
function championshipScores(c){
  const scores={}; c.teams.forEach(t=>scores[t.id]=0);
  for(const f of c.fixtures||[]){if(f.status!=='finished')continue;if(f.homeScore>f.awayScore)scores[f.homeTeamId]++;else if(f.awayScore>f.homeScore)scores[f.awayTeamId]++;}
  return scores;
}
function maybeFinishChampionship(c){
  if(!c.fixtures.length || c.fixtures.some(f=>f.status!=='finished')) return false;
  const scores=championshipScores(c), a=c.teams[0].id,b=c.teams[1].id;
  c.status='finished'; c.winnerTeamId=scores[a]===scores[b]?null:(scores[a]>scores[b]?a:b); c.finishedAt=Date.now(); savePersistentData(); return true;
}
function firstOpenFixture(c){
  return (c.fixtures||[]).find(f=>f.status!=='finished')||null;
}
function ensureFixtureRoom(c,f){
  if(!c||!f)return null;
  const current=firstOpenFixture(c);
  const isReplay=f.status==='finished' && Array.isArray(f.finalBoard);
  if(!isReplay){
    if(c.status!=='in_progress')return null;
    if(!current || current.id!==f.id)return null;
    if(!['ready','playing'].includes(f.status))return null;
  }
  if(f.roomCode&&gameRooms.has(f.roomCode))return f.roomCode;
  const home=c.teams.find(t=>t.id===f.homeTeamId), away=c.teams.find(t=>t.id===f.awayTeamId);
  if(!home||!away||!f.homePlayerId||!f.awayPlayerId)return null;
  const rc=roomCode();
  f.roomCode=rc;
  if(!isReplay && f.status==='locked')f.status='ready';
  const result=isReplay?winner(f.finalBoard):null;
  gameRooms.set(rc,{code:rc,players:{X:null,O:null},names:{X:f.homePlayerName,O:f.awayPlayerName},ids:{X:f.homePlayerId,O:f.awayPlayerId},board:isReplay?[...f.finalBoard]:Array(9).fill(null),turn:null,winner:isReplay?(f.result||result?.winner||null):null,winningLine:isReplay?(result?.line||[]):[],turnStartedAt:null,lastActivity:Date.now(),score:{X:0,O:0},matchNumber:f.order,disconnected:null,teams:{X:home.name,O:away.name},spectators:new Set(),championshipFixture:{championshipId:c.id,fixtureId:f.id,homePlayerId:f.homePlayerId,awayPlayerId:f.awayPlayerId,homePlayerName:f.homePlayerName,awayPlayerName:f.awayPlayerName}});
  return rc;
}
function notifyFixtureReady(c,f){
  if(!c||!f||c.status!=='in_progress')return;
  const current=firstOpenFixture(c);
  if(!current || current.id!==f.id)return;
  if(f.status==='locked'||f.status==='scheduled')f.status='ready';
  const rc=ensureFixtureRoom(c,f);
  if(!rc)return;
  const payload={type:'championship-fixture-ready',championshipId:c.id,fixtureId:f.id,roomCode:rc,homePlayerId:f.homePlayerId,awayPlayerId:f.awayPlayerId,order:f.order,status:f.status};
  broadcastChampionship(c,payload);
  sendFixtureReadyToPlayer(c,f,f.homePlayerId);
  sendFixtureReadyToPlayer(c,f,f.awayPlayerId);
}
function isChampionshipMember(c,playerId){return !!c?.teams.some(t=>t.players.some(p=>p.playerId===playerId));}
function addPlayerSocket(ws,playerId){
  const pid=clean(playerId,80); if(!pid)return;
  const old=ws.identityPlayerId;
  if(old && old!==pid){const oldSet=playerSockets.get(old);if(oldSet){oldSet.delete(ws);if(!oldSet.size)playerSockets.delete(old)}}
  let set=playerSockets.get(pid); if(!set){set=new Set();playerSockets.set(pid,set)}
  set.add(ws); ws.identityPlayerId=pid;
}
function removePlayerSocket(ws){
  const pid=ws.identityPlayerId; if(!pid)return;
  const set=playerSockets.get(pid); if(set){set.delete(ws);if(!set.size)playerSockets.delete(pid)}
  ws.identityPlayerId=null;
}
function addChampSocket(c,ws,playerId){if(!c)return;let set=championshipSockets.get(c.id);if(!set){set=new Set();championshipSockets.set(c.id,set)}set.add(ws);ws.championshipId=c.id;addPlayerSocket(ws,playerId||ws.gamePlayerId);}
function removeChampSocket(ws){
  if(ws.championshipId){const set=championshipSockets.get(ws.championshipId);if(set){set.delete(ws);if(!set.size)championshipSockets.delete(ws.championshipId)}ws.championshipId=null;}
}
function broadcastChampionship(c,payload){const set=championshipSockets.get(c.id);if(!set)return;for(const target of set)send(target,payload);}
function sendFixtureReadyToPlayer(c,f,playerId){
  const set=playerSockets.get(playerId); if(!set)return;
  const payload={type:'championship-fixture-ready',championshipId:c.id,fixtureId:f.id,roomCode:f.roomCode,homePlayerId:f.homePlayerId,awayPlayerId:f.awayPlayerId,order:f.order,status:f.status};
  for(const target of set)send(target,payload);
}
function currentFixtureForPlayer(c,playerId){
  const current=firstOpenFixture(c);
  if(!current)return null;
  return current.homePlayerId===playerId||current.awayPlayerId===playerId?current:null;
}
function pushChampChat(c,playerId,name,text){const msg={id:makeId('msg'),playerId,name,text,scope:'general',at:Date.now()};c.chat=(c.chat||[]).slice(-199);c.chat.push(msg);savePersistentData();broadcastChampionship(c,{type:'championship-chat',message:msg});}

app.post('/api/games/championships/:id/start', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  const pid=clean(req.body?.playerId,80);
  if(pid!==c.ownerPlayerId)return res.status(403).json({error:'Apenas o criador do campeonato pode iniciar o campeonato.'});
  if(c.status!=='ready')return res.status(409).json({error:'O campeonato só pode começar quando todas as vagas estiverem preenchidas.'});
  c.fixtures=createChampionshipFixtures(c); c.status='in_progress'; c.startedAt=Date.now(); c.finishedAt=null; c.winnerTeamId=null;
  const first=firstOpenFixture(c); if(first)notifyFixtureReady(c,first);
  savePersistentData();
  res.json({championship:publicChampionship(c,pid),message:'Campeonato iniciado. A primeira partida está pronta para os dois jogadores.'});
});

app.post('/api/games/championships/:id/fixtures/:fixtureId/room', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id); if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  const f=c.fixtures.find(x=>x.id===req.params.fixtureId); if(!f)return res.status(404).json({error:'Jogo do campeonato não encontrado.'});
  const pid=clean(req.body?.playerId,80);
  if(!isChampionshipMember(c,pid))return res.status(403).json({error:'Apenas jogadores deste campeonato podem acompanhar esta partida.'});
  const current=firstOpenFixture(c);
  const isCurrent=!!current&&current.id===f.id&&['ready','playing'].includes(f.status);
  const isReplay=f.status==='finished' && Array.isArray(f.finalBoard);
  if(!isCurrent && !isReplay)return res.status(409).json({error:'Esta partida está bloqueada. Aguarda a conclusão da partida anterior.'});
  const rc=ensureFixtureRoom(c,f);
  if(!rc)return res.status(409).json({error:'O replay desta partida não está disponível após reinício do servidor.'});
  savePersistentData(); res.json({roomCode:rc,fixture:f,spectator:pid!==f.homePlayerId&&pid!==f.awayPlayerId});
});

app.post('/api/games/championships/:id/restart', (req,res)=>{
  const c=championships.find(x=>x.id===req.params.id);
  if(!c)return res.status(404).json({error:'Campeonato não encontrado.'});
  const pid=clean(req.body?.playerId,80);
  if(pid!==c.ownerPlayerId)return res.status(403).json({error:'Apenas o criador pode recomeçar o campeonato.'});
  const full=c.teams.every(t=>t.players.length===t.capacity);
  if(!full)return res.status(409).json({error:'Não é possível recomeçar enquanto as equipas não estiverem completas.'});
  for(const [code,room] of gameRooms){
    if(room.championshipFixture?.championshipId===c.id)gameRooms.delete(code);
  }
  c.fixtures=createChampionshipFixtures(c);
  c.status='in_progress'; c.startedAt=Date.now(); c.finishedAt=null; c.winnerTeamId=null;
  const first=firstOpenFixture(c); if(first)notifyFixtureReady(c,first);
  savePersistentData();
  res.json({championship:publicChampionship(c,pid),message:'Campeonato recomeçado. A primeira partida está pronta.'});
});

app.delete('/api/games/championships/:id', (req,res)=>{
  const i=championships.findIndex(x=>x.id===req.params.id);
  if(i<0)return res.status(404).json({error:'Campeonato não encontrado.'});
  const c=championships[i]; const pid=clean(req.query?.playerId || req.body?.playerId,80);
  if(pid!==c.ownerPlayerId)return res.status(403).json({error:'Apenas o criador pode eliminar este campeonato.'});
  if(c.status==='in_progress')return res.status(409).json({error:'Um campeonato em andamento não pode ser eliminado.'});
  championships.splice(i,1); savePersistentData(); res.json({ok:true,message:'Campeonato eliminado.'});
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
      if (message.type === 'championship-watch') {
        const cid=clean(message.championshipId,80), pid=clean(message.playerId,80);
        const c=championships.find(x=>x.id===cid);
        if(!c||!isChampionshipMember(c,pid)) return send(ws,{type:'game-error',message:'Não tens acesso a este campeonato.'});
        if(ws.gameRoom) leaveGame(ws,false);
        ws.gamePlayerId=pid; addChampSocket(c,ws,pid);
        send(ws,{type:'championship-chat-history',championshipId:c.id,messages:c.chat||[]});
        const current=firstOpenFixture(c);
        if(current && current.roomCode && gameRooms.has(current.roomCode)) send(ws,{type:'championship-fixture-ready',championshipId:c.id,fixtureId:current.id,roomCode:current.roomCode,homePlayerId:current.homePlayerId,awayPlayerId:current.awayPlayerId,order:current.order,status:current.status});
      } else if (message.type === 'championship-chat') {
        const cid=clean(message.championshipId,80), pid=clean(message.playerId,80), text=clean(message.text,300), name=clean(message.name,24)||'Jogador';
        const c=championships.find(x=>x.id===cid);
        if(!c||!isChampionshipMember(c,pid)||!text)return send(ws,{type:'game-error',message:'Não foi possível enviar a mensagem.'});
        addChampSocket(c,ws,pid); pushChampChat(c,pid,name,text);
      } else if (message.type.startsWith('game-')) {
        if (message.type === 'game-create') createGameRoom(ws, message);
        else if (message.type === 'game-join') joinGameRoom(ws, message);
        else if (message.type === 'game-rejoin') rejoinGameRoom(ws, message);
        else if (message.type === 'game-move') gameMove(ws, message);
        else if (message.type === 'game-reset') resetGame(ws);
        else if (message.type === 'game-rematch-response') gameRematchResponse(ws, message);
        else if (message.type === 'game-voice-ready') { const room=gameRooms.get(ws.gameRoom); if(room && !ws.gameSpectator) Object.values(room.players).forEach(target=>{ if(target && target!==ws) send(target,{type:'game-voice-ready',from:ws.gameSymbol}); }); }
        else if (message.type === 'game-voice') { const room=gameRooms.get(ws.gameRoom); if(room && !ws.gameSpectator) Object.values(room.players).forEach(target=>{ if(target && target!==ws) send(target,{type:'game-voice',from:ws.gameSymbol,signal:message.signal}); }); }
        else if (message.type === 'game-chat') {
          const room = gameRooms.get(ws.gameRoom); if (!room) return;
          const text = clean(message.text, 300); if (!text) return;
          const name=clean(message.name,24)||room.names[ws.gameSymbol]||'Jogador';
          if(room.championshipFixture){
            const c=championships.find(x=>x.id===room.championshipFixture.championshipId);
            if(c){ if(message.scope==='team' && !ws.gameSpectator){ const team=room.teams[ws.gameSymbol]; if(!team)return send(ws,{type:'game-error',message:'Equipa indisponível.'}); const msg={id:makeId('msg'),playerId:ws.gamePlayerId,name,text,scope:'team',at:Date.now()}; c.chat=(c.chat||[]).slice(-199); c.chat.push(msg); savePersistentData(); const teamIds=new Set(c.teams.filter(t=>t.name===team).flatMap(t=>t.players.map(p=>p.playerId))); const set=championshipSockets.get(c.id)||new Set(); for(const target of set) if(teamIds.has(target.gamePlayerId)) send(target,{type:'championship-chat',message:msg,scope:'team'}); } else pushChampChat(c,ws.gamePlayerId,name,text); return;
            }
          }
          const chatId=makeId('msg');
          if(message.scope==='team' && !ws.gameSpectator){ const team=room.teams[ws.gameSymbol]; if(!team) return send(ws,{type:'game-error',message:'Ainda não estás associado a uma equipa.'}); Object.entries(room.players).forEach(([sym,target])=>{if(target&&room.teams[sym]===team) send(target,{type:'game-chat',messageId:chatId,name,text,from:ws.gameSymbol,scope:'team'});}); }
          else broadcastGame(room, { type: 'game-chat', messageId: chatId, name, text, from: ws.gameSymbol, scope:'general' });
        } else if (message.type === 'game-leave') leaveGame(ws, true);
      } else handleStream(ws, message);
    } catch (error) { console.error('WS handler:', error); send(ws, { type: 'error', message: 'Ocorreu um erro ao processar a ação.' }); }
  });
  ws.on('close', () => {
    const room = gameRooms.get(ws.gameRoom);
    if (room && ws.gameSpectator) { room.spectators?.delete(ws); room.lastActivity=Date.now(); }
    else if (room && room.players[ws.gameSymbol] === ws) {
      const symbol=ws.gameSymbol; room.players[symbol]=null; room.disconnected=symbol; room.lastActivity=Date.now();
      broadcastGame(room,{type:'game-disconnected',symbol,state:publicGame(room)});
      setTimeout(()=>{ if(gameRooms.get(room.code)===room && room.disconnected===symbol && !room.players[symbol]) { room.disconnected=null; if(room.winner){ broadcastGame(room,{type:'game-left',symbol}); } else { room.ids[symbol]=null; room.names[symbol]=null; if(!room.players.X&&!room.players.O&&!room.spectators?.size){ const f=room.championshipFixture&&championships.find(c=>c.id===room.championshipFixture.championshipId)?.fixtures.find(f=>f.id===room.championshipFixture.fixtureId); if(f&&f.status!=='finished'){f.roomCode=null;f.status='ready';savePersistentData();gameRooms.delete(room.code);} } else broadcastGame(room,{type:'game-left',symbol}); } } }, RECONNECT_GRACE_MS);
    }
    removeChampSocket(ws);
    removePlayerSocket(ws);

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

function bootstrapActiveChampionships(){
  let changed=false;
  for(const c of championships){
    if(c.status!=='in_progress')continue;
    const current=firstOpenFixture(c);
    if(!current)continue;
    if(current.status==='locked'||current.status==='scheduled')current.status='ready';
    if(!current.roomCode || !gameRooms.has(current.roomCode)){
      if(ensureFixtureRoom(c,current))changed=true;
    }
  }
  if(changed)savePersistentData();
}
bootstrapActiveChampionships();

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
  for (const [key, room] of gameRooms) {
    const hasPlayers=!!room.players.X||!!room.players.O;
    const hasSpectators=!!room.spectators?.size;
    if((!hasPlayers&&!hasSpectators) || (!hasPlayers&&room.lastActivity<cutoff)) gameRooms.delete(key);
  }
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
