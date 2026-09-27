# Auditoria 2 ON Platform v2.9.4

## Resultado
A versão 2.9.4 aplica as correções prioritárias identificadas na auditoria profunda da 2.9.3.

### Corrigido
- Removido `onclick` inline de `games.html`, mantendo compatibilidade com CSP.
- Adicionado meta description ao Streaming Games.
- Toast e modal receberam atributos de acessibilidade.
- Declarações de estado críticas de `games.js` foram movidas para o topo do IIFE.
- Recuperação de sessão guardada é carregada antes da inicialização assíncrona da sessão.
- `flushSocketState()` já não abandona a fila quando existe `game-rejoin`.
- `teamMessages` e estado de chat de equipa são limpos ao sair de uma partida.
- Evento explícito `championship-finished` emitido no final de um campeonato e tratado pelo cliente.
- Gerador de códigos de sala usa alfabeto sem caracteres ambíguos e limite de tentativas.
- `mode` do Streaming é validado no servidor contra uma whitelist.
- Fila de ações do Streaming suporta várias ações pendentes, em vez de guardar apenas a última.
- `updateViewerNowPlaying()` recebe apenas texto; os antigos chamadores que injetavam SVG foram removidos.
- Timestamp de `app-pong` é validado antes do cálculo de latência.
- Histórico de chat em memória é limitado a 50 entradas e limpo ao voltar ao início.
- `shutdown()` força `savePersistentData()` antes do encerramento.
- `legalMoves()` do motor de Damas valida que a peça forçada pertence à cor que deve jogar.
- Versões de `package.json`, servidor, smoke tests e README foram uniformizadas em 2.9.4.
- README foi reescrito para refletir a arquitetura e funcionalidades atuais.
- Criados `scripts/audit-smoke.js` e `scripts/version-check.js`.

## Testes executados
- `npm test` — PASSOU.
- `node --check server.js` — PASSOU.
- `node --check public/games.js` — PASSOU.
- `node --check public/streaming/streaming.js` — PASSOU.
- `node --check checkers.js` — PASSOU.
- STATIC SMOKE 2.9.4 — PASSOU.
- CHECKERS SMOKE 2.9.4 — PASSOU.
- RPS LOGIC SMOKE — PASSOU.
- SCHEDULER SMOKE — PASSOU.
- SECURITY SMOKE 2.9.4 — PASSOU.
- PRIVACY/QR SMOKE 2.9.4 — PASSOU.
- LOBBY SMOKE 2.9.4 — PASSOU.
- UI SMOKE 2.9.4 — PASSOU.
- AUDIT SMOKE 2.9.4 — PASSOU.
- VERSION CHECK 2.9.4 — PASSOU.

## E2E real
O E2E real com servidor + Express + WebSocket não foi executado neste ambiente porque `express`, `ws` e `qrcode` não estão instalados localmente. Foram tentadas duas instalações com `npm install`, mas ambas excederam o limite de execução do ambiente.

O script existente `scripts/e2e-championship.js` permanece preparado para executar o teste real após `npm install` no ambiente de deploy/desenvolvimento.
