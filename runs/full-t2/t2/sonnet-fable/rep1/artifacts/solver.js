'use strict';
// 막차 러너 풀이기 — 시간 확장 격자 위의 정확한 탐색
// A: (칸,구역,틱) 도달 가능 + E까지 갈 수 있는 상태만 남김 (최소 도착 틱 T*)
// B: 살아남은 상태 위에서 (칸,구역,틱,통행 상태)별 최소 (확정 요금, 승차 수)
// C: 최적 경로 위의 상태 표시, D: 사전순 최소 행동을 탐욕적으로 복원
const fs = require('fs');

function fareOf(km) {
  if (km <= 10) return 1450;
  if (km <= 50) return 1450 + 100 * Math.ceil((km - 10) / 5);
  return 2250 + 100 * Math.ceil((km - 50) / 8);
}

function solve(L) {
  const grid = L.grid;
  const H = grid.length, W = grid[0].length, N = H * W, maxTick = L.maxTick;
  const TYPE = new Int8Array(N); // -1 벽, 0 밖, 1 안, 2 G
  const ESC = new Int8Array(N).fill(-1); // 0 D,1 L,2 R,3 U
  let S = -1, E = -1;
  const escCh = { 'v': 0, '<': 1, '>': 2, '^': 3 };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const ch = grid[r][c], i = r * W + c;
    if (ch === '#') TYPE[i] = -1;
    else if (ch === '.' || ch === 'P') TYPE[i] = 1;
    else if (ch in escCh) { TYPE[i] = 1; ESC[i] = escCh[ch]; }
    else if (ch === 'G') TYPE[i] = 2;
    else { TYPE[i] = 0; if (ch === 'S') S = i; if (ch === 'E') E = i; }
  }
  // 방: 안 칸 -> 폐쇄 틱, 퇴장 칸
  const CLOSE = new Int32Array(N).fill(1e9);
  const EVICT = new Int32Array(N).fill(-1);
  for (const rm of L.rooms) {
    const [r0, c0, r1, c1] = rm.rect;
    const ev = rm.evict[0] * W + rm.evict[1];
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      if (r < 0 || c < 0 || r >= H || c >= W) continue;
      const i = r * W + c;
      if (TYPE[i] !== 1) continue;
      if (CLOSE[i] !== 1e9 && rm.close >= CLOSE[i]) continue; // 겹치면 더 이른 폐쇄
      CLOSE[i] = rm.close; EVICT[i] = ev;
    }
  }
  // 열차
  const lines = L.lines.map(ln => {
    const n = ln.stations.length;
    const cumT = [0], cumK = [0];
    for (let i = 0; i < n - 1; i++) { cumT.push(cumT[i] + ln.travel[i]); cumK.push(cumK[i] + ln.km[i]); }
    const cells = ln.stations.map(s => s.at[0] * W + s.at[1]);
    const targets = [];
    for (let i = 0; i < n; i++) {
      const seen = new Set(), tg = [];
      for (let j = i + 1; j < n; j++) {
        const nm = ln.stations[j].name;
        if (seen.has(nm)) continue;
        seen.add(nm);
        tg.push({ j, tok: '[' + ln.id + '>' + nm + ']', dt: cumT[j] - cumT[i], km: cumK[j] - cumK[i], cell: cells[j] });
      }
      targets.push(tg);
    }
    return { ln, n, cumT, cells, targets };
  });
  const boardAt = new Map(); // 칸 -> [{li, i}]
  lines.forEach((l, li) => l.cells.forEach((c, i) => {
    if (i === l.n - 1) return;
    if (!boardAt.has(c)) boardAt.set(c, []);
    boardAt.get(c).push({ li, i });
  }));

  // 이동 목록: 시간 이동만 (요금 무관)
  const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0], TOK = ['D', 'L', 'R', 'U'];
  function land(c2, z2, t2, ent, km, brd, tok, out) {
    // 착지 후 퇴장 처리
    let ext = false;
    if (TYPE[c2] === 1 && t2 >= CLOSE[c2]) {
      c2 = EVICT[c2]; z2 = 0; ext = true;
      if (!ent && false) { /* 안에 있던 중 폐쇄 */ }
    } else if (ent === 0 && false) { }
    out.push({ tok, c2, z2, t2, ent, ext, km, brd });
  }
  // zone 상태 z: G 칸에서만 의미 (0 밖쪽, 1 안쪽)
  function moves(cell, z, t, out) {
    out.length = 0;
    if (cell === E) return;
    const cz = TYPE[cell];
    const r = (cell / W) | 0, c = cell - r * W;
    const t2 = t + 1;
    if (t2 <= maxTick) {
      const esc = ESC[cell];
      for (let d = 0; d < 4; d++) {
        if (esc >= 0 && esc !== d) continue;
        const nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
        const c2 = nr * W + nc, tz = TYPE[c2];
        if (tz < 0) continue;
        if (ESC[c2] >= 0 && ESC[c2] !== d) continue;
        if (cz === 1 && tz === 0) continue;
        if (cz === 0 && tz === 1) continue;
        let ent = false, zz;
        if (tz === 2) zz = cz === 2 ? z : cz;
        else zz = tz;
        const curSide = cz === 2 ? z : cz;
        if (tz === 1 && curSide === 0) ent = true; // G(밖쪽) -> 안
        let ex = false;
        if (tz === 0 && curSide === 1) ex = true; // G(안쪽) -> 밖
        let fc = c2, fz = zz, fex = ex;
        if (tz === 1 && t2 >= CLOSE[c2]) { fc = EVICT[c2]; fz = 0; fex = true; }
        out.push({ tok: TOK[d], c2: fc, z2: fz, t2, ent, ext: fex, km: 0, brd: 0 });
      }
      if (esc < 0) {
        let fc = cell, fz = z, fex = false;
        if (cz === 1 && t2 >= CLOSE[cell]) { fc = EVICT[cell]; fz = 0; fex = true; }
        out.push({ tok: 'W', c2: fc, z2: fz, t2, ent: false, ext: fex, km: 0, brd: 0 });
      }
    }
    if (cz === 1) {
      const bl = boardAt.get(cell);
      if (bl) for (const { li, i } of bl) {
        const l = lines[li], ln = l.ln;
        const d = t - l.cumT[i];
        if (d < ln.first || d > ln.last || (d - ln.first) % ln.headway !== 0) continue;
        for (const tg of l.targets[i]) {
          const tt = t + tg.dt;
          if (tt > maxTick) continue;
          let fc = tg.cell, fz = 1, fex = false;
          if (t2 >= 0 && tt >= CLOSE[fc]) { fc = EVICT[fc]; fz = 0; fex = true; }
          out.push({ tok: tg.tok, c2: fc, z2: fz, t2: tt, ent: false, ext: fex, km: tg.km, brd: 1 });
        }
      }
    }
  }
  const zNorm = (c, z) => (TYPE[c] === 2 ? z : (TYPE[c] === 1 ? 1 : 0));

  // ---- A: 도달 가능 + 생존 상태
  const NS = N * 2;
  const reach = new Array(maxTick + 1);
  for (let t = 0; t <= maxTick; t++) reach[t] = new Uint8Array(NS);
  reach[0][S * 2] = 1;
  let Tstar = Infinity;
  const buf = [];
  for (let t = 0; t <= maxTick && t < Tstar; t++) {
    const rt = reach[t];
    for (let s = 0; s < NS; s++) {
      if (!rt[s]) continue;
      const cell = s >> 1, z = s & 1;
      moves(cell, z, t, buf);
      for (const m of buf) {
        const ns = m.c2 * 2 + zNorm(m.c2, m.z2);
        if (m.c2 === E && m.t2 < Tstar) Tstar = m.t2;
        reach[m.t2][ns] = 1;
      }
    }
  }
  if (Tstar === Infinity) return '불가';
  const alive = new Array(Tstar + 1);
  for (let t = 0; t <= Tstar; t++) alive[t] = new Uint8Array(NS);
  alive[Tstar][E * 2] = 1;
  for (let t = Tstar - 1; t >= 0; t--) {
    const rt = reach[t], at = alive[t];
    for (let s = 0; s < NS; s++) {
      if (!rt[s]) continue;
      moves(s >> 1, s & 1, t, buf);
      for (const m of buf) {
        if (m.t2 > Tstar) continue;
        if (alive[m.t2][m.c2 * 2 + zNorm(m.c2, m.z2)]) { at[s] = 1; break; }
      }
    }
  }
  for (let t = 0; t <= Tstar; t++) reach[t] = null;

  // ---- B: 요금 상태 포함 DP
  // 요금 상태: open(0/1), km, lastExit(밖일 때만, 아니면 0), closed, boards
  const FSH = 16384 * 512;
  function mkKey(cell, z, open, km, lastExit) {
    return (cell * 2 + zNorm(cell, z)) * FSH + (open ? (km + 1) : 0) * 512 + lastExit;
  }
  // fare 적용: 상태 (open, km, le, closed, brd) + 이동 m -> 새 상태 (객체 재사용 위해 배열)
  const nf = { open: 0, km: 0, le: 0, closed: 0, brd: 0 };
  function apply(open, km, le, closed, brd, m) {
    if (m.ent) {
      if (open && le > 0 && m.t2 <= le + 30) { /* 이어짐 */ }
      else if (open && le > 0) { closed += fareOf(km); km = 0; }
      else if (open) { /* 안쪽 G 경유 등: 이미 통행 중 */ }
      else { km = 0; }
      open = 1; le = 0;
    }
    km += m.km; brd += m.brd;
    if (m.ext) le = m.t2;
    // 정규화: 밖 + 열린 통행 + 만료
    const cell = m.c2;
    const out = TYPE[cell] === 0 || (TYPE[cell] === 2 && m.z2 === 0);
    if (open && out && le > 0 && m.t2 > le + 30) { closed += fareOf(km); open = 0; km = 0; le = 0; }
    if (!open) { km = 0; le = 0; }
    nf.open = open; nf.km = km; nf.le = le; nf.closed = closed; nf.brd = brd;
  }
  const bucket = new Array(Tstar + 1);
  for (let t = 0; t <= Tstar; t++) bucket[t] = new Map();
  bucket[0].set(mkKey(S, 0, 0, 0, 0), 0);
  const PK = 1024;
  let bestFinal = Infinity;
  const total = (closed, open, km) => closed + (open ? fareOf(km) : 0);
  function decode(key) {
    const fsPart = key % FSH;
    const s = (key - fsPart) / FSH;
    const f = (fsPart / 512) | 0, le = fsPart & 511;
    return { cell: s >> 1, z: s & 1, open: f > 0 ? 1 : 0, km: f > 0 ? f - 1 : 0, le };
  }
  for (let t = 0; t < Tstar; t++) {
    const bm = bucket[t];
    for (const [key, val] of bm) {
      const d = decode(key);
      const closed = Math.floor(val / PK), brd = val % PK;
      moves(d.cell, d.z, t, buf);
      for (const m of buf) {
        if (m.t2 > Tstar) continue;
        const ns = m.c2 * 2 + zNorm(m.c2, m.z2);
        if (!alive[m.t2][ns]) continue;
        apply(d.open, d.km, d.le, closed, brd, m);
        if (m.c2 === E) {
          if (m.t2 !== Tstar) continue;
          const v = total(nf.closed, nf.open, nf.km) * PK + nf.brd;
          if (v < bestFinal) bestFinal = v;
          continue;
        }
        const k2 = mkKey(m.c2, m.z2, nf.open, nf.km, nf.le);
        const v2 = nf.closed * PK + nf.brd;
        const b2 = bucket[m.t2];
        const old = b2.get(k2);
        if (old === undefined || v2 < old) b2.set(k2, v2);
      }
    }
  }
  if (bestFinal === Infinity) return '불가';
  // ---- C: 최적 경로 위 상태
  const good = new Array(Tstar + 1);
  for (let t = 0; t <= Tstar; t++) good[t] = new Set();
  for (let t = Tstar - 1; t >= 0; t--) {
    const bm = bucket[t], gt = good[t];
    for (const [key, val] of bm) {
      const d = decode(key);
      const closed = Math.floor(val / PK), brd = val % PK;
      moves(d.cell, d.z, t, buf);
      for (const m of buf) {
        if (m.t2 > Tstar) continue;
        const ns = m.c2 * 2 + zNorm(m.c2, m.z2);
        if (!alive[m.t2][ns]) continue;
        apply(d.open, d.km, d.le, closed, brd, m);
        if (m.c2 === E) {
          if (m.t2 === Tstar && total(nf.closed, nf.open, nf.km) * PK + nf.brd === bestFinal) { gt.add(key); break; }
          continue;
        }
        const k2 = mkKey(m.c2, m.z2, nf.open, nf.km, nf.le);
        if (bucket[m.t2].get(k2) === nf.closed * PK + nf.brd && good[m.t2].has(k2)) { gt.add(key); break; }
      }
    }
  }
  // ---- D: 복원
  let cell = S, z = 0, t = 0, open = 0, km = 0, le = 0, closed = 0, brd = 0;
  let res = '';
  while (cell !== E) {
    moves(cell, z, t, buf);
    const cands = buf.slice().sort((a, b) => (a.tok < b.tok ? -1 : a.tok > b.tok ? 1 : 0));
    let chosen = null;
    for (const m of cands) {
      if (m.t2 > Tstar) continue;
      const ns = m.c2 * 2 + zNorm(m.c2, m.z2);
      if (!alive[m.t2][ns]) continue;
      apply(open, km, le, closed, brd, m);
      if (m.c2 === E) {
        if (m.t2 === Tstar && total(nf.closed, nf.open, nf.km) * PK + nf.brd === bestFinal) { chosen = m; break; }
        continue;
      }
      const k2 = mkKey(m.c2, m.z2, nf.open, nf.km, nf.le);
      if (bucket[m.t2].get(k2) === nf.closed * PK + nf.brd && good[m.t2].has(k2)) { chosen = m; break; }
    }
    if (!chosen) throw new Error('복원 실패 t=' + t);
    apply(open, km, le, closed, brd, chosen);
    open = nf.open; km = nf.km; le = nf.le; closed = nf.closed; brd = nf.brd;
    res += chosen.tok;
    cell = chosen.c2; z = chosen.z2; t = chosen.t2;
  }
  if (process.env.DEBUG) console.error('T*', Tstar, 'fare', Math.floor(bestFinal / PK), 'boards', bestFinal % PK);
  return res;
}

module.exports = { solve, fareOf };
if (require.main === module) {
  const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(solve(L));
}
