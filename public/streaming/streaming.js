(function () {
  const wsProtocol = location.protocol === 'https:' ? 'wss://' : 'ws://';
  let ws = null;
  let wsAuthenticated = false;
  let wsReconnectDelay = 1000;
  let pendingSocketAction = null;

  const SESSION_KEY = 'assistir_juntos_session_v1';
  const AUTH_KEY = '2on_session_token';
  let authToken = localStorage.getItem(AUTH_KEY) || '';
  async function initAuth() {
    const headers = {'content-type':'application/json'};
    if (authToken) headers.Authorization = 'Bearer ' + authToken;
    const res = await fetch('/api/session', {method:'POST', headers, body:JSON.stringify({name:'Jogador'})});
    const data = await res.json();
    if (!res.ok || !data.playerId) throw new Error(data.error || 'Sessão indisponível.');
    if (data.token) { authToken = data.token; localStorage.setItem(AUTH_KEY, authToken); }
  }

  const FALLBACK_ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
  ];
  let cachedIceServers = null;
  async function getIceServers() {
    if (cachedIceServers) return cachedIceServers;
    try {
      const res = await fetch('/ice-servers');
      const list = await res.json();
      cachedIceServers = { iceServers: Array.isArray(list) && list.length ? list : FALLBACK_ICE_SERVERS };
    } catch (e) {
      cachedIceServers = { iceServers: FALLBACK_ICE_SERVERS };
    }
    return cachedIceServers;
  }

  const screens = {
    welcome: document.getElementById('screen-welcome'),
    home: document.getElementById('screen-home'),
    host: document.getElementById('screen-host'),
    viewer: document.getElementById('screen-viewer')
  };
  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[name].classList.add('active');
    if (name === 'home') hideTopbarChip();
  }

  function showTopbarChip(code) {
    document.getElementById('topbar-room-code').textContent = code;
    document.getElementById('topbar-room-chip').classList.add('show');
  }
  function hideTopbarChip() {
    document.getElementById('topbar-room-chip').classList.remove('show');
  }

  function setStatus(el, cls, text) {
    el.className = 'status ' + cls;
    el.innerHTML = '<span class="dot"></span> ' + text;
  }

  function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function formatTime(t) {
    if (!isFinite(t) || isNaN(t)) return '0:00';
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return m + ':' + String(s).padStart(2, '0');
  }

  // ---------- ESTADO GERAL ----------
  let role = null;
  let roomCode = null;
  let myName = 'Tu';
  let lastPingSent = 0;
  let typingTimeout = null;
  let pc = null;
  let polite = false;
  let makingOffer = false;
  let ignoreOffer = false;
  let iceRestartTimer = null;
  let movieStreamId = null;
  let moviePublished = false;
  let pendingPeer = false;
  let fileKind = 'video';
  let remoteFileKind = 'video';
  let movieAudioAttached = false;
  let currentMode = 'file';
  let ytPlayer = null;
  let ytApplyingRemote = false;

  // Transferência de ficheiros (modo "📤 Enviar")
  let fileChannel = null;
  let transferKind = 'video';
  let transferUrl = null;
  let incomingMeta = null;
  let incomingChunks = [];
  let incomingReceived = 0;
  let transferApplyingRemote = false;

  // Playlists (geridas pelo anfitrião)
  let filePlaylist = [];
  let fileCurrentIndex = -1;
  let ytPlaylist = [];
  let ytCurrentIndex = -1;

  function saveLocalSession() {
    try { localStorage.setItem(SESSION_KEY, JSON.stringify({ code: roomCode, role })); } catch (e) {}
  }
  function clearLocalSession() {
    try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
  }

  function updateUrl() {
    const url = new URL(location.href);
    if (roomCode && role) {
      url.searchParams.set('room', roomCode);
      url.searchParams.set('role', role);
    } else {
      url.searchParams.delete('room');
      url.searchParams.delete('role');
    }
    history.replaceState(null, '', url);
  }

  function shareLink() {
    const url = new URL(location.href);
    url.searchParams.set('room', roomCode);
    url.searchParams.set('role', 'viewer');
    return url.toString();
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) { return false; }
  }

  function queueSocketAction(payload) {
    if (socketSend(payload)) return true;
    pendingSocketAction = payload;
    return true;
  }

  // ---------- ECRÃ INICIAL ----------
  const inputCode = document.getElementById('input-code');
  inputCode.addEventListener('input', () => {
    inputCode.value = inputCode.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
  });

  document.getElementById('welcome-create').addEventListener('click', () => {
    showScreen('home');
    setTimeout(() => document.getElementById('host-name').focus(), 150);
  });
  document.getElementById('welcome-join').addEventListener('click', () => {
    showScreen('home');
    setTimeout(() => document.getElementById('viewer-name').focus(), 150);
  });

  document.getElementById('btn-create').addEventListener('click', () => {
    const enteredName = (document.getElementById('host-name').value || '').trim().slice(0, 24);
    if (!enteredName) {
      document.getElementById('home-error').textContent = 'Escreve o teu nome antes de criar a sessão.';
      document.getElementById('host-name').focus();
      return;
    }
    document.getElementById('home-error').textContent = '';
    myName = enteredName;
    try { localStorage.setItem('assistir_juntos_name', myName); } catch (e) {}
    queueSocketAction({ type: 'create-room', name: myName });
  });

  document.getElementById('btn-paste-code').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      inputCode.value = text.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    } catch (e) {
      document.getElementById('home-error').textContent = 'Não consegui aceder à área de transferência — cola manualmente.';
    }
  });

  document.getElementById('btn-join').addEventListener('click', () => {
    const code = inputCode.value.trim().toUpperCase();
    if (code.length < 5) {
      document.getElementById('home-error').textContent = 'O código tem 5 letras/números.';
      return;
    }
    const enteredName = (document.getElementById('viewer-name').value || '').trim().slice(0, 24);
    if (!enteredName) {
      document.getElementById('home-error').textContent = 'Escreve o teu nome antes de entrar na sessão.';
      document.getElementById('viewer-name').focus();
      return;
    }
    document.getElementById('home-error').textContent = '';
    myName = enteredName;
    try { localStorage.setItem('assistir_juntos_name', myName); } catch (e) {}
    queueSocketAction({ type: 'join-room', code, name: myName });
  });

  document.getElementById('host-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-create').click(); });
  document.getElementById('viewer-name').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join').click(); });
  document.getElementById('input-code').addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('btn-join').click(); });

  try {
    const savedName = localStorage.getItem('assistir_juntos_name');
    if (savedName) {
      document.getElementById('host-name').value = savedName;
      document.getElementById('viewer-name').value = savedName;
    }
  } catch (e) {}

  // ---------- SAIR DA SALA ----------
  function leaveRoom() {
    socketSend({ type: 'leave-room' });
  }
  document.getElementById('btn-leave-viewer').addEventListener('click', leaveRoom);

  function resetAllStateToHome() {
    resetPeerConnection();
    clearLocalSession();
    roomCode = null;
    role = null;
    updateUrl();
    filePlaylist.forEach(item => { try { URL.revokeObjectURL(item.url); } catch (e) {} });
    filePlaylist = [];
    fileCurrentIndex = -1;
    ytPlaylist = [];
    ytCurrentIndex = -1;
    if (ytPlayer && ytPlayer.destroy) { try { ytPlayer.destroy(); } catch (e) {} }
    ytPlayer = null;
    cleanupTransferFile();
    showScreen('home');
  }

  // ---------- LADO ANFITRIÃO ----------
  const hostVideo = document.getElementById('host-video');
  const hostAudioEl = document.getElementById('host-audio');
  const fileInput = document.getElementById('file-input');
  const hostStatus = document.getElementById('host-status');
  const reselectBanner = document.getElementById('host-reselect-banner');

  function activeHostMediaEl() {
    return fileKind === 'audio' ? hostAudioEl : hostVideo;
  }

  function addMovieTracksIfNeeded() {
    if (moviePublished || !pc) return;
    const el = activeHostMediaEl();
    const localStream = el.captureStream ? el.captureStream() : el.mozCaptureStream();
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    moviePublished = true;
    pendingPeer = false;
  }

  function publishOrReplaceMovieTrack() {
    if (pendingPeer) { addMovieTracksIfNeeded(); return; }
    if (moviePublished && pc) {
      const el = activeHostMediaEl();
      const newStream = el.captureStream ? el.captureStream() : el.mozCaptureStream();
      const senders = pc.getSenders();
      newStream.getTracks().forEach(track => {
        const sender = senders.find(s => s.track && s.track.kind === track.kind && s.track !== track);
        if (sender) sender.replaceTrack(track);
        else pc.addTrack(track, newStream);
      });
    }
  }

  function broadcastFileState() {
    const item = filePlaylist[fileCurrentIndex];
    socketSend({ type: 'control', action: 'file-kind', kind: fileKind, title: item ? item.name : '' });
  }

  function syncCurrentContentToPeer() {
    if (role !== 'host') return;
    socketSend({ type: 'control', action: 'mode', mode: currentMode });
    if (currentMode === 'file') {
      broadcastFileState();
      const el = activeHostMediaEl();
      if (el && el.src) socketSend({ type: 'control', action: 'media-sync', kind: fileKind, time: el.currentTime || 0, playing: !el.paused, index: fileCurrentIndex, title: filePlaylist[fileCurrentIndex]?.name || '' });
    } else if (currentMode === 'youtube') {
      const item = ytPlaylist[ytCurrentIndex];
      if (item) {
        socketSend({ type: 'control', action: 'yt-load', videoId: item.videoId, title: item.title || item.videoId });
        if (ytPlayer) socketSend({ type: 'control', action: 'yt-sync', time: ytPlayer.getCurrentTime(), playing: ytPlayer.getPlayerState() === YT.PlayerState.PLAYING, videoId: item.videoId, title: item.title || item.videoId });
      }
    } else if (currentMode === 'transfer') {
      const el = getActiveTransferElement();
      if (el && el.src) socketSend({ type: 'control', action: 'transfer-heartbeat', time: el.currentTime || 0 });
    }
  }

  function stopMovieTracks() {
    if (pc) {
      const micTrack = micStream ? micStream.getAudioTracks()[0] : null;
      pc.getSenders().forEach(s => {
        if (!s.track) return;
        if (s.track.kind === 'video' || (s.track.kind === 'audio' && s.track !== micTrack)) {
          pc.removeTrack(s);
        }
      });
    }
    moviePublished = false;
    movieStreamId = null;
  }

  // ---------- PLAYLIST DO TELEMÓVEL ----------
  function renderFilePlaylist() {
    const container = document.getElementById('file-playlist');
    if (!filePlaylist.length) {
      container.innerHTML = '<p class="hint">A playlist está vazia — adiciona vídeos ou música.</p>';
      return;
    }
    container.innerHTML = filePlaylist.map((item, i) => `
      <div class="playlist-item ${i === fileCurrentIndex ? 'playing' : ''}">
        <span class="playlist-icon kind-${item.kind}">${item.kind === 'audio' ? '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>' : '<svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>'}</span>
        <div class="playlist-name-wrap">
          <span class="playlist-name">${escapeHtml(item.name)}</span>
          <span class="playlist-kind-label">${item.kind === 'audio' ? 'Música' : 'Vídeo'}</span>
        </div>
        <div class="playlist-actions">
          <button type="button" data-action="play" data-index="${i}" title="Tocar agora">▶</button>
          <button type="button" data-action="up" data-index="${i}" title="Mover para cima">↑</button>
          <button type="button" data-action="down" data-index="${i}" title="Mover para baixo">↓</button>
          <button type="button" data-action="remove" data-index="${i}" title="Remover">✕</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('file-playlist').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const action = btn.dataset.action;
    if (action === 'play') playFileAt(index);
    else if (action === 'remove') removeFileAt(index);
    else if (action === 'up') moveFile(index, -1);
    else if (action === 'down') moveFile(index, 1);
  });

  function addFilesToPlaylist(fileList) {
    const startIndex = filePlaylist.length;
    Array.from(fileList).forEach(file => {
      filePlaylist.push({
        file,
        name: file.name,
        kind: file.type.startsWith('audio/') ? 'audio' : 'video',
        url: URL.createObjectURL(file)
      });
    });
    renderFilePlaylist();
    if (fileCurrentIndex === -1) playFileAt(startIndex);
  }

  function playFileAt(index) {
    if (index < 0 || index >= filePlaylist.length) return;
    fileCurrentIndex = index;
    const item = filePlaylist[index];
    fileKind = item.kind;
    reselectBanner.classList.remove('show');

    if (item.kind === 'audio') {
      hostVideo.style.display = 'none';
      document.getElementById('file-player-bar').classList.add('show');
      hostAudioEl.src = item.url;
      hostAudioEl.play().catch(() => {});
    } else {
      hostVideo.style.display = 'block';
      document.getElementById('file-player-bar').classList.remove('show');
      hostVideo.src = item.url;
      hostVideo.play().catch(() => {});
    }
    document.getElementById('file-track-title').textContent = item.name;
    renderFilePlaylist();
    broadcastFileState();
    publishOrReplaceMovieTrack();
  }

  function playNextFile() {
    if (!filePlaylist.length) return;
    playFileAt((fileCurrentIndex + 1) % filePlaylist.length);
  }
  function playPrevFile() {
    if (!filePlaylist.length) return;
    playFileAt((fileCurrentIndex - 1 + filePlaylist.length) % filePlaylist.length);
  }

  function removeFileAt(index) {
    const wasCurrent = index === fileCurrentIndex;
    try { URL.revokeObjectURL(filePlaylist[index].url); } catch (e) {}
    filePlaylist.splice(index, 1);
    if (fileCurrentIndex > index) fileCurrentIndex--;
    else if (wasCurrent) {
      fileCurrentIndex = -1;
      if (filePlaylist.length) {
        playFileAt(0);
      } else {
        hostVideo.pause();
        hostAudioEl.pause();
        stopMovieTracks();
        document.getElementById('file-player-bar').classList.remove('show');
      }
    }
    renderFilePlaylist();
  }

  function moveFile(index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= filePlaylist.length) return;
    [filePlaylist[index], filePlaylist[newIndex]] = [filePlaylist[newIndex], filePlaylist[index]];
    if (fileCurrentIndex === index) fileCurrentIndex = newIndex;
    else if (fileCurrentIndex === newIndex) fileCurrentIndex = index;
    renderFilePlaylist();
  }

  fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) addFilesToPlaylist(e.target.files);
    fileInput.value = '';
  });

  // Barra de reprodução — música do telemóvel
  hostAudioEl.addEventListener('play', () => { document.getElementById('file-play-pause').innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><rect x="5" y="4" width="5" height="16"></rect><rect x="14" y="4" width="5" height="16"></rect></svg>'; });
  hostAudioEl.addEventListener('pause', () => { document.getElementById('file-play-pause').innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"></polygon></svg>'; });
  hostAudioEl.addEventListener('timeupdate', () => {
    const seek = document.getElementById('file-seek');
    if (!isNaN(hostAudioEl.duration) && isFinite(hostAudioEl.duration)) seek.max = hostAudioEl.duration;
    seek.value = hostAudioEl.currentTime || 0;
    document.getElementById('file-time-current').textContent = formatTime(hostAudioEl.currentTime);
    document.getElementById('file-time-duration').textContent = formatTime(hostAudioEl.duration);
  });
  hostAudioEl.addEventListener('ended', playNextFile);
  hostVideo.addEventListener('ended', playNextFile);

  document.getElementById('file-play-pause').addEventListener('click', () => {
    if (hostAudioEl.paused) hostAudioEl.play(); else hostAudioEl.pause();
  });
  document.getElementById('file-seek').addEventListener('input', (e) => {
    hostAudioEl.currentTime = Number(e.target.value);
  });
  document.getElementById('file-prev-btn').addEventListener('click', playPrevFile);
  document.getElementById('file-next-btn').addEventListener('click', playNextFile);

  document.getElementById('btn-copy-link').addEventListener('click', async () => {
    const ok = await copyText(shareLink());
    const btn = document.getElementById('btn-copy-link');
    btn.textContent = ok ? '✅ Link copiado!' : '🔗 Copiar link';
    setTimeout(() => { btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>Copiar link'; }, 1800);
  });

  document.getElementById('btn-copy-code').addEventListener('click', async () => {
    const ok = await copyText(roomCode);
    const btn = document.getElementById('btn-copy-code');
    btn.textContent = ok ? 'Copiado!' : 'Copiar código';
    setTimeout(() => { btn.textContent = 'Copiar código'; }, 1800);
  });

  document.getElementById('btn-share-link').addEventListener('click', async () => {
    const url = shareLink();
    if (navigator.share) {
      try { await navigator.share({ title: '2 ON Streaming', text: 'Usa este link para assistirmos juntos:', url }); return; }
      catch (e) { /* utilizador cancelou ou não suportado — cai para copiar */ }
    }
    await copyText(url);
    const btn = document.getElementById('btn-share-link');
    btn.textContent = 'Link copiado!';
    setTimeout(() => { btn.innerHTML = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Partilhar'; }, 1800);
  });

  document.getElementById('vol-call-host').addEventListener('input', (e) => {
    remoteAudio.volume = Number(e.target.value) / 100;
  });

  // ---------- GRELHA DE AÇÕES (launcher) ----------
  document.getElementById('action-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('.grid-item');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'playlist') {
      revealContentPanel();
      document.getElementById('mode-file-btn').click();
      setTimeout(() => {
        document.getElementById('file-playlist').scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 150);
    } else if (action === 'audio') {
      document.getElementById('mic-toggle').click();
    } else if (action === 'mode-file') {
      revealContentPanel();
      document.getElementById('mode-file-btn').click();
    } else if (action === 'mode-youtube') {
      revealContentPanel();
      document.getElementById('mode-youtube-btn').click();
    } else if (action === 'mode-transfer') {
      revealContentPanel();
      document.getElementById('mode-transfer-btn').click();
    } else if (action === 'chat') {
      document.getElementById('chat-toggle').click();
    } else if (action === 'members') {
      pulseConnectionStatus();
    } else if (action === 'install') {
      handleInstallRequest();
    } else if (action === 'leave') {
      leaveRoom();
    }
  });

  function revealContentPanel() {
    const panel = document.getElementById('content-panel-card');
    panel.style.display = 'flex';
    setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  }

  function pulseConnectionStatus() {
    hostStatus.scrollIntoView({ behavior: 'smooth', block: 'center' });
    hostStatus.classList.remove('pulse-highlight');
    void hostStatus.offsetWidth; // reinicia a animação mesmo se já tiver corrido
    hostStatus.classList.add('pulse-highlight');
  }

  // Instalação da PWA ("📲 Instalar" na grelha)
  let deferredInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
  });
  async function handleInstallRequest() {
    if (deferredInstallPrompt) {
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
    } else {
      alert('Para instalar: abre o menu do browser (⋮) e escolhe "Adicionar ao ecrã principal" ou "Instalar app".');
    }
  }

  // ---------- MODO: TELEMÓVEL vs YOUTUBE ----------
  function setActiveModeButton(activeId) {
    ['mode-file-btn', 'mode-transfer-btn', 'mode-youtube-btn'].forEach(id => {
      document.getElementById(id).classList.toggle('mode-btn-active', id === activeId);
    });
    document.getElementById('mode-file-panel').style.display = activeId === 'mode-file-btn' ? 'block' : 'none';
    document.getElementById('mode-transfer-panel').style.display = activeId === 'mode-transfer-btn' ? 'block' : 'none';
    document.getElementById('mode-youtube-panel').style.display = activeId === 'mode-youtube-btn' ? 'block' : 'none';
  }

  document.getElementById('mode-file-btn').addEventListener('click', () => {
    currentMode = 'file';
    setActiveModeButton('mode-file-btn');
    if (ytPlayer) ytPlayer.pauseVideo();
    pauseTransferPlayback();
    socketSend({ type: 'control', action: 'mode', mode: 'file' });
  });

  document.getElementById('mode-transfer-btn').addEventListener('click', () => {
    currentMode = 'transfer';
    setActiveModeButton('mode-transfer-btn');
    hostVideo.pause();
    hostAudioEl.pause();
    stopMovieTracks();
    if (ytPlayer) ytPlayer.pauseVideo();
    socketSend({ type: 'control', action: 'mode', mode: 'transfer' });
  });

  document.getElementById('mode-youtube-btn').addEventListener('click', () => {
    currentMode = 'youtube';
    setActiveModeButton('mode-youtube-btn');
    hostVideo.pause();
    hostAudioEl.pause();
    stopMovieTracks();
    pauseTransferPlayback();
    socketSend({ type: 'control', action: 'mode', mode: 'youtube' });
  });

  function pauseTransferPlayback() {
    const el = getActiveTransferElement();
    if (el) el.pause();
  }

  function applyRemoteMode(mode) {
    if (role !== 'viewer') return;
    currentMode = mode;
    viewerVideo.style.display = mode === 'file' ? '' : 'none';
    document.getElementById('yt-player-viewer').style.display = mode === 'youtube' ? 'block' : 'none';
    if (mode !== 'transfer') {
      document.getElementById('transfer-viewer-video').style.display = 'none';
      document.getElementById('transfer-viewer-audio').style.display = 'none';
      document.getElementById('transfer-receive-progress').style.display = 'none';
    }
  }

  // ---------- LADO VIEWER ----------
  const viewerVideo = document.getElementById('viewer-video');
  const viewerStatus = document.getElementById('viewer-status');
  const btnUnmute = document.getElementById('btn-unmute');
  const remoteAudio = document.getElementById('remote-audio');
  const btnAudioUnmute = document.getElementById('btn-audio-unmute');
  viewerVideo.addEventListener('play',()=>{ if (role==='viewer' && viewerControlGranted && !transferApplyingRemote) socketSend({type:'control',action: currentMode==='file' ? 'media-play' : 'transfer-play',time:viewerVideo.currentTime}); setViewerPlaybackButton(); });
  viewerVideo.addEventListener('pause',()=>{ if (role==='viewer' && viewerControlGranted && !transferApplyingRemote) socketSend({type:'control',action: currentMode==='file' ? 'media-pause' : 'transfer-pause',time:viewerVideo.currentTime}); setViewerPlaybackButton(); });


  function updateViewerNowPlaying(text) {
    const el = document.getElementById('viewer-now-playing');
    if (text) { el.textContent = text; el.style.display = 'block'; }
    else { el.style.display = 'none'; }
  }

  btnUnmute.addEventListener('click', () => {
    viewerVideo.muted = false;
    viewerVideo.play();
    remoteAudio.play().catch(() => {});
    btnUnmute.style.display = 'none';
  });
  btnAudioUnmute.addEventListener('click', () => {
    remoteAudio.play().catch(() => {});
    document.getElementById('movie-audio').play().catch(() => {});
    btnAudioUnmute.classList.remove('show');
  });

  document.getElementById('vol-content').addEventListener('input', (e) => {
    const v = Number(e.target.value) / 100;
    viewerVideo.volume = v;
    document.getElementById('movie-audio').volume = v;
  });
  document.getElementById('vol-call').addEventListener('input', (e) => {
    remoteAudio.volume = Number(e.target.value) / 100;
  });

  // ---------- LIGAÇÃO WEBRTC (peer connection única, com renegociação) ----------
  function attachIceMonitoring(peerConn, statusEl) {
    peerConn.oniceconnectionstatechange = () => {
      const state = peerConn.iceConnectionState;
      if (state === 'connected' || state === 'completed') {
        if (iceRestartTimer) { clearTimeout(iceRestartTimer); iceRestartTimer = null; }
        setStatus(statusEl, 'ok', 'Ligado!');
      } else if (state === 'disconnected') {
        setStatus(statusEl, 'connecting', 'A rede oscilou — a tentar recuperar a ligação...');
        if (iceRestartTimer) clearTimeout(iceRestartTimer);
        iceRestartTimer = setTimeout(() => {
          if (peerConn.iceConnectionState === 'disconnected' && peerConn.restartIce) peerConn.restartIce();
        }, 3000);
      } else if (state === 'failed') {
        setStatus(statusEl, 'err', 'A ligação falhou. A tentar novamente...');
        if (peerConn.restartIce) peerConn.restartIce();
      } else if (state === 'checking') {
        setStatus(statusEl, 'connecting', 'A estabelecer ligação...');
      }
    };
  }

  async function ensurePeerConnection() {
    if (pc) return pc;
    const iceConfig = await getIceServers();
    pc = new RTCPeerConnection(iceConfig);
    polite = (role === 'viewer');

    pc.onicecandidate = (e) => {
      if (e.candidate) socketSend({ type: 'ice-candidate', candidate: e.candidate });
    };

    pc.onnegotiationneeded = async () => {
      try {
        makingOffer = true;
        await pc.setLocalDescription();
        socketSend({ type: 'offer', offer: pc.localDescription });
      } catch (err) {
        console.error('Erro ao negociar ligação:', err);
      } finally {
        makingOffer = false;
      }
    };

    pc.ontrack = (e) => {
      const stream = e.streams[0];
      if (e.track.kind === 'video') {
        movieStreamId = stream.id;
        viewerVideo.srcObject = stream;
        viewerVideo.play().catch(() => { btnUnmute.style.display = 'block'; });
      } else if (e.track.kind === 'audio') {
        if (stream.id === movieStreamId) return;
        if (remoteFileKind === 'audio' && !movieAudioAttached) {
          movieAudioAttached = true;
          movieStreamId = stream.id;
          const movieAudioEl = document.getElementById('movie-audio');
          movieAudioEl.srcObject = stream;
          movieAudioEl.play().catch(() => { btnAudioUnmute.classList.add('show'); });
          return;
        }
        remoteAudio.srcObject = stream;
        remoteAudio.play().catch(() => { btnAudioUnmute.classList.add('show'); });
      }
    };

    // Canal de dados dedicado à transferência de ficheiros. É criado apenas
    // quando o primeiro envio acontece, por qualquer um dos participantes.
    pc.ondatachannel = (e) => {
      if (e.channel.label === 'filetransfer') {
        fileChannel = e.channel;
        setupFileChannel(fileChannel);
      }
    };

    const statusEl = role === 'host' ? hostStatus : viewerStatus;
    attachIceMonitoring(pc, statusEl);
    return pc;
  }

  function resetPeerConnection() {
    if (pc) { try { pc.close(); } catch (e) {} }
    pc = null;
    fileChannel = null;
    moviePublished = false;
    micAdded = false;
    movieStreamId = null;
    movieAudioAttached = false;
  }

  async function handleSignal(msg) {
    await ensurePeerConnection();
    const description = msg.offer || msg.answer;
    const isOffer = description.type === 'offer';
    const collision = isOffer && (makingOffer || pc.signalingState !== 'stable');
    ignoreOffer = !polite && collision;
    if (ignoreOffer) return;

    await pc.setRemoteDescription(description);
    if (isOffer) {
      await pc.setLocalDescription();
      socketSend({ type: 'answer', answer: pc.localDescription });
    }
  }

  // ---------- CHAMADA DE VOZ ----------
  const micToggle = document.getElementById('mic-toggle');
  let micStream = null;
  let micAdded = false;
  let micEnabled = false;

  function updateMicButton() {
    micToggle.classList.remove('active', 'muted');
    const gridIcon = document.getElementById('grid-icon-audio');
    const volRow = document.getElementById('call-volume-row');
    if (gridIcon) gridIcon.classList.remove('is-active', 'is-muted');

    if (!micAdded) {
      micToggle.textContent = '🎤';
      if (volRow) volRow.style.display = 'none';
    } else if (micEnabled) {
      micToggle.textContent = '🎙️'; micToggle.classList.add('active');
      if (gridIcon) gridIcon.classList.add('is-active');
      if (volRow) volRow.style.display = 'flex';
    } else {
      micToggle.textContent = '🔇'; micToggle.classList.add('muted');
      if (gridIcon) gridIcon.classList.add('is-muted');
      if (volRow) volRow.style.display = 'flex';
    }
  }

  micToggle.addEventListener('click', async () => {
    if (!micStream) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        alert('Não foi possível aceder ao microfone. Verifica as permissões do telemóvel/browser.');
        return;
      }
    }
    await ensurePeerConnection();
    if (!micAdded) {
      micStream.getAudioTracks().forEach(t => { t.enabled = true; pc.addTrack(t, micStream); });
      micAdded = true;
      micEnabled = true;
    } else {
      micEnabled = !micEnabled;
      micStream.getAudioTracks().forEach(t => { t.enabled = micEnabled; });
    }
    updateMicButton();
  });

  // ---------- YOUTUBE (vídeo ou música, em sincronia, com playlist) ----------
  function loadYouTubeAPI() {
    return new Promise((resolve) => {
      if (window.YT && window.YT.Player) { resolve(); return; }
      const existingCallback = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (existingCallback) existingCallback(); resolve(); };
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    });
  }

  function extractYouTubeId(input) {
    input = (input || '').trim();
    const match = input.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) return match[1];
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
    return null;
  }

  function fetchYoutubeTitle(videoId) {
    return fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`)
      .then(r => r.ok ? r.json() : null)
      .then(data => (data && data.title) ? data.title : videoId)
      .catch(() => videoId);
  }

  function getYtContainerId() {
    return role === 'host' ? 'yt-player-host' : 'yt-player-viewer';
  }

  function onYtStateChange(e) {
    if (ytApplyingRemote || !ytPlayer || !canControlPlayback()) return;
    const currentTime = ytPlayer.getCurrentTime();
    if (e.data === YT.PlayerState.PLAYING) {
      socketSend({ type: 'control', action: 'yt-play', time: currentTime });
    } else if (e.data === YT.PlayerState.PAUSED) {
      socketSend({ type: 'control', action: 'yt-pause', time: currentTime });
    } else if (e.data === YT.PlayerState.ENDED && role === 'host') {
      playNextYoutube();
    }
  }

  async function ensureYtPlayer(videoId) {
    await loadYouTubeAPI();
    if (ytPlayer) {
      ytPlayer.loadVideoById(videoId);
      return ytPlayer;
    }
    return new Promise((resolve) => {
      const player = new YT.Player(getYtContainerId(), {
        videoId,
        playerVars: { playsinline: 1 },
        events: {
          onReady: () => { ytPlayer = player; resolve(player); },
          onStateChange: onYtStateChange
        }
      });
    });
  }

  function sendYtSync() {
    if (!ytPlayer || !canControlPlayback()) return;
    const time = ytPlayer.getCurrentTime();
    const playing = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
    socketSend({ type: 'control', action: 'yt-sync', time, playing, videoId: ytPlaylist[ytCurrentIndex]?.videoId || null, title: ytPlaylist[ytCurrentIndex]?.title || '' });
  }
  document.getElementById('yt-sync-btn').addEventListener('click', sendYtSync);
  document.getElementById('yt-sync-btn-viewer').addEventListener('click', sendYtSync);

  // Corrige desvios de sincronização automaticamente, sem interromper a reprodução
  setInterval(() => {
    if (ytPlayer && typeof ytPlayer.getPlayerState === 'function' && canControlPlayback() &&
        ytPlayer.getPlayerState() === YT.PlayerState.PLAYING && !ytApplyingRemote) {
      socketSend({ type: 'control', action: 'yt-heartbeat', time: ytPlayer.getCurrentTime(), videoId: ytPlaylist[ytCurrentIndex]?.videoId || null });
    }
  }, 4000);

  // Playlist do YouTube
  function renderYtPlaylist() {
    const container = document.getElementById('yt-playlist');
    if (!ytPlaylist.length) {
      container.innerHTML = '<p class="hint">A fila está vazia — adiciona um link do YouTube.</p>';
      return;
    }
    container.innerHTML = ytPlaylist.map((item, i) => `
      <div class="playlist-item ${i === ytCurrentIndex ? 'playing' : ''}">
        <span class="playlist-icon kind-yt"><svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg></span>
        <div class="playlist-name-wrap">
          <span class="playlist-name">${escapeHtml(item.title || item.videoId)}</span>
          <span class="playlist-kind-label">YouTube</span>
        </div>
        <div class="playlist-actions">
          <button type="button" data-action="play" data-index="${i}" title="Tocar agora">▶</button>
          <button type="button" data-action="up" data-index="${i}" title="Mover para cima">↑</button>
          <button type="button" data-action="down" data-index="${i}" title="Mover para baixo">↓</button>
          <button type="button" data-action="remove" data-index="${i}" title="Remover">✕</button>
        </div>
      </div>`).join('');
  }

  document.getElementById('yt-playlist').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const index = Number(btn.dataset.index);
    const action = btn.dataset.action;
    if (action === 'play') playYoutubeAt(index);
    else if (action === 'remove') removeYoutubeAt(index);
    else if (action === 'up') moveYoutube(index, -1);
    else if (action === 'down') moveYoutube(index, 1);
  });

  async function playYoutubeAt(index) {
    if (!canControlPlayback() || index < 0 || index >= ytPlaylist.length) return;
    ytCurrentIndex = index;
    const item = ytPlaylist[index];
    await ensureYtPlayer(item.videoId);
    document.getElementById('yt-track-title').textContent = item.title || item.videoId;
    document.getElementById('yt-player-bar').classList.add('show');
    document.getElementById('yt-sync-btn').style.display = 'inline-block';
    renderYtPlaylist();
    socketSend({ type: 'control', action: 'yt-load', videoId: item.videoId, title: item.title });
  }

  function playNextYoutube() {
    if (!ytPlaylist.length) return;
    playYoutubeAt((ytCurrentIndex + 1) % ytPlaylist.length);
  }
  function playPrevYoutube() {
    if (!ytPlaylist.length) return;
    playYoutubeAt((ytCurrentIndex - 1 + ytPlaylist.length) % ytPlaylist.length);
  }
  document.getElementById('yt-next-btn').addEventListener('click', playNextYoutube);
  document.getElementById('yt-prev-btn').addEventListener('click', playPrevYoutube);

  function removeYoutubeAt(index) {
    const wasCurrent = index === ytCurrentIndex;
    ytPlaylist.splice(index, 1);
    if (ytCurrentIndex > index) ytCurrentIndex--;
    else if (wasCurrent) {
      ytCurrentIndex = -1;
      if (ytPlaylist.length) playYoutubeAt(0);
      else if (ytPlayer) ytPlayer.stopVideo();
    }
    renderYtPlaylist();
  }

  function moveYoutube(index, delta) {
    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= ytPlaylist.length) return;
    [ytPlaylist[index], ytPlaylist[newIndex]] = [ytPlaylist[newIndex], ytPlaylist[index]];
    if (ytCurrentIndex === index) ytCurrentIndex = newIndex;
    else if (ytCurrentIndex === newIndex) ytCurrentIndex = index;
    renderYtPlaylist();
  }

  document.getElementById('yt-load-btn').addEventListener('click', async () => {
    const raw = document.getElementById('yt-url-input').value;
    const videoId = extractYouTubeId(raw);
    if (!videoId) { alert('Link do YouTube inválido. Cola o link completo ou só o código do vídeo.'); return; }
    document.getElementById('yt-url-input').value = '';
    const item = { videoId, title: videoId };
    ytPlaylist.push(item);
    renderYtPlaylist();
    if (ytCurrentIndex === -1) playYoutubeAt(ytPlaylist.length - 1);
    const title = await fetchYoutubeTitle(videoId);
    item.title = title;
    renderYtPlaylist();
    if (ytPlaylist[ytCurrentIndex] === item) {
      document.getElementById('yt-track-title').textContent = title;
    }
  });

  document.getElementById('viewer-yt-load')?.addEventListener('click', async () => {
    if (!viewerControlGranted) return;
    const raw=document.getElementById('viewer-yt-url').value;
    const videoId=extractYouTubeId(raw);
    if (!videoId) { alert('Link do YouTube inválido.'); return; }
    document.getElementById('viewer-yt-url').value='';
    const title=await fetchYoutubeTitle(videoId);
    await ensureYtPlayer(videoId);
    applyRemoteMode('youtube');
    document.getElementById('yt-player-viewer').style.display='block';
    document.getElementById('viewer-now-playing').textContent='▶ '+title;
    document.getElementById('viewer-now-playing').style.display='block';
    socketSend({type:'control',action:'yt-load',videoId,title});
  });

  async function handleControlMessage(msg) {
    if (msg.action === 'mode') {
      applyRemoteMode(msg.mode);
    } else if (msg.action === 'file-kind') {
      remoteFileKind = msg.kind;
      movieAudioAttached = false;
      updateViewerNowPlaying(msg.kind === 'audio' ? ('<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg> ' + (msg.title || 'Música')) : '');
    } else if (msg.action === 'yt-load') {
      if (role === 'viewer') applyRemoteMode('youtube');
      if (role === 'host') {
        currentMode = 'youtube';
        setActiveModeButton('mode-youtube-btn');
        document.getElementById('content-panel-card').style.display='flex';
        document.getElementById('mode-youtube-panel').style.display='block';
        document.getElementById('yt-track-title').textContent = msg.title || msg.videoId;
      }
      document.getElementById('yt-sync-btn-viewer').style.display = role === 'viewer' ? 'inline-block' : 'none';
      updateViewerNowPlaying('<svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg> ' + (msg.title || 'Vídeo do YouTube'));
      await ensureYtPlayer(msg.videoId);
    } else if (msg.action === 'yt-play' || msg.action === 'yt-pause' || msg.action === 'yt-sync') {
      if (!ytPlayer && msg.videoId) await ensureYtPlayer(msg.videoId);
      if (!ytPlayer) return;
      ytApplyingRemote = true;
      ytPlayer.seekTo(Math.max(0, Number(msg.time) || 0), true);
      const shouldPlay = msg.action === 'yt-play' || (msg.action === 'yt-sync' && msg.playing);
      if (shouldPlay) ytPlayer.playVideo(); else ytPlayer.pauseVideo();
      setTimeout(() => { ytApplyingRemote = false; }, 400);
    } else if (msg.action === 'yt-heartbeat') {
      if (!ytPlayer) return;
      const diff = Math.abs(ytPlayer.getCurrentTime() - msg.time);
      if (diff > 1.5) {
        ytApplyingRemote = true;
        ytPlayer.seekTo(msg.time, true);
        setTimeout(() => { ytApplyingRemote = false; }, 400);
      }
    } else if (msg.action === 'media-sync') {
      if (role !== 'viewer') return;
      const el = msg.kind === 'audio' ? document.getElementById('movie-audio') : viewerVideo;
      if (!el) return;
      applyRemoteMode('file');
      remoteFileKind = msg.kind || remoteFileKind;
      const t = Math.max(0, Number(msg.time) || 0);
      transferApplyingRemote = true;
      try { el.currentTime = t; } catch {}
      if (msg.playing) el.play().catch(() => { if (msg.kind === 'audio') btnAudioUnmute.classList.add('show'); else btnUnmute.style.display='block'; });
      else el.pause();
      setTimeout(() => { transferApplyingRemote = false; }, 400);
    } else if (msg.action === 'media-play' || msg.action === 'media-pause' || msg.action === 'media-seek') {
      if (role !== 'host') return;
      const el = activeHostMediaEl();
      if (!el) return;
      if (msg.action === 'media-seek') el.currentTime = Math.max(0, Number(msg.time) || 0);
      else if (msg.action === 'media-play') el.play().catch(() => {});
      else el.pause();
    } else if (msg.action === 'transfer-play' || msg.action === 'transfer-pause') {
      const el = getActiveTransferElement();
      if (!el || !el.src) return;
      transferApplyingRemote = true;
      el.currentTime = msg.time;
      if (msg.action === 'transfer-play') el.play().catch(() => {}); else el.pause();
      setTimeout(() => { transferApplyingRemote = false; }, 400);
    } else if (msg.action === 'transfer-heartbeat') {
      const el = getActiveTransferElement();
      if (!el || !el.src) return;
      if (Math.abs(el.currentTime - msg.time) > 1.5) {
        transferApplyingRemote = true;
        el.currentTime = msg.time;
        setTimeout(() => { transferApplyingRemote = false; }, 400);
      }
    }
  }

  // ---------- TRANSFERÊNCIA DE FICHEIROS (modo "📤 Enviar") ----------
  document.getElementById('viewer-file-input')?.addEventListener('change', async (e) => {
    const file=e.target.files[0];
    e.target.value='';
    if (!file || !viewerControlGranted) return;
    transferKind=file.type.startsWith('audio/')?'audio':'video';
    const url=URL.createObjectURL(file);
    if (transferUrl) URL.revokeObjectURL(transferUrl);
    transferUrl=url;
    const videoEl=document.getElementById('transfer-viewer-video');
    const audioEl=document.getElementById('transfer-viewer-audio');
    if (transferKind==='audio') { videoEl.style.display='none'; videoEl.pause(); videoEl.removeAttribute('src'); audioEl.style.display='block'; audioEl.src=url; }
    else { audioEl.style.display='none'; audioEl.pause(); audioEl.removeAttribute('src'); videoEl.style.display='block'; videoEl.src=url; }
    const activeEl=transferKind==='audio'?audioEl:videoEl;
    wireTransferSyncElement(activeEl);
    activeEl.play().catch(()=>{});
    applyRemoteMode('transfer');
    socketSend({type:'control',action:'mode',mode:'transfer'});
    socketSend({type:'control',action:'file-kind',kind:transferKind,title:file.name});
    await ensurePeerConnection();
    sendFileViaDataChannel(file);
  });

  function setupFileChannel(channel) {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = handleFileChannelMessage;
    channel.onerror = (err) => console.error('Erro no canal de transferência:', err);
    channel.onclose = () => { if (fileChannel === channel) fileChannel = null; };
  }

  function getActiveTransferElement() {
    if (role === 'host') {
      return transferKind === 'audio' ? document.getElementById('transfer-host-audio') : document.getElementById('transfer-host-video');
    }
    return transferKind === 'audio' ? document.getElementById('transfer-viewer-audio') : document.getElementById('transfer-viewer-video');
  }

  function wireTransferSyncElement(el) {
    if (el.dataset.syncWired) return;
    el.dataset.syncWired = '1';
    el.addEventListener('play', () => {
      if (!transferApplyingRemote) socketSend({ type: 'control', action: 'transfer-play', time: el.currentTime });
    });
    el.addEventListener('pause', () => {
      if (!transferApplyingRemote) socketSend({ type: 'control', action: 'transfer-pause', time: el.currentTime });
    });
  }

  // Corrige pequenos desvios de sincronia sem interromper a reprodução
  setInterval(() => {
    const el = getActiveTransferElement();
    if (el && !el.paused && el.src && !transferApplyingRemote) {
      socketSend({ type: 'control', action: 'transfer-heartbeat', time: el.currentTime });
    }
  }, 4000);

  document.getElementById('transfer-file-input').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    transferKind = file.type.startsWith('audio/') ? 'audio' : 'video';

    // O anfitrião já tem o ficheiro — pode começar a ver de imediato,
    // sem esperar que a transferência para a outra pessoa termine.
    const localUrl = URL.createObjectURL(file);
    const videoEl = document.getElementById('transfer-host-video');
    const audioEl = document.getElementById('transfer-host-audio');
    if (transferKind === 'audio') {
      videoEl.style.display = 'none'; videoEl.pause(); videoEl.removeAttribute('src');
      audioEl.style.display = 'block';
      audioEl.src = localUrl;
    } else {
      audioEl.style.display = 'none'; audioEl.pause(); audioEl.removeAttribute('src');
      videoEl.style.display = 'block';
      videoEl.src = localUrl;
    }
    const activeEl = transferKind === 'audio' ? audioEl : videoEl;
    wireTransferSyncElement(activeEl);
    activeEl.play().catch(() => {});

    await ensurePeerConnection();
    sendFileViaDataChannel(file);
  });

  function getTransferSendUI() {
    if (role === 'viewer') return {
      progress:document.getElementById('viewer-transfer-send-progress'),
      fill:document.getElementById('viewer-transfer-send-fill'),
      label:document.getElementById('viewer-transfer-send-label')
    };
    return {
      progress:document.getElementById('transfer-send-progress'),
      fill:document.getElementById('transfer-send-fill'),
      label:document.getElementById('transfer-send-label')
    };
  }

  async function sendFileViaDataChannel(file) {
    const MAX_TRANSFER_BYTES = 512 * 1024 * 1024;
    if (!file || file.size > MAX_TRANSFER_BYTES) {
      const ui=getTransferSendUI();
      ui.label.textContent='Ficheiro demasiado grande. O limite é 512 MB.';
      ui.progress.style.display='block';
      setTimeout(()=>ui.progress.style.display='none',3000);
      return;
    }

    await ensurePeerConnection();
    if (!fileChannel || fileChannel.readyState === 'closed') {
      fileChannel = pc.createDataChannel('filetransfer', { ordered: true });
      setupFileChannel(fileChannel);
    }
    const waitStart=Date.now();
    while (fileChannel && fileChannel.readyState !== 'open') {
      if (Date.now()-waitStart > 30000) {
        const ui=getTransferSendUI();
        ui.label.textContent='Não foi possível abrir o canal de transferência.';
        ui.progress.style.display='block';
        setTimeout(()=>ui.progress.style.display='none',3000);
        return;
      }
      await new Promise(r=>setTimeout(r,100));
    }
    if (!fileChannel || fileChannel.readyState !== 'open') return;

    const {progress, fill, label} = getTransferSendUI();
    progress.style.display = 'block';
    fill.style.width = '0%';

    const CHUNK_SIZE = 16 * 1024;
    const LOW_THRESHOLD = 256 * 1024;
    fileChannel.bufferedAmountLowThreshold = LOW_THRESHOLD;
    fileChannel.send(JSON.stringify({ type: 'file-start', name: file.name, size: file.size, mime: file.type }));

    let offset = 0;
    while (offset < file.size) {
      if (!fileChannel || fileChannel.readyState !== 'open') { label.textContent = 'A transferência foi interrompida (ligação perdida).'; return; }
      while (fileChannel.bufferedAmount > LOW_THRESHOLD) {
        await new Promise(resolve => setTimeout(resolve, 50));
        if (!fileChannel || fileChannel.readyState !== 'open') { label.textContent = 'A transferência foi interrompida (ligação perdida).'; return; }
      }
      const end = Math.min(offset + CHUNK_SIZE, file.size);
      const buf = await file.slice(offset, end).arrayBuffer();
      fileChannel.send(buf);
      offset = end;
      const pct = Math.round((offset / file.size) * 100);
      fill.style.width = pct + '%';
      label.textContent = `A enviar "${file.name}"... ${pct}%`;
    }
    fileChannel.send(JSON.stringify({ type: 'file-end' }));
    label.textContent = 'Envio concluído — a outra pessoa já está a ver.';
    setTimeout(() => { progress.style.display = 'none'; }, 2500);
  }

  function handleFileChannelMessage(e) {
    if (typeof e.data === 'string') {
      const msg = JSON.parse(e.data);
      if (msg.type === 'file-start') {
        incomingMeta = msg;
        incomingChunks = [];
        incomingReceived = 0;
        transferKind = (msg.mime || '').startsWith('audio/') ? 'audio' : 'video';
        if (role === 'viewer') applyRemoteMode('transfer');
        document.getElementById('transfer-receive-progress').style.display = 'block';
        document.getElementById('transfer-receive-fill').style.width = '0%';
        document.getElementById('transfer-receive-label').textContent = `A receber "${msg.name}"... 0%`;
      } else if (msg.type === 'file-end') {
        finalizeIncomingFile();
      }
    } else {
      incomingChunks.push(e.data);
      incomingReceived += e.data.byteLength;
      if (incomingMeta && incomingMeta.size) {
        const pct = Math.round((incomingReceived / incomingMeta.size) * 100);
        document.getElementById('transfer-receive-fill').style.width = pct + '%';
        document.getElementById('transfer-receive-label').textContent = `A receber "${incomingMeta.name}"... ${pct}%`;
      }
    }
  }

  function finalizeIncomingFile() {
    if (!incomingMeta) return;
    const blob = new Blob(incomingChunks, { type: incomingMeta.mime || 'application/octet-stream' });
    incomingChunks = [];
    if (transferUrl) URL.revokeObjectURL(transferUrl);
    transferUrl = URL.createObjectURL(blob);

    const prefix = role === 'host' ? 'transfer-host-' : 'transfer-viewer-';
    const videoEl = document.getElementById(prefix + 'video');
    const audioEl = document.getElementById(prefix + 'audio');
    let activeEl;
    if (transferKind === 'audio') {
      videoEl.style.display = 'none'; videoEl.pause(); videoEl.removeAttribute('src');
      audioEl.style.display = 'block';
      audioEl.src = transferUrl;
      activeEl = audioEl;
    } else {
      audioEl.style.display = 'none'; audioEl.pause(); audioEl.removeAttribute('src');
      videoEl.style.display = 'block';
      videoEl.src = transferUrl;
      activeEl = videoEl;
    }
    wireTransferSyncElement(activeEl);
    document.getElementById('transfer-receive-label').textContent = `✅ Pronto: ${incomingMeta.name}`;
    if (role === 'host') {
      document.getElementById('content-panel-card').style.display='flex';
      document.getElementById('mode-transfer-panel').style.display='block';
    }
    incomingMeta = null;
    incomingReceived = 0;
    setTimeout(() => { document.getElementById('transfer-receive-progress').style.display = 'none'; }, 1500);
  }

  function cleanupTransferFile() {
    ['transfer-host-video', 'transfer-host-audio', 'transfer-viewer-video', 'transfer-viewer-audio'].forEach(id => {
      const el = document.getElementById(id);
      el.pause();
      el.removeAttribute('src');
      delete el.dataset.syncWired;
    });
    if (transferUrl) { URL.revokeObjectURL(transferUrl); transferUrl = null; }
    incomingMeta = null;
    incomingChunks = [];
  }

  // ---------- CHAT ----------
  const chatToggle = document.getElementById('chat-toggle');
  const chatPanel = document.getElementById('chat-panel');
  const chatMessages = document.getElementById('chat-messages');
  const chatInput = document.getElementById('chat-input');
  const chatBadge = document.getElementById('chat-badge');
  let unread = 0;
  let chatHistoryLog = [];

  function chatStorageKey() { return 'assistir_juntos_chat_' + roomCode; }
  function saveChatHistory() {
    try { localStorage.setItem(chatStorageKey(), JSON.stringify(chatHistoryLog.slice(-50))); } catch (e) {}
  }
  function loadChatHistory() {
    try {
      const raw = localStorage.getItem(chatStorageKey());
      if (!raw) return;
      const arr = JSON.parse(raw);
      arr.forEach(m => addMessage(m.text, m.kind, false));
    } catch (e) {}
  }
  function clearChatHistory() {
    try { if (roomCode) localStorage.removeItem(chatStorageKey()); } catch (e) {}
  }

  function addMessage(text, kind, remember = true) {
    const empty = document.getElementById('chat-empty');
    if (empty) empty.remove();
    const div = document.createElement('div');
    div.className = 'msg ' + kind;
    div.textContent = text;
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    if (remember) {
      chatHistoryLog.push({ text, kind });
      saveChatHistory();
    }
  }

  chatToggle.addEventListener('click', () => {
    chatPanel.classList.add('show');
    unread = 0;
    chatBadge.classList.remove('show');
    const gridBadge = document.getElementById('chat-badge-grid');
    if (gridBadge) gridBadge.classList.remove('show');
    ['quick-chat-badge-host','quick-chat-badge-viewer'].forEach(id => { const b=document.getElementById(id); if(b) b.classList.remove('show'); });
  });
  document.getElementById('chat-close').addEventListener('click', () => chatPanel.classList.remove('show'));

  function sendChat() {
    const text = chatInput.value.trim();
    if (!text) return;
    if (!socketSend({ type: 'chat', text })) return;
    addMessage(text, 'me');
    chatInput.value = '';
  }
  document.getElementById('chat-send').addEventListener('click', sendChat);
  chatInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendChat(); });

  // ---------- PRESENÇA (nomes/avatares) ----------
  function initials(name) {
    return (name || '?').trim().slice(0, 1).toUpperCase();
  }
  function applyPresence(msg) {
    const otherName = role === 'host' ? msg.viewerName : msg.hostName;
    const mine = role === 'host' ? msg.hostName : msg.viewerName;
    if (mine) myName = mine;
    const otherText = msg.hasViewer || role === 'viewer' ? (otherName || (role === 'host' ? 'Convidado' : 'Anfitrião')) : 'A aguardar...';
    ['my-avatar', 'my-avatar-v'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = initials(myName); });
    ['my-name', 'my-name-v'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = myName + ' (tu)'; });
    ['other-name', 'other-name-v'].forEach(id => { const el = document.getElementById(id); if (el) el.textContent = otherText; });
  }


  // ---------- CONTROLOS PROFISSIONAIS DA SALA 5.4 ----------
  let viewerControlRequested = false;
  let viewerControlGranted = false;
  let hostControlRequestPending = false;
  let hostControlGranted = false;

  function toggleControlPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = el.style.display === 'none' ? 'grid' : 'none';
  }
  function syncQuickRoomCode(code) {
    ['host-stage-code','viewer-stage-code'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent=code || '-----'; });
  }
  function setQuickMicState() {
    const active = micAdded && micEnabled;
    const muted = micAdded && !micEnabled;
    ['quick-mic-host','quick-mic-viewer'].forEach(id => { const b=document.getElementById(id); if(b) b.classList.toggle('active',active), b.classList.toggle('muted',muted); });
    ['quick-mic-icon-host','quick-mic-icon-viewer'].forEach(id => { const e=document.getElementById(id); if(e) e.innerHTML = active ? '<span style="font-size:15px">🎙️</span>' : muted ? '<span style="font-size:15px">🔇</span>' : '<span style="font-size:15px">🎤</span>'; });
  }
  function updateViewerControlLabel() {
    const el = document.getElementById('viewer-control-label');
    if (!el) return;
    el.textContent = viewerControlGranted ? 'Controlo ativo' : (viewerControlRequested ? 'Pedido enviado' : 'Pedir controlo');
    document.getElementById('quick-control-viewer')?.classList.toggle('active', viewerControlGranted);
  }
  function setHostControlRequestState(pending) {
    hostControlRequestPending = !!pending;
    const badge = document.getElementById('quick-control-badge-host');
    if (badge) {
      badge.textContent = hostControlRequestPending ? '1' : '';
      badge.classList.toggle('show', hostControlRequestPending);
    }
    const btn = document.getElementById('quick-control-host');
    if (btn) btn.classList.toggle('active', hostControlRequestPending);
  }
  function canControlPlayback() { return role === 'host' || viewerControlGranted; }
  function updateViewerPermissionUI() {
    const tools = document.querySelectorAll('.viewer-granted-tools');
    tools.forEach(el => { el.style.display = (role === 'viewer' && viewerControlGranted) ? 'block' : 'none'; });
    const text = document.getElementById('viewer-permission-text');
    if (text) text.textContent = viewerControlGranted ? 'Autorização ativa: podes controlar a reprodução e partilhar conteúdo.' : (viewerControlRequested ? 'Pedido enviado. Aguarda a autorização do anfitrião.' : 'Pede autorização ao anfitrião para controlar a reprodução e partilhar conteúdo.');
    const revoke = document.getElementById('host-control-revoke');
    if (revoke) revoke.style.display = (role === 'host' && hostControlGranted) ? 'block' : 'none';
  }
  function setViewerPlaybackButton() {
    const btn=document.getElementById('viewer-play-pause');
    if (!btn) return;
    const ytState = ytPlayer && typeof ytPlayer.getPlayerState==='function' && window.YT ? ytPlayer.getPlayerState() : null;
    const el = document.getElementById('transfer-viewer-video');
    const audio = document.getElementById('transfer-viewer-audio');
    const media = (el && el.src) ? el : ((audio && audio.src) ? audio : viewerVideo);
    const playing = ytState === 1 || (media && !media.paused);
    btn.textContent = playing ? '⏸ Pausar' : '▶ Reproduzir';
  }

  function socketSend(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN || !wsAuthenticated) return false;
    try {
      ws.send(JSON.stringify(payload));
      return true;
    } catch (e) {
      return false;
    }
  }

  function requestViewerControl() {
    if (viewerControlGranted) {
      toggleControlPanel('viewer-control-panel');
      return;
    }
    if (viewerControlRequested) { toggleControlPanel('viewer-control-panel'); return; }
    if (!socketSend({type:'control-request', name: myName})) return;
    viewerControlRequested = true;
    updateViewerControlLabel();
    const sub=document.getElementById('viewer-stage-subtitle'); if(sub) sub.textContent='Pedido enviado ao anfitrião';
    const panel=document.getElementById('viewer-control-panel'); if(panel) panel.style.display='grid';
    updateViewerPermissionUI();
  }
  document.getElementById('quick-chat-host')?.addEventListener('click',()=>document.getElementById('chat-toggle').click());
  document.getElementById('quick-chat-viewer')?.addEventListener('click',()=>document.getElementById('chat-toggle').click());
  document.getElementById('quick-mic-host')?.addEventListener('click',()=>document.getElementById('mic-toggle').click());
  document.getElementById('quick-mic-viewer')?.addEventListener('click',()=>document.getElementById('mic-toggle').click());
  document.getElementById('quick-audio-host')?.addEventListener('click',()=>toggleControlPanel('host-control-panel'));
  document.getElementById('quick-audio-viewer')?.addEventListener('click',()=>toggleControlPanel('viewer-control-panel'));
  document.getElementById('quick-control-host')?.addEventListener('click',()=>toggleControlPanel('host-control-panel'));
  document.getElementById('quick-control-viewer')?.addEventListener('click',requestViewerControl);
  document.getElementById('host-control-revoke')?.addEventListener('click',()=>{
    if (role !== 'host' || ws.readyState !== WebSocket.OPEN) return;
    socketSend({type:'control-revoked'});
    hostControlGranted = false;
    updateViewerPermissionUI();
    const req=document.getElementById('host-control-request'); if(req) req.classList.remove('show');
    setHostControlRequestState(false);
  });
  document.getElementById('viewer-play-pause')?.addEventListener('click',()=>{
    if (!viewerControlGranted) return;
    if (currentMode==='youtube' && ytPlayer && typeof ytPlayer.getPlayerState==='function' && window.YT) {
      const state=ytPlayer.getPlayerState();
      if (state===YT.PlayerState.PLAYING) ytPlayer.pauseVideo(); else ytPlayer.playVideo();
    } else {
      const v=document.getElementById('transfer-viewer-video');
      const a=document.getElementById('transfer-viewer-audio');
      const el=currentMode==='transfer' ? ((v && v.src) ? v : ((a && a.src) ? a : viewerVideo)) : viewerVideo;
      if (el.paused) el.play().catch(()=>{}); else el.pause();
    }
    setTimeout(setViewerPlaybackButton,120);
  });
  document.getElementById('viewer-back10')?.addEventListener('click',()=>{
    if (!viewerControlGranted) return;
    if (ytPlayer && typeof ytPlayer.getCurrentTime==='function') { const t=Math.max(0,ytPlayer.getCurrentTime()-10); ytPlayer.seekTo(t,true); socketSend({type:'control',action:'yt-sync',time:t,playing:true}); }
    else { const v=document.getElementById('transfer-viewer-video'); const a=document.getElementById('transfer-viewer-audio'); const el=currentMode==='transfer'?((v&&v.src)?v:((a&&a.src)?a:viewerVideo)):viewerVideo; el.currentTime=Math.max(0,el.currentTime-10); socketSend({type:'control',action: currentMode==='file' ? 'media-seek' : 'transfer-heartbeat',time:el.currentTime}); }
  });
  document.getElementById('viewer-forward10')?.addEventListener('click',()=>{
    if (!viewerControlGranted) return;
    if (ytPlayer && typeof ytPlayer.getCurrentTime==='function') { const t=ytPlayer.getCurrentTime()+10; ytPlayer.seekTo(t,true); socketSend({type:'control',action:'yt-sync',time:t,playing:true}); }
    else { const v=document.getElementById('transfer-viewer-video'); const a=document.getElementById('transfer-viewer-audio'); const el=currentMode==='transfer'?((v&&v.src)?v:((a&&a.src)?a:viewerVideo)):viewerVideo; el.currentTime=Math.min(isFinite(el.duration)?el.duration:el.currentTime+10,el.currentTime+10); socketSend({type:'control',action: currentMode==='file' ? 'media-seek' : 'transfer-heartbeat',time:el.currentTime}); }
  });
  document.getElementById('host-call-volume-quick')?.addEventListener('input',e=>{ const v=Number(e.target.value); remoteAudio.volume=v/100; document.getElementById('vol-call-host').value=v; document.getElementById('host-call-volume-output').textContent=v+'%'; });
  document.getElementById('viewer-content-volume-quick')?.addEventListener('input',e=>{ const v=Number(e.target.value); viewerVideo.volume=v/100; document.getElementById('movie-audio').volume=v/100; document.getElementById('vol-content').value=v; document.getElementById('viewer-content-volume-output').textContent=v+'%'; });
  document.getElementById('viewer-call-volume-quick')?.addEventListener('input',e=>{ const v=Number(e.target.value); remoteAudio.volume=v/100; document.getElementById('vol-call').value=v; document.getElementById('viewer-call-volume-output').textContent=v+'%'; });
  document.getElementById('viewer-unmute-quick')?.addEventListener('click',()=>{ btnUnmute.click(); btnAudioUnmute.click(); });
  document.getElementById('viewer-sync-quick')?.addEventListener('click',()=>{
    if (!viewerControlGranted) return;
    if (currentMode === 'youtube' && ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
      sendYtSync();
      return;
    }
    const transferVideo=document.getElementById('transfer-viewer-video');
    const transferAudio=document.getElementById('transfer-viewer-audio');
    const media=currentMode==='transfer'
      ? ((transferVideo && transferVideo.src) ? transferVideo : ((transferAudio && transferAudio.src) ? transferAudio : viewerVideo))
      : viewerVideo;
    if (!media) return;
    const time=Number.isFinite(media.currentTime) ? media.currentTime : 0;
    const playing=!media.paused;
    socketSend({
      type:'control',
      action:currentMode==='transfer' ? 'transfer-heartbeat' : 'media-sync',
      time,
      playing,
      kind:fileKind,
      index:fileCurrentIndex,
      title:filePlaylist[fileCurrentIndex]?.name||''
    });
    setStatus(viewerStatus,'connecting','Sincronização enviada.');
  });
  document.getElementById('host-sync-quick')?.addEventListener('click',()=>{ if(currentMode==='youtube') sendYtSync(); else if(role==='host'){ const el=getActiveTransferElement(); if(el && el.src) socketSend({type:'control',action:'transfer-heartbeat',time:el.currentTime}); else if(hostVideo.src || hostAudioEl.src) socketSend({type:'control',action:'media-sync',kind:fileKind,time:activeHostMediaEl().currentTime,playing:!activeHostMediaEl().paused,index:fileCurrentIndex,title:filePlaylist[fileCurrentIndex]?.name||''}); } });
  document.getElementById('host-install-quick')?.addEventListener('click',handleInstallRequest);
  document.getElementById('host-control-allow')?.addEventListener('click',()=>{
    if (!socketSend({type:'control-granted'})) return;
    hostControlGranted = true;
    updateViewerPermissionUI();
    setHostControlRequestState(false);
    document.getElementById('host-control-request')?.classList.remove('show');
  });
  document.getElementById('host-control-deny')?.addEventListener('click',()=>{
    if (!socketSend({type:'control-denied'})) return;
    hostControlGranted = false;
    updateViewerPermissionUI();
    setHostControlRequestState(false);
    document.getElementById('host-control-request')?.classList.remove('show');
  });
  const _oldUpdateMicButton = updateMicButton;
  updateMicButton = function(){ _oldUpdateMicButton(); setQuickMicState(); };

  // ---------- REAÇÕES ----------
  function showReaction(emoji) {
    const layer = document.getElementById('reaction-layer');
    const el = document.createElement('div');
    el.className = 'reaction-pop';
    el.textContent = emoji;
    el.style.left = (10 + Math.random() * 70) + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2300);
  }
  document.querySelectorAll('.reactions-row').forEach(row => {
    row.addEventListener('click', (e) => {
      const btn = e.target.closest('.react-btn');
      if (!btn) return;
      const emoji = btn.dataset.emoji;
      showReaction(emoji);
      socketSend({ type: 'reaction', emoji });
    });
  });

  // ---------- LATÊNCIA ----------
  setInterval(() => {
    if (roomCode && role && ws.readyState === WebSocket.OPEN) {
      lastPingSent = performance.now();
      socketSend({ type: 'app-ping', t: lastPingSent });
    }
  }, 5000);
  function updateLatency(ms) {
    const rounded = Math.round(ms);
    const cls = rounded < 150 ? 'good' : rounded > 400 ? 'bad' : '';
    ['latency-badge', 'latency-badge-v'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.textContent = rounded + ' ms';
      el.className = 'latency ' + cls;
    });
  }

  // ---------- INDICADOR "A ESCREVER" ----------
  let typingSentAt = 0;
  chatInput.addEventListener('input', () => {
    const now = Date.now();
    if (now - typingSentAt > 1500) {
      typingSentAt = now;
      socketSend({ type: 'typing' });
    }
  });
  function showTypingIndicator() {
    const el = document.getElementById('typing-indicator');
    el.style.display = 'block';
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { el.style.display = 'none'; }, 2500);
  }

  // ---------- CONTROLOS EXTRA DE VÍDEO ----------
  const hostBack10 = document.getElementById('host-back10');
  const hostForward10 = document.getElementById('host-forward10');
  const hostFullscreenBtn = document.getElementById('host-fullscreen');
  if (hostBack10) hostBack10.addEventListener('click', () => { hostVideo.currentTime = Math.max(0, hostVideo.currentTime - 10); });
  if (hostForward10) hostForward10.addEventListener('click', () => { hostVideo.currentTime += 10; });
  if (hostFullscreenBtn) hostFullscreenBtn.addEventListener('click', () => {
    if (hostVideo.requestFullscreen) hostVideo.requestFullscreen();
    else if (hostVideo.webkitRequestFullscreen) hostVideo.webkitRequestFullscreen();
  });
  const viewerFullscreenBtn = document.getElementById('viewer-fullscreen');
  if (viewerFullscreenBtn) viewerFullscreenBtn.addEventListener('click', () => {
    if (viewerVideo.requestFullscreen) viewerVideo.requestFullscreen();
    else if (viewerVideo.webkitRequestFullscreen) viewerVideo.webkitRequestFullscreen();
  });

  // ---------- VISIBILIDADE POR PAPEL ----------
  function updateRolePanels() {
    const hostCard = document.getElementById('host-stage-card');
    const viewerCard = document.getElementById('viewer-stage-card');
    if (hostCard) hostCard.style.display = role === 'host' ? '' : 'none';
    if (viewerCard) viewerCard.style.display = role === 'viewer' ? 'block' : 'none';
    const hostQuickControl = document.getElementById('quick-control-host');
    if (hostQuickControl) hostQuickControl.style.display = role === 'host' ? '' : 'none';
    updateViewerPermissionUI();
  }

  // O painel de controlos do convidado fica no próprio ecrã do convidado.
  // Ele é visível desde a entrada na sala; o pedido de controlo é uma ação separada.
  function ensureViewerPanelVisible() {
    const panel = document.getElementById('viewer-stage-card');
    if (panel && role === 'viewer') panel.style.display = 'block';
  }

  // ---------- MENSAGENS DO SERVIDOR ----------
  function wireSocket(socket) {
    // Centraliza o envio para evitar exceções quando a ligação fecha durante uma ação.
    const nativeSend = socket.send.bind(socket);
    socket.send = (data) => {
      if (socket.readyState !== WebSocket.OPEN) return false;
      try { nativeSend(data); return true; } catch (e) { return false; }
    };
    socket.addEventListener('open', () => {
      wsReconnectDelay = 1000;
      wsAuthenticated = false;
      socket.send(JSON.stringify({type:'session-auth',token:authToken}));
    });
    socket.onmessage = async (event) => {
      let msg;
      try { msg = JSON.parse(event.data); } catch (e) { return; }

      if (msg.type === 'session-ready') {
        wsAuthenticated = true;
        if (roomCode && role) {
          socket.send(JSON.stringify({ type: 'rejoin-room', code: roomCode, role, name: myName }));
        } else if (pendingSocketAction) {
          const action = pendingSocketAction; pendingSocketAction = null; socket.send(JSON.stringify(action));
        }
        return;
      }

      switch (msg.type) {
        case 'room-created':
          role = 'host';
          hostControlGranted = false;
          updateRolePanels();
          roomCode = msg.code;
          document.getElementById('room-code').textContent = msg.code;
          if(window.QRCode){QRCode.toDataURL(shareLink(),{errorCorrectionLevel:'M',width:160,margin:2,color:{dark:'#101827',light:'#ffffff'}}).then(url=>{document.getElementById('qr-code').src=url}).catch(()=>{document.getElementById('qr-code').removeAttribute('src')});}else{document.getElementById('qr-code').removeAttribute('src');}
          updateUrl();
          saveLocalSession();
          showScreen('host');
          syncQuickRoomCode(msg.code);
          showTopbarChip(msg.code);
          loadChatHistory();
          applyPresence(msg);
          updateViewerPermissionUI();
          if (msg.rejoined) {
            resetPeerConnection();
            reselectBanner.classList.add('show');
            setStatus(hostStatus, 'connecting', 'Sessão restabelecida. A aguardar a outra pessoa...');
          }
          break;

        case 'room-joined':
          role = 'viewer';
          setHostControlRequestState(false);
          viewerControlRequested = false;
          viewerControlGranted = false;
          updateViewerControlLabel();
          updateViewerPermissionUI();
          updateRolePanels();
          roomCode = msg.code;
          document.getElementById('viewer-code').textContent = msg.code;
          updateUrl();
          saveLocalSession();
          showScreen('viewer');
          ensureViewerPanelVisible();
          syncQuickRoomCode(msg.code);
          showTopbarChip(msg.code);
          loadChatHistory();
          applyPresence(msg);
          if (msg.rejoined) resetPeerConnection();
          break;

        case 'presence':
          applyPresence(msg);
          break;

        case 'left-room':
          clearChatHistory();
          resetAllStateToHome();
          hideTopbarChip();
          break;

        case 'error':
          if (msg.expired) { roomCode = null; role = null; updateUrl(); clearLocalSession(); showScreen('home'); }
          document.getElementById('home-error').textContent = msg.message;
          break;

        case 'peer-joined':
          await ensurePeerConnection();
          if (role === 'host') {
            setStatus(hostStatus, 'connecting', msg.rejoined ? 'A pessoa voltou. A reconectar...' : 'A pessoa entrou! A iniciar transmissão...');
            if (currentMode === 'file') {
              if (filePlaylist.length) addMovieTracksIfNeeded();
              else pendingPeer = true;
            }
            setTimeout(syncCurrentContentToPeer, 250);
          } else {
            setStatus(viewerStatus, 'connecting', 'O anfitrião reconectou-se. A aguardar conteúdo...');
          }
          if (micStream && !micAdded && micEnabled) {
            micStream.getAudioTracks().forEach(t => pc.addTrack(t, micStream));
            micAdded = true;
            updateMicButton();
          }
          break;

        case 'offer':
        case 'answer':
          await handleSignal(msg);
          break;

        case 'ice-candidate':
          await ensurePeerConnection();
          try { await pc.addIceCandidate(msg.candidate); }
          catch (err) { if (!ignoreOffer) console.error(err); }
          break;

        case 'chat':
          addMessage(msg.text, 'them');
          if (!chatPanel.classList.contains('show')) {
            unread++;
            chatBadge.textContent = unread;
            chatBadge.classList.add('show');
            const gridBadge = document.getElementById('chat-badge-grid');
            if (gridBadge) { gridBadge.textContent = unread; gridBadge.classList.add('show'); }
            ['quick-chat-badge-host','quick-chat-badge-viewer'].forEach(id => { const b=document.getElementById(id); if(b) { b.textContent=unread; b.classList.add('show'); } });
          }
          break;

        case 'control-request':
          if (role === 'host') {
            const request = document.getElementById('host-control-request');
            const name = document.getElementById('host-control-request-name');
            if (name) name.textContent = msg.name || 'A outra pessoa';
            setHostControlRequestState(true);
            if (request) {
              request.classList.add('show');
              request.classList.remove('pulse-highlight');
              void request.offsetWidth;
              request.classList.add('pulse-highlight');
              request.scrollIntoView({behavior:'smooth', block:'center'});
            }
          }
          break;

        case 'control-granted':
          if (role === 'viewer') {
            viewerControlGranted = true;
            viewerControlRequested = false;
            updateViewerControlLabel();
            updateViewerPermissionUI();
            const sub=document.getElementById('viewer-stage-subtitle'); if(sub) sub.textContent='O anfitrião permitiu os controlos';
            const panel=document.getElementById('viewer-control-panel'); if(panel) panel.style.display='grid';
          }
          break;

        case 'control-revoked':
          if (role === 'viewer') {
            viewerControlGranted = false;
            viewerControlRequested = false;
            updateViewerControlLabel();
            updateViewerPermissionUI();
            const sub=document.getElementById('viewer-stage-subtitle'); if(sub) sub.textContent='O anfitrião retirou o acesso aos controlos';
          }
          break;

        case 'control-denied':
          if (role === 'viewer') {
            viewerControlGranted = false;
            viewerControlRequested = false;
            updateViewerControlLabel();
            updateViewerPermissionUI();
            const sub=document.getElementById('viewer-stage-subtitle'); if(sub) sub.textContent='O anfitrião não autorizou os controlos';
          }
          break;

        case 'control':
          await handleControlMessage(msg);
          break;

        case 'app-pong':
          updateLatency(performance.now() - msg.t);
          break;

        case 'reaction':
          showReaction(msg.emoji);
          break;

        case 'typing':
          showTypingIndicator();
          break;

        case 'peer-disconnected-temp':
          if (role === 'host') setStatus(hostStatus, 'connecting', 'A pessoa perdeu ligação — a aguardar que volte...');
          if (role === 'viewer') setStatus(viewerStatus, 'connecting', 'O anfitrião perdeu ligação — a aguardar que volte...');
          break;

        case 'peer-left':
          if (role === 'host') setStatus(hostStatus, 'err', 'A outra pessoa encerrou a sessão.');
          if (role === 'viewer') setStatus(viewerStatus, 'err', 'O anfitrião encerrou a sessão.');
          resetPeerConnection();
          break;

        default:
          break;
      }
    };

    socket.onclose = () => {
      setTimeout(reconnectSocket, wsReconnectDelay);
      wsReconnectDelay = Math.min(wsReconnectDelay * 2, 10000);
    };
  }

  function reconnectSocket() {
    if (!authToken) return;
    ws = new WebSocket(wsProtocol + location.host);
    wireSocket(ws);
  }

  initAuth().then(() => { reconnectSocket(); }).catch(() => {
    setTimeout(() => initAuth().then(reconnectSocket).catch(() => {}), 1500);
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // ---------- RESTAURAR SESSÃO (link partilhado, refresh, ou reabrir o site) ----------
  window.addEventListener('load', () => {
    const params = new URL(location.href).searchParams;
    let urlRoom = params.get('room');
    let urlRole = params.get('role');

    if (!urlRoom || !urlRole) {
      try {
        const saved = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
        if (saved && saved.code && saved.role) {
          urlRoom = saved.code;
          urlRole = saved.role;
        }
      } catch (e) {}
    }

    if (urlRoom && urlRole) {
      roomCode = urlRoom.toUpperCase();
      role = urlRole;
      if (ws.readyState === WebSocket.OPEN) socketSend({ type: 'rejoin-room', code: roomCode, role, name: myName });
    }
  });
})();
