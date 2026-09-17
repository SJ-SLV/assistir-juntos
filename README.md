# Assistir Juntos 2.1

Versão avançada do Assistir Juntos para duas pessoas assistirem vídeo/música em sincronização.

## Melhorias 2.1
- Interface mais limpa e responsiva.
- Modo Cinema.
- Botão de sincronização imediata.
- Indicador de latência em tempo real.
- Instalação PWA com botão próprio quando o navegador oferece a opção.
- Nomes persistentes no dispositivo.
- Reações com animação no ecrã.
- Presença atualizada quando a outra pessoa entra, sai ou reconecta.
- Limitação de tamanho de mensagens e rate-limit básico no WebSocket.
- Endpoint `/health` para monitorização.
- Expiração de salas inativas.
- TURN próprio continua configurável por `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL`.

## Executar
```bash
npm install
npm start
```
Abra `http://localhost:3000`.

## Render
Defina as variáveis de ambiente do TURN no serviço e use o comando `npm start`.

## Nota
Vídeos locais são transmitidos diretamente entre os dois navegadores através de WebRTC; o servidor funciona principalmente como sinalização. YouTube é carregado diretamente pelo YouTube e apenas os comandos de sincronização passam pela sala.
