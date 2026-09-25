'use strict';
const fs=require('fs');
const path=require('path');
const root=path.join(__dirname,'..');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const games=fs.readFileSync(path.join(root,'public','games.js'),'utf8');
const stream=fs.readFileSync(path.join(root,'public','streaming','index.html'),'utf8');
function assert(cond,msg){if(!cond)throw new Error(msg)}
assert(!games.includes('api.qrserver.com'), 'Games ainda usa QR externo');
assert(!stream.includes('api.qrserver.com'), 'Streaming ainda usa QR externo');
assert(server.includes('function publicChatMessage'), 'Sanitização pública de chat ausente');
assert(server.includes('isMe:m.playerId===playerId'), 'Chat público não marca autor relativo ao destinatário');
assert(server.includes("publicChatMessage(msg,target.identityPlayerId)"), 'Broadcast global ainda pode expor playerId');
assert(server.includes("publicChatMessage(msg,targetPid)"), 'Chat de equipa ainda pode expor playerId');
assert(server.includes("messages:globalChat.slice(-200).map(m=>publicChatMessage(m,ws.identityPlayerId))"), 'Histórico global não está sanitizado');
assert(server.includes("if(!guardRate(req,res,'session',10))return;"), 'Rate limit da sessão ausente');
assert(fs.existsSync(path.join(root,'public','games.html')), 'games.html ausente');
assert(fs.existsSync(path.join(root,'public','streaming','index.html')), 'streaming index ausente');
console.log('PRIVACY/QR SMOKE 2.8.4 PASSED');
