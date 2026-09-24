# 2 ON Platform 2.2.2

Plataforma web de jogos competitivos em tempo real, com partidas rápidas e campeonatos entre duas equipas.

## O que foi corrigido nesta versão

- A próxima partida de campeonato já não depende de o jogador carregar em **Abrir partida**.
- O servidor anuncia a partida pronta diretamente aos jogadores envolvidos.
- Se o jogador estiver numa partida anterior, o cliente encerra a sessão anterior e entra na nova partida automaticamente.
- Ao abrir novamente o campeonato, o servidor identifica a partida atual do jogador e pode reencaminhá-lo para ela.
- Foi criada uma associação temporária entre `playerId` e WebSocket para entregar eventos mesmo quando o jogador não está no ecrã do campeonato.
- Corrigida a contagem de jogadores na lista de campeonatos.
- Removidos scripts de testes antigos que apontavam para ficheiros inexistentes.
- Mantidos espectadores sem permissão de jogar.
- O chat do campeonato continua persistente.

## Fluxo do campeonato

1. O criador define o número total de participantes, o nome das duas equipas e o número de partidas.
2. O criador entra automaticamente na Equipa A.
3. O servidor gera um código para cada equipa.
4. Cada participante usa apenas o código da sua equipa.
5. Quando todas as vagas estiverem preenchidas, o criador inicia o campeonato.
6. O servidor cria a primeira sala e envia o evento `championship-fixture-ready` aos jogadores daquela partida.
7. Os dois jogadores entram automaticamente na sala X/O.
8. O primeiro toque válido define quem começa.
9. O resultado é guardado no campeonato.
10. Se ainda houver partidas, a próxima sala é criada e anunciada automaticamente.
11. Jogadores que não estão escalados podem abrir uma partida como espectadores.
12. Depois da última partida, o campeonato é marcado como concluído.

### Importante sobre o formato atual

O campeonato atual é uma **série entre duas equipas**. O campo “partidas até à final” define quantas partidas compõem a série; não é um sistema de eliminatórias com chaveamento. Um bracket verdadeiro deve ser implementado como um formato separado.

## Estrutura

```text
2-on-platform/
├── server.js
├── package.json
├── data/
│   └── games.json
├── scripts/
│   └── smoke.js
└── public/
    ├── index.html
    ├── games.html
    ├── games.css
    ├── games.js
    └── streaming/
```

## Execução

Requer Node.js 18 ou superior.

```bash
npm install
npm start
```

Depois abra `http://localhost:3000/`.

## Verificação local

```bash
npm run check
npm run test:static
npm test
```

A verificação disponível neste pacote é estática: sintaxe JavaScript, ficheiros obrigatórios, IDs HTML, presença dos fluxos principais e estrutura do JSON de dados.

A instalação das dependências (`express` e `ws`) deve ser feita no ambiente de execução. Nesta revisão, o ambiente de análise não conseguiu concluir `npm install`, portanto não é correto declarar um teste E2E real de WebSocket como concluído.

## Produção

Para partidas e voz entre telemóveis:

- use HTTPS/WSS;
- configure TURN real através de `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL`;
- mantenha `ADMIN_TOKEN`/credenciais fora do código se forem adicionados recursos administrativos;
- para vários processos/servidores, substitua o armazenamento JSON por PostgreSQL e presença em memória por Redis.

## Dados

O MVP persiste campeonatos e estatísticas em `data/games.json`. Isso é adequado para uma implantação pequena em armazenamento persistente. Em ambientes como Render com filesystem efémero, os dados não devem ser tratados como armazenamento definitivo.


## Correções da 2.2.2
- Impede abrir partidas futuras antes da partida atual terminar.
- Mantém salas com espectadores enquanto houver espectadores ativos.
- Reforça a renegociação de voz quando o segundo jogador entra.
- A interface identifica partidas futuras como aguardando.


## Championship Core 2.2.2

A lógica do campeonato usa uma sequência de estados controlada pelo servidor: a primeira partida não concluída fica `ready`/`playing`; todas as partidas seguintes ficam `locked` até a anterior terminar. O cliente nunca pode desbloquear uma partida futura por abrir a página ou chamar diretamente o endpoint.

- `championship-watch` é somente leitura e não cria salas.
- O endpoint de sala rejeita partidas futuras com HTTP 409.
- Jogadores atribuídos recebem `championship-fixture-ready` apenas para a partida atual.
- O servidor valida novamente a partida atual no WebSocket antes de permitir entrada.
- Partidas concluídas continuam disponíveis como replay quando o `finalBoard` está persistido.
- Ao terminar uma partida, a seguinte é desbloqueada e preparada automaticamente.
- A interface distingue `JOGAR AGORA`, `ASSISTIR AO VIVO`, `REVER` e `AGUARDA`.

### Limite de validação

Os testes estáticos e de sintaxe podem ser executados localmente. O teste E2E de dois clientes WebSocket só é considerado válido quando executado com as dependências instaladas e o servidor realmente iniciado.


## Pós-partida do campeonato (2.2.2)
- Depois de uma partida concluída, a interface consulta o estado real do campeonato.
- Se existir outra partida ativa/pronta, mostra `Partir para o outro jogo` para o jogador escalado e `Assistir ao outro jogo` para acompanhamento.
- Quando todas as partidas terminam, mostra explicitamente o nome da equipa vencedora (ou empate).
- No fim do campeonato, o criador pode `Recomeçar campeonato`; todos os participantes permanecem nas suas equipas e uma nova série é criada.
- `Encerrar campeonato` fecha a sessão do campeonato no dispositivo sem apagar os dados do campeonato.


## 2.2.2 — Entrada de partida e espectador
- `championship-watch` é somente leitura e nunca abandona a partida atual.
- A abertura de uma partida muda imediatamente para a tela de jogo após a preparação do room.
- Erros de entrada limpam a ação pendente para impedir reentrada automática incorreta.
- Atualizações do campeonato durante uma partida usam refresh silencioso e não derrubam o jogador/espectador da sala.
