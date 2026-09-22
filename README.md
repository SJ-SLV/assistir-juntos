# 2 ON Platform v1.0.0

Plataforma unificada **Connect · Play · Watch** que junta os dois conceitos do projecto:

- **2 ON Streng Games** — X/O multiplayer, salas privadas, chat, ranking e base para campeonatos.
- **2 ON Streaming** — sessões privadas de vídeo/YouTube, sincronização, WebRTC, chat, voz e partilha.

## Estrutura

```text
2on-platform/
├── server.js
├── package.json
└── public/
    ├── index.html          # hub 2 ON
    ├── games.html          # módulo Streng Games
    ├── games.css
    ├── games.js
    └── streaming/
        ├── index.html      # módulo Streaming 5.6
        ├── manifest.json
        ├── sw.js
        ├── icon.svg
        └── icon.png
```

## Arranque

```bash
npm install
npm start
```

Abrir `http://localhost:3000`.

## Rotas

- `/` — Hub 2 ON
- `/games.html` — Streng Games
- `/streaming/` — Streaming
- `/health` — estado do servidor

## Nota de arquitectura

O servidor usa um único WebSocket e separa os protocolos por prefixo: mensagens do jogo começam por `game-`; a camada de Streaming mantém os tipos de sinalização existentes. Isto permite que os dois módulos coexistam no mesmo serviço e domínio.

## Estado desta versão

Esta entrega é a **primeira integração executável**. O ranking e as salas de jogo são mantidos em memória; a camada de persistência, autenticação, perfis completos, torneios avançados e poderes podem ser adicionados sem alterar o conceito central.
