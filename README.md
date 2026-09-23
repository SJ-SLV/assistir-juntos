# 2 ON Platform — v1.5.0

## Campeonatos — fluxo reorganizado

A v1.5 reorganiza o campeonato como um fluxo completo de competição entre duas equipas:

1. **Criar campeonato** — nome, total de jogadores e nomes das duas equipas.
2. **Sala de preparação** — o criador entra automaticamente na Equipa A e recebe o código da sua equipa.
3. **Entrada por código** — cada jogador usa apenas o código da equipa a que pertence; o sistema associa-o automaticamente.
4. **Pronto** — quando todas as vagas das duas equipas estiverem preenchidas, o campeonato passa para `ready`.
5. **Iniciar campeonato** — apenas o criador pode iniciar. O servidor cria automaticamente um jogo para cada par A×B.
6. **Jogar** — cada participante vê o seu jogo e entra numa sala X/O reservada ao par correspondente.
7. **Resultados** — cada vitória atualiza o placar das equipas e o resultado do jogo.
8. **Campeão** — quando o confronto termina, o servidor regista a equipa vencedora.

### Estados

`waiting` → `ready` → `in_progress` → `finished`

### Segurança do campeonato

- Apenas o criador pode iniciar.
- O código da equipa define a equipa automaticamente.
- Uma pessoa não pode entrar nas duas equipas do mesmo campeonato.
- Uma sala de jogo de campeonato só aceita os dois jogadores daquele confronto.
- Campeonatos em andamento não podem ser eliminados.

## Partida X/O

- Primeiro toque define quem começa.
- Revanche imediata: um jogador pode reiniciar a partida sem aprovação do outro.
- Reconexão por `playerId`.
- Relógio por jogada, marcador e histórico.

## Executar

```bash
npm install
npm start
```

Abrir `http://localhost:3000/games.html`.

## Validação desta versão

- `node --check server.js` — OK
- `node --check public/games.js` — OK
- ZIP testado com `unzip -t` após empacotamento.
- Teste real em dois dispositivos/WebRTC depende do ambiente com dependências instaladas e deve ser feito antes de produção.

## Produção

A persistência desta versão usa o armazenamento existente do projeto. Para crescimento, migrar campeonatos e estatísticas para PostgreSQL e presença/salas para Redis. Para voz em redes móveis restritas, configurar TURN.
