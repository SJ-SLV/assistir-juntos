'use strict';
const assert = require('assert');
const http = require('http');
const WebSocket = require('ws');
const {spawn} = require('child_process');

const PORT = 3182;
const BASE = `http://127.0.0.1:${PORT}`;
const server = spawn(process.execPath, ['server.js'], {cwd: require('path').join(__dirname, '..'), env:{...process.env, PORT:String(PORT), HOST:'127.0.0.1'}});
let clients=[];
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function session(name){const r=await fetch(BASE+'/api/session',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name})});const d=await r.json();assert.ok(r.ok&&d.token&&d.playerId);return d;}
async function fetchJson(path, options={}, token){const headers=new Headers(options.headers||{});if(token)headers.set('Authorization','Bearer '+token);const r=await fetch(BASE+path,{...options,headers});const d=await r.json();return {r,d};}
function wsClient(token){return new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${PORT}`);const q=[];ws.on('message',raw=>q.push(JSON.parse(raw.toString())));ws.on('open',()=>{ws.send(JSON.stringify({type:'session-auth',token}));});const timer=setTimeout(()=>reject(new Error('WS auth timeout')),5000);const onMsg=raw=>{const m=JSON.parse(raw.toString());if(m.type==='session-ready'){clearTimeout(timer);ws.off('message',onMsg);resolve({ws,q});}};ws.on('message',onMsg);ws.on('error',reject);clients.push(ws);});}
async function waitFor(c,pred,timeout=5000){const end=Date.now()+timeout;while(Date.now()<end){const i=c.q.findIndex(pred);if(i>=0)return c.q.splice(i,1)[0];await sleep(25);}throw new Error('Timeout aguardando evento');}
function send(c,msg){c.ws.send(JSON.stringify(msg));}
async function main(){
  for(let i=0;i<50;i++){try{const r=await fetch(BASE+'/health');if(r.ok)break}catch{}await sleep(50);}
  const players=[['a1','Ana'],['a2','Alda'],['b1','Beto'],['b2','Bia']];
  const sessions={}; for(const [pid,name] of players)sessions[pid]=await session(name);
  let x=await fetchJson('/api/games/championships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name:'E2E 2 ON',participantCount:4,plannedMatches:2,teamAName:'A',teamBName:'B',ownerName:'Ana'})},sessions.a1.token);
  assert.equal(x.r.status,201);const cid=x.d.championship.id;const codeA=x.d.championship.teams[0].joinCode,codeB=x.d.championship.teams[1].joinCode;
  for(const [pid,name] of players.slice(1)){const code=pid.startsWith('a')?codeA:codeB;const j=await fetchJson('/api/games/championships/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,name})},sessions[pid].token);assert.equal(j.r.status,201);}
  let c=await fetchJson(`/api/games/championships/${cid}` ,{},sessions.a1.token);assert.equal(c.r.status,200);assert.equal(c.d.championship.status,'ready');
  const wsA1=await wsClient(sessions.a1.token), wsB1=await wsClient(sessions.b1.token), wsA2=await wsClient(sessions.a2.token);
  send(wsA1,{type:'championship-watch',championshipId:cid});send(wsB1,{type:'championship-watch',championshipId:cid});send(wsA2,{type:'championship-watch',championshipId:cid});
  await waitFor(wsA1,m=>m.type==='championship-chat-history');await waitFor(wsB1,m=>m.type==='championship-chat-history');await waitFor(wsA2,m=>m.type==='championship-chat-history');
  const st=await fetchJson(`/api/games/championships/${cid}/start`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})},sessions.a1.token);assert.equal(st.r.status,200);
  const first=st.d.championship.fixtures[0], second=st.d.championship.fixtures[1];assert.equal(first.status,'ready');assert.equal(second.status,'locked');
  const blocked=await fetchJson(`/api/games/championships/${cid}/fixtures/${second.id}/room`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})},sessions.a2.token);assert.equal(blocked.r.status,409);
  const readyA=await waitFor(wsA1,m=>m.type==='championship-fixture-ready'&&m.fixtureId===first.id);const readyB=await waitFor(wsB1,m=>m.type==='championship-fixture-ready'&&m.fixtureId===first.id);assert.equal(readyA.roomCode,readyB.roomCode);
  const room=readyA.roomCode;
  send(wsA1,{type:'game-join',roomCode:room,name:'Ana',teamName:'A'});send(wsB1,{type:'game-join',roomCode:room,name:'Beto',teamName:'B'});send(wsA2,{type:'game-join',roomCode:room,name:'Alda',teamName:'A'});
  const ja=await waitFor(wsA1,m=>m.type==='game-joined');const jb=await waitFor(wsB1,m=>m.type==='game-joined');const js=await waitFor(wsA2,m=>m.type==='game-joined'&&m.spectator===true);assert.equal(ja.symbol,'X');assert.equal(jb.symbol,'O');assert.equal(js.spectator,true);
  send(wsA2,{type:'game-move',cell:0});const err=await waitFor(wsA2,m=>m.type==='game-error');assert.equal(err.message,'Estás a acompanhar como espectador.');
  send(wsA1,{type:'game-move',cell:0});send(wsB1,{type:'game-move',cell:3});send(wsA1,{type:'game-move',cell:1});send(wsB1,{type:'game-move',cell:4});send(wsA1,{type:'game-move',cell:2});
  await waitFor(wsA1,m=>m.type==='game-state'&&m.state?.winner==='X');
  const after=await fetchJson(`/api/games/championships/${cid}` ,{},sessions.a1.token);const fs=after.d.championship.fixtures;assert.equal(fs[0].status,'finished');assert.equal(fs[1].status,'ready');
  const next=await waitFor(wsA2,m=>m.type==='championship-fixture-ready'&&m.fixtureId===fs[1].id);assert.ok(next.roomCode);
  const replay=await fetchJson(`/api/games/championships/${cid}/fixtures/${fs[0].id}/room`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({})},sessions.a2.token);assert.equal(replay.r.status,200);assert.equal(replay.d.spectator,true);
  console.log('E2E CHAMPIONSHIP CORE PASSED');
}
main().catch(e=>{console.error('E2E FAILED:',e.stack||e);process.exitCode=1}).finally(async()=>{for(const c of clients)try{c.ws.close()}catch{};server.kill('SIGTERM');await sleep(200);});
