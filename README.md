# Assistir Juntos 2.2

Versão 2.2 focada em continuidade de sessão e uma interface mais limpa e humana.

## Novidades
- A sala é restaurada automaticamente depois de atualizar a página.
- Reconexão automática do WebSocket e tentativa de reentrada na sala.
- A sessão só é apagada quando o utilizador escolhe sair ou quando a sala expira.
- Janela de tolerância de 5 minutos para uma desconexão temporária.
- Interface redesenhada: menos efeitos, menos gradientes, tipografia mais discreta, espaçamento consistente e aparência de produto real.
- Playlist do YouTube guardada localmente por sala.
- Link `?room=XXXXX` continua a permitir entrar numa sala partilhada.
- Manifest/PWA ajustado para abrir a aplicação pela raiz.

## Nota importante
Vídeos e músicas escolhidos diretamente do telefone não podem ser recuperados automaticamente apenas com localStorage depois de um refresh. Nesta versão a sala é restaurada, mas os ficheiros locais precisam ser selecionados novamente. A próxima etapa pode usar IndexedDB para guardar ficheiros locais de forma persistente.

## Executar
```bash
npm install
npm start
```

O servidor usa a variável `PORT` quando disponível. Para produção, configure as credenciais TURN através das variáveis de ambiente `METERED_TURN_USERNAME` e `METERED_TURN_CREDENTIAL`.
