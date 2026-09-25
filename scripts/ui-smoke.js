const fs=require('fs');const path=require('path');
const root=path.join(__dirname,'..');
const games=fs.readFileSync(path.join(root,'public','games.html'),'utf8');
const js=fs.readFileSync(path.join(root,'public','games.js'),'utf8');
const home=fs.readFileSync(path.join(root,'public','index.html'),'utf8');
const stream=fs.readFileSync(path.join(root,'public','streaming','index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public','games.css'),'utf8');
const checks=[
 ['home actions',/href="\/games\.html"/.test(home)&&/href="\/streaming\//.test(home)],
 ['game actions',/id="openGameEntry"/.test(games)&&/data-game="tictactoe"/.test(games)&&/data-game="rps"/.test(games)],
 ['lobby handler',/document\.querySelectorAll\('\.lobby-game-button'\)/.test(js)],
 ['stream css external',/href="streaming\.css"/.test(stream)&&!/<style/.test(stream)],
 ['stream js external',/src="streaming\.js"/.test(stream)&&!/<script>/.test(stream)],
 ['responsive design',/@media\(max-width:/.test(css)],
];
for(const [n,ok] of checks)if(!ok)throw new Error('UI smoke failed: '+n);
console.log('UI SMOKE 2.8.4 PASSED');
