import asyncio,json,time,urllib.request,websockets
BASE='http://127.0.0.1:3110'
def req(path,method='GET',body=None):
 d=None;h={}
 if body is not None:d=json.dumps(body).encode();h['Content-Type']='application/json'
 r=urllib.request.Request(BASE+path,data=d,headers=h,method=method)
 with urllib.request.urlopen(r,timeout=3) as x:return x.status,json.loads(x.read())
async def recv(ws,typ,timeout=3):
 while True:
  m=json.loads(await asyncio.wait_for(ws.recv(),timeout))
  if m.get('type')==typ:return m
async def state_after(ws,count):
 while True:
  m=json.loads(await asyncio.wait_for(ws.recv(),3))
  if m.get('type')=='game-state' and sum(1 for x in m['state']['board'] if x) >= count:return m
async def main():
 ts=str(int(time.time()*1000)); ids=[f'p{i}_{ts}' for i in range(4)]
 st,c=req('/api/games/championships','POST',{'name':'ADV','participantCount':4,'plannedMatches':2,'teamAName':'Alpha','teamBName':'Beta','ownerName':'A1','ownerPlayerId':ids[0]});assert st==201
 cup=c['championship']; ca=cup['teams'][0]['joinCode']; cb=cup['teams'][1]['joinCode']
 # A2 joins A, B1/B2 join B
 assert req('/api/games/championships/join','POST',{'code':ca,'name':'A2','playerId':ids[1]})[0]==201
 assert req('/api/games/championships/join','POST',{'code':cb,'name':'B1','playerId':ids[2]})[0]==201
 assert req('/api/games/championships/join','POST',{'code':cb,'name':'B2','playerId':ids[3]})[0]==201
 st,s=req(f"/api/games/championships/{cup['id']}/start",'POST',{'playerId':ids[0]});assert st==200
 f1=s['championship']['fixtures'][0]; f2=s['championship']['fixtures'][1]; assert f1['status']=='playing' and f2['status']=='scheduled'
 async with websockets.connect('ws://127.0.0.1:3110') as a1,websockets.connect('ws://127.0.0.1:3110') as b1,websockets.connect('ws://127.0.0.1:3110') as a2,websockets.connect('ws://127.0.0.1:3110') as b2,websockets.connect('ws://127.0.0.1:3110') as spectator:
  await a1.send(json.dumps({'type':'game-join','roomCode':f1['roomCode'],'name':'A1','playerId':ids[0]}));assert (await recv(a1,'game-joined'))['symbol']=='X';
  while True:
   try:
    m=json.loads(await asyncio.wait_for(a1.recv(),.05))
   except: break
  await b1.send(json.dumps({'type':'game-join','roomCode':f1['roomCode'],'name':'B1','playerId':ids[2]}));assert (await recv(b1,'game-joined'))['symbol']=='O';
  while True:
   try:
    m=json.loads(await asyncio.wait_for(b1.recv(),.05))
   except: break
  # finish f1 sequentially
  for sock,other,cell,count in [(a1,b1,0,1),(b1,a1,3,2),(a1,b1,1,3),(b1,a1,4,4)]:
   await sock.send(json.dumps({'type':'game-move','cell':cell})); await state_after(other,count)
  await a1.send(json.dumps({'type':'game-move','cell':2})); await recv(a1,'game-state')
  # f2 is prepared automatically
  for _ in range(10):
   st,c2=req(f"/api/games/championships/{cup['id']}?playerId={ids[0]}");
   if c2['championship']['fixtures'][1]['status']=='playing': break
   await asyncio.sleep(.1)
  st,c2=req(f"/api/games/championships/{cup['id']}?playerId={ids[0]}"); cup2=c2['championship']; f2=cup2['fixtures'][1]; assert f2['status']=='playing' and f2['roomCode']
  await a2.send(json.dumps({'type':'game-join','roomCode':f2['roomCode'],'name':'A2','playerId':ids[1]}));assert (await recv(a2,'game-joined'))['symbol']=='X'
  await b2.send(json.dumps({'type':'game-join','roomCode':f2['roomCode'],'name':'B2','playerId':ids[3]}));assert (await recv(b2,'game-joined'))['symbol']=='O'
  # A1 spectates f2
  await spectator.send(json.dumps({'type':'game-join','roomCode':f2['roomCode'],'name':'A1','playerId':ids[0]}));sj=await recv(spectator,'game-joined');assert sj.get('spectator') is True
  await a2.send(json.dumps({'type':'game-chat','text':'Boa sorte','name':'A2'})); msg=await recv(spectator,'championship-chat');assert msg['message']['text']=='Boa sorte'
  # spectator cannot move
  await spectator.send(json.dumps({'type':'game-move','cell':0}));err=await recv(spectator,'game-error');assert 'espectador' in err['message'].lower()
  print('ADVANCED CHAMPIONSHIP PASSED')
asyncio.run(main())
