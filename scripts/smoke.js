'use strict';
const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const root=path.join(__dirname,'..');

function read(file){return fs.readFileSync(path.join(root,file),'utf8')}
function check(condition,message){if(!condition)throw new Error(message)}
function syntax(file){const r=cp.spawnSync(process.execPath,['--check',path.join(root,file)],{encoding:'utf8'});if(r.status!==0)throw new Error(`Sintaxe inválida em ${file}: ${r.stderr||r.stdout}`)}

const required=[
  'server.js','package.json','public/index.html','public/games.html','public/games.css','public/games.js',
  'public/streaming/index.html','public/streaming/manifest.json','public/streaming/sw.js','data/games.json'
];
for(const f of required)check(fs.existsSync(path.join(root,f)),`Ficheiro em falta: ${f}`);

syntax('server.js');
syntax('public/games.js');

const streamHtml=read('public/streaming/index.html');
const streamScripts=[...streamHtml.matchAll(/<script(?:\s[^>]*)?>(.*?)<\/script>/gs)].map(m=>m[1]);
check(streamScripts.length===1,'O streaming deve ter exatamente um bloco JavaScript inline principal.');
const tmp=path.join(require('os').tmpdir(),`2on-stream-${process.pid}.js`);
fs.writeFileSync(tmp,streamScripts[0]);
try{const r=cp.spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});check(r.status===0,`Sintaxe inválida em public/streaming/index.html: ${r.stderr||r.stdout}`)}finally{try{fs.unlinkSync(tmp)}catch{}}

const html=read('public/games.html');
const ids=[...html.matchAll(/id=["']([^"']+)["']/g)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
check(!dup.length,`IDs duplicados: ${[...new Set(dup)].join(', ')}`);
for(const id of ['shareCode','chat','qrModal','qrCanvas','qrImage','qrShare','qrDownload','champResultActions','voiceBtn'])check(ids.includes(id),`Elemento crítico ausente em games.html: ${id}`);

const js=read('public/games.js');
for(const token of ['championship-fixture-ready','openFixture','toggleVoice','game-voice-ready','game-voice-state','activeFixtureId','showQr','shareAccess','joinRoomCode','championshipId:currentCupId,playerId,text'])check(js.includes(token),`Fluxo ausente: ${token}`);
check(!js.includes("$('shareCode').onclick") || ids.includes('shareCode'),'games.js referencia shareCode sem elemento HTML.');
check(!js.includes("$('chat').classList") || ids.includes('chat'),'games.js referencia chat sem elemento HTML.');

// Auditoria de interatividade: botões estáticos devem ter tipo explícito e handlers/delegação conhecidos.
const gameButtons=[...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(m=>m[1]);
check(gameButtons.every(attrs=>/\btype=[\"']button[\"']/.test(attrs)), 'Existe botão de games.html sem type=button.');
const stream=read('public/streaming/index.html');
const streamButtons=[...stream.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(m=>m[1]);
check(streamButtons.every(attrs=>/\btype=[\"']button[\"']/.test(attrs)), 'Existe botão do streaming sem type=button.');
check(!/function socketSend\(payload\)\s*\{[\s\S]{0,250}?socketSend\(payload\)/.test(stream), 'socketSend entrou em recursão e não envia para o WebSocket.');
check(stream.includes('ws.send(JSON.stringify(payload))'), 'socketSend não usa ws.send().');
check(stream.includes("id='viewer-sync-quick'") || stream.includes('id="viewer-sync-quick"'), 'Botão de sincronização rápida do viewer desapareceu.');
check(stream.includes("currentMode === 'youtube'"), 'Sincronização rápida do viewer não trata YouTube.');
check(stream.includes("action:currentMode==='transfer' ? 'transfer-heartbeat' : 'media-sync'"), 'Sincronização rápida do viewer não trata ficheiro/transferência.');

const server=read('server.js');
for(const token of [
  'ensureFixtureRoom','notifyFixtureReady','sendFixtureReadyToPlayer','currentFixtureForPlayer','playerSockets',
  'championships/:id/start','championships/:id/fixtures/:fixtureId/room','championships/:id/restart',
  'game-voice-ready','game-voice-state','chatAllowed','streamChatAllowed','/vendor/qrcode.min.js',
  'status===\'locked\'','status===\'ready\'','Esta partida está bloqueada','media-sync','allowedActions'
])check(server.includes(token),`Servidor incompleto: ${token}`);
check(server.includes("const APP_VERSION = '2.4.1';"),'Versão do servidor não foi atualizada.');
check(server.includes('const cycle=Math.floor(i / aPlayers.length);'),'Scheduler de confrontos não está na versão rotativa.');

const pkg=JSON.parse(read('package.json'));
check(pkg.version==='2.4.1','package.json não está na versão 2.4.0.');
check(!pkg.scripts?.['test-championship.py']&&!pkg.scripts?.['test-championship-advanced.py'],'Scripts de teste antigos continuam no package.json.');

const data=JSON.parse(read('data/games.json'));
check(Array.isArray(data.stats)&&Array.isArray(data.championships),'Estrutura de dados inválida.');

console.log('STATIC SMOKE 2.4.1 PASSED');
