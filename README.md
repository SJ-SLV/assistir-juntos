# 2 ON Platform — v1.7.0 Auditado e executável

Versão consolidada da plataforma 2 ON, com **2 ON Streng Games** e **2 ON Streaming** no mesmo servidor.

## Execução imediata

Requisito: **Node.js 18+**.

O projeto inclui os módulos de servidor necessários em `node_modules/` para funcionar de forma autónoma, portanto a execução básica **não depende de `npm install`**.

```bash
npm start
```

ou:

```bash
node server.js
```

Abrir:

- `http://localhost:3000/` — plataforma 2 ON
- `http://localhost:3000/games.html` — Streng Games
- `http://localhost:3000/streaming/` — Streaming
- `http://localhost:3000/health` — diagnóstico
- `http://localhost:3000/api/status` — módulos e versão

## O que foi corrigido nesta auditoria

### Servidor
- Servidor executável sem depender de download de pacotes no primeiro arranque.
- Camada HTTP local para JSON, rotas, ficheiros estáticos e cabeçalhos de segurança.
- WebSocket local com handshake, frames, ping/pong, close e mensagens de texto.
- Normalização dos dados persistidos na inicialização.
- Estatísticas recalculadas a partir de vitórias/derrotas/empates para evitar contadores inconsistentes.
- Campeonatos antigos são normalizados para o formato atual.
- Salas de jogos de campeonato que estavam `playing` quando o servidor foi encerrado são reabertas como `scheduled`, evitando referências para salas que já não existem em memória.
- Códigos, nomes, IDs e mensagens passam por limpeza/limitação.
- Rotas de ranking, perfil, criação, entrada, início, acesso a confronto e eliminação de campeonatos verificadas.
- Sala de campeonato fica reservada aos dois jogadores do confronto.
- Revanche comum continua imediata para os dois jogadores.
- Revanche é bloqueada em jogos de campeonato já concluídos, evitando alterar um resultado oficial.
- Se os dois jogadores abandonarem uma sala de campeonato antes do fim, a sala temporária é libertada e pode ser recriada.
- Campeonato encerrado com pontuação igual fica marcado como confronto empatado em vez de ficar eternamente `in_progress`.

### Jogos
- Primeiro toque válido define quem começa.
- Jogada só é aceite na vez correta.
- Casa ocupada é rejeitada.
- Relógio por jogada.
- Reconexão por `playerId`.
- Marcador por partidas.
- Revanche imediata sem confirmação do adversário.
- Chat geral e chat de equipa separados.
- IDs de mensagens evitam duplicação no cliente.
- Voz WebRTC sinalizada pelo servidor.

### Campeonatos
Fluxo:

`Criar → Preparar equipas → Preencher vagas → Pronto → Iniciar → Jogar confrontos → Resultados → Final`

- O criador entra automaticamente na Equipa A.
- Os dois códigos são gerados no momento da criação.
- O criador consegue ver/copiar os dois códigos.
- Os restantes jogadores só recebem o código da própria equipa.
- O código determina automaticamente a equipa.
- Um jogador não pode pertencer às duas equipas do mesmo campeonato.
- Apenas o criador inicia o campeonato.
- Cada confronto possui uma sala X/O reservada aos participantes correspondentes.

### Cliente
- Fila de ação quando o WebSocket ainda está a conectar.
- Reconexão automática.
- Estado da sessão salvo localmente.
- Leitura segura do `localStorage`.
- Escape de conteúdo dinâmico antes de inserir HTML.
- Painel de campeonato atualizado automaticamente.
- Interface mobile responsiva.

## Validação realizada

Foram executados:

```bash
node --check server.js
node --check public/games.js
```

Também foram executados testes reais locais com o servidor iniciado:

1. HTTP `/health` e `/api/status`.
2. Criação de sala X/O por WebSocket.
3. Entrada de segundo jogador.
4. Primeiro toque e sincronização da partida.
5. Vitória X.
6. Revanche imediata.
7. Criação de campeonato.
8. Verificação dos dois códigos de equipa.
9. Entrada da Equipa B.
10. Início do campeonato.
11. Criação/entrada de sala de confronto.
12. Streaming: criação de sessão, entrada do convidado, presença, pedido de controlo, aprovação e encaminhamento de controlo.

Os testes locais de servidor passaram.

## Persistência

Os dados de jogos, ranking e campeonatos são guardados em:

```text
data/games.json
```

O ficheiro é criado automaticamente quando houver dados.

Para produção com muitos utilizadores, recomenda-se posteriormente migrar a persistência para PostgreSQL e presença/salas para Redis.

## Voz e WebRTC

O servidor fornece `/ice-servers`. Em desenvolvimento existe fallback STUN/TURN público. Para produção, configure credenciais TURN próprias através de:

```text
METERED_TURN_USERNAME
METERED_TURN_CREDENTIAL
```

## Nota sobre o teste de produção

Os testes realizados nesta auditoria foram locais. Ainda é necessário validar em dois dispositivos reais, especialmente WebRTC/microfone e redes móveis diferentes, antes de publicar como serviço de produção.
