const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');

const srv = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, d) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    r.end(d);
  });
});
const wss = new WebSocketServer({ server: srv });
const rooms = {};

const sum = h => h.reduce((s, t) => s + t[0] + t[1], 0);
const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.random() * (i + 1) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
const full = () => { const t = []; for (let i = 0; i < 7; i++) for (let j = i; j < 7; j++) t.push([i, j]); return shuffle(t); };
const ends = R => R.board.length ? [R.board[0][0], R.board[R.board.length - 1][1]] : null;
const fits = (R, t) => { const e = ends(R); return !e || t.includes(e[0]) || t.includes(e[1]); };
const same = (a, b) => a && b && a[0] == b[0] && a[1] == b[1];

function view(R, p) {
  return {
    type: 'state', room: R.code, me: p.id, host: R.host, mode: R.mode, manual: R.manual, phase: R.phase,
    players: R.players.map(q => ({ id: q.id, name: q.name, score: q.score, n: q.hand.length, on: !!q.ws && q.ws.readyState === 1 })),
    hand: p.hand, board: R.board, turn: R.phase === 'play' ? R.players[R.ti].id : null,
    bank: R.bank, stock: R.stock.length, pool: R.pool.length, must: R.must, result: R.result, log: R.log.slice(-4)
  };
}
function push(R) {
  R.players.forEach(p => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(view(R, p))); });
}
function startRound(R) {
  const t = full();
  R.board = []; R.passes = 0; R.result = null; R.must = null;
  R.players.forEach(p => p.hand = []);
  if (R.manual) { R.pool = t; R.stock = []; R.phase = 'pick'; }
  else { R.players.forEach(p => p.hand = t.splice(0, 7)); R.pool = []; R.stock = t; begin(R); }
}
function begin(R) {
  R.phase = 'play';
  if (R.first) {
    let b = -1;
    R.players.forEach((p, i) => p.hand.forEach(t => {
      const k = t[0] == t[1] ? 100 + t[0] : t[0] + t[1];
      if (k > b) { b = k; R.must = t; R.ti = i; }
    }));
    R.first = false;
  } else if (R.wi >= 0) R.ti = R.wi;
  R.log.push(R.players[R.ti].name + ' başlayır');
  settle(R);
}
function endRound(R, wi) {
  let pts = 0;
  R.players.forEach((p, i) => { if (i != wi) pts += sum(p.hand); });
  if (wi >= 0) { pts += R.bank; R.bank = 0; R.players[wi].score += pts; }  // qalib bankı da götürür
  else R.bank += sum(R.players.flatMap(p => p.hand));                       // bərabərlik: xallar banka
  R.wi = wi;
  const over = R.mode == 'classic' || R.players.some(p => p.score >= 101);
  R.phase = 'end';
  R.result = {
    winner: wi >= 0 ? R.players[wi].id : null, pts: wi >= 0 ? pts : 0, over,
    hands: Object.fromEntries(R.players.map(p => [p.id, p.hand]))
  };
}
// auto-pass when player cannot move and stock is empty; detect blocked game
function settle(R) {
  const n = R.players.length;
  while (R.phase == 'play') {
    const p = R.players[R.ti];
    if (!R.board.length || p.hand.some(t => fits(R, t)) || R.stock.length) break;
    R.passes++; R.log.push(p.name + ' pas dedi');
    if (R.passes >= n) {
      const m = R.players.map(q => sum(q.hand)), mn = Math.min(...m);
      return endRound(R, m.filter(x => x == mn).length > 1 ? -1 : m.indexOf(mn));
    }
    R.ti = (R.ti + 1) % n;
  }
}

wss.on('connection', ws => {
  let R, P;
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.type == 'join') {
      const code = String(d.room || '').toUpperCase().slice(0, 8);
      R = rooms[code] || (rooms[code] = { code, players: [], host: d.id, mode: '101', manual: false, phase: 'lobby', board: [], stock: [], pool: [], log: [], first: true, ti: 0, wi: -1, passes: 0, bank: 0 });
      P = R.players.find(x => x.id == d.id);
      if (P) { P.ws = ws; P.name = String(d.name || P.name).slice(0, 16); }
      else {
        if (R.players.length >= 4 || R.phase != 'lobby') { ws.send(JSON.stringify({ type: 'err', m: 'Otaq doludur və ya oyun başlayıb' })); R = P = null; return; }
        P = { id: d.id, name: String(d.name || 'Oyunçu').slice(0, 16), score: 0, hand: [], ws };
        R.players.push(P);
      }
      return push(R);
    }
    if (!R || !P) return;
    const host = R.host == P.id, n = R.players.length;
    if (d.type == 'rtc') {
      const q = R.players.find(x => x.id == d.to);
      if (q && q.ws && q.ws.readyState === 1) q.ws.send(JSON.stringify({ type: 'rtc', from: P.id, data: d.data }));
      return;
    }
    if (d.type == 'chat') {
      const t = String(d.text || '').slice(0, 300); if (!t) return;
      R.players.forEach(q => q.ws && q.ws.readyState === 1 && q.ws.send(JSON.stringify({ type: 'chat', name: P.name, text: t })));
      return;
    }
    if (d.type == 'opts' && host && R.phase == 'lobby') { R.mode = d.mode == 'classic' ? 'classic' : '101'; R.manual = !!d.manual; }
    else if (d.type == 'start' && host && R.phase == 'lobby' && n >= 2) { R.first = true; R.wi = -1; R.bank = 0; R.players.forEach(p => p.score = 0); startRound(R); }
    else if (d.type == 'pick' && R.phase == 'pick' && P.hand.length < 7 && R.pool[d.i]) {
      P.hand.push(R.pool.splice(d.i, 1)[0]);
      if (R.players.every(p => p.hand.length == 7)) { R.stock = R.pool; R.pool = []; begin(R); }
    }
    else if (d.type == 'play' && R.phase == 'play' && R.players[R.ti] == P && Array.isArray(d.t)) {
      const idx = P.hand.findIndex(x => same(x, d.t));
      if (idx < 0) return;
      const tile = P.hand[idx]; let c;
      if (!R.board.length) {
        if (R.must && !same(R.must, tile)) return;
        c = [tile[0], tile[1]];
      } else {
        const e = ends(R);
        if (d.side == 'L') { if (tile[1] == e[0]) c = [tile[0], tile[1]]; else if (tile[0] == e[0]) c = [tile[1], tile[0]]; else return; }
        else { if (tile[0] == e[1]) c = [tile[0], tile[1]]; else if (tile[1] == e[1]) c = [tile[1], tile[0]]; else return; }
      }
      P.hand.splice(idx, 1); R.must = null; R.passes = 0;
      if (d.side == 'L' && R.board.length) R.board.unshift(c); else R.board.push(c);
      if (!P.hand.length) endRound(R, R.ti);
      else { R.ti = (R.ti + 1) % n; settle(R); }
    }
    else if (d.type == 'draw' && R.phase == 'play' && R.players[R.ti] == P && R.board.length && R.stock.length && !P.hand.some(t => fits(R, t))) {
      P.hand.push(R.stock.pop()); settle(R);
    }
    else if (d.type == 'next' && host && R.phase == 'end' && !R.result.over) startRound(R);
    else if (d.type == 'again' && host && R.phase == 'end' && R.result.over) {
      R.bank = 0; R.players.forEach(p => { p.score = 0; p.hand = []; }); R.phase = 'lobby'; R.board = []; R.result = null;
    }
    push(R);
  });
  ws.on('close', () => {
    if (!R || !P) return;
    P.ws = null; push(R);
    const r = R;
    setTimeout(() => { if (r.players.every(p => !p.ws)) delete rooms[r.code]; }, 600000);
  });
});
srv.listen(process.env.PORT || 3000, () => console.log('Domino server ready'));
