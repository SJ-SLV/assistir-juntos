# 2 on Streaming — entrada em 3 painéis

Versão com fluxo de entrada reorganizado:

1. **Início:** a pessoa informa o nome e escolhe **Criar uma sala** ou **Entrar numa sala**.
2. **Sala:** anfitrião cria a sessão e recebe código, link e QR Code.
3. **Acesso:** quem recebe código, link ou QR Code chega primeiro ao painel de acesso, confirma o nome e entra na sessão.

O restante do sistema (WebRTC, sincronização, YouTube, playlist, mensagens, voz, transferência e PWA) é preservado.

## Executar

```bash
npm install
npm start
```

Abrir `http://localhost:3000`.

## Observação

O nome é guardado localmente no navegador para evitar digitação repetida. O servidor continua responsável pela criação/entrada das salas; campos adicionais de nome podem ser ignorados por versões antigas do servidor sem impedir o fluxo.
