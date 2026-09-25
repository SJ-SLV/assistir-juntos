'use strict';
const fs=require('fs'), vm=require('vm'), path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const match=source.match(/function createChampionshipFixtures\(c\)\{[\s\S]*?\n\}/);
if(!match)throw new Error('createChampionshipFixtures não encontrado');
const context={makeId:(p)=>`${p}_${Math.random().toString(16).slice(2)}`};
vm.createContext(context); vm.runInContext(match[0]+';this.createChampionshipFixtures=createChampionshipFixtures;',context);
const players=n=>Array.from({length:n},(_,i)=>({playerId:`p${i+1}`,name:`P${i+1}`}));
const c={plannedMatches:6,gameType:'rps',teams:[{id:'A',players:players(3)},{id:'B',players:players(2)}]};
const fx=context.createChampionshipFixtures(c);
if(fx.length!==6)throw new Error(`Esperadas 6 fixtures, obtidas ${fx.length}`);
const seen=new Set();
for(const f of fx){const key=f.homePlayerId+'|'+f.awayPlayerId;if(seen.has(key))throw new Error('Confronto repetido antes de percorrer todas as combinações: '+key);seen.add(key)}
console.log('SCHEDULER SMOKE PASSED');
