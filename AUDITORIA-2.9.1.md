# Auditoria e correção — 2 ON Streaming Games v2.9.1

## Problemas encontrados

1. O lobby visual permitia selecionar Damas, mas o servidor só reconhecia `tictactoe` e `rps`; uma seleção de Damas acabava tratada como X Vs O.
2. O cliente não possuía renderer 8×8 nem envio de coordenadas `from/to` para Damas.
3. O servidor não possuía motor de regras de Damas integrado.
4. O contador de tempo dos jogos existentes poderia ser aplicado indevidamente se Damas usasse o mesmo campo de turno; Damas foi explicitamente excluído do timeout de 20 s.
5. O lobby mobile tinha dimensões excessivas para ecrãs estreitos e o chat global fixo podia sobrepor os cards.
6. O botão Criar partida não apresentava estado visual de processamento.

## Correções

- Novo `checkers.js` integrado ao servidor, com tabuleiro 8×8, 12 peças por lado, captura obrigatória, múltiplas capturas, promoção, vitória e empate.
- `server.js` aceita `gameType=checkers`, valida cada jogada no servidor e sincroniza estado, histórico, peças e alvos legais.
- Reconexão e saída existentes continuam compatíveis com Damas.
- Damas não usa o relógio de 20 segundos dos jogos de turnos rápidos.
- `games.js` ganhou renderer e interação 8×8, indicação de jogadas legais, seleção de peça e promoção.
- Card de Damas passou para “Disponível agora”.
- Lobby recebeu refinamento responsivo para desktop/tablet/mobile.
- Chat global deixa de ocupar a área de conteúdo de forma agressiva em ecrãs pequenos.
- Criar partida mostra `A criar…` enquanto aguarda confirmação do servidor.

## Validações

- `node --check server.js` — OK
- `node --check public/games.js` — OK
- `node --check checkers.js` — OK
- `CHECKERS SMOKE 2.9.1` — OK
- `STATIC SMOKE` — OK
- `UI SMOKE` — OK
- `RPS LOGIC SMOKE` — OK
- `SCHEDULER SMOKE` — OK
- `SECURITY SMOKE` — OK
- `PRIVACY/QR SMOKE` — OK
- `LOBBY SMOKE` — OK

## E2E

O E2E real com Express/WebSocket não foi falsamente marcado como aprovado. O ambiente atual não conseguiu concluir `npm install`; não há `express`/`ws` disponíveis localmente. O projeto mantém as dependências declaradas no `package.json` para execução no Render/ambiente de desenvolvimento.

## Próximo passo recomendado

Publicar esta versão no Render e executar o teste com dois navegadores/dispositivos: criar sala Damas → copiar código → entrar → fazer jogadas → captura obrigatória → reconexão → revanche.


## v2.9.2 — correção de criação e hierarquia responsiva
- Corrigido o fluxo de autenticação WebSocket quando a sessão expira: o cliente renova a sessão e reconecta.
- O botão de criação deixa de ficar preso em “A criar…” quando a ligação falha ou o servidor não responde.
- Adicionado timeout de 12 s para criação de sala com feedback ao utilizador.
- Adicionada mensagem de estado na área de preparação.
- Adicionado limite de 1000 salas de jogos em memória.
- Reorganizada a hierarquia do lobby: hero → preparação → catálogo.
- Reduzidas dimensões e espaçamentos em mobile e desktop.
- Criado título explícito “Jogos disponíveis”.
- Aumentado o espaço inferior para impedir que o dock de conversa cubra conteúdo.
