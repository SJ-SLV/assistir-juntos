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
check(fs.existsSync(path.join(root,'public/streaming/streaming.js')),'Streaming JS externo ausente.');
check(fs.existsSync(path.join(root,'public/streaming/streaming.css')),'Streaming CSS externo ausente.');
syntax('public/streaming/streaming.js');
check(streamHtml.includes('src="streaming.js"'),'Streaming não referencia streaming.js externo.');
check(streamHtml.includes('href="streaming.css"'),'Streaming não referencia streaming.css externo.');
check(!/<script>\s*[\s\S]*?<\/script>/.test(streamHtml),'Streaming ainda contém JavaScript inline principal.');

const html=read('public/games.html');
const ids=[...html.matchAll(/id=["']([^"']+)["']/g)].map(m=>m[1]);
const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);
check(!dup.length,`IDs duplicados: ${[...new Set(dup)].join(', ')}`);
for(const id of ['shareCode','chat','teamChatBadge','globalChatDock','globalChatPanel','globalMessages','globalChatInput','globalChatSend','qrModal','qrCanvas','qrImage','qrShare','qrDownload','champResultActions','voiceBtn'])check(ids.includes(id),`Elemento crítico ausente em games.html: ${id}`);
for(const id of ['cupGameType','connectGame','lobbyEntry','playerName','teamName','lobbyCreateBtn','lobbyJoinBtn','closeLobbyEntry','openChampionshipFromLobby'])check(ids.includes(id),`Elemento do novo lobby ausente em games.html: ${id}`);
check((html.match(/class=\"lobby-game-button\"/g)||[]).length===5,'O lobby deve apresentar exatamente cinco cards de jogos.');
for(const id of ['backHome','rpsChoices','selectedGameLabel'])check(ids.includes(id),`Elemento RPS/painel ausente em games.html: ${id}`);
check(html.includes('data-game=\"tictactoe\"'),'O card do X Vs O não está ligado ao motor atual.');
check(html.includes('data-game=\"rps\"'),'O card RPS não está ligado ao lobby.');
check(html.includes('2 ON STREAMING GAMES'),'A marca do lobby não foi padronizada para Streaming Games.');
check(html.includes('2 ON STREAMING GAMES'),'A marca do lobby não foi padronizada para Streaming Games.');


const js=read('public/games.js');
for(const token of ['championship-fixture-ready','selectedGameType','renderRps','rpsChoices','gameType:selectedGameType','openFixture','toggleVoice','game-voice-ready','game-voice-state','activeFixtureId','showQr','shareAccess','joinRoomCode','championshipId:currentCupId,text','global-chat','global-chat-history','team-chat','team-chat-history','deleteChampionship'])check(js.includes(token),`Fluxo ausente: ${token}`);
check(!js.includes("$('shareCode').onclick") || ids.includes('shareCode'),'games.js referencia shareCode sem elemento HTML.');
check(!js.includes("$('chat').classList") || ids.includes('chat'),'games.js referencia chat sem elemento HTML.');

// Auditoria de interatividade: botões estáticos devem ter tipo explícito e handlers/delegação conhecidos.
const gameButtons=[...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(m=>m[1]);
check(gameButtons.every(attrs=>/\btype=[\"']button[\"']/.test(attrs)), 'Existe botão de games.html sem type=button.');
const stream=read('public/streaming/index.html');
const streamJs=read('public/streaming/streaming.js');
const streamButtons=[...stream.matchAll(/<button\b([^>]*)>(.*?)<\/button>/gs)].map(m=>m[1]);
check(streamButtons.every(attrs=>/\btype=[\"']button[\"']/.test(attrs)), 'Existe botão do streaming sem type=button.');
check(!/function socketSend\(payload\)\s*\{[\s\S]{0,250}?socketSend\(payload\)/.test(streamJs), 'socketSend entrou em recursão e não envia para o WebSocket.');
check(streamJs.includes('ws.send(JSON.stringify(payload))'), 'socketSend não usa ws.send().');
check(stream.includes("id='viewer-sync-quick'") || stream.includes('id="viewer-sync-quick"'), 'Botão de sincronização rápida do viewer desapareceu.');
check(streamJs.includes("currentMode === 'youtube'"), 'Sincronização rápida do viewer não trata YouTube.');
check(streamJs.includes("action:currentMode==='transfer' ? 'transfer-heartbeat' : 'media-sync'"), 'Sincronização rápida do viewer não trata ficheiro/transferência.');

const server=read('server.js');
for(const token of [
  'ensureFixtureRoom','notifyFixtureReady','sendFixtureReadyToPlayer','currentFixtureForPlayer','playerSockets',
  'championships/:id/start','championships/:id/fixtures/:fixtureId/room','championships/:id/restart',
  'game-voice-ready','game-voice-state','chatAllowed','streamChatAllowed','globalChatSockets','globalChat','visibleTeamChat','championships/:id/start','championships/:id/fixtures/:fixtureId/room','championships/:id/restart','championships/:id','/vendor/qrcode.min.js',
  'status===\'locked\'','status===\'ready\'','Esta partida está bloqueada','media-sync','allowedActions'
])check(server.includes(token),`Servidor incompleto: ${token}`);
check(server.includes("const APP_VERSION = '2.8.7';"),'Versão do servidor não está em 2.8.4.');
for(const token of ['gameType','rpsOutcome','rpsMove','rpsChoices','rpsResult','choice','paper','scissors'])check(server.includes(token),`RPS ausente no servidor: ${token}`);
check(server.includes('const pairs=[];'),'Scheduler de confrontos não está a gerar todas as combinações.');
check(server.includes('ws.globalPlayerId=pid; ws.globalName=name; globalChatSockets.add(ws); addPlayerSocket(ws,pid);') || server.includes('ws.globalPlayerId=pid; ws.globalName=name; globalChatSockets.add(ws); addPlayerSocket(ws,pid);'),'Identidade do chat global não está vinculada ao socket.');
check(server.includes("message.type !== 'session-auth'"),'WebSocket não exige autenticação de sessão.');
check(server.includes('session.recentActions.has(aid)'),'Deduplicação de ações não está ativa no servidor.');
check(!server.includes('requestedPid=clean(message.playerId,80)'),'championship-watch ainda aceita identidade do payload.');
check(server.includes('ws.championshipId!==c.id'),'Subscrição de campeonato antiga não é limpa ao trocar de campeonato.');

const pkg=JSON.parse(read('package.json'));
check(pkg.version==='2.8.7','package.json não está na versão 2.8.4.');
check(!pkg.scripts?.['test-championship.py']&&!pkg.scripts?.['test-championship-advanced.py'],'Scripts de teste antigos continuam no package.json.');

const data=JSON.parse(read('data/games.json'));
check(Array.isArray(data.stats)&&Array.isArray(data.championships),'Estrutura de dados inválida.');

check(!server.match(/ownerPlayerId\s*:\s*c\.ownerPlayerId/) || !server.includes('ownerPlayerId:c.ownerPlayerId'),'ownerPlayerId ainda está exposto na resposta pública.');
console.log('STATIC SMOKE 2.8.7 PASSED');
