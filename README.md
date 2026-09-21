# 2-ON Streaming 5.3

Versão profissional com painel de sessão separado por papel.

## 5.3 — Painel do convidado
- “Controlos da sessão” aparece exclusivamente no lado do convidado.
- O convidado tem Mensagens, Microfone, Áudio e Pedido de controlo no mesmo painel.
- Ao pedir controlo, o estado muda para “Pedido enviado” e o anfitrião recebe o pedido para aceitar ou recusar.
- O anfitrião não recebe o painel de pedido de controlo como ferramenta própria; recebe apenas a notificação de autorização.
- Layout responsivo: 4 ações em ecrãs maiores e 2x2 em telemóveis estreitos.

## Executar
```bash
npm install
npm start
```
Depois abrir `http://localhost:3000`.


## Correção 5.3 — painel do convidado

O painel “Controlos da sessão” foi colocado dentro do ecrã real do convidado (`screen-viewer`). Ele fica visível assim que o convidado entra na sala. O botão “Pedir controlo” envia o pedido ao anfitrião; depois de aceite, o painel muda para “Controlo ativo”.
