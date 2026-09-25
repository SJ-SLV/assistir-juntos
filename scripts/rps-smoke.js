'use strict';
const fs=require('fs');
const vm=require('vm');
const path=require('path');
const source=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const match=source.match(/function rpsOutcome\(a,b\)\{[\s\S]*?\n\}/);
if(!match)throw new Error('rpsOutcome não encontrado no servidor.');
const context={};
vm.createContext(context);
vm.runInContext(match[0]+'; this.rpsOutcome=rpsOutcome;',context);
const r=context.rpsOutcome;
const cases=[
  ['rock','scissors','X'],['scissors','paper','X'],['paper','rock','X'],
  ['scissors','rock','O'],['paper','scissors','O'],['rock','paper','O'],
  ['rock','rock','draw'],['paper','paper','draw'],['scissors','scissors','draw']
];
for(const [a,b,expected] of cases){const got=r(a,b);if(got!==expected)throw new Error(`${a} vs ${b}: esperado ${expected}, obtido ${got}`)}
console.log('RPS LOGIC SMOKE PASSED');
