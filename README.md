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
