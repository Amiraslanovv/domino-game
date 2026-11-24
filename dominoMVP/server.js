const http = require('http'), fs = require('fs'), path = require('path');
const { WebSocketServer } = require('ws');
const srv = http.createServer((q, r) => {
  fs.readFile(path.join(__dirname, 'public', 'index.html'), (e, d) => {
    r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(d);
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
const U = (R, i) => R.mode == 'team' ? i % 2 : i;           // xal vahidi: oyunçu və ya komanda
const unames = (R, u) => R.players.filter((p, i) => U(R, i) == u).map(p => p.name).join(' & ');
const ev = (R, text) => { R.ev = { n: (R.ev ? R.ev.n : 0) + 1, text }; };

function view(R, p) {
  return {
    type: 'state', room: R.code, me: p.id, host: R.host, mode: R.mode, phase: R.phase, manual: R.manual, round: R.round,
    players: R.players.map((q, i) => { const u = U(R, i); return { id: q.id, name: q.name, seat: q.seat, u, score: R.sc[u] || 0, pend: R.pend[u] || 0, n: q.hand.length, on: !!q.ws && q.ws.readyState === 1 }; }),
    hand: p.hand, board: R.board, turn: R.phase === 'play' ? R.players[R.ti].id : null,
    bank: R.bank, stock: R.stock.length, pool: R.pool.length, must: R.must, result: R.result, ev: R.ev || null
  };
}
function push(R) { R.players.forEach(p => { if (p.ws && p.ws.readyState === 1) p.ws.send(JSON.stringify(view(R, p))); }); }

function startRound(R) {
  const t = full();
  R.round++; R.board = []; R.passes = 0; R.result = null; R.must = null;
  R.players.forEach(p => p.hand = []);
  if (R.manual) { R.pool = t; R.stock = []; R.phase = 'pick'; }
  else { R.players.forEach(p => p.hand = t.splice(0, 7)); R.pool = []; R.stock = t; begin(R); }
}
function begin(R) {
  R.phase = 'play';
  if (R.first) {   // ilk raund: ən kiçik qoşa daş olan başlayır
    let b = 1e9;
    R.players.forEach((p, i) => p.hand.forEach(t => {
      const k = t[0] == t[1] ? t[0] : 100 + t[0] + t[1];
      if (k < b) { b = k; R.must = t; R.ti = i; }
    }));
    R.first = false;
  } else R.ti = R.wi;   // qalib və ya balığı elan edən başlayır
  settle(R);
}
function endRound(R, wi, fish) {
  const hs = R.players.map(p => sum(p.hand)), tot = Array(R.units).fill(0);
  hs.forEach((h, i) => tot[U(R, i)] += h);
  R.result = { winner: null, wn: '', fish: !!fish, over: false, pts: 0, best: [], hands: Object.fromEntries(R.players.map(p => [p.id, p.hand])) };
  let wu = -1;
  if (fish) { const mn = Math.min(...tot), w = tot.map((x, u) => x == mn ? u : -1).filter(u => u >= 0); if (w.length == 1) wu = w[0]; }
  else { wu = U(R, wi); R.result.winner = R.players[wi].id; }
  if (wu >= 0) {   // qalib tərəf rəqiblərin xallarını + bankı alır
    let pts = R.bank; tot.forEach((x, u) => { if (u != wu) pts += x; });
    R.bank = 0; R.sc[wu] += pts; R.result.pts = pts; R.result.wn = unames(R, wu);
  } else R.bank += tot.reduce((a, b) => a + b, 0);   // bərabərlik: xallar banka
  if (R.sc.some(x => x >= 101)) {
    const bu = R.sc.indexOf(Math.max(...R.sc));
    R.result.over = true; R.result.best = R.players.filter((p, i) => U(R, i) == bu).map(p => p.id);
    ev(R, '🏆 QALİB: ' + unames(R, bu));
  } else if (R.units > 1) {   // dominasiya: aparan tərəf ikincidən 40+ xal öndədir
    const o = R.sc.map((x, u) => [-x, u]).sort((a, b) => a[0] - b[0]);
    if (o[1][0] - o[0][0] >= 40) { if (R.dom != o[0][1]) { R.dom = o[0][1]; ev(R, '🔥 DOMİNASİYA! ' + unames(R, o[0][1])); } }
    else R.dom = -1;
  }
  R.wi = !fish ? wi : (wu >= 0 ? R.players.findIndex((p, i) => U(R, i) == wu) : R.lm);
  R.phase = 'end';
}
function settle(R) {
  const n = R.players.length;
  while (R.phase == 'play') {
    const p = R.players[R.ti];
    if (!R.board.length || p.hand.some(t => fits(R, t)) || R.stock.length) break;
    R.passes++;
    if (R.passes >= n) return endRound(R, -1, true);
    R.ti = (R.ti + 1) % n;
  }
}

wss.on('connection', ws => {
  let R, P;
  ws.on('message', m => {
    let d; try { d = JSON.parse(m); } catch { return; }
    if (d.type == 'join') {
      const code = String(d.room || '').toUpperCase().slice(0, 8);
      R = rooms[code] || (rooms[code] = { code, players: [], host: d.id, mode: 'team', manual: false, phase: 'lobby', board: [], stock: [], pool: [], first: true, ti: 0, wi: 0, lm: 0, passes: 0, bank: 0, round: 0, units: 0, sc: [], pend: [], st: [], dom: -1 });
      P = R.players.find(x => x.id == d.id);
      if (P) { P.ws = ws; P.name = String(d.name || P.name).slice(0, 16); }
      else {
        if (R.players.length >= 4 || R.phase != 'lobby') { ws.send(JSON.stringify({ type: 'err', m: 'Otaq doludur və ya oyun başlayıb' })); R = P = null; return; }
        P = { id: d.id, name: String(d.name || 'Oyunçu').slice(0, 16), hand: [], ws, seat: [0, 1, 2, 3].find(x => !R.players.some(y => y.seat == x)) }; R.players.push(P);
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
      R.players.forEach(q => q.ws && q.ws.readyState === 1 && q.ws.send(JSON.stringify({ type: 'chat', id: P.id, name: P.name, text: t, big: !!d.big })));
      return;
    }
    if (d.type == 'opts' && host && R.phase == 'lobby') { R.mode = d.mode == 'solo' ? 'solo' : 'team'; }
    else if (d.type == 'seat' && R.phase == 'lobby' && d.s >= 0 && d.s < 4) {   // oturacaq seçimi (1&3, 2&4 cütdür)
      const o = R.players.find(x => x != P && x.seat == d.s); if (o) o.seat = P.seat; P.seat = d.s;
    }
    else if (d.type == 'start' && host && R.phase == 'lobby' && n >= 2 && (R.mode != 'team' || n == 4)) {
      R.players.sort((a, b) => a.seat - b.seat); R.first = true; R.wi = 0; R.lm = 0; R.bank = 0; R.dom = -1; R.ev = null;
      R.units = R.mode == 'team' ? 2 : n; R.sc = Array(R.units).fill(0); R.pend = Array(R.units).fill(0); R.st = Array(R.units).fill(false);
      startRound(R);
    }
    else if (d.type == 'pick' && R.phase == 'pick' && P.hand.length < 7 && R.pool[d.i]) {
      P.hand.push(R.pool.splice(d.i, 1)[0]);
      if (R.players.every(p => p.hand.length == 7)) { R.stock = R.pool; R.pool = []; begin(R); }
    }
    else if (d.type == 'play' && R.phase == 'play' && R.players[R.ti] == P && Array.isArray(d.t)) {
      const idx = P.hand.findIndex(x => same(x, d.t)); if (idx < 0) return;
      const tile = P.hand[idx]; let c;
      if (!R.board.length) { if (R.must && !same(R.must, tile)) return; c = [tile[0], tile[1]]; }
      else {
        const e = ends(R);
        if (d.side == 'L') { if (tile[1] == e[0]) c = [tile[0], tile[1]]; else if (tile[0] == e[0]) c = [tile[1], tile[0]]; else return; }
        else { if (tile[0] == e[1]) c = [tile[0], tile[1]]; else if (tile[1] == e[1]) c = [tile[1], tile[0]]; else return; }
      }
      P.hand.splice(idx, 1); R.must = null; R.passes = 0; R.lm = R.ti;
      if (d.side == 'L' && R.board.length) R.board.unshift(c); else R.board.push(c);
      if (!P.hand.length) endRound(R, R.ti, false);
      else { R.ti = (R.ti + 1) % n; settle(R); }
    }
    else if (d.type == 'draw' && R.phase == 'play' && R.players[R.ti] == P && R.board.length && R.stock.length && !P.hand.some(t => fits(R, t))) { P.hand.push(R.stock.pop()); settle(R); }
    else if (d.type == 'next' && host && R.phase == 'end' && !R.result.over) startRound(R);
    else if (d.type == 'again' && host && R.phase == 'end' && R.result.over) { R.sc = []; R.pend = []; R.bank = 0; R.players.forEach(p => p.hand = []); R.phase = 'lobby'; R.board = []; R.result = null; }
    push(R);
  });
  ws.on('close', () => {
    if (!R || !P) return;
    P.ws = null; push(R);
    const r = R; setTimeout(() => { if (r.players.every(p => !p.ws)) delete rooms[r.code]; }, 600000);
  });
});
srv.listen(process.env.PORT || 3000, () => console.log('Domino server ready'));
