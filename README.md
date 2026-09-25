# 2 ON Platform 2.8.4

Plataforma web de jogos competitivos em tempo real, com partidas rápidas e campeonatos entre duas equipas.

## 2.8.4 — Security & Functional Patch

- Corrigida a entrada em campeonatos: o endpoint de adesão agora exige uma sessão autenticada antes de usar a identidade do jogador.
- Corrigida a reconexão do Streaming: anfitrião e convidado ficam vinculados ao `playerId` emitido pelo servidor; o papel enviado pelo cliente não é suficiente para assumir a sessão.
- Removidos `playerId`, `homePlayerId` e `awayPlayerId` das respostas públicas do campeonato; o frontend usa flags `isMe`, `homeIsMe` e `awayIsMe`.
- O perfil passou para `/api/games/profile/me`, evitando consulta arbitrária por ID interno.
- Adicionado rate limiting básico para sessão e operações sensíveis de campeonatos.
- Adicionados cabeçalhos CSP, HSTS em HTTPS/produção e políticas de segurança adicionais.
- Atualizados os testes estáticos para validar estas proteções.

### Validação desta entrega

- `node --check server.js` — OK
- `node --check public/games.js` — OK
- `STATIC SMOKE 2.8.4 PASSED`
- `RPS LOGIC SMOKE PASSED`
- `SCHEDULER SMOKE PASSED`
- `SECURITY SMOKE 2.8.4 PASSED`

Nota: o teste E2E com servidor real e WebSocket não foi concluído nesta execução porque a instalação das dependências npm excedeu o tempo disponível. Também não foi realizado teste físico em dois telemóveis nem teste real de TURN/WebRTC.

## 2.8.4 — Lobby integrado + Pedra, Papel e Tesoura

- A página inicial de jogos foi adaptada para o novo visual fornecido, sem remover o motor multiplayer existente.
- O nome da área foi padronizado para **2 ON STREAMING GAMES**.
- O Jogo do Galo continua ligado ao fluxo real de criação/entrada de salas, chat, voz, espectadores e campeonatos.
- Os restantes quatro cards estão visíveis como **Em preparação**, evitando prometer funcionalidades multiplayer que ainda não foram implementadas no servidor.
- Campeonatos, Ranking e Conversação continuam acessíveis pelo lobby.
- Os campos de nome/equipa foram integrados ao novo layout e continuam a usar a persistência local existente.


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


## Correções adicionais da 2.4.0

- Corrigidos elementos HTML em falta que impediam o JavaScript de inicializar corretamente na página de jogos (`shareCode` e `chat`).
- Corrigido o envio do chat do campeonato: o `playerId` passa a ser associado à identidade do WebSocket e validado no servidor.
- Corrigida a transferência P2P para permitir que **qualquer um dos dois participantes** seja o primeiro a enviar um ficheiro; o canal de dados é criado sob demanda.
- Adicionado limite de 512 MB por transferência e espera com timeout/backpressure para evitar bloqueios indefinidos.
- Corrigida a recuperação de estado quando alguém entra/reentra numa sessão de streaming: modo, reprodução local e YouTube podem ser sincronizados novamente.
- Adicionada validação de ações de controlo no servidor de streaming e proteção básica contra spam no chat.
- Melhorada a distribuição dos confrontos do campeonato para rodar os adversários e reduzir repetições prematuras.
- O launcher inicial e a reconexão WebSocket agora evitam falhas quando o utilizador toca em criar/entrar enquanto a ligação ainda está a abrir.
- A versão da plataforma e o `.nvmrc` foram atualizados para a linha Node 22.

## Fluxo do campeonato

1. O criador define o número total de participantes, o nome das duas equipas e o número de partidas.
2. O criador entra automaticamente na Equipa A.
3. O servidor gera um código para cada equipa.
4. Cada participante usa apenas o código da sua equipa.
5. Quando todas as vagas estiverem preenchidas, o criador inicia o campeonato.
6. O servidor cria a primeira sala e envia o evento `championship-fixture-ready` aos jogadores daquela partida.
7. Os jogadores entram automaticamente na sala da partida.
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

A verificação automática inclui sintaxe do servidor, jogos e streaming, IDs HTML críticos, fluxos de campeonato/chat/voz/transferência e estrutura do JSON de dados. O teste E2E real de dois clientes WebSocket continua dependente das dependências instaladas no ambiente de execução.

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


## 2.2.3 — Pós-jogo visível

Após uma partida de campeonato terminar, o painel de continuidade permanece visível no ecrã de jogo. O sistema consulta o estado atualizado do campeonato e apresenta a próxima ação disponível: entrar para jogar quando o utilizador está escalado, assistir quando é espectador, ou, quando o campeonato terminou, mostrar a equipa vencedora e as opções de recomeçar/encerrar.

## Partilha de acesso — 2.3.0

A plataforma passou a permitir partilhar acessos por três meios:

- **Código** — continua disponível para cópia manual.
- **Link** — gera um endereço direto com o código de acesso. Ao abrir `?join=...`, o formulário de entrada é preenchido automaticamente; `?room=...` permite entrar diretamente numa partida normal.
- **QR Code** — o navegador gera o QR localmente quando a biblioteca `qrcode` está instalada; existe fallback visual por serviço externo caso a biblioteca não esteja disponível.

Os códigos de equipa continuam a funcionar como credenciais de entrada. Portanto, um link/QR deve ser partilhado apenas com as pessoas autorizadas a entrar na equipa.

## Auditoria de chat — 2.3.0

Foram reforçados os seguintes pontos:

- limite de frequência de mensagens no servidor (8 mensagens/10 s por `playerId`);
- deduplicação por `clientMessageId`;
- nome do remetente resolvido pelo servidor em chats de campeonato;
- mensagens de equipa passam a usar o **ID da equipa**, e não apenas o nome;
- mensagens recebem horário e identificação única;
- mensagens continuam limitadas a 300 caracteres;
- espectadores não podem enviar mensagens de equipa;
- o chat geral do campeonato permanece persistente.

## Auditoria de voz — 2.3.0

- voz continua P2P via WebRTC;
- microfone é opt-in e não é solicitado automaticamente ao outro participante;
- `game-voice-ready` só inicia negociação quando há intenção de voz;
- sinalização aceita apenas `offer`, `answer` e `ice`;
- `bundlePolicy: max-bundle` e `rtcpMuxPolicy: require` reduzem overhead;
- ICE usa pool pequeno de candidatos;
- falha ICE tenta `restartIce()` quando suportado;
- desligar voz avisa o outro participante e encerra o peer local;
- produção deve usar HTTPS/WSS e TURN configurado.

A voz não é considerada garantida apenas por testes estáticos: deve ser validada em dois dispositivos/browser diferentes numa rede móvel/Wi-Fi real.


## v2.5.0 — conversação global, equipa e gestão do campeonato

- Corrigido um erro crítico no `socketSend()` do Streaming que fazia a função chamar a si própria em vez de enviar a mensagem pelo WebSocket.
- Corrigida a ação **Sincronizar** rápida do convidado para funcionar nos modos YouTube, ficheiro e transferência.
- Todos os botões HTML passaram a declarar explicitamente `type="button"`, evitando submissões acidentais.
- O smoke test passou a verificar a interatividade estrutural dos botões e a impedir o regresso da recursão em `socketSend()`.
- Sintaxe de servidor, games e JavaScript inline do Streaming validada.

### v2.5.0 — conversação e gestão

- O **Geral** passou a ser uma conversação global em tempo real: mensagens enviadas dentro de uma partida são distribuídas para todos os clientes online, incluindo utilizadores que estão fora de jogos.
- O histórico global é persistido e carregado quando o utilizador entra.
- O chat de **Equipa** continua isolado: apenas membros da mesma equipa recebem essas mensagens.
- A aba **Equipa** apresenta um indicador vermelho de mensagem não lida.
- Foi adicionado um painel global de conversação fora da partida, mantendo o mesmo fluxo do Geral.
- O criador pode **eliminar o campeonato em qualquer estado**, inclusive antes do início, durante as partidas ou depois de concluído. A eliminação encerra as salas ativas desse campeonato e notifica os participantes.
- O nome da área é **2 ON STREAMING GAMES**.

### Nota de validação

A funcionalidade WebRTC/P2P depende de dois navegadores/dispositivos reais, HTTPS/WSS e, para redes NAT restritivas, TURN. O pacote não declara esse teste físico como concluído sem uma execução real entre dois dispositivos.


## Histórico da auditoria anterior
- Vinculação do playerId ao WebSocket para evitar troca de identidade no `championship-watch`.
- Limpeza de subscrições antigas de campeonatos no mesmo WebSocket.
- Saída centralizada das partidas ao voltar ao painel/campeonato.
- Scheduler de confrontos baseado no conjunto completo de combinações A × B antes de repetir pares.

## 2.8.4 — Privacy, QR & Final Hardening

Esta versão incorpora as correções finais da auditoria da 2.8.1:
- IDs internos de jogadores não são expostos no chat público.
- Mensagens públicas usam `isMe` por destinatário.
- QR Codes são gerados localmente, sem `api.qrserver.com`.
- Rate limiting de sessão/perfil é mantido.
- Auditoria final está em `AUDIT-2.8.4.md`.

### Validação

`STATIC SMOKE 2.8.4 PASSED`, `RPS LOGIC SMOKE PASSED`, `SCHEDULER SMOKE PASSED`, `SECURITY SMOKE 2.8.4 PASSED` e `PRIVACY/QR SMOKE 2.8.4 PASSED`.


## 2.8.4 — Correção crítica do lobby

Corrigido o fluxo em que os botões **Jogar agora** / **Criar partida** não conseguiam enviar `game-create`.

### Causa encontrada
O cliente utilizava `wsAuthenticated` em `send()`, `flushQueuedActions()` e `flushSocketState()`, mas a variável não estava declarada nem era marcada como verdadeira após `session-ready`. Isso provocava `ReferenceError` no navegador e interrompia o fluxo de criação da partida.

### Correção
- `wsAuthenticated` agora é inicializado como `false`.
- Passa para `true` após `session-ready`.
- Volta para `false` em `close/error` do WebSocket.
- O fluxo `Jogar agora → Criar partida → game-create` foi coberto por teste estático dedicado.

### Teste adicional
`LOBBY SMOKE 2.8.4 PASSED`

Relatório desta correção: `AUDIT-2.8.4.md`.
