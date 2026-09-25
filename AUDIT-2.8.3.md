# 2 ON Platform 2.8.3 — Auditoria da correção do lobby

Data: 25/09/2026

## Problema reportado

Ao tocar em **Jogar agora** e posteriormente em **Criar partida**, a partida não era criada e não havia resposta funcional aparente.

## Causa raiz encontrada

O frontend `public/games.js` utilizava `wsAuthenticated` nas funções `send()`, `flushQueuedActions()` e `flushSocketState()`, porém a variável não estava declarada.

Quando o fluxo de criação chegava a `send()`, o navegador tentava avaliar `wsAuthenticated` e produzia `ReferenceError`. Como consequência, a mensagem `game-create` não era enviada ao servidor.

Além disso, o estado de autenticação do WebSocket não era atualizado explicitamente após o recebimento de `session-ready`.

## Correção aplicada

1. Declaração inicial:
   - `wsAuthenticated=false`.
2. Após `session-ready`:
   - `wsAuthenticated=true`.
3. Após `WebSocket.close`:
   - `wsAuthenticated=false`.
4. Em erro do WebSocket:
   - `wsAuthenticated=false`.
5. O fluxo existente foi preservado:
   - `Jogar agora`
   - abre o painel de criação;
   - `Criar partida`
   - cria a ação `game-create`;
   - a ação aguarda a autenticação quando necessário;
   - é enviada ao servidor;
   - servidor responde `game-created`;
   - frontend abre a página da partida.

## Testes executados

```text
node --check server.js                    OK
node --check public/games.js              OK
LOBBY SMOKE 2.8.3 PASSED
```

O teste dedicado confirma:

- `wsAuthenticated` está declarado;
- `session-ready` o ativa;
- `close` o limpa;
- botão `Criar partida` existe;
- botão `Jogar agora` está ligado ao fluxo de criação;
- cliente gera `game-create`.

## Observação

A correção identifica e elimina a falha de JavaScript responsável pelo sintoma reportado. A validação automatizada completa de WebSocket exige as dependências npm instaladas; testes físicos em dois dispositivos/rede móvel não fazem parte desta execução.

## Versão

**2.8.3 — Lobby Fix**
