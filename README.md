# 2 ON Platform — v1.3.0

Revisão profissional do 2 ON STRENG GAMES com foco em partida, comunicação, reconexão e experiência mobile.

## Principais melhorias
- Primeiro toque define quem começa.
- Animação de colocação de X/O e destaque da linha vencedora.
- Indicador de turno + relógio de 20 segundos por jogada.
- Contador de partidas e marcador de vitórias.
- Revanche por confirmação dos dois jogadores.
- Confirmação antes de abandonar a partida.
- Reconexão automática com estado visual de adversário desconectado.
- Avatar por iniciais, nome, símbolo e equipa.
- Perfil com vitórias, derrotas, empates e partidas.
- Histórico de resultados persistente (até 50 resultados por jogador).
- Ranking persistente em `data/games.json`.
- Campeonatos com opção Liga ou Eliminatórias.
- Chat geral dos competidores e chat privado da equipa.
- Voz P2P por WebRTC com sinalização pelo servidor.
- Mensagens com IDs para evitar duplicações.
- Interface mobile revista, com menos redundância e mensagens humanas.

## Executar

```bash
npm install
npm start
```

Aceda a `http://localhost:3000/games.html`.

## Dados persistentes

A primeira execução cria `data/games.json`. Faça backup deste ficheiro em produção. Para múltiplos servidores, substitua esta camada por PostgreSQL/Redis.

## Nota sobre voz

A voz usa WebRTC. Para redes móveis restritas, configure TURN no ambiente de produção. O STUN sozinho não garante conectividade em todas as operadoras.

## Validação
- `node --check server.js` — OK
- `node --check public/games.js` — OK
- IDs duplicados — verificar antes do deploy
- Teste real entre dois dispositivos e teste visual de browser ainda devem ser realizados no ambiente publicado.
