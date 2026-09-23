const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const required=['server.js','package.json','public/index.html','public/games.html','public/games.css','public/games.js','public/streaming/index.html','data/games.json'];
for(const f of required){if(!fs.existsSync(path.join(root,f)))throw new Error(`Ficheiro em falta: ${f}`)}
const html=fs.readFileSync(path.join(root,'public/games.html'),'utf8');
const ids=[...html.matchAll(/id=["']([^"']+)["']/g)].map(m=>m[1]);const dup=ids.filter((x,i)=>ids.indexOf(x)!==i);if(dup.length)throw new Error(`IDs duplicados: ${[...new Set(dup)].join(', ')}`);
const js=fs.readFileSync(path.join(root,'public/games.js'),'utf8');
for(const token of ['championship-fixture-ready','openFixture','toggleVoice','game-voice-ready','activeFixtureId'])if(!js.includes(token))throw new Error(`Fluxo ausente: ${token}`);
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
for(const token of ['ensureFixtureRoom','notifyFixtureReady','sendFixtureReadyToPlayer','currentFixtureForPlayer','playerSockets','championships/:id/start','championships/:id/fixtures/:fixtureId/room','game-voice-ready'])if(!server.includes(token))throw new Error(`Servidor incompleto: ${token}`);

const pkg=fs.readFileSync(path.join(root,'package.json'),'utf8');
if(pkg.includes('test-championship.py')||pkg.includes('test-championship-advanced.py'))throw new Error('Scripts de teste removidos continuam no package.json');
if(!server.includes("const APP_VERSION = '2.1.0';"))throw new Error('Versão do servidor não foi atualizada');

const data=JSON.parse(fs.readFileSync(path.join(root,'data/games.json'),'utf8'));if(!Array.isArray(data.stats)||!Array.isArray(data.championships))throw new Error('Estrutura de dados inválida');
console.log('STATIC SMOKE PASSED');
