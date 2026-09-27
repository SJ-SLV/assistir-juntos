# 2 ON Platform — Auditoria e correção 2.8.7

## Alterações desta versão

### 1. Lobby Games reorganizado
- Removidos do topo os blocos/atalhos redundantes `Criar partida`, `Entrar com código` e `Ver campeonatos` como trio de ações rápidas.
- Criado um bloco principal `Escolha o seu jogo.`.
- O bloco explica o fluxo de conexão no Streaming Games e apresenta uma ação única de entrada: `Conectar a uma partida`.
- `Ver campeonatos` permanece disponível de forma secundária e também na navegação principal.
- Os jogos continuam selecionáveis individualmente.

### 2. Nome oficial do jogo
- `Jogo do Galo` foi substituído por `X Vs O` em toda a interface e documentação operacional relevante.
- O identificador interno `tictactoe` foi preservado para não quebrar compatibilidade com dados, servidor e campeonatos existentes.

### 3. Bug X Vs O ↔ Pedra, Papel e Tesoura
Foi identificado um problema de isolamento visual entre os dois modos:
- o estado do servidor mudava corretamente para `rps`;
- porém o elemento DOM do tabuleiro X Vs O podia continuar visível junto das opções Pedra/Papel/Tesoura.

Correções:
- regra CSS explícita `.board[hidden], .rps-choices[hidden] { display:none !important; }`;
- limpeza do tabuleiro quando o modo RPS é renderizado;
- limpeza das opções RPS quando o modo X Vs O é renderizado;
- `aria-hidden` sincronizado com o modo atual;
- limpeza completa dos dois componentes ao sair da partida;
- o motor interno `tictactoe` continua separado do motor `rps`.

### 4. Testes
Passaram:
- STATIC SMOKE 2.8.7
- RPS LOGIC SMOKE
- SCHEDULER SMOKE
- SECURITY SMOKE 2.8.7
- PRIVACY/QR SMOKE 2.8.7
- LOBBY SMOKE 2.8.7
- UI SMOKE 2.8.7
- `node --check server.js`
- `node --check public/games.js`

O teste E2E com dois clientes WebSocket/WebRTC continua dependente das dependências npm e de um ambiente real de execução.
