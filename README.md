# 2-ON Streaming 4.4

Interface em dois níveis:

1. **Entrada 2-ON** — primeiro painel com Criar Sala e Iniciar Sessão.
2. **Painel principal** — menu visual com as funções da sessão.
3. Ao criar/entrar na sala, a aplicação abre o painel correspondente do anfitrião ou convidado.

A lógica WebRTC/WebSocket existente foi preservada.

## Executar

```bash
npm install
npm start
```


## Versão 4.4
- Todos os atalhos do segundo painel foram ligados às funcionalidades existentes.
- Armazenamento abre informação real do espaço estimado pelo navegador.
- Enviar vídeos abre o modo de transferência.
- Criar Playlist abre o modo de ficheiros e a playlist.
- Ao vivo e Partilhar vídeo abrem o modo de transmissão.
- YouTube abre o modo YouTube.
- Informações, Membros Conectados e menu têm painéis funcionais.
- Terminar sessão limpa a sessão local e regressa ao primeiro painel.
- O botão voltar permite regressar ao primeiro painel.
