'use strict';
const fs=require('fs');
const js=fs.readFileSync('public/games.js','utf8');
const html=fs.readFileSync('public/games.html','utf8');
function ok(cond,msg){if(!cond)throw new Error(msg)}
ok(/wsAuthenticated=false/.test(js),'wsAuthenticated não foi declarado.');
ok(/case'session-ready':sessionReady=true;wsAuthenticated=true;/.test(js),'session-ready não autentica o WebSocket no cliente.');
ok(/ws\.onclose=\(\)=>\{wsAuthenticated=false;/.test(js),'onclose não limpa autenticação do WebSocket.');
ok(/id="lobbyCreateBtn"/.test(html),'Botão Criar partida ausente.');
ok(/id="connectGame"/.test(html),'Entrada Criar partida ausente.');
ok(/\.lobby-game-button/.test(js)&&/openLobbyEntry\('create',game\)/.test(js),'Jogar agora não abre o fluxo de criação.');
ok(/type:'game-create'/.test(js),'Cliente não envia game-create.');
console.log('LOBBY SMOKE 2.8.7 PASSED');
