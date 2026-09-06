# Assistir Juntos

Site que permite duas pessoas assistirem ao mesmo vídeo em sincronia, cada uma no seu telefone. O vídeo fica no telemóvel de quem cria a sala (anfitrião) e é transmitido em tempo real, via WebRTC, para quem entra na sala (viewer).

## Novidades desta versão

- **Refresh já não perde a sala.** O código/link da sala fica guardado no URL; se a página recarregar (ou a rede cair por instantes), o site reconecta automaticamente à mesma sala em vez de obrigar a criar outra.
  - Exceção inevitável do browser: se o **anfitrião** recarregar a página, tem de escolher o vídeo outra vez (os telemóveis não deixam guardar o ficheiro escolhido entre recarregamentos, por segurança). O site avisa com um banner quando isto acontece.
- **Link partilhável em vez de só código.** Em "A tua sala" há um botão **"Copiar link"** — quem recebe o link só precisa de abrir e já entra automaticamente na sala, sem escrever nada.
- **Código mais fácil de usar:** o campo converte tudo para maiúsculas automaticamente e há um botão **"Colar"** que lê da área de transferência do telemóvel.
- **Reconexão de rede:** quando a ligação oscila (rede móvel instável, mudança de Wi-Fi para dados), o site tenta recuperar a ligação sozinho (`ICE restart`) antes de desistir, e mostra o estado em tempo real ("a rede oscilou, a recuperar...").
- **Caixa de mensagens (chat):** botão flutuante 💬 em ambos os ecrãs para os dois lados trocarem mensagens de texto enquanto veem o vídeo.
- **Interface renovada:** cores, estados de ligação mais claros (a ligar / ligado / erro) e feedback visual em cada ação.

## Como funciona

1. O anfitrião cria uma sala e escolhe um vídeo do telefone.
2. Envia o **link** (ou código) à outra pessoa.
3. Ao abrir o link, a outra pessoa entra automaticamente na sala e a transmissão começa — play, pausa e avanço do anfitrião refletem-se no ecrã da outra pessoa em tempo real.
4. Os dois podem trocar mensagens pelo chat flutuante.

Um pequeno servidor Node.js serve apenas para "apresentar" os dois telefones um ao outro (sinalização WebRTC) e para retransmitir as mensagens de chat; o vídeo em si vai direto de um telefone para o outro.

## Correr localmente

```bash
cd assistir-juntos
npm install
npm start
```

Abre `http://localhost:3000` em dois separadores/telemóveis diferentes.

## Publicar gratuitamente (Render.com)

1. Cria conta grátis em https://render.com
2. Sobe este código a um repositório no GitHub.
3. No Render: **New → Web Service** → liga o repositório.
4. **Build Command:** `npm install` — **Start Command:** `node server.js` (ou `npm start`) — **Plano:** Free.
5. Aguarda o deploy — o link fica visível no topo (ex: `https://assistir-juntos.onrender.com`).

**Nota:** no plano gratuito, o serviço "adormece" após alguns minutos sem uso e demora ~30-60s a acordar no pedido seguinte — isto já é tratado no site (tenta reconectar-se sozinho ao servidor).

## Limitações que continuam a existir

- **Rede muito restritiva:** o TURN gratuito incluído (Open Relay/Metered) ajuda bastante, mas em redes muito bloqueadas a ligação pode continuar difícil. Isto é uma limitação de infraestrutura, não do código.
- **Safari/iOS:** `captureStream()` pode variar de comportamento entre versões do iOS.
- **Direitos de autor:** pensado para uso pessoal entre duas pessoas, não para distribuição pública de conteúdo protegido.

## Estrutura do projeto

```
assistir-juntos/
├── server.js          # servidor Node (Express + WebSocket) — sinalização, reconexão e chat
├── package.json
└── public/
    └── index.html      # interface e lógica do cliente (HTML+CSS+JS)
```
