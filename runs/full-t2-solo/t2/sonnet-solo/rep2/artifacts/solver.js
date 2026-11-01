'use strict';
// 막차 러너 풀이기: 시간 확장 그래프 + (1) 순방향 도달성 -> 최단 도착 틱 T*,
// (2) 역방향 도달성(T*에 E 도착 가능한 상태만), (3) 가지친 상태 위에서 라벨(요금/승차/문자열) 탐색.
const fs = require('fs');

const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = level.grid;
const H = grid.length, W = grid[0].length;
const maxTick = level.maxTick;
const N = H * W;

const INSIDE = new Set(['.', 'P', '>', '<', '^', 'v']);
const OUTSIDE = new Set([',', 'S', 'E']);
// 칸 종류: 0 벽, 1 안, 2 밖, 3 G
const kind = new Uint8Array(N);
const esc = new Int8Array(N).fill(-1); // 에스컬레이터 방향 인덱스
const DIRS = [[1, 0, 'D'], [0, -1, 'L'], [0, 1, 'R'], [-1, 0, 'U']];
let S = -1, E = -1;
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
  const ch = grid[r][c], i = r * W + c;
  if (ch === '#') kind[i] = 0;
  else if (ch === 'G') kind[i] = 3;
  else if (INSIDE.has(ch)) kind[i] = 1;
  else if (OUTSIDE.has(ch)) kind[i] = 2;
  if (ch === 'S') S = i;
  if (ch === 'E') E = i;
  if (ch === 'v') esc[i] = 0;
  else if (ch === '<') esc[i] = 1;
  else if (ch === '>') esc[i] = 2;
  else if (ch === '^') esc[i] = 3;
}

// 역 건물
const roomClose = new Int32Array(N).fill(1e9);
const roomEvict = new Int32Array(N).fill(-1);
for (const room of level.rooms || []) {
  const [r0, c0, r1, c1] = room.rect;
  const ev = room.evict[0] * W + room.evict[1];
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
    if (r < 0 || c < 0 || r >= H || c >= W) continue;
    const i = r * W + c;
    if (kind[i] === 1) { roomClose[i] = room.close; roomEvict[i] = ev; }
  }
}

// 열차 승차 이벤트: boardEv[t] = [{cell, line, i, ...}]
const boardEv = Array.from({ length: maxTick + 1 }, () => []);
for (const line of level.lines) {
  const n = line.stations.length;
  const cum = [0];
  const cumKm = [0];
  for (let i = 0; i < n - 1; i++) { cum.push(cum[i] + line.travel[i]); cumKm.push(cumKm[i] + line.km[i]); }
  // 승차 i 에서 하차 가능한 j
  const opts = [];
  for (let i = 0; i < n; i++) {
    const o = [];
    const seen = new Set();
    for (let j = i + 1; j < n; j++) {
      const nm = line.stations[j].name;
      if (!seen.has(nm)) o.push(j);
      seen.add(nm);
    }
    opts.push(o);
  }
  for (let i = 0; i < n - 1; i++) {
    const cell = line.stations[i].at[0] * W + line.stations[i].at[1];
    const rides = opts[i].map(j => ({
      dt: cum[j] - cum[i],
      km: cumKm[j] - cumKm[i],
      cell: line.stations[j].at[0] * W + line.stations[j].at[1],
      token: `[${line.id}>${line.stations[j].name}]`,
    }));
    for (let d = line.first; d <= line.last; d += line.headway) {
      const t = d + cum[i];
      if (t > maxTick) break;
      boardEv[t].push({ cell, rides });
    }
  }
}
// 칸별 승차 이벤트 조회용
const boardAt = Array.from({ length: maxTick + 1 }, () => null);
for (let t = 0; t <= maxTick; t++) {
  if (boardEv[t].length) {
    const m = new Map();
    for (const ev of boardEv[t]) {
      if (!m.has(ev.cell)) m.set(ev.cell, []);
      m.get(ev.cell).push(...ev.rides);
    }
    boardAt[t] = m;
  }
}

function fare(D) {
  if (D <= 10) return 1450;
  if (D <= 50) return 1450 + 100 * Math.ceil((D - 10) / 5);
  return 2250 + 100 * Math.ceil((D - 50) / 8);
}

// 이동 생성. 상태: (t, cell, zone) zone 0 밖, 1 안 (G 는 마지막 구역)
// 콜백 fn(nt, ncell, nzone, token, entry, exit, km)
function genMoves(t, cell, zone, limit, fn) {
  const nt = t + 1;
  const ck = kind[cell];
  const r = (cell / W) | 0, c = cell - r * W;
  if (nt <= limit) {
    // 대기
    if (esc[cell] < 0) finish(nt, cell, zone, cell, 'W', fn);
    // 이동
    for (let d = 0; d < 4; d++) {
      if (esc[cell] >= 0 && esc[cell] !== d) continue;
      const nr = r + DIRS[d][0], nc = c + DIRS[d][1];
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      const ni = nr * W + nc;
      const nk = kind[ni];
      if (nk === 0) continue;
      if (esc[ni] >= 0 && esc[ni] !== d) continue;
      if (ck === 1 && nk === 2) continue;
      if (ck === 2 && nk === 1) continue;
      finish(nt, ni, zone, cell, DIRS[d][2], fn);
    }
  }
  // 승차
  if (ck === 1 && zone === 1 && boardAt[t]) {
    const rides = boardAt[t].get(cell);
    if (rides) {
      for (const rd of rides) {
        const at = t + rd.dt;
        if (at > limit) continue;
        // 하차 후 폐쇄 검사
        let ncell = rd.cell, nzone = 1, exit = false;
        if (at >= roomClose[ncell]) { ncell = roomEvict[ncell]; nzone = 0; exit = true; }
        fn(at, ncell, nzone, rd.token, false, exit, rd.km);
      }
    }
  }
}

// 걷기/대기 결과 처리: 목적 칸 ni, 이전 구역 zone, 이전 칸 from
function finish(nt, ni, zone, from, token, fn) {
  const nk = kind[ni];
  let nzone = zone, entry = false, exit = false;
  if (nk === 1) {
    nzone = 1;
    if (kind[from] === 3 && zone === 0) entry = true;
  } else if (nk === 2) {
    nzone = 0;
    if (kind[from] === 3 && zone === 1) exit = true;
  } else { // G
    if (kind[from] === 1) nzone = 1;
    else if (kind[from] === 2) nzone = 0;
  }
  if (nk === 1 && nt >= roomClose[ni]) {
    ni = roomEvict[ni]; nzone = 0; exit = true;
  }
  fn(nt, ni, nzone, token, entry, exit, 0);
}

function validState(cell, zone) {
  const k = kind[cell];
  if (k === 0) return false;
  if (k === 1) return zone === 1;
  if (k === 2) return zone === 0;
  return true;
}

// ---------- 1. 순방향 도달성 ----------
const S2 = N * 2;
const fw = Array.from({ length: maxTick + 1 }, () => null);
fw[0] = new Uint8Array(S2);
fw[0][S * 2] = 1;
let Tstar = -1;
for (let t = 0; t <= maxTick; t++) {
  if (Tstar >= 0 && Tstar <= t) break;
  const cur = fw[t];
  if (!cur) continue;
  for (let s = 0; s < S2; s++) {
    if (!cur[s]) continue;
    const cell = s >> 1, zone = s & 1;
    if (cell === E) continue;
    genMoves(t, cell, zone, maxTick, (nt, nc, nz) => {
      if (!fw[nt]) fw[nt] = new Uint8Array(S2);
      fw[nt][nc * 2 + nz] = 1;
      if (nc === E && (Tstar < 0 || nt < Tstar)) Tstar = nt;
    });
  }
}
if (Tstar < 0) { console.log('불가'); process.exit(0); }

// ---------- 2. 역방향 도달성 (T* 에 E 도착) ----------
const bw = Array.from({ length: Tstar + 1 }, () => null);
bw[Tstar] = new Uint8Array(S2);
bw[Tstar][E * 2] = 1;
for (let t = Tstar - 1; t >= 0; t--) {
  const f = fw[t];
  if (!f) continue;
  const cur = new Uint8Array(S2);
  bw[t] = cur;
  for (let s = 0; s < S2; s++) {
    if (!f[s]) continue;
    const cell = s >> 1, zone = s & 1;
    if (cell === E) continue;
    let ok = false;
    genMoves(t, cell, zone, Tstar, (nt, nc, nz) => {
      if (!ok && bw[nt] && bw[nt][nc * 2 + nz]) ok = true;
    });
    if (ok) cur[s] = 1;
  }
}

// ---------- 3. 라벨 탐색 ----------
// 라벨: {c0, D, b, s, e}. e: 퇴장 틱(밖에서 통행이 살아있을 때), 없으면 -1.
// 총요금 = c0 + (통행 활성 ? fare(D) : 0), 통행 활성 = 안이거나 e>=0.
// 같은 키(cell, zone, e)에서 (c0, D, b) 모두 <= 이고 문자열도 <= 이면 지배.
function dominates(a, b) {
  return a.c0 <= b.c0 && a.D <= b.D && a.b <= b.b && a.s <= b.s;
}
const layers = Array.from({ length: Tstar + 1 }, () => null);
function insert(nt, cell, zone, lab) {
  let m = layers[nt];
  if (!m) m = layers[nt] = new Map();
  const key = (cell * 2 + zone) * 1024 + (lab.e + 1);
  const list = m.get(key);
  if (!list) { m.set(key, [lab]); return; }
  for (let i = 0; i < list.length; i++) if (dominates(list[i], lab)) return;
  let w = 0;
  for (let i = 0; i < list.length; i++) if (!dominates(lab, list[i])) list[w++] = list[i];
  list.length = w;
  list.push(lab);
}

layers[0] = new Map();
insert(0, S, 0, { c0: 0, D: 0, b: 0, s: '', e: -1 });

let best = null;
for (let t = 0; t <= Tstar; t++) {
  const m = layers[t];
  if (!m) continue;
  layers[t] = null;
  const bwt = bw[t];
  for (const [key, list] of m) {
    const e = (key % 1024) - 1;
    const sk = Math.floor(key / 1024);
    const cell = sk >> 1, zone = sk & 1;
    if (cell === E) {
      if (t !== Tstar) continue;
      for (const lab of list) {
        const total = lab.c0 + (lab.e >= 0 ? fare(lab.D) : 0);
        if (!best || total < best.total || (total === best.total && (lab.b < best.b || (lab.b === best.b && lab.s < best.s)))) {
          best = { total, b: lab.b, s: lab.s };
        }
      }
      continue;
    }
    if (!bwt || !bwt[sk]) continue;
    for (const lab of list) {
      genMoves(t, cell, zone, Tstar, (nt, nc, nz, token, entry, exit, km) => {
        const nb = bw[nt];
        if (!nb || !nb[nc * 2 + nz]) return;
        let c0 = lab.c0, D = lab.D, ne = lab.e;
        if (entry) {
          if (ne >= 0 && nt - ne <= 30) { /* 이어짐 */ }
          else {
            if (ne >= 0) c0 += fare(D);
            D = 0;
          }
          ne = -1;
        }
        if (km) D += km;
        if (exit) ne = nt;
        if (nz === 0 && ne >= 0 && nt - ne > 30) { c0 += fare(D); D = 0; ne = -1; }
        insert(nt, nc, nz, { c0, D, b: lab.b + (km ? 1 : 0), s: lab.s + token, e: ne });
      });
    }
  }
}

console.log(best ? best.s : '불가');
