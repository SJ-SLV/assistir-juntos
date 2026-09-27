#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const C=require('../checkers');
const server=fs.readFileSync(path.join(__dirname,'..','server.js'),'utf8');
const games=fs.readFileSync(path.join(__dirname,'..','public','games.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','public','games.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','public','games.css'),'utf8');
let s=C.initialState();
if(C.countPieces(s.board,C.WHITE)!==12||C.countPieces(s.board,C.BLACK)!==12)throw new Error('Posição inicial inválida');
if(!server.includes("message.gameType === 'checkers'")||!server.includes('function checkersMove'))throw new Error('Integração do servidor ausente');
if(!html.includes('data-game="checkers"')||!games.includes('function renderCheckers'))throw new Error('Integração do cliente ausente');
if(!css.includes('.checkers-board'))throw new Error('CSS de Damas ausente');
console.log('CHECKERS INTEGRATION SMOKE PASSED: engine + server + client + UI.');
