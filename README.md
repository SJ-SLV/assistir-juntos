# 2 ON Platform 2.9.5

Plataforma multiplayer da 2 ON com **X Vs O**, **Pedra, Papel e Tesoura**, **Damas**, campeonatos, ranking, chat e Streaming sincronizado.

## Requisitos
- Node.js 18 ou superior
- `npm install`
- `npm start`

## Estrutura
- `server.js` — HTTP, WebSocket, sessões, salas, campeonatos e Streaming.
- `public/games.html` / `games.js` / `games.css` — Streaming Games.
- `checkers.js` — motor puro das regras de Damas.
- `public/streaming/` — Streaming sincronizado.
- `data/games.json` — persistência local de estatísticas, campeonatos, chat e sessões.

## Jogos
### X Vs O
Salas privadas, reconexão, espectadores, chat, voz e campeonatos.

### Pedra, Papel e Tesoura
Escolhas simultâneas validadas pelo servidor.

### Damas
Tabuleiro 8×8, captura obrigatória, múltiplas capturas, promoção, empate e validação no servidor.

## Segurança e robustez
- Sessões autenticadas por HTTP e WebSocket.
- Rate limiting para endpoints sensíveis.
- CSP e cabeçalhos de segurança.
- Sanitização de entradas e chats.
- Códigos de sala gerados com alfabeto sem caracteres ambíguos.
- Ações Streaming com lista de modos permitidos.
- Filas de ações durante reconexão.

## Testes
```bash
npm test
npm run test:e2e
npm run test:e2e:security
```

Os testes E2E iniciam um servidor real e usam clientes WebSocket reais. Precisam das dependências instaladas.

## Versão
`2.9.5` — auditoria profunda, correções de segurança/estado, acessibilidade e endurecimento do Streaming Games.
