# 2 ON Platform v1.9.0

Plataforma 2 ON para partidas em tempo real, campeonatos entre duas equipas e streaming.

## Campeonato — fluxo normalizado

1. 🏆 **Criar campeonato**
2. 👥 Escolher o número total de jogadores
3. 🎯 Escolher o número de partidas (1–15); a última é a **FINAL**
4. 🅰️ Definir Equipa A
5. 🅱️ Definir Equipa B
6. 🔑 O criador recebe os dois códigos
7. 📲 Cada jogador entra com o código da sua equipa
8. ✅ Quando todas as vagas estiverem preenchidas, o criador inicia
9. 🎮 A primeira partida fica preparada automaticamente
10. 👆 O primeiro toque determina quem começa
11. 🏁 Ao terminar uma partida, a próxima é preparada automaticamente
12. 👀 Jogadores que já terminaram podem assistir às outras partidas como espectadores
13. 💬 O chat do campeonato permanece disponível até ao final
14. 🏆 A última partida é apresentada como FINAL e o resultado fecha o campeonato

## Voz / microfone

- O botão 🎙️ Voz solicita permissão de microfone.
- O áudio usa WebRTC.
- O servidor fornece STUN/TURN em `/ice-servers`.
- Em produção, configure `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL`.
- Em telemóveis, o navegador normalmente exige **HTTPS** para acesso ao microfone.
- O modo espectador não ativa microfone.

## Execução

```bash
npm install
npm start
```

Abrir `http://localhost:3000/`.

## Verificações

```bash
npm run check
npm test
```

Para o teste de integração do campeonato, execute `npm run test:championship` e `npm run test:advanced` com o servidor em execução.

Os testes incluem criação de campeonato, equipas, partidas, transição automática para a próxima partida, espectador e chat persistente.
