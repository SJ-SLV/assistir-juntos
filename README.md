# 2 on Streaming

Site para duas pessoas assistirem ao mesmo vídeo/música em sincronia, cada uma no seu telefone, via WebRTC — com chat de texto, chamada de voz, playlists de música/vídeo do telemóvel e do YouTube.

**Nota:** o nome de exibição da app é "2 on Streaming", mas a pasta/repositório continua chamada `assistir-juntos` (o Render e o link já publicado continuam a funcionar sem qualquer alteração — só o que aparece no ecrã mudou).

## Novidades desta versão

- **Barra de ações flutuante em pílula.** Os botões de chamada de voz (🎤) e chat (💬) — antes dois círculos soltos — agora partilham um único invólucro em vidro fosco, inspirado em interfaces modernas de apps de ficheiros/produtividade.

- **Novo modo: 📤 Enviar ficheiro.** Em vez de transmitir o vídeo ao vivo, agora podes enviar o ficheiro por completo para a outra pessoa (transferência direta entre os dois telefones, via `RTCDataChannel` do WebRTC — não passa pelo nosso servidor). Depois de recebido, cada telefone toca a sua própria cópia local, com qualidade perfeita e sem depender da rede a partir daí. Ideal para músicas e vídeos curtos; para filmes inteiros, o modo "📱 Ao vivo" continua a ser melhor (começa a ver de imediato, sem esperar a transferência toda).
  - O ficheiro nunca é gravado no telefone de quem recebe — fica só na memória do browser e desaparece sozinho quando a reprodução termina ou se sai da sala.
  - Barra de progresso em tempo real dos dois lados.
  - Sincronização de play/pausa/avanço, com correção automática de pequenos desvios.

- **Identidade visual nova.** A cor de destaque anterior (`#e50914`) era literalmente a cor da Netflix — trocada por uma paleta própria: azul-noite profundo (`#0b1220`) com um dourado-coral quente (`#ff8a4c → #ffc069`), evocando o brilho do ecrã do telemóvel no escuro. Tipografia também nova — **Space Grotesk** para títulos/marca, **Inter** para o resto — via Google Fonts.
- Ícone da marca trocado de um "play" genérico para dois círculos sobrepostos (o motivo de "duas pessoas, um momento").
- Hierarquia visual mais clara: o cartão de ação principal ("Criar sala") tem um tratamento distinto do secundário, em vez de dois cartões idênticos lado a lado.
- Contraste de texto corrigido em todos os botões/elementos sobre fundo em destaque (a cor mais clara exigia texto escuro, não branco, para cumprir os mínimos de acessibilidade).
- Respeita a preferência do sistema por "reduzir animações" (`prefers-reduced-motion`), e todos os botões têm anel de foco visível ao navegar por teclado.

- **Partilha mais fácil:** botão "📤 Partilhar" (usa o menu nativo do telemóvel — WhatsApp, SMS, etc.) e um **código QR** para a outra pessoa apontar a câmara e entrar direto.
- **Controlo de volume separado:** o viewer pode ajustar o volume do conteúdo (vídeo/música) e da chamada de voz de forma independente. O anfitrião também pode ajustar o volume da chamada recebida.
- **Chat com histórico persistente:** as mensagens já não se perdem ao atualizar a página — ficam guardadas por sala no telemóvel.
- **Reconexão mais robusta:** se o servidor ficar indisponível momentaneamente (ex: o Render "a acordar"), o site tenta ligar-se de novo com esperas crescentes (1s, 2s, 4s... até 10s), em vez de martelar sempre ao mesmo ritmo.
- **Instalável como app:** em telemóveis Android/Chrome, aparece a opção "Adicionar ao ecrã principal" — passa a abrir como uma app normal, com ícone próprio.
- **A sala não se perde ao atualizar a página.** Antes bastava recarregar; agora a sessão fica guardada no telemóvel (mesmo sem link nem código à mão) e só termina se tocares em **"🚪 Sair da sala"**, ou se a outra pessoa saiu e não voltou dentro do tempo de tolerância. Podes atualizar a página as vezes que quiseres sem perder o lugar na sala.
- **Playlists.** Tanto para música/vídeo do telemóvel como para o YouTube, o anfitrião pode agora adicionar vários ficheiros/links de seguida, reordenar (↑↓), tocar um item específico, remover, e a reprodução avança automaticamente para o próximo quando um termina.
- **Leitor melhorado.** Para música (do telemóvel), há uma barra de reprodução própria — título da faixa, barra de progresso arrastável, tempo atual/total, play/pausa, anterior/seguinte. Para YouTube, o título de cada vídeo é obtido automaticamente, e há botões de anterior/seguinte para navegar na fila.
- **Sincronização do YouTube mais robusta.** Além do botão manual "Sincronizar agora", agora há uma verificação automática a cada poucos segundos que corrige pequenos desvios sem interromper a reprodução.

## Os 3 modos de partilha

No ecrã do anfitrião há três separadores:

- **📱 Ao vivo** — transmite o vídeo/música do telemóvel em tempo real (P2P, via WebRTC). Aceita vídeo e áudio, dá para criar uma playlist com vários ficheiros de uma vez. Começa a ver de imediato — ideal para vídeos grandes.
- **📤 Enviar** — envia o ficheiro por completo para a outra pessoa (ver secção acima). Ideal para músicas e vídeos curtos.
- **▶️ YouTube** — cola o link (ou só o código) de um vídeo ou música do YouTube e toca em "Adicionar". **Importante: isto funciona de forma diferente dos outros dois modos** — não há transmissão P2P nem transferência; cada telefone carrega o vídeo diretamente do YouTube, e nós só sincronizamos play/pausa/avanço entre os dois. Isto tem até vantagens: não depende do TURN, não gasta dados a "reenviar" vídeo, e a qualidade é a mesma que terias a ver o YouTube normalmente.

Em qualquer um dos modos, qualquer um dos dois lados pode dar play/pausa — sincroniza automaticamente para o outro. As playlists (do telemóvel e do YouTube) são geridas pelo **anfitrião** — é quem tem os ficheiros/escolhe os links. A pessoa do outro lado vê sempre o que está a tocar.

## Chamada de voz (microfone)

Além do chat de texto (SMS), há um botão flutuante **🎤** (canto inferior esquerdo) em ambos os ecrãs:

- Ao tocar pela primeira vez, o telemóvel pede permissão para usar o microfone.
- Depois de aceitar, o áudio do microfone passa a ser enviado ao vivo para a outra pessoa (chamada de voz durante o vídeo).
- Toques seguintes no botão silenciam/ativam o microfone (🎙️ = ativo, 🔇 = mudo).
- Cada lado ativa o microfone de forma independente — não é preciso os dois ativarem ao mesmo tempo.
- Se o áudio da chamada não tocar automaticamente (comum em telemóveis por restrições do browser), aparece um botão "🔊 Ativar áudio da chamada" — basta tocar uma vez.

Tecnicamente, isto usa a mesma ligação WebRTC que já transmite o vídeo, apenas com uma faixa de áudio adicional bidirecional — não precisa de nenhum servidor extra.

**Nota:** se usares música do telemóvel (não vídeo) e chamada de voz ao mesmo tempo, pode haver conflito no áudio recebido do outro lado — é uma limitação conhecida desta versão, por afetar poucos casos de uso reais.

## Recapitulando as funcionalidades

- **Vídeo/música em sincronia:** o anfitrião escolhe um ficheiro do telefone (vídeo ou áudio) ou um link do YouTube, e é sincronizado com a outra pessoa.
- **Link partilhável:** botão "Copiar link" para a outra pessoa entrar sem escrever código.
- **Reconexão automática:** refresh de página ou queda de rede não obriga a criar sala nova.
- **TURN fiável (opcional, recomendado):** configura `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL` nas variáveis de ambiente do Render para ligações mais estáveis (ver secção abaixo).
- **Chat de texto:** botão flutuante 💬.
- **Chamada de voz:** botão flutuante 🎤.
- **YouTube em sincronia:** vídeos e música do YouTube, com play/pausa sincronizados.

## TURN fiável (Metered) — recomendado

Já vais precisar disto ativo, porque configuraste uma credencial TURN. No Render:

1. Vai ao teu serviço → separador **Environment**.
2. Adiciona:
   - `METERED_TURN_USERNAME` = `55ac5a01892e44b0a89f3388`
   - `METERED_TURN_CREDENTIAL` = `eKohXOnTnDqTa5/h`
3. Guarda — o Render reinicia sozinho e passa a usar este TURN fiável.

Sem isto, o site usa um TURN de reserva público, menos fiável em algumas redes móveis.

## Correr localmente

```bash
cd assistir-juntos
npm install
npm start
```

## Publicar gratuitamente (Render.com)

1. Conta grátis em https://render.com
2. Sobe este código a um repositório no GitHub.
3. No Render: **New → Web Service** → liga o repositório.
4. **Build Command:** `npm install` — **Start Command:** `node server.js` — **Plano:** Free.

## Limitações

- Redes muito restritivas podem continuar difíceis mesmo com TURN.
- `captureStream()` pode variar entre versões do Safari/iOS.
- Pensado para uso pessoal entre duas pessoas, não distribuição de conteúdo protegido.

## Estrutura do projeto

```
assistir-juntos/
├── server.js          # servidor Node — sinalização, chat, credenciais TURN
├── package.json
└── public/
    └── index.html      # interface e lógica do cliente (vídeo + voz + chat)
```
