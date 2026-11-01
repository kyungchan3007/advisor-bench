'use strict';
// 막차 러너 풀이기
// A: 요금 무시 시간확장 BFS로 최단 도착 틱 T 계산
// B: T 틱에 정확히 E에 닿을 수 있는 (칸,틱) 역방향 표시(alive)
// C: 요금 상태(통행 km, 퇴장 후 경과)를 붙인 상태에서 남은 (요금, 승차) 최소값 V를 메모이제이션 DFS로 계산
// D: 시작에서 같은 문자열로 도달 가능한 최적 상태 집합(frontier)을 유지하며 사전순 최소 토큰을 하나씩 고름
const fs = require('fs');

const KM = 16384; // 통행 km 상한(인코딩용)
const WINDOW = 30;

function fare(km) {
  if (km <= 10) return 1450;
  if (km <= 50) return 1450 + 100 * Math.ceil((km - 10) / 5 - 1e-9);
  return 2250 + 100 * Math.ceil((km - 50) / 8 - 1e-9);
}

function solve(L) {
  const grid = L.grid;
  const H = grid.length, W = grid[0].length, NC = H * W;
  const maxTick = L.maxTick;
  const type = new Uint8Array(NC); // 0 벽, 1 안, 2 밖, 3 개찰구
  const esc = new Int8Array(NC).fill(-1); // 에스컬레이터 방향 (D0 L1 R2 U3)
  const isE = new Uint8Array(NC);
  let S = -1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = grid[r][c], i = r * W + c;
      switch (ch) {
        case '.': case 'P': type[i] = 1; break;
        case '>': type[i] = 1; esc[i] = 2; break;
        case '<': type[i] = 1; esc[i] = 1; break;
        case '^': type[i] = 1; esc[i] = 3; break;
        case 'v': type[i] = 1; esc[i] = 0; break;
        case ',': type[i] = 2; break;
        case 'S': type[i] = 2; S = i; break;
        case 'E': type[i] = 2; isE[i] = 1; break;
        case 'G': type[i] = 3; break;
        default: type[i] = 0;
      }
    }
  }
  if (S < 0) return '불가';
  const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0];
  const DCH = ['D', 'L', 'R', 'U'];

  const nb = new Int32Array(NC * 4).fill(-1);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (type[i] === 0 || isE[i]) continue;
      for (let d = 0; d < 4; d++) {
        const nr = r + DR[d], nc = c + DC[d];
        if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
        const n = nr * W + nc;
        if (type[n] === 0) continue;
        if ((type[i] === 1 && type[n] === 2) || (type[i] === 2 && type[n] === 1)) continue;
        if (esc[i] >= 0 && d !== esc[i]) continue;
        if (esc[n] >= 0 && d !== esc[n]) continue;
        nb[i * 4 + d] = n;
      }
    }
  }

  // 역 건물
  const closeAt = new Int32Array(NC).fill(1 << 30);
  const evictTo = new Int32Array(NC).fill(-1);
  for (const room of L.rooms || []) {
    const [r0, c0, r1, c1] = room.rect;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || c < 0 || r >= H || c >= W) continue;
        const i = r * W + c;
        if (type[i] !== 1) continue;
        if (evictTo[i] >= 0) continue; // 겹치면 먼저 나온 것
        closeAt[i] = room.close;
        evictTo[i] = room.evict[0] * W + room.evict[1];
      }
    }
  }

  // 입장 가능한 개찰구까지의 밖 걸음 수
  const dEntry = new Int32Array(NC).fill(1 << 28);
  {
    const q = [];
    for (let i = 0; i < NC; i++) {
      if (type[i] !== 3) continue;
      let ok = false;
      for (let d = 0; d < 4; d++) {
        const n = nb[i * 4 + d];
        if (n >= 0 && type[n] === 1) ok = true;
      }
      if (ok) { dEntry[i] = 0; q.push(i); }
    }
    for (let h = 0; h < q.length; h++) {
      const i = q[h];
      for (let d = 0; d < 4; d++) {
        const n = nb[i * 4 + d];
        if (n < 0 || type[n] === 1) continue;
        if (dEntry[n] > dEntry[i] + 1) { dEntry[n] = dEntry[i] + 1; q.push(n); }
      }
    }
  }

  // 노선 · 탑승 옵션
  const tokStr = ['D', 'L', 'R', 'U', 'W'];
  const opts = []; // {dt, km, ncell}
  const boards = new Map(); // t*NC+cell -> [opt id]
  for (const line of L.lines || []) {
    const st = line.stations, n = st.length;
    const cumT = [0], cumK = [0];
    for (let i = 0; i < n - 1; i++) {
      cumT.push(cumT[i] + line.travel[i]);
      cumK.push(cumK[i] + line.km[i]);
    }
    const cells = st.map(s => s.at[0] * W + s.at[1]);
    const ds = [];
    if (line.headway > 0) {
      for (let d = line.first; d <= line.last; d += line.headway) ds.push(d);
    } else if (line.first <= line.last) ds.push(line.first);
    for (let i = 0; i < n - 1; i++) {
      if (type[cells[i]] !== 1) continue;
      const seen = new Set();
      const targets = [];
      for (let j = i + 1; j < n; j++) {
        if (seen.has(st[j].name)) continue;
        seen.add(st[j].name);
        targets.push(j);
      }
      for (const j of targets) {
        const dt = cumT[j] - cumT[i], km = cumK[j] - cumK[i];
        const token = '[' + line.id + '>' + st[j].name + ']';
        for (const d of ds) {
          const t = d + cumT[i];
          if (t > maxTick) continue;
          const id = opts.length;
          opts.push({ dt, km, ncell: cells[j] });
          tokStr[5 + id] = token;
          const key = t * NC + cells[i];
          let arr = boards.get(key);
          if (!arr) boards.set(key, arr = []);
          arr.push(5 + id);
        }
      }
    }
  }
  const sortedToks = Array.from(new Set(tokStr)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const rankOfStr = new Map(sortedToks.map((s, i) => [s, i]));
  const rank = tokStr.map(s => rankOfStr.get(s));

  // 이동 생성 (요금 무관)
  function newBuf(cap) {
    return {
      n: 0,
      tok: new Int32Array(cap), nt: new Int32Array(cap), nc: new Int32Array(cap),
      raw: new Int32Array(cap), ev: new Uint8Array(cap), km: new Int32Array(cap), ride: new Uint8Array(cap),
    };
  }
  function grow(buf) {
    const cap = buf.tok.length * 2;
    const nbuf = newBuf(cap);
    nbuf.n = buf.n;
    nbuf.tok.set(buf.tok); nbuf.nt.set(buf.nt); nbuf.nc.set(buf.nc);
    nbuf.raw.set(buf.raw); nbuf.ev.set(buf.ev); nbuf.km.set(buf.km); nbuf.ride.set(buf.ride);
    Object.assign(buf, nbuf);
  }
  function push(buf, tok, ntv, raw, ride, km) {
    if (buf.n >= buf.tok.length) grow(buf);
    const k = buf.n++;
    buf.tok[k] = tok; buf.nt[k] = ntv; buf.raw[k] = raw; buf.ride[k] = ride; buf.km[k] = km;
    if (type[raw] === 1 && ntv >= closeAt[raw] && evictTo[raw] >= 0) {
      buf.ev[k] = 1; buf.nc[k] = evictTo[raw];
    } else {
      buf.ev[k] = 0; buf.nc[k] = raw;
    }
  }
  function genMoves(cell, t, buf, limit) {
    buf.n = 0;
    if (t + 1 <= limit) {
      for (let d = 0; d < 4; d++) {
        const m = nb[cell * 4 + d];
        if (m >= 0) push(buf, d, t + 1, m, 0, 0);
      }
      if (esc[cell] < 0) push(buf, 4, t + 1, cell, 0, 0);
    }
    if (type[cell] === 1) {
      const arr = boards.get(t * NC + cell);
      if (arr) {
        for (const tid of arr) {
          const o = opts[tid - 5];
          if (t + o.dt <= limit) push(buf, tid, t + o.dt, o.ncell, 1, o.km);
        }
      }
    }
  }

  // A: 최단 도착
  const reach = [];
  for (let t = 0; t <= maxTick; t++) reach.push(new Uint8Array(NC));
  reach[0][S] = 1;
  const abuf = newBuf(64);
  for (let t = 0; t < maxTick; t++) {
    const rt = reach[t];
    for (let c = 0; c < NC; c++) {
      if (!rt[c] || isE[c]) continue;
      genMoves(c, t, abuf, maxTick);
      for (let i = 0; i < abuf.n; i++) reach[abuf.nt[i]][abuf.nc[i]] = 1;
    }
  }
  let T = -1;
  for (let t = 0; t <= maxTick && T < 0; t++) {
    for (let c = 0; c < NC; c++) if (isE[c] && reach[t][c]) { T = t; break; }
  }
  if (T < 0) return '불가';

  // B: alive
  const alive = [];
  for (let t = 0; t <= T; t++) alive.push(new Uint8Array(NC));
  for (let c = 0; c < NC; c++) if (isE[c] && reach[T][c]) alive[T][c] = 1;
  for (let t = T - 1; t >= 0; t--) {
    const rt = reach[t], at = alive[t];
    for (let c = 0; c < NC; c++) {
      if (!rt[c] || isE[c]) continue;
      genMoves(c, t, abuf, T);
      for (let i = 0; i < abuf.n; i++) {
        if (alive[abuf.nt[i]][abuf.nc[i]]) { at[c] = 1; break; }
      }
    }
  }

  // 상태 전이 (요금)
  const FEE0 = fare(0) * 4096;
  let outCtx = 0, outDelta = 0;
  function applyMove(ctx, cell, t, buf, i) {
    let tp, K = 0, age = 0;
    if (ctx === 0) tp = 0;
    else if (ctx <= KM) { tp = 1; K = ctx - 1; }
    else { tp = 2; const v = ctx - KM - 1; K = v >> 5; age = v & 31; }
    let delta = 0;
    const nt = buf.nt[i], nc = buf.nc[i];
    if (tp === 2) age += nt - t;
    if (buf.ride[i]) {
      const K2 = K + buf.km[i];
      delta += (fare(K2) - fare(K)) * 4096 + 1;
      K = K2;
    } else {
      const zc = type[cell], zr = type[buf.raw[i]];
      if (zc === 3 && zr === 1) {
        if (tp !== 1) {
          if (tp === 2 && age <= WINDOW) { tp = 1; }
          else { tp = 1; K = 0; delta += FEE0; }
        }
      } else if (zc === 3 && zr === 2) {
        if (tp === 1) { tp = 2; age = 0; }
      }
    }
    if (buf.ev[i]) { tp = 2; age = 0; }
    if (tp === 2 && (age >= WINDOW || dEntry[nc] + 1 > WINDOW - age)) tp = 0;
    outDelta = delta;
    outCtx = tp === 0 ? 0 : tp === 1 ? 1 + K : KM + 1 + (K << 5) + age;
  }

  // C: 값 (메모이제이션 DFS)
  const memo = new Map();
  const bufs = [];
  for (let t = 0; t <= T; t++) bufs.push(null);
  const CB = 1048576; // 2^20
  function V(t, cell, ctx) {
    if (isE[cell]) return 0;
    const key = (t * NC + cell) * CB + ctx;
    const got = memo.get(key);
    if (got !== undefined) return got;
    let buf = bufs[t];
    if (!buf) buf = bufs[t] = newBuf(64);
    genMoves(cell, t, buf, T);
    let best = Infinity;
    const n = buf.n;
    for (let i = 0; i < n; i++) {
      const nt = buf.nt[i], nc = buf.nc[i];
      if (!alive[nt][nc]) continue;
      applyMove(ctx, cell, t, buf, i);
      const d = outDelta, nctx = outCtx;
      const v = d + V(nt, nc, nctx);
      if (v < best) best = v;
    }
    memo.set(key, best);
    return best;
  }
  const total = V(0, S, 0);

  // D: 사전순 최소 문자열
  let frontier = [{ t: 0, cell: S, ctx: 0, acc: 0 }];
  let out = '';
  const fbuf = newBuf(64);
  for (;;) {
    if (frontier.some(s => isE[s.cell])) break;
    let bestRank = Infinity;
    let cands = [];
    for (const s of frontier) {
      genMoves(s.cell, s.t, fbuf, T);
      for (let i = 0; i < fbuf.n; i++) {
        const nt = fbuf.nt[i], nc = fbuf.nc[i];
        if (!alive[nt][nc]) continue;
        const rk = rank[fbuf.tok[i]];
        if (rk > bestRank) continue;
        applyMove(s.ctx, s.cell, s.t, fbuf, i);
        const nacc = s.acc + outDelta;
        if (nacc + V(nt, nc, outCtx) !== total) continue;
        if (rk < bestRank) { bestRank = rk; cands = []; }
        cands.push({ t: nt, cell: nc, ctx: outCtx, acc: nacc });
      }
    }
    if (!cands.length) throw new Error('reconstruction failed');
    out += sortedToks[bestRank];
    const seen = new Set();
    frontier = [];
    for (const c of cands) {
      const k = (c.t * NC + c.cell) * CB + c.ctx;
      if (seen.has(k)) continue;
      seen.add(k);
      frontier.push(c);
    }
  }
  solve.stats = { T, total, fare: Math.floor(total / 4096), rides: total % 4096, states: memo.size };
  return out;
}

module.exports = { solve, fare };

if (require.main === module) {
  const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(solve(level));
}
