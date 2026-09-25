# 2 ON Platform 2.8.2 — Auditoria final da versão entregue

Data da auditoria: 25/09/2026

## Escopo

Auditoria do mesmo código que compõe o pacote 2.8.2, cobrindo Games, campeonatos, chat, sessões, WebSocket, Streaming, QR, headers e testes estáticos.

## Correções implementadas nesta versão

1. **Privacidade do chat**
   - `playerId` interno deixou de ser enviado nas mensagens públicas de chat.
   - As mensagens recebidas pelo cliente usam `isMe` relativo ao destinatário.
   - Histórico global, histórico de campeonato e histórico de equipa são sanitizados.
   - O servidor continua a manter `playerId` internamente para autorização e persistência.

2. **QR Code sem serviço externo**
   - Removido o fallback para `api.qrserver.com`.
   - Games utiliza a biblioteca QR local servida pelo próprio servidor.
   - Streaming utiliza a mesma biblioteca local e gera o QR no próprio dispositivo.
   - Se a dependência QR não estiver instalada, a aplicação informa o utilizador em vez de enviar dados para um terceiro.

3. **Rate limiting**
   - Mantido o limite de criação/renovação de sessões.
   - Adicionado limite ao endpoint de perfil próprio.
   - Mantidos limites para operações sensíveis dos campeonatos e chat.

4. **Autorização e identidade**
   - A identidade continua derivada da sessão autenticada.
   - O proprietário de campeonato é validado no servidor.
   - A reconexão do Streaming continua vinculada a `hostPlayerId`/`viewerPlayerId`.

5. **API pública**
   - Respostas públicas de campeonatos não expõem IDs internos de jogadores.
   - Fixtures utilizam `homeIsMe`/`awayIsMe`.
   - Perfis usam `/api/games/profile/me`.

## Testes executados nesta mesma versão

```text
node --check server.js                    OK
node --check public/games.js              OK
STATIC SMOKE 2.8.2 PASSED
RPS LOGIC SMOKE PASSED
SCHEDULER SMOKE PASSED
SECURITY SMOKE 2.8.2 PASSED
PRIVACY/QR SMOKE 2.8.2 PASSED
```

## Verificações específicas

- Não foi encontrado `api.qrserver.com` nos ficheiros ativos.
- O cliente de Games não utiliza `playerId` para determinar se uma mensagem pública é do próprio utilizador; utiliza `isMe`.
- O chat público é sanitizado por destinatário no servidor.
- O Streaming carrega a biblioteca QR local em `/vendor/qrcode.min.js`.
- O projeto não contém referências ativas às versões 2.8.0/2.8.1 nem à marca antiga “Streng”.

## Limitações de validação

### Não foi possível concluir `npm install`

A instalação das dependências excedeu o tempo limite deste ambiente. As dependências não estão disponíveis localmente nesta cópia, portanto não foi possível executar o servidor real através de `npm start` neste ambiente.

### Teste físico não realizado

Não houve teste físico com dois telefones/redes móveis reais. Assim, WebRTC, TURN, permissões de microfone, NAT móvel, reconexão real e comportamento de PWA não podem ser declarados fisicamente validados.

## Estado técnico

A versão está **validada por análise de código, verificação de sintaxe e testes smoke disponíveis**. Ela está preparada para execução com:

```bash
npm install
npm test
npm start
```

Para produção, recomenda-se configurar HTTPS/WSS e credenciais TURN próprias.

## Conclusão

Os pontos encontrados na auditoria 2.8.1 foram corrigidos nesta versão, principalmente o vazamento de identificadores internos no chat e o fallback QR externo. Não foram identificados novos bloqueadores críticos na análise estática realizada.

A expressão “100% operacional” deve ser entendida como **código completo e verificável no ambiente de desenvolvimento**, não como garantia de funcionamento em todas as redes, browsers e dispositivos físicos, porque essa parte exige teste externo real.
