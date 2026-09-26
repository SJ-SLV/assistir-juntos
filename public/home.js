(() => {
  const root = document.getElementById('serverStatus');
  const text = document.getElementById('serverStatusText');
  async function check() {
    try {
      const r = await fetch('/api/status', { cache: 'no-store' });
      if (!r.ok) throw new Error();
      const data = await r.json();
      root.classList.add('online'); root.classList.remove('offline');
      text.textContent = `Servidor online · v${data.version}`;
    } catch {
      root.classList.add('offline'); root.classList.remove('online');
      text.textContent = 'Servidor indisponível';
    }
  }
  check();
})();
