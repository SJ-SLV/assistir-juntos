# 2 on Streaming 4.1

Aplicação web para duas pessoas assistirem ao mesmo conteúdo em sincronia.

## Melhorias

- Interface redesenhada com aparência de produto real, sem excesso de efeitos.
- Painel 4.1 reorganizado para eliminar código/sessão/voz duplicados e reduzir ruído visual.
- Controlo de ficheiros com seletor de ficheiros personalizado e mais limpo no telemóvel.
- Identidade visual própria do 2 on Streaming.
- Layout responsivo para telemóvel, tablet e desktop.
- Sessões com código, link de convite e partilha.
- Reconexão automática da sessão após perda temporária de WebSocket.
- Persistência da sessão atual no navegador.
- Indicadores de ligação e latência.
- Chat, reações e microfone via WebRTC.
- Modo cinema e ecrã inteiro.
- PWA com service worker atualizado.
- Cabeçalhos básicos de segurança no servidor.
- Limite de payload e proteção básica contra spam no WebSocket.
- Correção do fluxo de transmissão de vídeo/áudio local usando `captureStream()` e substituição de tracks WebRTC.
- Endpoint `/health` e `/ice-servers`.

## Executar

```bash
npm install
npm start
```

Depois abre `http://localhost:3000`.

## TURN

Para redes onde P2P direto não funciona bem, recomenda-se configurar um servidor TURN próprio.

Variáveis aceites:
- `METERED_TURN_USERNAME`
- `METERED_TURN_CREDENTIAL`

## Nota sobre vídeos locais

Os vídeos escolhidos no telefone continuam a ser ficheiros locais do dispositivo anfitrião. Uma atualização da página não consegue recuperar automaticamente o `File` escolhido sem armazenamento persistente. IndexedDB continua a ser a próxima etapa recomendada para biblioteca local persistente.

## Estrutura

```text
2-on-streaming/
├── server.js
├── package.json
├── README.md
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js
    └── icon.svg
```
