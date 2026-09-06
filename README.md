# Assistir Juntos

Site que permite duas pessoas assistirem ao mesmo vídeo em sincronia, cada uma no seu telefone. O vídeo fica no telemóvel de quem cria a sala (anfitrião) e é transmitido em tempo real, via WebRTC, para quem entra na sala (viewer).

## Como funciona

1. O anfitrião abre o site, carrega **Criar sala** e recebe um código de 5 letras.
2. O anfitrião escolhe um vídeo do telefone (ficheiro local).
3. A outra pessoa abre o mesmo site noutro telefone, escolhe **Entrar numa sala** e introduz o código.
4. É estabelecida uma ligação direta (peer-to-peer) entre os dois telefones e o vídeo do anfitrião passa a ser transmitido ao vivo para o viewer — play, pausa e avanço do anfitrião refletem-se automaticamente no ecrã do viewer, porque este está a ver a transmissão em tempo real, não uma cópia à parte.

Um pequeno servidor Node.js serve apenas para "apresentar" os dois telefones um ao outro (sinalização WebRTC); depois disso, o vídeo não passa pelo servidor.

## Correr localmente (para testar no computador antes de publicar)

```bash
cd assistir-juntos
npm install
npm start
```

Abre `http://localhost:3000` em dois separadores/telemóveis diferentes (na mesma rede Wi-Fi, usa o IP do computador em vez de `localhost`).

## Publicar gratuitamente (para os dois telefones se ligarem pela internet)

Recomendo o **Render.com** (tem plano gratuito e suporta WebSocket, necessário para a sinalização):

1. Cria uma conta grátis em https://render.com
2. Cria um repositório no GitHub com esta pasta e faz push do código.
3. No Render, escolhe **New → Web Service**, liga o teu repositório GitHub.
4. Configuração:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plano:** Free
5. Depois do deploy, vais ter um link tipo `https://assistir-juntos.onrender.com` — é esse link que os dois telefones abrem.

**Nota sobre o plano gratuito do Render:** o serviço "adormece" após alguns minutos sem uso e demora ~30-60 segundos a "acordar" no primeiro pedido. Para uso pessoal entre duas pessoas isto é aceitável.

Alternativas gratuitas com suporte a WebSocket: **Glitch**, **Railway** (tem horas grátis limitadas por mês).

## Limitações a ter em conta

- **Ligação direta (P2P):** na maioria das redes funciona bem, mas em redes muito restritivas (algumas redes móveis/corporativas) pode falhar. O código já inclui um servidor TURN gratuito público (Open Relay/Metered) como intermediário de emergência — é limitado (20 GB/mês partilhados por todos os utilizadores do serviço), suficiente para uso pessoal ocasional. Se usares muito, cria credenciais próprias grátis em https://dashboard.metered.ca.
- **Safari/iOS:** a captura do vídeo (`captureStream`) pode ter comportamento inconsistente nalgumas versões do iOS — vale testar no telemóvel real desde já.
- **Direitos de autor:** este sistema é pensado para uso pessoal entre duas pessoas (como assistir juntos ao mesmo telefone), não para distribuição pública de conteúdo com direitos de autor.
- Não há reencriptação/gravação em servidor — o vídeo vai direto de um telefone para o outro.

## Estrutura do projeto

```
assistir-juntos/
├── server.js          # servidor Node (Express + WebSocket) — sinalização
├── package.json
└── public/
    └── index.html      # toda a interface e lógica do cliente (HTML+CSS+JS)
```
