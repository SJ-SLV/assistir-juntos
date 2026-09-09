# Assistir Juntos

Site para duas pessoas assistirem ao mesmo vídeo em sincronia, cada uma no seu telefone, via WebRTC — com chat de texto, chamada de voz, música do telemóvel e vídeos/música do YouTube.

## Novidade: YouTube e música do telemóvel

No ecrã do anfitrião há agora dois separadores:

- **📱 Do telemóvel** (como já existia) — agora também aceita **ficheiros de áudio** (música), não só vídeo. Se escolheres um ficheiro de música, aparece um leitor simples em vez do vídeo.
- **▶️ YouTube** — cola o link (ou só o código) de um vídeo ou música do YouTube e toca em "Carregar". **Importante: isto funciona de forma diferente do vídeo do telemóvel** — não há transmissão P2P; cada telefone carrega o vídeo diretamente do YouTube, e nós só sincronizamos play/pausa/avanço entre os dois. Isto tem até vantagens: não depende do TURN, não gasta dados a "reenviar" vídeo, e a qualidade é a mesma que terias a ver o YouTube normalmente.
  - Qualquer um dos dois lados pode dar play/pausa — sincroniza automaticamente para o outro.
  - Se a sincronia desviar (ex: um teve de recarregar a página), há um botão **"🔄 Sincronizar agora"** que força os dois a ficarem no mesmo ponto.

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
