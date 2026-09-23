import asyncio, json, time, urllib.request
import websockets
BASE='http://127.0.0.1:3108'
def req(path, method='GET', body=None):
    data=None; headers={}
    if body is not None:
        data=json.dumps(body).encode(); headers['Content-Type']='application/json'
    r=urllib.request.Request(BASE+path,data=data,headers=headers,method=method)
    with urllib.request.urlopen(r,timeout=3) as x:return x.status,json.loads(x.read())
async def recv_type(ws,typ,timeout=3):
    while True:
        m=json.loads(await asyncio.wait_for(ws.recv(),timeout));
        if m.get('type')==typ:return m
async def recv_state(ws, predicate, timeout=3):
    while True:
        m=json.loads(await asyncio.wait_for(ws.recv(),timeout));
        if m.get('type')=='game-state' and predicate(m['state']):return m
async def main():
    status,_=req('/health');assert status==200
    ts=str(int(time.time()*1000)); owner='owner_'+ts; b='b_'+ts
    st,c=req('/api/games/championships','POST',{'name':'E2E','participantCount':2,'teamAName':'Alpha','teamBName':'Beta','ownerName':'Owner','ownerPlayerId':owner});assert st==201
    cup=c['championship']; codeb=cup['teams'][1]['joinCode'];
    st,j=req('/api/games/championships/join','POST',{'code':codeb,'name':'Beta','playerId':b});assert st==201
    st,s=req(f"/api/games/championships/{cup['id']}/start",'POST',{'playerId':owner});assert st==200
    f=s['championship']['fixtures'][0];assert f['roomCode'] and f['status']=='playing'
    async with websockets.connect('ws://127.0.0.1:3108') as a, websockets.connect('ws://127.0.0.1:3108') as o:
        await a.send(json.dumps({'type':'game-join','roomCode':f['roomCode'],'name':'Owner','playerId':owner,'teamName':'Alpha'}));ma=await recv_type(a,'game-joined');assert ma['symbol']=='X'
        await o.send(json.dumps({'type':'game-join','roomCode':f['roomCode'],'name':'Beta','playerId':b,'teamName':'Beta'}));mo=await recv_type(o,'game-joined');assert mo['symbol']=='O'
        moves=[(a,{'type':'game-move','cell':0},o,1),(o,{'type':'game-move','cell':3},a,2),(a,{'type':'game-move','cell':1},o,3),(o,{'type':'game-move','cell':4},a,4)]
        for sock,msg,other,count in moves:
            await sock.send(json.dumps(msg)); await recv_state(other,lambda st,c=count: sum(1 for x in st['board'] if x) >= c)
        await a.send(json.dumps({'type':'game-move','cell':2})); final=await recv_state(a,lambda st: st['winner']=='X'); assert final['state']['winner']=='X'
    st,after=req(f"/api/games/championships/{cup['id']}?playerId={owner}");assert after['championship']['fixtures'][0]['status']=='finished'
    print('CHAMPIONSHIP E2E PASSED')
asyncio.run(main())
