# Assistir Juntos 2.0

Versão 2.0 do Assistir Juntos, baseada no projeto original enviado.

## Incluído
- Salas privadas de 2 pessoas com código e link.
- Reconexão e período de tolerância de 60 segundos.
- WebRTC para transmissão de vídeo/áudio local e chamada de voz.
- STUN/TURN configurável por `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL`.
- Player com play/pause, -10s, +10s, seek, volume e fullscreen.
- Playlist local e playlist YouTube.
- Sincronização de reprodução, posição e avanço automático de ficheiros locais.
- Chat persistente localmente, indicador de escrita e contador de não lidas.
- Reações em tempo real.
- Partilha por link, QR e menu nativo do telefone.
- PWA instalável.
- Interface responsiva para Android/desktop.

## Executar
```bash
npm install
npm start
```
Depois abrir `http://localhost:3000`.

## Render
- Build: `npm install`
- Start: `npm start`
- Node: 18+
- Configure as variáveis TURN no ambiente do servidor.

## Nota técnica
Os ficheiros locais continuam no telefone do anfitrião. O WebRTC transmite o conteúdo para o convidado; o YouTube é carregado diretamente pelo navegador de cada utilizador e a aplicação sincroniza o estado.
