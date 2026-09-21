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
