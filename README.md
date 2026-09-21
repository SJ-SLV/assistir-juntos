# 2-ON Streaming 5.4

Versão com pedido de controlo operacional entre convidado e anfitrião.

## Fluxo do pedido de controlo

1. O convidado toca em **Pedir controlo**.
2. O servidor encaminha o pedido diretamente ao anfitrião.
3. No painel do anfitrião aparece **Pedido de controlo**, com o nome do convidado e os botões **Permitir** e **Agora não**.
4. O botão **Controlos** do anfitrião recebe um badge `1` enquanto existe um pedido pendente.
5. Ao permitir, o convidado recebe **Controlo ativo**.
6. Ao recusar, o convidado recebe a informação de que o pedido não foi autorizado.

A sinalização usa WebSocket; vídeo/áudio continuam a usar a arquitetura WebRTC existente.

## Executar

```bash
npm install
npm start
```

Abrir `http://localhost:3000`.


## 5.5 — Permissão de controlo e partilha pelo convidado

- O convidado informa o nome antes de entrar na sessão.
- O convidado pode pedir autorização ao anfitrião.
- O anfitrião recebe um pedido visível com Permitir / Agora não.
- A autorização é controlada pelo servidor: comandos de reprodução enviados pelo convidado só são encaminhados quando a autorização está ativa.
- O anfitrião pode retirar o acesso posteriormente.
- Depois da autorização, o convidado pode controlar reprodução e enviar vídeo/música do próprio telefone pelo canal P2P de dados, além de abrir conteúdo do YouTube para a sessão.
- O painel foi reorganizado para separar volume/áudio (sempre locais) de reprodução/partilha (dependentes de autorização).


## Versão 5.6 — normalização e correções
- Validação obrigatória do nome antes de criar/entrar numa sessão.
- Pedido de controlo com estado único no servidor: pendente, autorizado, recusado ou revogado.
- O servidor impede pedidos duplicados e comandos de reprodução do convidado sem autorização.
- Cliente com envio WebSocket protegido por estado de ligação.
- Removido código redundante/no-op do painel do convidado.
- Painéis e permissões separados por papel (anfitrião/convidado).
- Verificação de sintaxe do cliente e servidor e verificação de IDs HTML duplicados.

### Nota de execução
Execute `npm install` antes de `npm start`. A validação local desta entrega confirma a sintaxe; a execução HTTP não foi concluída neste ambiente porque as dependências npm não estavam instaladas e a instalação excedeu o tempo disponível.


## 5.7 — revisão lógica e estrutural

- Validação do fluxo de WebSocket antes de criar/entrar/sair da sessão.
- Reconexão WebSocket com proteção contra tentativas duplicadas.
- Estado de autorização do convidado reiniciado de forma consistente em saída/reentrada.
- Sincronização explícita para ficheiro, transferência e YouTube.
- Proteção contra espera indefinida durante transferência de ficheiros.
- Tratamento seguro de mensagens JSON inválidas no WebSocket e no canal de ficheiros.
- Referências do ícone corrigidas para `icon.svg`.
- Service Worker atualizado para limpar versões antigas e manter o shell da PWA disponível.
- Servidor impede criar/entrar numa nova sala enquanto a ligação atual ainda está associada a uma sala válida.
