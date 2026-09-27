'use strict';
const fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..');
const files=['public/games.html','public/games.js','public/streaming/streaming.js','server.js'];
function check(v,m){if(!v)throw new Error(m)}
const html=fs.readFileSync(path.join(root,'public/games.html'),'utf8');
const games=fs.readFileSync(path.join(root,'public/games.js'),'utf8');
const stream=fs.readFileSync(path.join(root,'public/streaming','streaming.js'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
check(!/<(?:button|a|input|div|span)[^>]+\sonclick\s*=/.test(html),'games.html ainda contém onclick inline.');
check(games.includes("$('topbarBrand').onclick"),'Navegação do topo não está ligada por JavaScript.');
check(games.includes('flushQueuedActions()}'),'Fila de ações não é descarregada após rejoin.');
check(stream.includes('let pendingSocketActions = []'),'Fila de ações do Streaming não é múltipla.');
check(!stream.includes('pendingSocketAction = payload'),'Streaming ainda usa fila de ação única.');
check(stream.includes("typeof msg.t === 'number'"),'app-pong não valida timestamp.');
check(server.includes("ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'"),'Gerador de salas ainda usa alfabeto frágil.');
check(server.includes("action==='mode'&&!['file','transfer','youtube'].includes(message.mode)"),'Modo Streaming não está validado.');
check(server.includes("type:'championship-finished'"),'Evento final de campeonato ausente.');
console.log('AUDIT SMOKE 2.9.5 PASSED');
