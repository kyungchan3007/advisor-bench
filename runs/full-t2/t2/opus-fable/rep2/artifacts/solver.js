'use strict';
// 막차 러너 풀이기
// 1) (칸, 틱) 전진 BFS 로 최소 도착 틱 T* 를 구한다 (도달 가능성은 칸·틱만으로 정해진다)
// 2) 역방향으로 "T* 안에 E 에 닿을 수 있는 (칸, 틱)" 표시(good)
// 3) good 안에서만 전체 상태 (틱, 칸, 통행상태, 통행거리, 퇴장후 경과) 에 대해
//    남은 비용(요금·승차횟수) 을 메모 DFS 로 계산 — 요금은 "누적 확정액 + 열린 통행 운임" 퍼텐셜로 가산형으로 만든다
// 4) 시작 상태에서 최적을 유지하는 가장 작은 행동 토큰을 차례로 골라 사전순 최소 문자열 복원

const fs = require('fs');

const DIRS = [
  ['D', 1, 0],
  ['L', 0, -1],
  ['R', 0, 1],
  ['U', -1, 0],
];
const ESC = { 'v': 0, '<': 1, '>': 2, '^': 3 };
const WALL = 0, IN = 1, OUT = 2, GATE = 3;

function fare(km) {
  let f = 1450;
  if (km > 10) f += 100 * Math.ceil((Math.min(km, 50) - 10) / 5);
  if (km > 50) f += 100 * Math.ceil((km - 50) / 8);
  return f;
}

function buildModel(level) {
  const grid = level.grid;
  const H = grid.length;
  const W = grid[0].length;
  const NC = H * W;
  const type = new Uint8Array(NC);
  const esc = new Int8Array(NC).fill(-1);
  const isE = new Uint8Array(NC);
  let start = -1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = grid[r][c];
      const id = r * W + c;
      if (ch === '.' || ch === 'P') type[id] = IN;
      else if (ch in ESC) { type[id] = IN; esc[id] = ESC[ch]; }
      else if (ch === ',' || ch === 'S' || ch === 'E') type[id] = OUT;
      else if (ch === 'G') type[id] = GATE;
      else type[id] = WALL;
      if (ch === 'S') start = id;
      if (ch === 'E') isE[id] = 1;
    }
  }

  // 역 폐쇄: 칸마다 가장 먼저 닫히는 역
  const closeAt = new Int32Array(NC).fill(1 << 30);
  const evictTo = new Int32Array(NC).fill(-1);
  for (const room of level.rooms || []) {
    const [r0, c0, r1, c1] = room.rect;
    for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
        const id = r * W + c;
        if (type[id] !== IN) continue;
        if (room.close < closeAt[id]) {
          closeAt[id] = room.close;
          evictTo[id] = room.evict[0] * W + room.evict[1];
        }
      }
    }
  }

  // 걷기/대기 이동 (토큰 순서 D L R U W)
  const moves = new Array(NC);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const id = r * W + c;
      const list = [];
      moves[id] = list;
      if (type[id] === WALL) continue;
      for (let d = 0; d < 4; d++) {
        const [tok, dr, dc] = DIRS[d];
        const nr = r + dr, nc = c + dc;
        if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
        const n = nr * W + nc;
        const tn = type[n];
        if (tn === WALL) continue;
        if (esc[id] >= 0 && esc[id] !== d) continue;
        if (esc[n] >= 0 && esc[n] !== d) continue;
        const ti = type[id];
        if ((ti === IN && tn === OUT) || (ti === OUT && tn === IN)) continue;
        list.push([tok, n]);
      }
      if (esc[id] < 0) list.push(['W', id]);
    }
  }

  // 열차: 칸별 (노선, 역 순번) → 하차 후보
  const boardAt = new Map(); // cell -> [{first, headway, last, cum, targets:[{tok, cell, dt, km}]}]
  for (const line of level.lines || []) {
    const st = line.stations;
    const n = st.length;
    const cum = [0];
    const cumKm = [0];
    for (let i = 0; i + 1 < n; i++) {
      cum.push(cum[i] + line.travel[i]);
      cumKm.push(cumKm[i] + line.km[i]);
    }
    for (let i = 0; i + 1 < n; i++) {
      const cell = st[i].at[0] * W + st[i].at[1];
      if (type[cell] !== IN || grid[st[i].at[0]][st[i].at[1]] !== 'P') continue;
      const seen = new Set();
      const targets = [];
      for (let j = i + 1; j < n; j++) {
        const name = st[j].name;
        if (seen.has(name)) continue;
        seen.add(name);
        const [ar, ac] = st[j].at;
        if (ar < 0 || ar >= H || ac < 0 || ac >= W) continue;
        const tcell = ar * W + ac;
        if (type[tcell] === WALL) continue;
        targets.push({
          tok: '[' + line.id + '>' + name + ']',
          cell: tcell,
          dt: cum[j] - cum[i],
          km: cumKm[j] - cumKm[i],
        });
      }
      if (!targets.length) continue;
      if (!boardAt.has(cell)) boardAt.set(cell, []);
      boardAt.get(cell).push({
        first: line.first, headway: line.headway, last: line.last, offset: cum[i], targets,
      });
    }
  }

  return { H, W, NC, type, esc, isE, start, closeAt, evictTo, moves, boardAt, maxTick: level.maxTick };
}

function trainHere(b, t) {
  const d = t - b.offset;
  if (d < b.first || d > b.last) return false;
  if (b.headway > 0) return (d - b.first) % b.headway === 0;
  return d === b.first;
}

// (칸, 틱) 에서 가능한 모든 행동: [tok, 도착칸(퇴장 반영), 도착틱, km, isRide, evicted]
function actions(M, cell, t) {
  const out = [];
  for (const [tok, n] of M.moves[cell]) {
    let dest = n, ev = false;
    if (M.type[n] === IN && M.closeAt[n] <= t + 1) { dest = M.evictTo[n]; ev = true; }
    out.push([tok, dest, t + 1, 0, false, ev, n]);
  }
  const bs = M.boardAt.get(cell);
  if (bs) {
    for (const b of bs) {
      if (!trainHere(b, t)) continue;
      for (const tg of b.targets) {
        const t2 = t + tg.dt;
        let dest = tg.cell, ev = false;
        if (M.type[dest] === IN && M.closeAt[dest] <= t2) { dest = M.evictTo[dest]; ev = true; }
        out.push([tg.tok, dest, t2, tg.km, true, ev, tg.cell]);
      }
    }
  }
  return out;
}

function solve(level) {
  const M = buildModel(level);
  const { NC, isE, start, maxTick } = M;
  if (start < 0) return '불가';
  const T = maxTick;
  const reach = new Uint8Array((T + 1) * NC);
  reach[start] = 1;
  let best = -1;
  for (let t = 0; t <= T && best < 0; t++) {
    const base = t * NC;
    for (let c = 0; c < NC; c++) {
      if (!reach[base + c]) continue;
      if (isE[c]) { best = t; break; }
    }
    if (best >= 0) break;
    for (let c = 0; c < NC; c++) {
      if (!reach[base + c]) continue;
      for (const a of actions(M, c, t)) {
        const t2 = a[2];
        if (t2 > T || t2 <= t || a[1] < 0) continue;
        reach[t2 * NC + a[1]] = 1;
      }
    }
  }
  if (best < 0) return '불가';
  const TS = best;

  // good: T* 안에 E 에 닿을 수 있는 (틱, 칸)
  const good = new Uint8Array((TS + 1) * NC);
  for (let t = TS; t >= 0; t--) {
    const base = t * NC;
    for (let c = 0; c < NC; c++) {
      if (!reach[base + c]) continue;
      if (isE[c]) { if (t === TS) good[base + c] = 1; continue; }
      for (const a of actions(M, c, t)) {
        const t2 = a[2];
        if (t2 > TS || t2 <= t || a[1] < 0) continue;
        if (good[t2 * NC + a[1]]) { good[base + c] = 1; break; }
      }
    }
  }

  // 전체 상태 전이
  // mode 0: 열린 통행 없음(밖), 1: 안(통행 중), 2: 밖으로 나온 지 off(0..30) 틱, km=k 인 통행 유지
  const BOARD = 1, FARE = 1000; // 비용 = 요금*1000 + 승차횟수
  function transitions(t, cell, mode, k, off) {
    const res = [];
    for (const a of actions(M, cell, t)) {
      const [tok, dest, t2, km, isRide, ev, raw] = a;
      if (t2 > TS || t2 <= t || dest < 0) continue;
      if (!good[t2 * NC + dest]) continue;
      let nm = mode, nk = k, x = mode === 2 ? t - off : 0, cost = 0;
      if (isRide) {
        if (mode !== 1) continue; // 안에 있어야 탈 수 있다
        cost += (fare(k + km) - fare(k)) * FARE + BOARD;
        nk = k + km;
      } else {
        const tn = M.type[raw];
        if (tn === IN && mode !== 1) {
          if (mode === 2 && t2 - x <= 30) { nm = 1; }
          else { nm = 1; nk = 0; cost += fare(0) * FARE; }
        } else if (tn === OUT && mode === 1) {
          nm = 2; x = t2;
        }
      }
      if (ev) { nm = 2; x = t2; }
      let noff = 0;
      if (nm === 2) {
        noff = t2 - x;
        if (noff > 30) { nm = 0; nk = 0; noff = 0; }
      }
      if (nm === 0) nk = 0;
      res.push([tok, t2, dest, nm, nk, noff, cost]);
    }
    return res;
  }

  const KM = 1000003;
  const memo = new Map(); // mode 0/1: 스칼라
  const memo2 = new Map(); // mode 2: off 0..30 전체를 한 벡터로 (상태 수 31배 절감)
  const keyOf = (t, cell, mode, k, off) => (((t * NC + cell) * 3 + mode) * 31 + off) * KM + k;
  const key2 = (t, cell, k) => (t * NC + cell) * KM + k;
  const aggKey = (t, cell, mode, k) => ((t * NC + cell) * 3 + mode) * KM + k;
  const INF = 2147483647;
  const ENTRY = fare(0) * FARE;

  // ── 상한 UB: 칸·mode 마다 라벨 하나만 남기는 빔 전진 탐색 (실제 경로이므로 UB >= 최적)
  let UB = Infinity;
  {
    let layers = new Map(); // t -> Map(cell*3+mode -> [g,k,off])
    const put = (t, cell, mode, k, off, g) => {
      let L = layers.get(t);
      if (!L) { L = new Map(); layers.set(t, L); }
      const key = cell * 3 + mode;
      const o = L.get(key);
      if (!o || g < o[0] || (g === o[0] && (k < o[1] || (k === o[1] && off < o[2])))) L.set(key, [g, k, off]);
    };
    put(0, start, 0, 0, 0, 0);
    for (let t = 0; t <= TS; t++) {
      const L = layers.get(t);
      if (!L) continue;
      layers.delete(t);
      for (const [key, [g, k, off]] of L) {
        const cell = Math.floor(key / 3), mode = key % 3;
        if (isE[cell]) { if (t === TS && g < UB) UB = g; continue; }
        for (const tr of transitions(t, cell, mode, k, off)) put(tr[1], tr[2], tr[3], tr[4], tr[5], g + tr[6]);
      }
    }
  }
  if (UB === Infinity) return '불가';

  // ── 정확한 전진 탐색: 지난 비용 g <= UB 인 상태만 남긴다 (최적 경로 위 상태는 모두 g <= 최적 <= UB)
  //    mode 2 는 off 0..30 벡터로 묶어 처리
  const alive = new Set(); // aggKey(t, cell, mode, k)
  {
    const L01 = new Map(); // t -> Map((cell*3+mode)*KM+k -> g)
    const L2 = new Map(); // t -> Map(cell*KM+k -> Float64Array(31))
    const getL = (M_, t) => { let L = M_.get(t); if (!L) { L = new Map(); M_.set(t, L); } return L; };
    const push = (t, cell, mode, k, off, g) => {
      if (g > UB) return;
      if (mode === 2) {
        const L = getL(L2, t);
        const key = cell * KM + k;
        let V = L.get(key);
        if (!V) { V = new Float64Array(31).fill(Infinity); L.set(key, V); }
        if (g < V[off]) V[off] = g;
      } else {
        const L = getL(L01, t);
        const key = (cell * 3 + mode) * KM + k;
        const o = L.get(key);
        if (o === undefined || g < o) L.set(key, g);
      }
    };
    push(0, start, 0, 0, 0, 0);
    for (let t = 0; t <= TS; t++) {
      const A = L01.get(t);
      L01.delete(t);
      if (A) {
        for (const [key, g] of A) {
          const k = key % KM, cm = (key - k) / KM, cell = Math.floor(cm / 3), mode = cm % 3;
          alive.add(aggKey(t, cell, mode, k));
          if (isE[cell]) continue;
          for (const tr of transitions(t, cell, mode, k, 0)) push(tr[1], tr[2], tr[3], tr[4], tr[5], g + tr[6]);
        }
      }
      const B = L2.get(t);
      L2.delete(t);
      if (B) {
        for (const [key, V] of B) {
          const k = key % KM, cell = (key - k) / KM;
          alive.add(aggKey(t, cell, 2, k));
          if (isE[cell]) continue;
          let cont = Infinity;
          for (let o = 0; o < 30; o++) if (V[o] < cont) cont = V[o];
          for (const a of actions(M, cell, t)) {
            const [, dest, t2, , isRide, ev, raw] = a;
            if (isRide || t2 > TS || t2 <= t || dest < 0 || !good[t2 * NC + dest]) continue;
            if (M.type[raw] === IN) {
              if (ev) { push(t2, dest, 2, k, 0, cont); push(t2, dest, 2, 0, 0, V[30] + ENTRY); }
              else { push(t2, dest, 1, k, 0, cont); push(t2, dest, 1, 0, 0, V[30] + ENTRY); }
            } else {
              for (let o = 0; o < 30; o++) if (V[o] < Infinity) push(t2, dest, 2, k, o + 1, V[o]);
              push(t2, dest, 0, 0, 0, V[30]);
            }
          }
        }
      }
    }
  }
  const NOPE = new Int32Array(31).fill(INF);

  function cost(t, cell, mode, k, off) {
    if (isE[cell]) return t === TS ? 0 : Infinity;
    if (!alive.has(aggKey(t, cell, mode, k))) return Infinity;
    if (mode === 2) {
      const v = vec2(t, cell, k)[off];
      return v === INF ? Infinity : v;
    }
    const key = keyOf(t, cell, mode, k, 0);
    const m = memo.get(key);
    if (m !== undefined) return m;
    memo.set(key, Infinity);
    let bestC = Infinity;
    for (const tr of transitions(t, cell, mode, k, off)) {
      const c = tr[6] + cost(tr[1], tr[2], tr[3], tr[4], tr[5]);
      if (c < bestC) bestC = c;
    }
    memo.set(key, bestC);
    return bestC;
  }

  // 밖(또는 밖에서 온 G)에서 퇴장 후 off 틱 지난 상태들의 남은 비용 벡터
  // transitions() 의 mode 2 처리와 같은 규칙: 다음 틱 off+1 <= 30 이면 통행 이어짐, 넘으면 mode 0
  function vec2(t, cell, k) {
    const key = key2(t, cell, k);
    let V = memo2.get(key);
    if (V !== undefined) return V;
    if (!alive.has(aggKey(t, cell, 2, k))) return NOPE;
    V = new Int32Array(31).fill(INF);
    memo2.set(key, V);
    for (const a of actions(M, cell, t)) {
      const [, dest, t2, , isRide, ev, raw] = a;
      if (isRide) continue;
      if (t2 > TS || t2 <= t || dest < 0) continue;
      if (!good[t2 * NC + dest]) continue;
      if (isE[dest]) {
        if (t2 === TS) V.fill(0);
        continue;
      }
      if (M.type[raw] === IN) {
        // 입장: off<=29 → 이어짐, off=30 → 새 통행
        const cont = ev ? cost(t2, dest, 2, k, 0) : cost(t2, dest, 1, k, 0);
        const neu = ENTRY + (ev ? cost(t2, dest, 2, 0, 0) : cost(t2, dest, 1, 0, 0));
        if (cont < INF) for (let o = 0; o < 30; o++) if (cont < V[o]) V[o] = cont;
        if (neu < V[30]) V[30] = neu;
      } else {
        const W = vec2(t2, dest, k);
        for (let o = 0; o < 30; o++) if (W[o + 1] < V[o]) V[o] = W[o + 1];
        const c0 = cost(t2, dest, 0, 0, 0);
        if (c0 < V[30]) V[30] = c0;
      }
    }
    return V;
  }

  const opt = cost(0, start, 0, 0, 0);
  if (opt === Infinity) return '불가';

  // 사전순 복원 (같은 문자열로 갈 수 있는 상태 집합을 함께 들고 간다)
  let cur = [[0, start, 0, 0, 0, 0]]; // t, cell, mode, k, off, past
  let outStr = '';
  for (;;) {
    if (cur.some((s) => isE[s[1]])) break;
    let bestTok = null;
    let next = [];
    for (const [t, cell, mode, k, off, past] of cur) {
      for (const tr of transitions(t, cell, mode, k, off)) {
        const [tok, t2, c2, m2, k2, o2, dc] = tr;
        const p2 = past + dc;
        if (p2 + cost(t2, c2, m2, k2, o2) !== opt) continue;
        if (bestTok === null || tok < bestTok) { bestTok = tok; next = []; }
        if (tok === bestTok) next.push([t2, c2, m2, k2, o2, p2]);
      }
    }
    if (bestTok === null) return '불가';
    outStr += bestTok;
    const seen = new Set();
    cur = next.filter((s) => {
      const key = keyOf(s[0], s[1], s[2], s[3], s[4]) + ':' + s[5];
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }
  return outStr;
}

// 검증용: 행동 문자열을 규칙대로 시뮬레이션 → {ok, tick, fare, boards}
function simulate(level, str) {
  const M = buildModel(level);
  const toks = str.match(/\[[^\]]*\]|[DLRUW]/g) || [];
  if (toks.join('') !== str) return { ok: false, why: 'parse' };
  let t = 0, cell = M.start, mode = 0, k = 0, x = 0, total = 0, boards = 0;
  for (const tok of toks) {
    if (M.isE[cell]) return { ok: false, why: 'after end' };
    if (mode === 2 && t - x > 30) { total += fare(k); mode = 0; k = 0; }
    const cands = actions(M, cell, t).filter((a) => a[0] === tok);
    if (cands.length !== 1) return { ok: false, why: `action ${tok} at t=${t} cands=${cands.length}` };
    const [, dest, t2, km, isRide, ev, raw] = cands[0];
    if (isRide) {
      if (mode !== 1) return { ok: false, why: 'ride outside' };
      k += km; boards++;
    } else {
      const tn = M.type[raw];
      if (tn === IN && mode !== 1) {
        if (mode === 2 && t2 - x <= 30) mode = 1;
        else { if (mode === 2) total += fare(k); mode = 1; k = 0; }
      } else if (tn === OUT && mode === 1) { mode = 2; x = t2; }
    }
    if (ev) { mode = 2; x = t2; }
    t = t2; cell = dest;
  }
  if (!M.isE[cell] || t > M.maxTick) return { ok: false, why: 'not at E' };
  if (mode !== 0) total += fare(k);
  return { ok: true, tick: t, fare: total, boards };
}

module.exports = { solve, simulate, fare };

if (require.main === module) {
  const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(solve(level));
}
