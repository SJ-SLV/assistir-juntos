# 2-ON Streaming — versão 5.0

Aplicação para duas pessoas assistirem ao mesmo conteúdo em dois telefones, com WebRTC P2P, sincronização, chat, voz, reações, playlists e transferência de ficheiros.

## Esta versão
- Interface reorganizada para parecer um produto móvel real, sem excesso de elementos decorativos.
- Primeiro ecrã de entrada separado do painel de sessão.
- Menu da sessão em grelha de 3 colunas, com ações diretamente ligadas às funcionalidades existentes.
- Navegação de saída regressa ao ecrã inicial.
- Melhor tratamento de ligação indisponível antes de criar/entrar.
- Suporte à tecla Enter nos campos de nome/código.
- Corrigidos textos e estados de sessão.
- Ícone, manifesto e service worker incluídos no pacote.
- Lógica WebRTC/WebSocket original preservada.

## Funcionalidades
WebRTC P2P, YouTube sincronizado, vídeos locais, playlists, transferência de ficheiros, chat, chamada de voz, reações, presença e latência.

## Executar
```bash
npm install
npm start
```
Depois abre `http://localhost:3000`.

## TURN
Para redes móveis mais restritivas, recomenda-se configurar:
- `METERED_TURN_USERNAME`
- `METERED_TURN_CREDENTIAL`

## Limitações conhecidas
- Ficheiros locais precisam de ser novamente selecionados depois de um refresh, devido às restrições do navegador.
- A transferência completa é mais indicada para vídeos/músicas curtos; o modo Ao vivo começa mais rapidamente em ficheiros grandes.
