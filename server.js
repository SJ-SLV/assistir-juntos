const express=require('express');
const http=require('http');
const path=require('path');
const crypto=require('crypto');
const WebSocket=require('ws');
const app=express();
app.use(express.static(path.join(__dirname,'public')));
const server=http.createServer(app); const wss=new WebSocket.Server({server});
const rooms=new Map(); const GRACE_MS=60000;
const FALLBACK=[
 {urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'},
 {urls:'turn:openrelay.metered.ca:80',username:'openrelayproject',credential:'openrelayproject'},
 {urls:'turn:openrelay.metered.ca:443',username:'openrelayproject',credential:'openrelayproject'},
 {urls:'turn:openrelay.metered.ca:443?transport=tcp',username:'openrelayproject',credential:'openrelayproject'}
];
app.get('/ice-servers',(req,res)=>{const u=process.env.METERED_TURN_USERNAME,c=process.env.METERED_TURN_CREDENTIAL;if(!u||!c)return res.json(FALLBACK);res.json([
 {urls:'stun:stun.relay.metered.ca:80'},{urls:'turn:global.relay.metered.ca:80',username:u,credential:c},{urls:'turn:global.relay.metered.ca:80?transport=tcp',username:u,credential:c},{urls:'turn:global.relay.metered.ca:443',username:u,credential:c},{urls:'turns:global.relay.metered.ca:443?transport=tcp',username:u,credential:c}]);});
function send(ws,data){if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(data));}
function code(){let c;do{c=crypto.randomBytes(4).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,5);}while(c.length<5||rooms.has(c));return c;}
function roomState(r){return {code:r.code,hostName:r.hostName||'Anfitrião',viewerName:r.viewerName||'Convidado',hasViewer:!!r.viewer};}
function removeAfterDisconnect(r,role){clearTimeout(r.timers[role]);r.timers[role]=setTimeout(()=>{if(!rooms.has(r.code))return;r[role]=null;r[role+'Name']=null;const other=role==='host'?r.viewer:r.host;send(other,{type:'peer-left',reason:'timeout'});if(!r.host&&!r.viewer)rooms.delete(r.code);},GRACE_MS);}
wss.on('connection',ws=>{ws.room=null;ws.role=null;ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);
 ws.on('message',raw=>{let m;try{m=JSON.parse(raw.toString())}catch{return} if(!m||typeof m.type!=='string')return;
  if(m.type==='create-room'){const c=code();const r={code:c,host:ws,viewer:null,hostName:String(m.name||'Anfitrião').slice(0,24),viewerName:null,timers:{host:null,viewer:null}};rooms.set(c,r);ws.room=c;ws.role='host';send(ws,{type:'room-created',...roomState(r)});return;}
  if(m.type==='join-room'){const c=String(m.code||'').toUpperCase().trim(),r=rooms.get(c);if(!r)return send(ws,{type:'error',message:'Sala não encontrada.'});if(r.viewer&&r.viewer.readyState===WebSocket.OPEN)return send(ws,{type:'error',message:'Esta sala já tem duas pessoas.'});clearTimeout(r.timers.viewer);r.viewer=ws;r.viewerName=String(m.name||'Convidado').slice(0,24);ws.room=c;ws.role='viewer';send(ws,{type:'room-joined',...roomState(r)});send(r.host,{type:'peer-joined',...roomState(r)});return;}
  if(m.type==='rejoin-room'){const c=String(m.code||'').toUpperCase().trim(),role=m.role,r=rooms.get(c);if(!r||!['host','viewer'].includes(role))return send(ws,{type:'error',expired:true,message:'A sala expirou. Cria uma nova sala.'});const old=r[role];if(old&&old!==ws)try{old.close()}catch{};clearTimeout(r.timers[role]);r[role]=ws;ws.room=c;ws.role=role;if(m.name)r[role+'Name']=String(m.name).slice(0,24);send(ws,{type:role==='host'?'room-created':'room-joined',rejoined:true,...roomState(r)});send(role==='host'?r.viewer:r.host,{type:'peer-joined',rejoined:true,...roomState(r)});return;}
  const r=rooms.get(ws.room); if(!r)return;
  if(m.type==='leave-room'){if(r[ws.role]===ws){clearTimeout(r.timers[ws.role]);r[ws.role]=null;const other=ws.role==='host'?r.viewer:r.host;send(other,{type:'peer-left',reason:'left'});if(!r.host&&!r.viewer)rooms.delete(r.code);}ws.room=null;ws.role=null;return send(ws,{type:'left-room'});}
  if(['offer','answer','ice-candidate','chat','reaction','control','typing'].includes(m.type)){const target=ws.role==='host'?r.viewer:r.host; if(target)send(target,m);return;}
 });
 ws.on('close',()=>{const r=rooms.get(ws.room);if(!r||r[ws.role]!==ws)return;const other=ws.role==='host'?r.viewer:r.host;send(other,{type:'peer-disconnected-temp'});removeAfterDisconnect(r,ws.role);});
});
setInterval(()=>{wss.clients.forEach(ws=>{if(ws.isAlive===false)return ws.terminate();ws.isAlive=false;ws.ping();});},30000);
const PORT=process.env.PORT||3000;server.listen(PORT,()=>console.log('Assistir Juntos 2.0 na porta '+PORT));
