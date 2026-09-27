'use strict';

const SIZE = 8;
const EMPTY = 0;
const WHITE = 1;
const BLACK = 2;

function cloneBoard(board) { return board.map(row => row.slice()); }
function inside(r, c) { return r >= 0 && r < SIZE && c >= 0 && c < SIZE; }
function opponent(color) { return color === WHITE ? BLACK : WHITE; }
function isPieceOf(board, r, c, color) { return inside(r,c) && board[r][c] !== EMPTY && board[r][c].color === color; }
function isKing(piece) { return piece && piece.king; }
function makeInitialBoard() {
  const b = Array.from({length: SIZE}, () => Array(SIZE).fill(EMPTY));
  for (let r = 0; r < 3; r++) for (let c = 0; c < SIZE; c++) if ((r+c)%2===1) b[r][c] = { color: BLACK, king:false };
  for (let r = 5; r < 8; r++) for (let c = 0; c < SIZE; c++) if ((r+c)%2===1) b[r][c] = { color: WHITE, king:false };
  return b;
}
function initialState() {
  return { board: makeInitialBoard(), turn: WHITE, winner: null, draw: false, moves: 0, halfMoves: 0, mustContinue: null, status:'waiting' };
}

function directions(piece) {
  if (piece.king) return [[1,1],[1,-1],[-1,1],[-1,-1]];
  return piece.color === WHITE ? [[-1,1],[-1,-1]] : [[1,1],[1,-1]];
}

function captureMoves(board, r, c) {
  const piece = board[r][c];
  if (!piece) return [];
  const out=[];
  for (const [dr,dc] of directions(piece)) {
    const mr=r+dr, mc=c+dc, tr=r+2*dr, tc=c+2*dc;
    if (inside(tr,tc) && board[mr]?.[mc] && board[mr][mc].color===opponent(piece.color) && board[tr][tc]===EMPTY) {
      out.push({from:{r,c},to:{r:tr,c:tc},capture:{r:mr,c:mc}});
    }
  }
  return out;
}

function simpleMoves(board,r,c) {
  const piece=board[r][c]; if(!piece) return [];
  const out=[];
  for(const [dr,dc] of directions(piece)) {
    const tr=r+dr, tc=c+dc;
    if(inside(tr,tc) && board[tr][tc]===EMPTY) out.push({from:{r,c},to:{r:tr,c:tc},capture:null});
  }
  return out;
}
function allCaptures(board,color) {
  const out=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(isPieceOf(board,r,c,color)) out.push(...captureMoves(board,r,c));
  return out;
}
function legalMoves(board,color,forcedFrom=null) {
  if(forcedFrom) return captureMoves(board,forcedFrom.r,forcedFrom.c);
  const captures=allCaptures(board,color);
  if(captures.length) return captures;
  const out=[];
  for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(isPieceOf(board,r,c,color)) out.push(...simpleMoves(board,r,c));
  return out;
}
function applyMove(state, move) {
  const board=cloneBoard(state.board);
  const p=board[move.from.r][move.from.c];
  if(!p) throw new Error('Peça inexistente.');
  board[move.from.r][move.from.c]=EMPTY;
  board[move.to.r][move.to.c]=p;
  if(move.capture) board[move.capture.r][move.capture.c]=EMPTY;
  let promoted=false;
  if(!p.king && ((p.color===WHITE && move.to.r===0) || (p.color===BLACK && move.to.r===SIZE-1))) { p.king=true; promoted=true; }
  const next={...state,board,moves:state.moves+1,halfMoves:move.capture?0:state.halfMoves+1};
  if(move.capture) {
    const more=captureMoves(board,move.to.r,move.to.c);
    if(more.length && !promoted) { next.mustContinue={r:move.to.r,c:move.to.c}; return finishState(next); }
  }
  next.mustContinue=null;
  next.turn=opponent(state.turn);
  return finishState(next);
}
function countPieces(board,color){let n=0;for(let r=0;r<SIZE;r++)for(let c=0;c<SIZE;c++)if(isPieceOf(board,r,c,color))n++;return n;}
function finishState(state){
  const current=state.turn;
  const moves=legalMoves(state.board,current,state.mustContinue);
  if(!moves.length){state.winner=opponent(current);state.status='finished';state.mustContinue=null;return state;}
  if(state.halfMoves>=80){state.draw=true;state.status='finished';state.mustContinue=null;return state;}
  state.status='playing';
  return state;
}
function validateAndApply(state, from, to) {
  if(!state || !Array.isArray(state.board) || state.board.length!==SIZE) return {ok:false,error:'Estado da partida inválido.'};
  if(!from || !to || !Number.isInteger(from.r) || !Number.isInteger(from.c) || !Number.isInteger(to.r) || !Number.isInteger(to.c)) return {ok:false,error:'Coordenadas inválidas.'};
  if(state.status==='finished') return {ok:false,error:'A partida já terminou.'};
  if(!inside(from.r,from.c)||!inside(to.r,to.c)) return {ok:false,error:'Coordenadas inválidas.'};
  const legal=legalMoves(state.board,state.turn,state.mustContinue);
  const move=legal.find(m=>m.from.r===from.r&&m.from.c===from.c&&m.to.r===to.r&&m.to.c===to.c);
  if(!move) return {ok:false,error:'Jogada inválida ou captura obrigatória.'};
  return {ok:true,state:applyMove(state,move),move};
}
function serialize(state){return JSON.parse(JSON.stringify(state));}
function legalTargets(state,color){
  if(state.status==='finished'||state.turn!==color)return [];
  return legalMoves(state.board,color,state.mustContinue).map(m=>({from:m.from,to:m.to,capture:m.capture}));
}
function isGameOver(state){return state.status==='finished';}

module.exports={SIZE,EMPTY,WHITE,BLACK,initialState,legalMoves,legalTargets,validateAndApply,serialize,countPieces,isGameOver};
