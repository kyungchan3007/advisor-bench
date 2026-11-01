'use strict';
// 막차 러너 풀이기: node solver.js <level.json>
// 1) (칸,틱) 정방향 도달 -> 최단 도착 틱 T*   2) 역방향으로 T*에 닿는 상태만 남김
// 3) 남긴 상태 위에서 요금 상태(통행 거리/재입장 기한)를 가진 라벨 DP, 파레토 지배 + 사전순 비교
const fs = require('fs');

const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = level.grid;
const H = grid.length, W = grid[0].length, N = H * W;
const maxTick = level.maxTick;
const INF = 1e9;

// ---------- 지도 ----------
const ZOUT = 0, ZIN = 1, ZG = 2, ZWALL = 3;
const zone = new Uint8Array(N);
const arrow = new Int8Array(N).fill(-1); // 0:D 1:L 2:R 3:U
const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0], DCH = ['D', 'L', 'R', 'U'];
let startCell = -1, endCell = -1;
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const ch = grid[r][c], i = r * W + c;
  switch (ch) {
    case '.': case 'P': zone[i] = ZIN; break;
    case 'v': zone[i] = ZIN; arrow[i] = 0; break;
    case '<': zone[i] = ZIN; arrow[i] = 1; break;
    case '>': zone[i] = ZIN; arrow[i] = 2; break;
    case '^': zone[i] = ZIN; arrow[i] = 3; break;
    case ',': zone[i] = ZOUT; break;
    case 'S': zone[i] = ZOUT; startCell = i; break;
    case 'E': zone[i] = ZOUT; endCell = i; break;
    case 'G': zone[i] = ZG; break;
    default: zone[i] = ZWALL;
  }
}

// 방: 안 칸 -> (close, evict)
const closeT = new Int32Array(N).fill(INF);
const evictTo = new Int32Array(N).fill(-1);
for (const room of level.rooms || []) {
  const [r0, c0, r1, c1] = room.rect;
  const ev = room.evict[0] * W + room.evict[1];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (r < 0 || r >= H || c < 0 || c >= W) continue;
    const i = r * W + c;
    if (zone[i] !== ZIN || closeT[i] !== INF || evictTo[i] >= 0) continue; // 겹치면 먼저 나온 방
    closeT[i] = room.close;
    evictTo[i] = ev;
  }
}

// 이동 가능한 이웃 (정적)
const nbrStart = new Int32Array(N + 1);
const nbrCell = [], nbrDir = [];
for (let i = 0; i < N; i++) {
  nbrStart[i] = nbrCell.length;
  if (zone[i] === ZWALL) continue;
  const r = (i / W) | 0, c = i % W;
  for (let d = 0; d < 4; d++) {
    if (arrow[i] >= 0 && arrow[i] !== d) continue;
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
    const n = nr * W + nc;
    if (zone[n] === ZWALL) continue;
    if (arrow[n] >= 0 && arrow[n] !== d) continue;
    if ((zone[i] === ZIN && zone[n] === ZOUT) || (zone[i] === ZOUT && zone[n] === ZIN)) continue;
    nbrCell.push(n); nbrDir.push(d);
  }
}
nbrStart[N] = nbrCell.length;

// ---------- 열차 ----------
// boardAt[t] : Map cell -> [ {alights:[{dt,km,cell,name,id}]} ]
const boardAt = new Array(maxTick + 1);
for (let t = 0; t <= maxTick; t++) boardAt[t] = null;
for (const line of level.lines) {
  const st = line.stations, n = st.length;
  const cumT = [0], cumK = [0];
  for (let i = 0; i < n - 1; i++) { cumT.push(cumT[i] + line.travel[i]); cumK.push(cumK[i] + line.km[i]); }
  const alightsOf = [];
  for (let i = 0; i < n; i++) {
    const list = [];
    const seen = new Set();
    for (let j = i + 1; j < n; j++) {
      if (seen.has(st[j].name)) continue; // 가장 가까운 뒤 역만
      seen.add(st[j].name);
      list.push({
        dt: cumT[j] - cumT[i], km: cumK[j] - cumK[i],
        cell: st[j].at[0] * W + st[j].at[1],
        str: '[' + line.id + '>' + st[j].name + ']',
      });
    }
    alightsOf.push(list);
  }
  for (let d = line.first; d <= line.last; d += line.headway) {
    for (let i = 0; i < n - 1; i++) {
      const t = d + cumT[i];
      if (t > maxTick) continue;
      if (alightsOf[i].length === 0) continue;
      const cell = st[i].at[0] * W + st[i].at[1];
      if (!boardAt[t]) boardAt[t] = new Map();
      let arr = boardAt[t].get(cell);
      if (!arr) { arr = []; boardAt[t].set(cell, arr); }
      arr.push(alightsOf[i]);
    }
  }
}

// ---------- 공통 전이 ----------
// 상태 s = cell*2 + flag (flag 1: 개찰구 안쪽 통행 중)
const CAP = 8192;
const sT = new Int32Array(CAP), sS = new Int32Array(CAP), sKm = new Int32Array(CAP);
const sEnter = new Uint8Array(CAP), sExit = new Uint8Array(CAP), sBoard = new Uint8Array(CAP);
const sStr = new Array(CAP);
let sN = 0;

function push(t2, cell2, flag2, enter, exit, km, board, str) {
  // 강제 퇴장
  if (zone[cell2] === ZIN && t2 >= closeT[cell2] && evictTo[cell2] >= 0) {
    cell2 = evictTo[cell2]; flag2 = 0; exit = 1;
    if (zone[cell2] === ZIN) flag2 = 1; // 방어적(규칙상 밖 칸)
  }
  if (sN >= CAP) return;
  sT[sN] = t2; sS[sN] = cell2 * 2 + flag2; sKm[sN] = km;
  sEnter[sN] = enter; sExit[sN] = exit; sBoard[sN] = board; sStr[sN] = str;
  sN++;
}

function succ(t, s) {
  sN = 0;
  const c = s >> 1, flag = s & 1;
  if (c === endCell) return 0;
  const t2 = t + 1;
  if (t2 <= maxTick) {
    // 대기
    if (arrow[c] < 0) push(t2, c, flag, 0, 0, 0, 0, 'W');
    for (let k = nbrStart[c]; k < nbrStart[c + 1]; k++) {
      const n = nbrCell[k], z = zone[n];
      let f2 = flag, enter = 0, exit = 0;
      if (z === ZIN) { if (!flag) enter = 1; f2 = 1; }
      else if (z === ZOUT) { if (flag) exit = 1; f2 = 0; }
      push(t2, n, f2, enter, exit, 0, 0, DCH[nbrDir[k]]);
    }
  }
  // 열차
  if (flag && zone[c] === ZIN && boardAt[t]) {
    const lst = boardAt[t].get(c);
    if (lst) for (const als of lst) for (const a of als) {
      const ta = t + a.dt;
      if (ta > maxTick) continue;
      push(ta, a.cell, 1, 0, 0, a.km, 1, a.str);
    }
  }
  return sN;
}

function fare(km) {
  if (km <= 10) return 1450;
  if (km <= 50) return 1450 + 100 * Math.ceil((km - 10) / 5);
  return 2250 + 100 * Math.ceil((km - 50) / 8);
}

// ---------- 1단계: 정방향 도달 ----------
const NS = N * 2;
const reach = new Array(maxTick + 1);
for (let t = 0; t <= maxTick; t++) reach[t] = null;
reach[0] = new Uint8Array(NS);
reach[0][startCell * 2] = 1;
let Tstar = -1;
const E0 = endCell * 2;
if (startCell === endCell) Tstar = 0;
for (let t = 0; t <= maxTick && Tstar < 0; t++) {
  const cur = reach[t];
  if (!cur) continue;
  for (let s = 0; s < NS; s++) {
    if (!cur[s]) continue;
    const n = succ(t, s);
    for (let k = 0; k < n; k++) {
      const tt = sT[k];
      if (!reach[tt]) reach[tt] = new Uint8Array(NS);
      reach[tt][sS[k]] = 1;
    }
  }
  // tick t 까지 확장했으면 t+1 이하 도착은 모두 확정
  if (reach[t + 1] && reach[t + 1][E0]) Tstar = t + 1;
}
if (Tstar < 0) {
  // 마지막 틱까지 확장했을 때(열차 강제 퇴장 등) 전체에서 최소 틱 확인
  for (let t = 0; t <= maxTick; t++) if (reach[t] && reach[t][E0]) { Tstar = t; break; }
}
if (Tstar < 0) { console.log('불가'); process.exit(0); }

// ---------- 2단계: 역방향 가지치기 ----------
const good = new Array(Tstar + 1);
for (let t = 0; t <= Tstar; t++) good[t] = null;
good[Tstar] = new Uint8Array(NS);
good[Tstar][E0] = 1;
for (let t = Tstar - 1; t >= 0; t--) {
  const cur = reach[t];
  if (!cur) continue;
  const g = new Uint8Array(NS);
  let any = false;
  for (let s = 0; s < NS; s++) {
    if (!cur[s]) continue;
    const n = succ(t, s);
    for (let k = 0; k < n; k++) {
      const tt = sT[k];
      if (tt <= Tstar && good[tt] && good[tt][sS[k]]) { g[s] = 1; any = true; break; }
    }
  }
  if (any) good[t] = g;
}
if (!good[0] || !good[0][startCell * 2]) { console.log('불가'); process.exit(0); }

// ---------- 3단계: 라벨 DP ----------
// 라벨: F(확정 요금) D(열린 통행 거리, -1 없음) e(마지막 퇴장 틱, 통행 중이면 INF) b(승차) s(문자열)
function passLE(a, b) {
  if (a.D < 0) return true;
  if (b.D < 0) return false;
  return a.D <= b.D && a.e >= b.e;
}
function dominates(a, b) {
  if (!passLE(a, b)) return false;
  if (a.F !== b.F) return a.F < b.F;
  if (a.b !== b.b) return a.b < b.b;
  return a.s <= b.s;
}
function insert(list, lab) {
  for (let i = 0; i < list.length; i++) if (dominates(list[i], lab)) return;
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!dominates(lab, list[i])) list[w++] = list[i];
  list.length = w;
  list.push(lab);
}

const layers = new Array(Tstar + 1);
for (let t = 0; t <= Tstar; t++) layers[t] = null;
layers[0] = new Map();
layers[0].set(startCell * 2, [{ F: 0, D: -1, e: INF, b: 0, s: '' }]);

let finals = null;
for (let t = 0; t <= Tstar; t++) {
  const mp = layers[t];
  layers[t] = null;
  if (!mp) continue;
  if (t === Tstar) { finals = mp.get(E0) || null; break; }
  for (const [s, labs] of mp) {
    const n = succ(t, s);
    for (let k = 0; k < n; k++) {
      const t2 = sT[k], s2 = sS[k];
      if (t2 > Tstar || !good[t2] || !good[t2][s2]) continue;
      const enter = sEnter[k], exit = sExit[k], km = sKm[k], bd = sBoard[k], str = sStr[k];
      let target = layers[t2];
      if (!target) { target = new Map(); layers[t2] = target; }
      let list = target.get(s2);
      if (!list) { list = []; target.set(s2, list); }
      const inFlag = s2 & 1;
      for (let i = 0; i < labs.length; i++) {
        const L = labs[i];
        let F = L.F, D = L.D, e = L.e;
        if (enter) {
          if (D >= 0 && e !== INF && t2 - e <= 30) { /* 이어짐 */ }
          else { if (D >= 0) F += fare(D); D = 0; }
        }
        if (km) D += km;
        if (exit) e = t2;
        if (inFlag) e = INF;
        else {
          if (D >= 0 && e !== INF && t2 - e > 30) { F += fare(D); D = -1; e = INF; }
        }
        insert(list, { F, D, e, b: L.b + bd, s: L.s + str });
      }
    }
  }
}
if (!finals || finals.length === 0) { console.log('불가'); process.exit(0); }
let best = null, bestTotal = 0;
for (const L of finals) {
  const total = L.F + (L.D >= 0 ? fare(L.D) : 0);
  if (!best || total < bestTotal || (total === bestTotal && (L.b < best.b || (L.b === best.b && L.s < best.s)))) {
    best = L; bestTotal = total;
  }
}
console.log(best.s);
if (process.env.SOLVER_DEBUG) console.error('T*=' + Tstar, 'fare=' + bestTotal, 'rides=' + best.b);
