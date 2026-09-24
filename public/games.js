(() => {
'use strict';
const $=id=>document.getElementById(id), pages=[...document.querySelectorAll('.page')];
let ws=null,reconnectTimer=null,reconnectDelay=800,roomCode=null,mySymbol=null,myName='',myTeam='',playerId='',state=null,intentionalClose=false,chatScope='general',clockTimer=null,rematchAsked=false,pendingAction=null;
let pc=null,localStream=null,voiceOn=false,isSpectator=false,currentChampChat=[],pendingIce=[],voiceNegotiating=false,activeFixtureId=null,resultActionToken=0;
const seen=new Set();
playerId=localStorage.getItem('2on_player_id')||crypto.randomUUID();localStorage.setItem('2on_player_id',playerId);
myName=localStorage.getItem('2on_player_name')||'';myTeam=localStorage.getItem('2on_player_team')||'';
$('playerName').value=myName;$('teamName').value=myTeam;
function page(id){pages.forEach(p=>p.classList.toggle('active',p.id===id));document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.page===id));if(id!=='championships'){clearInterval(cupPollTimer);cupPollTimer=null}if(id==='championships')loadCups();if(id==='ranking'){loadRanking();loadProfile();}}
function toast(m){$('toast').textContent=m;$('toast').style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').style.display='none',2400)}
function openConfirm(title,text,yes){$('confirmTitle').textContent=title;$('confirmText').textContent=text;$('confirm').classList.add('open');$('confirm').setAttribute('aria-hidden','false');$('confirmYes').onclick=()=>{closeConfirm();yes()};$('confirmNo').onclick=closeConfirm}
function closeConfirm(){$('confirm').classList.remove('open');$('confirm').setAttribute('aria-hidden','true')}
function socketOpen(){return ws&&ws.readyState===WebSocket.OPEN}
function send(payload){if(!socketOpen()){toast('A ligação está a ser recuperada…');connect();return false}try{ws.send(JSON.stringify(payload));return true}catch{toast('Não foi possível concluir a ação.');return false}}
function connect(){if(ws&&(ws.readyState===1||ws.readyState===0))return;clearTimeout(reconnectTimer);const proto=location.protocol==='https:'?'wss:':'ws:';ws=new WebSocket(proto+'//'+location.host);ws.onopen=()=>{reconnectDelay=800;$('connectionState').textContent='Ligado';$('connectionState').className='status-dot online';if(currentCupId)send({type:'championship-watch',championshipId:currentCupId,playerId});if(roomCode&&mySymbol){send({type:'game-rejoin',roomCode,name:myName,playerId});return}if(pendingAction){const action=pendingAction;pendingAction=null;send(action)}};ws.onmessage=e=>{let m;try{m=JSON.parse(e.data)}catch{return}handle(m)};ws.onclose=()=>{if(intentionalClose)return;$('connectionState').textContent='Reconectando…';$('connectionState').className='status-dot offline';clearTimeout(reconnectTimer);reconnectTimer=setTimeout(connect,reconnectDelay);reconnectDelay=Math.min(reconnectDelay*2,8000)};ws.onerror=()=>{}}
function handle(m){switch(m.type){case'game-created':case'game-joined':case'game-rejoined':actionBusy=false;roomCode=m.roomCode;mySymbol=m.symbol;isSpectator=!!m.spectator;state=m.state;activeFixtureId=state?.championshipFixture?.fixtureId||null;saveSession();render();page('play');if(voiceOn&&!isSpectator&&state?.players?.X&&state?.players?.O){if(mySymbol==='X')makeVoiceOffer().catch(()=>{});else send({type:'game-voice-ready'});}break;case'game-state':state=m.state;render();break;case'game-timeout':state=m.state;render();toast('⏱️ Tempo esgotado. A vez passou para o adversário.');break;case'game-disconnected':state=m.state;render();toast('📡 O adversário perdeu a ligação. Aguardando reconexão…');break;case'game-left':if(state){state.players[m.symbol]=false;state.names[m.symbol]=null;state.disconnected=null;render()}toast('👋 O adversário saiu da partida.');break;case'game-info':toast(m.message||'');break;case'game-error':actionBusy=false;toast(m.message||'Não foi possível concluir.');break;case'game-chat':if(m.messageId&&seen.has(m.messageId))break;if(m.messageId){seen.add(m.messageId);if(seen.size>300)seen.delete(seen.values().next().value)}if(!m.scope||m.scope===chatScope)addMsg(m.name,m.text,m.from===mySymbol,m.scope);break;case'championship-chat-history':currentChampChat=m.messages||[];if($('cupMessages')){$('cupMessages').innerHTML='';currentChampChat.forEach(x=>addChampMsg(x.name,x.text,x.playerId===playerId,x.scope||'general'))}break;case'championship-chat':if(m.message?.id&&seen.has(m.message.id))break;if(m.message?.id)seen.add(m.message.id);currentChampChat.push(m.message);if(currentChampChat.length>200)currentChampChat.shift();addChampMsg(m.message.name,m.message.text,m.message.playerId===playerId,m.scope);break;case'championship-updated':if(currentCupId===m.championshipId)openChampionship(m.championshipId);break;case'championship-fixture-ready':{
  const isPlayer=m.homePlayerId===playerId||m.awayPlayerId===playerId;
  if(!isPlayer)break;
  currentCupId=m.championshipId;
  if(state?.championshipFixture?.championshipId===m.championshipId && m.fixtureId!==activeFixtureId){
    toast(`🎮 Jogo ${m.order} pronto. Escolhe como continuar.`);
    if(state.winner)updateChampionshipResultActions(m.championshipId,state.championshipFixture.fixtureId);
    break;
  }
  if(activeFixtureId===m.fixtureId && roomCode===String(m.roomCode).toUpperCase())break;
  if(roomCode&&socketOpen())send({type:'game-leave'});
  stopVoice();
  roomCode=String(m.roomCode).toUpperCase(); mySymbol=null; state=null; isSpectator=false; activeFixtureId=m.fixtureId;
  const action={type:'game-join',roomCode,name:myName,teamName:myTeam,playerId};
  pendingAction=action;
  page('play');
  if(socketOpen()){pendingAction=null;send(action)}else connect();
  toast(`🎮 Jogo ${m.order} pronto. A entrar…`);
  break;
}
case'championship-next':if(m.homePlayerId===playerId||m.awayPlayerId===playerId){toast('🎮 Próxima partida pronta! A entrar…');openFixture(m.championshipId,m.fixtureId)}else{toast('👀 A próxima partida começou. Podes assistir.')}break;case'game-rematch-declined':rematchAsked=false;toast('A revanche foi recusada.');break;case'game-voice-ready':if(mySymbol==='X'&&voiceOn&&state?.players?.O){makeVoiceOffer().catch(()=>{})}break;
case'game-voice':handleVoiceSignal(m);break}}
function saveSession(){if(roomCode&&mySymbol)localStorage.setItem('2on_game_session',JSON.stringify({roomCode,mySymbol,myName,myTeam,playerId}))}
function clearSession(){localStorage.removeItem('2on_game_session')}
function startWithData(){myName=$('playerName').value.trim().slice(0,24)||'Jogador';myTeam=$('teamName').value.trim().slice(0,40);localStorage.setItem('2on_player_name',myName);localStorage.setItem('2on_player_team',myTeam);return true}
let actionBusy=false;
function create(){if(actionBusy)return;actionBusy=true;if(!startWithData()){actionBusy=false;return}activeFixtureId=null;const action={type:'game-create',name:myName,teamName:myTeam,playerId};if(!socketOpen()){pendingAction=action;toast('A ligar ao servidor…');connect();return}send(action)}
function join(){const code=prompt('Código da sala:')?.trim().toUpperCase();if(!code)return;if(!/^[A-Z2-9]{5,10}$/.test(code))return toast('Código inválido.');startWithData();activeFixtureId=null;roomCode=code;mySymbol=null;const action={type:'game-join',roomCode:code,name:myName,teamName:myTeam,playerId};if(!socketOpen()){pendingAction=action;toast('A ligar ao servidor…');connect();return}send(action)}
function leave(){openConfirm('Sair da partida?','A partida será encerrada para ti e o adversário será informado.',()=>{send({type:'game-leave'});roomCode=null;mySymbol=null;state=null;activeFixtureId=null;clearSession();stopVoice();page('home')})}
function initials(name){return(name||'?').trim().split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase().slice(0,2)}
function render(){if(!state)return;const op=mySymbol==='X'?'O':'X',connected=!!state.players?.[op],opName=state.names?.[op]||'A aguardar';$('backChamp').hidden=!state.championshipFixture; $('roomTitle').textContent=roomCode||'SALA';$('meSymbol').textContent=isSpectator?'👀':(mySymbol||'—');$('opSymbol').textContent=op;$('meName').textContent=isSpectator?'👀 Espectador':(myName||'Tu');$('meTeam').textContent=isSpectator?'A acompanhar':(state.teams?.[mySymbol]||'Sem equipa');$('opponentName').textContent=connected?opName:'A aguardar';$('opTeam').textContent=connected?(state.teams?.[op]||'Sem equipa'):'A aguardar';$('meAvatar').textContent=isSpectator?'👀':initials(myName);$('opAvatar').textContent=initials(connected?opName:'O');$('matchNumber').textContent=state.matchNumber||1;$('scoreValue').textContent=isSpectator?'AO VIVO':`${state.score?.[mySymbol]||0} — ${state.score?.[op]||0}`;const winner=state.winner;let status=isSpectator?(winner?'🏁 Jogo terminado':connected?'👀 A acompanhar esta partida':'👀 A acompanhar'):winner?(winner==='draw'?'🤝 Empate':`🏆 Vitória de ${state.names?.[winner]||'Jogador'}`):state.disconnected?`Reconectando ${state.names?.[state.disconnected]||'adversário'}…`:!connected?'⏳ A aguardar o adversário':state.turn===null?'👆 Quem tocar primeiro começa':state.turn===mySymbol?'🎯 É a tua vez':`⏳ Vez de ${opName}`;$('gameStatus').textContent=status;$('resultBanner').textContent=winner?(winner==='draw'?'🤝 Partida empatada':`🏁 Partida terminada · ${state.names?.[winner]||winner}`):isSpectator?'👀 Estás a assistir — não podes jogar':'';const active=!isSpectator&&connected&&!winner&&(!state.turn||state.turn===mySymbol)&&!state.disconnected;$('board').innerHTML=state.board.map((v,i)=>`<button class="cell ${v?v.toLowerCase()+' place':''} ${state.winningLine?.includes(i)?'win':''}" data-cell="${i}" ${v||!active?'disabled':''}>${v||''}</button>`).join('');document.querySelectorAll('.cell').forEach(b=>b.onclick=()=>{const cell=+b.dataset.cell;if(active&&!state.board[cell])send({type:'game-move',cell})});$('rematchBtn').disabled=true;$('rematchBtn').hidden=!!state.championshipFixture;$('rematchBtn').textContent='🔁 Revanche';$('voiceBtn').disabled=isSpectator;$('voiceBtn').textContent=voiceOn?'🔴 Desligar voz':'🎙️ Voz';$('chat').classList.toggle('champ-chat-mode',!!state.championshipFixture);if(state.championshipFixture&&winner)updateChampionshipResultActions(state.championshipFixture.championshipId,state.championshipFixture.fixtureId);else{$('champResultActions').hidden=true;$('champResultActions').innerHTML=''}updateClock();}
function updateClock(){clearInterval(clockTimer);const tick=()=>{if(!state?.turn||state.winner||!state.turnStartedAt){$('turnClock').textContent='—';return}$('turnClock').textContent=`${Math.max(0,Math.ceil((state.turnStartedAt+state.turnSeconds*1000-Date.now())/1000))}s · ${state.turn===mySymbol?'a tua vez':'vez do adversário'}`};tick();clockTimer=setInterval(tick,250)}
async function updateChampionshipResultActions(cupId,fixtureId){
  const box=$('champResultActions'); if(!box)return;
  const token=++resultActionToken; box.hidden=false; box.innerHTML='<div class="result-loading">A preparar a próxima etapa…</div>';
  try{
    const r=await fetch('/api/games/championships/'+encodeURIComponent(cupId)+'?playerId='+encodeURIComponent(playerId),{cache:'no-store'});
    const d=await r.json(); if(!r.ok)throw new Error(d.error||'Não foi possível consultar o campeonato.');
    if(token!==resultActionToken)return;
    const c=d.championship||{};
    if(c.status==='finished'){
      const winnerTeam=c.winnerTeamId?(c.teams||[]).find(t=>t.id===c.winnerTeamId):null;
      box.innerHTML=`<div class="champ-result-card finished"><div class="result-kicker">🏆 CAMPEONATO TERMINADO</div><h3>${winnerTeam?'Vitória da '+esc(winnerTeam.name):'Campeonato empatado'}</h3><p>${winnerTeam?'A equipa vencedora do campeonato foi definida.':'As duas equipas terminaram com a mesma pontuação.'}</p><div class="result-actions"><button id="restartCupBtn" class="primary" ${c.ownerPlayerId===playerId?'':'disabled'}>🔁 Recomeçar campeonato</button><button id="closeFinishedCupBtn">Encerrar campeonato</button></div>${c.ownerPlayerId===playerId?'':'<small class="result-hint">Só o criador pode recomeçar o campeonato.</small>'}</div>`;
      $('restartCupBtn').onclick=()=>restartChampionship(c.id);
      $('closeFinishedCupBtn').onclick=()=>closeFinishedChampionship();
      return;
    }
    const current=(c.fixtures||[]).find(f=>f.status==='ready'||f.status==='playing');
    if(!current){box.hidden=true;box.innerHTML='';return;}
    const mine=current.homePlayerId===playerId||current.awayPlayerId===playerId;
    const home=c.teams?.find(t=>t.id===current.homeTeamId)?.name||'Equipa A';
    const away=c.teams?.find(t=>t.id===current.awayTeamId)?.name||'Equipa B';
    box.innerHTML=`<div class="champ-result-card"><div class="result-kicker">PRÓXIMO JOGO · PARTIDA ${current.order}</div><h3>${esc(current.homePlayerName)} <span>vs</span> ${esc(current.awayPlayerName)}</h3><p>${esc(home)} × ${esc(away)}</p><div class="result-actions"><button id="nextPlayBtn" class="primary" ${mine?'':'disabled'}>🎮 Partir para o outro jogo</button><button id="nextWatchBtn" ${mine?'disabled':''}>👀 Assistir ao outro jogo</button></div>${mine?'':'<small class="result-hint">Este jogo está atribuído a outros jogadores. Podes acompanhá-lo como espectador.</small>'}</div>`;
    $('nextPlayBtn').onclick=()=>openFixture(c.id,current.id);
    $('nextWatchBtn').onclick=()=>openFixture(c.id,current.id);
  }catch(e){if(token===resultActionToken){box.innerHTML=`<div class="champ-result-card"><p>${esc(e.message||'Não foi possível preparar a próxima etapa.')}</p><button id="returnCupBtn">🏆 Voltar ao campeonato</button></div>`;$('returnCupBtn').onclick=()=>closeFinishedChampionship()}}
}
function closeFinishedChampionship(){stopVoice();roomCode=null;mySymbol=null;state=null;activeFixtureId=null;clearSession();$('champResultActions').hidden=true;$('champResultActions').innerHTML='';page('championships');if(currentCupId)openChampionship(currentCupId)}
async function restartChampionship(id){try{const r=await fetch('/api/games/championships/'+encodeURIComponent(id)+'/restart',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerId})});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível recomeçar o campeonato.');stopVoice();roomCode=null;mySymbol=null;state=null;activeFixtureId=null;clearSession();toast('🔁 Campeonato recomeçado.');page('championships');await openChampionship(id)}catch(e){toast(e.message||'Não foi possível recomeçar o campeonato.')}}
function addMsg(name,text,me,scope){const n=document.createElement('div');n.className='msg'+(me?' me':'');const who=document.createElement('small');who.textContent=(scope==='team'?'Equipa · ':'')+(name||'Jogador');n.append(document.createTextNode(text),who);$('messages').appendChild(n);$('messages').scrollTop=$('messages').scrollHeight}
function sendChat(){const text=$('chatInput').value.trim();if(!text)return;if(state?.championshipFixture){if(send({type:'game-chat',text,name:myName,scope:'general'}))$('chatInput').value='';return}if(send({type:'game-chat',text,name:myName,scope:chatScope}))$('chatInput').value=''}
function addChampMsg(name,text,me,scope){if(!$('cupMessages'))return;const n=document.createElement('div');n.className='msg'+(me?' me':'');const who=document.createElement('small');who.textContent=(scope==='team'?'👥 Equipa · ':'💬 Geral · ')+(name||'Jogador');n.append(document.createTextNode(text),who);$('cupMessages').appendChild(n);$('cupMessages').scrollTop=$('cupMessages').scrollHeight}
function sendChampionshipChat(){const text=$('cupChatInput')?.value.trim();if(!text||!currentCupId)return;if(send({type:'championship-chat',championshipId:currentCupId,text,name:myName,scope:'general'}))$('cupChatInput').value=''}
let cupPollTimer=null,currentCupId=null,currentCupTimer=null;
function cupStatusLabel(status){return ({waiting:'Preparação',ready:'Pronto',in_progress:'Em andamento',finished:'Concluído'})[status]||status||'Preparação'}
function cupStatusClass(status){return status==='in_progress'?'live':status==='finished'?'done':status==='ready'?'ready':''}
function hideCupPanels(){ $('cupCreate').hidden=true; $('cupJoin').hidden=true; $('cupAccess').hidden=true; $('cupChat').hidden=true; currentCupId=null; clearInterval(currentCupTimer); currentCupTimer=null; }
function startCupPolling(){clearInterval(cupPollTimer);cupPollTimer=setInterval(()=>{if(document.getElementById('championships')?.classList.contains('active'))loadCups(false)},3000)}
async function loadCups(showEmpty=true){
  startCupPolling();
  try{
    const r=await fetch('/api/games/championships',{cache:'no-store'}); if(!r.ok)throw 0; const d=await r.json();
    if(!d.championships.length){$('cups').innerHTML='<div class="empty-action">Ainda não existem campeonatos.<br><small>Cria o primeiro confronto entre duas equipas.</small></div>';return}
    $('cups').innerHTML=d.championships.map(c=>{
      const mine=c.ownerPlayerId===playerId;
      const teams=(c.teams||[]).map(t=>`<span><b>${esc(t.name)}</b> ${Array.isArray(t.players)?t.players.length:0}/${t.capacity}</span>`).join(' · ');
      return `<article class="item cup-item"><div class="cup-main"><div class="cup-title"><b>${esc(c.name)}</b><span class="state ${cupStatusClass(c.status)}">${cupStatusLabel(c.status)}</span></div><div class="team-progress">${teams}</div></div><div class="cup-actions"><button data-open-cup="${esc(c.id)}">Abrir</button>${mine&&c.status!=='in_progress'&&c.status!=='finished'?`<button class="danger" data-delete-cup="${esc(c.id)}">Eliminar</button>`:''}</div></article>`;
    }).join('');
    document.querySelectorAll('[data-open-cup]').forEach(b=>b.onclick=()=>openChampionship(b.dataset.openCup));
    document.querySelectorAll('[data-delete-cup]').forEach(b=>b.onclick=()=>deleteChampionship(b.dataset.deleteCup));
  }catch{$('cups').innerHTML='<div class="empty-action">Não foi possível carregar os campeonatos.</div>'}
}
function renderChampionship(c){
  const a=c.teams?.[0],b=c.teams?.[1],mine=c.memberTeamId,mineTeam=c.teams?.find(t=>t.id===mine),isOwner=c.ownerPlayerId===playerId;
  const scoreA=(c.fixtures||[]).filter(f=>f.status==='finished'&&((f.homeTeamId===a?.id&&f.homeScore>f.awayScore)||(f.awayTeamId===a?.id&&f.awayScore>f.homeScore))).length;
  const scoreB=(c.fixtures||[]).filter(f=>f.status==='finished'&&((f.homeTeamId===b?.id&&f.homeScore>f.awayScore)||(f.awayTeamId===b?.id&&f.awayScore>f.homeScore))).length;
  const canStart=isOwner&&c.status==='ready'; const winner=c.winnerTeamId?(c.teams.find(t=>t.id===c.winnerTeamId)?.name):null; const championshipDraw=c.status==='finished'&&!c.winnerTeamId; const codeA=a?.joinCode,codeB=b?.joinCode;
  $('cupAccess').hidden=false;$('cupChat').hidden=false;
  $('cupAccess').innerHTML=`<div class="champ-shell"><div class="champ-top"><div><div class="eyebrow">${cupStatusLabel(c.status).toUpperCase()}</div><h3>🏆 ${esc(c.name)}</h3><p class="sub">👥 ${c.participantCount} jogadores · 🎯 ${c.plannedMatches||c.fixtures?.length||1} partidas · ${esc(a?.name||'Equipa A')} vs ${esc(b?.name||'Equipa B')}</p></div><div class="row compact"><button id="closeCupView">Fechar</button></div></div>
    <div class="champ-score"><div class="team-score"><b>🅰️ ${esc(a?.name||'Equipa A')}</b><strong>${scoreA}</strong><small>${a?.players?.length||0}/${a?.capacity||0} jogadores</small></div><div class="versus">VS</div><div class="team-score right"><b>🅱️ ${esc(b?.name||'Equipa B')}</b><strong>${scoreB}</strong><small>${b?.players?.length||0}/${b?.capacity||0} jogadores</small></div></div>
    ${c.status==='waiting'||c.status==='ready'?`<div class="access-grid"><div class="access-code"><small>🅰️ ${esc(a?.name||'Equipa A')}</small><strong>${codeA?esc(codeA):'••••••'}</strong>${codeA?`<button data-copy="${esc(codeA)}">Copiar</button>`:''}</div><div class="access-code"><small>🅱️ ${esc(b?.name||'Equipa B')}</small><strong>${codeB?esc(codeB):'••••••'}</strong>${codeB?`<button data-copy="${esc(codeB)}">Copiar</button>`:''}</div></div><div class="create-note">${isOwner?'👑 Como criador, tens os dois códigos. Partilha cada código apenas com a respetiva equipa.':mineTeam?'👤 Estás na '+esc(mineTeam.name)+'.':''}</div>`:''}
    ${mineTeam?`<div class="create-note">📌 Estás na <b>${esc(mineTeam.name)}</b>. ${c.status==='waiting'?'Aguarda o preenchimento das vagas.':''}</div>`:''}
    ${canStart?`<div class="start-panel"><div><b>🚀 Tudo pronto!</b><span>${c.plannedMatches||1} partidas foram configuradas.</span></div><button id="startCup" class="primary">▶️ Iniciar campeonato</button></div>`:c.status==='waiting'?`<div class="create-note">⏳ ${(a?.players?.length||0)}/${a?.capacity||0} na Equipa A · ${(b?.players?.length||0)}/${b?.capacity||0} na Equipa B. O início aparece quando todas as vagas estiverem preenchidas.</div>`:''}
    ${c.status==='in_progress'||c.status==='finished'?`<div class="list-heading"><span>🎮 JOGOS DO CAMPEONATO</span><small>${(c.fixtures||[]).filter(f=>f.status==='finished').length}/${c.fixtures?.length||0} concluídos</small></div><div class="fixture-list">${(c.fixtures||[]).map(f=>renderFixture(c,f)).join('')}</div>`:''}
    ${winner?`<div class="winner-line">🏆 <b>${esc(winner)}</b><div class="sub">Campeã do campeonato.</div></div>`:championshipDraw?`<div class="winner-line">🤝 <b>Campeonato empatado</b><div class="sub">As equipas terminaram com a mesma pontuação.</div></div>`:''}
  </div>`;
  $('closeCupView').onclick=()=>{$('cupAccess').hidden=true;$('cupChat').hidden=true};
  document.querySelectorAll('[data-copy]').forEach(btn=>btn.onclick=async()=>{try{await navigator.clipboard.writeText(btn.dataset.copy);toast('📋 Código copiado.')}catch{toast(btn.dataset.copy)}});
  if($('startCup'))$('startCup').onclick=()=>startChampionship(c.id);
  document.querySelectorAll('[data-play-fixture]').forEach(btn=>btn.onclick=()=>openFixture(c.id,btn.dataset.playFixture));
  currentChampChat=c.chat||[];seen.clear();if($('cupMessages')){$('cupMessages').innerHTML='';currentChampChat.forEach(m=>addChampMsg(m.name,m.text,m.playerId===playerId,m.scope||'general'))}
  if(socketOpen()&&mine)send({type:'championship-watch',championshipId:c.id,playerId});
}
function renderFixture(c,f){
  const mine=f.homePlayerId===playerId||f.awayPlayerId===playerId;
  const firstOpen=(c.fixtures||[]).find(x=>x.status!=='finished');
  const isCurrent=f.status==='playing'||(firstOpen&&firstOpen.id===f.id);
  const final=f.order===(c.plannedMatches||c.fixtures?.length);
  const status=f.status==='finished'?'🏁 Concluído':f.status==='playing'?'🔴 Ao vivo':isCurrent?'🟢 Pronta':'🔒 Bloqueada';
  const result=f.status==='finished'?`${f.homeScore} — ${f.awayScore}`:status;
  const canOpen=f.status==='finished'||isCurrent;
  const action=f.status==='finished'?(mine?'📺 Rever':'👀 Rever'):(isCurrent?(mine?(final?'🏆 JOGAR FINAL':'🎮 JOGAR AGORA'):(final?'👀 ASSISTIR FINAL':'👀 ASSISTIR AO VIVO')):'🔒 AGUARDA');
  const note=!canOpen&&f.status!=='finished'?`<small class="fixture-lock-note">Disponível após o Jogo ${(f.order||2)-1}</small>`:'';
  return `<div class="fixture ${isCurrent?'is-current':''} ${f.status==='finished'?'is-finished':'is-locked'}"><div class="fixture-num">${f.order}</div><div class="fixture-names"><b>${esc(f.homePlayerName)} <span class="sub">(${esc(c.teams.find(t=>t.id===f.homeTeamId)?.name||'')})</span></b><small>vs ${esc(f.awayPlayerName)} <span>(${esc(c.teams.find(t=>t.id===f.awayTeamId)?.name||'')})</span></small>${note}</div><div class="fixture-result"><strong>${esc(result)}</strong><button data-play-fixture="${esc(f.id)}" ${canOpen?'':'disabled'} class="${mine&&f.status!=='finished'&&canOpen?'primary':''}">${action}</button></div></div>`;
}
async function openChampionship(id){
  currentCupId=id; clearInterval(currentCupTimer);
  const refresh=async()=>{try{const r=await fetch('/api/games/championships/'+encodeURIComponent(id)+'?playerId='+encodeURIComponent(playerId),{cache:'no-store'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Campeonato não encontrado.');renderChampionship(d.championship);return true}catch(e){toast(e.message||'Não foi possível abrir o campeonato.');return false}};
  await refresh();
  if(socketOpen())send({type:'championship-watch',championshipId:id,playerId});
  currentCupTimer=setInterval(()=>{if(currentCupId===id&&$('championships')?.classList.contains('active'))refresh()},5000);
}
async function startChampionship(id){
  try{const r=await fetch('/api/games/championships/'+encodeURIComponent(id)+'/start',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerId})});const d=await r.json();if(!r.ok)throw new Error(d.error);toast(d.message||'Campeonato iniciado.');openChampionship(id);loadCups(false)}catch(e){toast(e.message||'Não foi possível iniciar o campeonato.')}
}
async function openFixture(cupId,fixtureId){
  try{
    const r=await fetch(`/api/games/championships/${encodeURIComponent(cupId)}/fixtures/${encodeURIComponent(fixtureId)}/room`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({playerId})});
    const d=await r.json(); if(!r.ok)throw new Error(d.error||'Não foi possível preparar a partida.');
    currentCupId=cupId; roomCode=String(d.roomCode).toUpperCase(); mySymbol=null; state=null; isSpectator=!!d.spectator; activeFixtureId=fixtureId;
    myName=localStorage.getItem('2on_player_name')||myName; myTeam=localStorage.getItem('2on_player_team')||myTeam;
    const action={type:'game-join',roomCode,name:myName,teamName:myTeam,playerId};
    pendingAction=action;
    if(!socketOpen()){toast('🔄 A ligar à partida…');connect();return;}
    pendingAction=null; send(action); toast(isSpectator?'👀 A abrir o modo espectador…':'🎮 A entrar na partida…');
  }catch(e){toast(e.message||'Não foi possível abrir este jogo.')}
}
async function deleteChampionship(id){if(!confirm('Eliminar este campeonato? Esta ação não pode ser desfeita.'))return;try{const r=await fetch('/api/games/championships/'+encodeURIComponent(id)+'?playerId='+encodeURIComponent(playerId),{method:'DELETE'});const d=await r.json();if(!r.ok)throw new Error(d.error||'Não foi possível eliminar.');$('cupAccess').hidden=true;toast('Campeonato eliminado.');loadCups(false)}catch(e){toast(e.message||'Não foi possível eliminar o campeonato.')}
}
async function createChampionship(){
  const name=$('cupName').value.trim(),participantCount=Number($('cupParticipants').value),plannedMatches=Number($('cupMatches').value),teamAName=$('teamAName').value.trim(),teamBName=$('teamBName').value.trim();
  if(!name||!teamAName||!teamBName)return toast('Preenche o nome do campeonato e das duas equipas.');
  myName=$('playerName').value.trim().slice(0,24)||'Jogador';localStorage.setItem('2on_player_name',myName);
  try{const r=await fetch('/api/games/championships',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({name,participantCount,plannedMatches,teamAName,teamBName,ownerName:myName,ownerPlayerId:playerId})});const d=await r.json();if(!r.ok)throw new Error(d.error);hideCupPanels();toast('Campeonato criado. Entraste na Equipa A.');openChampionship(d.championship.id);loadCups(false)}catch(e){toast(e.message||'Não foi possível criar o campeonato.')}
}
async function joinChampionship(){
  const code=$('cupJoinCode').value.trim().toUpperCase(),name=$('cupJoinName').value.trim()||myName||'Jogador';if(!code)return toast('Indica o código da equipa.');
  try{const r=await fetch('/api/games/championships/join',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({code,name,playerId})});const d=await r.json();if(!r.ok)throw new Error(d.error);myName=name;myTeam=d.team.name;localStorage.setItem('2on_player_name',myName);localStorage.setItem('2on_player_team',myTeam);hideCupPanels();toast(d.message||`Entraste na equipa ${d.team.name}.`);openChampionship(d.championship.id);loadCups(false)}catch(e){toast(e.message||'Não foi possível entrar na equipa.')}
}
async function loadRanking(){try{const r=await fetch('/api/games/ranking',{cache:'no-store'});if(!r.ok)throw 0;const d=await r.json();$('rankingBox').innerHTML=d.ranking.length?d.ranking.map((p,i)=>`<div class="item rank"><span class="ranknum">#${i+1}</span><span class="rank-avatar">${esc(initials(p.name))}</span><div><b>${esc(p.name)}</b><span class="sub">${p.wins} vitórias · ${p.losses} derrotas · ${p.draws} empates · ${p.games} partidas</span></div><strong>${p.rate}%</strong></div>`).join(''):'<div class="empty">O ranking começa a ganhar dados quando as partidas terminarem.</div>'}catch{$('rankingBox').innerHTML='<div class="empty">Não foi possível carregar o ranking.</div>'}}
async function loadProfile(){try{const r=await fetch('/api/games/profile/'+encodeURIComponent(playerId),{cache:'no-store'});const p=await r.json();$('profileBox').innerHTML=`<div class="profile-avatar">${esc(initials(p.name))}</div><div><b>${esc(p.name||'Jogador')}</b><small>O teu perfil · histórico até 50 partidas</small></div><div class="profile-stat"><strong>${p.wins||0}</strong><small>VITÓRIAS</small></div><div class="profile-stat"><strong>${p.losses||0}</strong><small>DERROTAS</small></div><div class="profile-stat"><strong>${p.draws||0}</strong><small>EMPATES</small></div><div class="profile-stat"><strong>${p.games||0}</strong><small>PARTIDAS</small></div>`}catch{$('profileBox').innerHTML=''}}
function esc(v){const n=document.createElement('div');n.textContent=v??'';return n.innerHTML}
async function toggleVoice(){if(isSpectator)return toast('👀 O modo espectador não usa microfone.');if(voiceOn){stopVoice();return}if(!navigator.mediaDevices?.getUserMedia)return toast('🎙️ O teu navegador não disponibiliza microfone.');if(location.protocol!=='https:'&&location.hostname!=='localhost'&&location.hostname!=='127.0.0.1')return toast('🔒 No telemóvel, o microfone requer HTTPS.');try{localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});voiceOn=true;await setupVoicePeer();if(state?.players?.X&&state?.players?.O){if(mySymbol==='X')await makeVoiceOffer();else send({type:'game-voice-ready'});}render();toast('🎙️ Microfone ativado.')}catch(e){stopVoice();toast(e?.name==='NotAllowedError'?'🎙️ Permissão do microfone recusada.':'❌ Não foi possível ativar o microfone.')}}
async function setupVoicePeer(){if(pc)return;pc=new RTCPeerConnection({iceServers:await getIceServers()});localStream?.getTracks().forEach(t=>{if(!pc.getSenders().some(s=>s.track===t))pc.addTrack(t,localStream)});pc.onicecandidate=e=>{if(e.candidate)send({type:'game-voice',signal:{type:'ice',candidate:e.candidate}})};pc.ontrack=e=>{$('remoteAudio').srcObject=e.streams[0];$('remoteAudio').play?.().catch(()=>{})};pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState))toast('📡 A ligação de voz foi interrompida.')}}
async function getIceServers(){try{const r=await fetch('/ice-servers',{cache:'no-store'});if(r.ok){const data=await r.json();if(Array.isArray(data)&&data.length)return data}}catch{}return[{urls:'stun:stun.l.google.com:19302'}]}
async function makeVoiceOffer(){await setupVoicePeer();const offer=await pc.createOffer();await pc.setLocalDescription(offer);send({type:'game-voice',signal:{type:'offer',sdp:offer}})}
async function handleVoiceSignal(m){if(!m.signal||isSpectator)return;try{if(m.signal.type==='offer'){if(!localStream){localStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true}});voiceOn=true}await setupVoicePeer();await pc.setRemoteDescription(m.signal.sdp);for(const c of pendingIce){try{await pc.addIceCandidate(c)}catch{}}pendingIce=[];const answer=await pc.createAnswer();await pc.setLocalDescription(answer);send({type:'game-voice',signal:{type:'answer',sdp:answer}});render()}else if(m.signal.type==='answer'&&pc){await pc.setRemoteDescription(m.signal.sdp);for(const c of pendingIce){try{await pc.addIceCandidate(c)}catch{}}pendingIce=[]}else if(m.signal.type==='ice'&&m.signal.candidate){if(pc?.remoteDescription)await pc.addIceCandidate(m.signal.candidate);else pendingIce.push(m.signal.candidate)}}catch(e){toast('📡 Não foi possível estabelecer a voz.')}}
function stopVoice(){voiceOn=false;voiceNegotiating=false;pendingIce=[];if(localStream){localStream.getTracks().forEach(t=>t.stop());localStream=null}if(pc){pc.close();pc=null}if($('remoteAudio'))$('remoteAudio').srcObject=null;if(state)render()}
$('backChamp').onclick=async()=>{const cid=state?.championshipFixture?.championshipId;if(cid){page('championships');await openChampionship(cid)}};$('quickRoom').onclick=create;$('joinBtn').onclick=join;$('copyCode').onclick=async()=>{try{await navigator.clipboard.writeText(roomCode);toast('Código copiado.')}catch{toast('Código: '+roomCode)}};$('leaveGame').onclick=leave;$('rematchBtn').onclick=()=>{if(!state?.winner)return;if(send({type:'game-reset'}))toast('Revanche iniciada.');};$('voiceBtn').onclick=toggleVoice;$('chatSend').onclick=sendChat;$('chatInput').onkeydown=e=>{if(e.key==='Enter')sendChat()};document.querySelectorAll('.chat-tabs button').forEach(b=>b.onclick=()=>{chatScope=b.dataset.scope;document.querySelectorAll('.chat-tabs button').forEach(x=>x.classList.toggle('active',x===b));$('messages').innerHTML='';if(chatScope==='team'&&!state?.teams?.[mySymbol])toast('Ainda não estás associado a uma equipa.')});document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>page(b.dataset.page));$('createCup').onclick=()=>{$('cupCreate').hidden=false;$('cupJoin').hidden=true;$('cupAccess').hidden=true};$('cupCancel').onclick=()=>{$('cupCreate').hidden=true};$('joinCup').onclick=()=>{$('cupJoin').hidden=false;$('cupCreate').hidden=true;$('cupAccess').hidden=true;$('cupJoinName').value=myName};$('cupJoinCancel').onclick=()=>{$('cupJoin').hidden=true};$('cupCreateSubmit').onclick=createChampionship;$('cupJoinSubmit').onclick=joinChampionship;$('cupChatSend').onclick=sendChampionshipChat;$('cupChatInput').onkeydown=e=>{if(e.key==='Enter')sendChampionshipChat()};
let saved=null;try{saved=JSON.parse(localStorage.getItem('2on_game_session')||'null')}catch{localStorage.removeItem('2on_game_session')}if(saved?.roomCode&&saved?.mySymbol){roomCode=String(saved.roomCode).toUpperCase();mySymbol=saved.mySymbol;myName=saved.myName||myName;myTeam=saved.myTeam||myTeam;playerId=saved.playerId||playerId;}
window.addEventListener('beforeunload',()=>{intentionalClose=true;stopVoice()});connect();
})();
