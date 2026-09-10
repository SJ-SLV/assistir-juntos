# Assistir Juntos — versão profissional

Plataforma web para duas pessoas assistirem ao mesmo vídeo, música ou conteúdo do YouTube em sincronia, cada uma no seu telefone. A aplicação usa WebSocket para sinalização e WebRTC para a comunicação P2P.

## O que foi melhorado

- Reconexão automática com backoff e recuperação após refresh/queda de rede.
- WebSocket protegido contra envio quando a ligação está fechada.
- Heartbeat do servidor para limpar ligações mortas.
- Limpeza automática de salas abandonadas e limite de salas em memória.
- Validação de mensagens e limite de tamanho/rate limit básico.
- Endpoint `/health` e `/api/health` para monitorização/Render.
- Headers HTTP de segurança e cache controlado.
- Fila de candidatos ICE no cliente para evitar perda de candidatos durante a negociação.
- Melhor monitorização da ligação WebRTC.
- Service Worker com cache apenas do shell da aplicação; sinalização, saúde e ICE continuam sempre em rede.
- PWA com manifest melhorado e ícone incluído.
- Dependências atualizadas para versões estáveis da linha usada pelo projeto.

## Funcionalidades

- Sala privada de 5 caracteres.
- Link partilhável e QR Code.
- Vídeos e músicas do telefone via WebRTC.
- Playlist local.
- YouTube com sincronização de play/pausa/posição.
- Chat de texto com histórico local.
- Chamada de voz via WebRTC.
- Controlo separado do volume de conteúdo e chamada.
- Recuperação da sessão depois de atualizar a página.

## Estrutura

```text
assistir-juntos/
├── server.js
├── package.json
├── README.md
└── public/
    ├── index.html
    ├── manifest.json
    ├── sw.js
    └── icon.svg
```

## Instalação local

```bash
npm install
npm run check
npm start
```

Depois abre `http://localhost:3000`.

## Render

- **Build Command:** `npm install`
- **Start Command:** `node server.js`
- O Render fornece automaticamente `PORT`.
- O serviço expõe `GET /health` para health checks.

### TURN recomendado

No Render, configura estas variáveis:

```text
METERED_TURN_USERNAME=...
METERED_TURN_CREDENTIAL=...
```

Não coloques credenciais TURN reais no GitHub, README ou código-fonte. O servidor entrega-as ao navegador apenas através de `/ice-servers`.

## Variáveis opcionais

```text
PORT=3000
GRACE_MS=45000
ROOM_TTL_MS=21600000
MAX_ROOMS=5000
```

## Limitações técnicas

- A reprodução P2P de ficheiros locais depende das capacidades WebRTC do navegador.
- Safari/iOS pode apresentar diferenças em `captureStream()`.
- A PWA precisa de rede para salas, sinalização e conteúdo remoto.
- O projeto foi desenhado para duas pessoas por sala.
- Conteúdo do YouTube é carregado diretamente pelo YouTube; a aplicação sincroniza o estado de reprodução.
- O projeto não deve ser usado para redistribuir conteúdo protegido sem autorização.

## Segurança e estabilidade

O servidor não guarda os ficheiros de vídeo dos utilizadores. Os ficheiros locais são selecionados no navegador e transmitidos através do WebRTC. As salas vivem em memória e são eliminadas quando ficam abandonadas.

Para produção, recomenda-se usar HTTPS/WSS no domínio público, configurar TURN próprio e acompanhar `/health` através do sistema de monitorização do alojamento.


## Modo Ficheiro P2P (novo)

O modo **Do telemóvel** usa WebRTC DataChannel para transferir o ficheiro diretamente entre os dois dispositivos, quando a rede permite. O servidor participa apenas na sinalização WebSocket; o vídeo/áudio não é enviado através do servidor.

### Fluxo
1. O anfitrião escolhe um vídeo ou áudio.
2. O ficheiro é dividido em blocos de 64 KB.
3. Os blocos são enviados pelo DataChannel com controlo de backpressure.
4. O dispositivo convidado guarda temporariamente os blocos em IndexedDB, reconstrói o Blob e começa a reprodução local.
5. O anfitrião envia eventos leves de `play`, `pause` e `seek`, mantendo as duas reproduções sincronizadas.
6. Ao terminar, o conteúdo temporário recebido é removido e o Object URL é revogado.

### Importante
- A transferência P2P não elimina a necessidade de Internet/rede para estabelecer a ligação WebRTC.
- TURN é importante em redes móveis/NAT mais restritivas. Configure `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL` no Render para melhorar a conectividade.
- O limite atual do cliente é 1,5 GB por ficheiro.
- O navegador controla o armazenamento temporário; a aplicação não tenta apagar ficheiros arbitrários do armazenamento do telefone.
- O modo YouTube continua a usar a sincronização online normal.
