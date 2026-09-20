# 2 on Streaming

Duas pessoas, dois telefones, o mesmo vídeo/música/YouTube ao mesmo tempo — com chat, chamada de voz e reações.

## O que esta versão junta

Esta é uma versão consolidada: a base robusta e testada ao longo do projeto (WebRTC P2P, YouTube sincronizado, transferência de ficheiros, playlists, sessão persistente, ícones SVG próprios, identidade visual sem gradientes/emoji) **+** um conjunto de funcionalidades novas:

- **Nomes e avatares.** Cada pessoa identifica-se com um nome ao criar/entrar na sessão; o nome e a inicial aparecem no cartão da sessão.
- **Reações.** Seis emoji de reação rápida — aparecem a flutuar no ecrã dos dois lados.
- **Indicador de latência.** Mede o tempo de ida e volta ao servidor a cada 5s (verde = boa, vermelho = fraca).
- **Indicador "a escrever...".** Aparece no chat quando a outra pessoa está a escrever.
- **Recuar/Avançar 10s e ecrã inteiro** nos controlos de vídeo.
- **Grelha de opções em 2 colunas**, com um fundo colorido próprio por categoria (roxo para playlist, azul para áudio/conectados, vermelho para YouTube/sair, laranja para enviar, verde-água para mensagens) — inspirada num mockup fornecido, mantendo a identidade escura já construída.
- **Novo ecrã de boas-vindas**, antes do ecrã de criar/entrar — ícone grande "2·ON", e duas opções ("Criar sessão" / "Entrar com código"), inspirado num mockup fornecido, com as nossas cores.
- **Servidor mais robusto:** limite de mensagens por segundo (evita flood), limpeza automática de salas abandonadas há mais de 6h, nomes/mensagens filtrados de caracteres perigosos, endpoint `/health` para monitorização.

## Arquitetura

```
2-on-streaming/
├── server.js          # sinalização WebRTC + salas + chat/reações (Node + Express + ws)
├── package.json
└── public/
    ├── index.html      # toda a interface e lógica do cliente
    ├── manifest.json   # PWA (instalável no ecrã principal)
    ├── sw.js           # service worker mínimo
    └── icon.png        # ícone da app
```

O servidor nunca transporta vídeo — só ajuda os dois telefones a encontrarem-se (sinalização) e retransmite mensagens pequenas (chat, reações, comandos de sincronização do YouTube).

## TURN fiável (recomendado)

Configura estas variáveis de ambiente no Render, usando uma conta grátis em [dashboard.metered.ca](https://dashboard.metered.ca):

- `METERED_TURN_USERNAME`
- `METERED_TURN_CREDENTIAL`

Sem isto, usa um TURN de reserva público, menos fiável em algumas redes móveis.

## Publicar gratuitamente (Render.com)

1. Sobe este código a um repositório no GitHub.
2. No Render: **New → Web Service** → liga o repositório.
3. **Build Command:** `npm install` — **Start Command:** `node server.js` — **Plano:** Free.
4. (Opcional) Configura as variáveis do TURN acima.

## Correr localmente

```bash
npm install
npm start
```

Abre `http://localhost:3000`.

## Limitações conhecidas

- Ficheiros do telemóvel não sobrevivem a um refresh da página (limitação de segurança dos browsers) — a playlist local tem de ser reconstruída.
- Transferência de ficheiro completo ("📤 Enviar") funciona melhor para músicas e vídeos curtos; para filmes inteiros o modo "Ao vivo" continua a ser mais rápido a começar.
- Modo "cinema/teatro" (esconder tudo exceto o vídeo) ainda não está implementado — fica como sugestão para uma próxima fase.


## Sala 5.1 — melhorias de experiência
- Barra rápida dentro da sala para **Mensagens, Microfone, Áudio e Controlos**.
- Mensagens ficam acessíveis diretamente no painel, com indicador de novas mensagens.
- Controlos de áudio separados para conteúdo e chamada, com ativação manual quando o navegador bloqueia autoplay.
- **Pedir controlo** para o participante e confirmação no lado do anfitrião.
- Layout de sala mais compacto e profissional em telemóveis, com área de vídeo, estado da ligação e ações principais organizadas.
- A lógica WebRTC/WebSocket existente foi preservada.
