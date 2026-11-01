'use strict';
// 막차 러너 풀이기 (미검증: 실행 없이 작성됨)
const fs = require('fs');

// ---------- 입력 파싱 ----------
const lvl = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = lvl.grid;
const maxTick = lvl.maxTick;
const H = grid.length;
const W = grid[0].length;
const N = H * W;

// 칸 종류: 0 벽, 1 안, 2 밖, 3 개찰구, 4 E
const tp = new Uint8Array(N);
// 에스컬레이터 방향 인덱스 (D=0 L=1 R=2 U=3), 아니면 -1
const esc = new Int8Array(N).fill(-1);
let S = -1;
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const id = r * W + c;
    if (ch === '.' || ch === 'P') tp[id] = 1;
    else if (ch === '>') { tp[id] = 1; esc[id] = 2; }
    else if (ch === '<') { tp[id] = 1; esc[id] = 1; }
    else if (ch === '^') { tp[id] = 1; esc[id] = 3; }
    else if (ch === 'v') { tp[id] = 1; esc[id] = 0; }
    else if (ch === ',') tp[id] = 2;
    else if (ch === 'S') { tp[id] = 2; S = id; }
    else if (ch === 'E') tp[id] = 4;
    else if (ch === 'G') tp[id] = 3;
    else tp[id] = 0;
  }
}

const DR = [1, 0, 0, -1];
const DC = [0, -1, 1, 0];
const ACH = 'DLRUW';

// ---------- 열차 시간표: rides[t*N+cell] = [노선, i, j, 노선, i, j, ...] ----------
const lineData = [];
const rides = new Map();
const isPlat = new Uint8Array(N);
for (let li = 0; li < lvl.lines.length; li++) {
  const L = lvl.lines[li];
  const n = L.stations.length;
  const at = [];
  const off = new Array(n).fill(0);
  const kmc = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    at.push(L.stations[i].at[0] * W + L.stations[i].at[1]);
    if (i > 0) {
      off[i] = off[i - 1] + L.travel[i - 1];
      kmc[i] = kmc[i - 1] + L.km[i - 1];
      if (L.travel[i - 1] < 1) console.error('경고: travel < 1', L.id);
    }
  }
  const cands = [];
  for (let i = 0; i < n; i++) {
    const seen = new Set();
    const list = [];
    for (let j = i + 1; j < n; j++) {
      const nm = L.stations[j].name;
      if (!seen.has(nm)) { seen.add(nm); list.push(j); }
    }
    cands.push(list);
  }
  const tok = [];
  for (let j = 0; j < n; j++) tok.push('[' + L.id + '>' + L.stations[j].name + ']');
  lineData.push({ at, off, kmc, tok });
  for (let i = 0; i < n; i++) isPlat[at[i]] = 1;

  const hw = L.headway;
  for (let d = L.first; d <= L.last; d += hw) {
    for (let i = 0; i < n; i++) {
      const t = d + off[i];
      if (t > maxTick) break;
      if (t < 0) continue;
      const list = cands[i];
      for (let q = 0; q < list.length; q++) {
        const j = list[q];
        const arr = t + off[j] - off[i];
        if (arr > maxTick || arr <= t) continue;
        const key = t * N + at[i];
        let a = rides.get(key);
        if (a === undefined) { a = []; rides.set(key, a); }
        a.push(li, i, j);
      }
    }
    if (!(hw > 0)) break;
  }
}

// ---------- 강제 퇴장 ----------
const roomsAt = new Array(N);
for (const room of lvl.rooms || []) {
  if (room.close > maxTick) continue;
  const ev = room.evict[0] * W + room.evict[1];
  for (let r = room.rect[0]; r <= room.rect[2]; r++) {
    for (let c = room.rect[1]; c <= room.rect[3]; c++) {
      if (r < 0 || r >= H || c < 0 || c >= W) continue;
      const id = r * W + c;
      if (tp[id] !== 1) continue;
      if (roomsAt[id] === undefined) roomsAt[id] = [];
      roomsAt[id].push([room.close, ev]);
    }
  }
}
function evictAt(b, nt) {
  const L = roomsAt[b];
  if (L === undefined) return -1;
  for (let i = 0; i < L.length; i++) if (nt >= L[i][0]) return L[i][1];
  return -1;
}

// ---------- 전이 (결과는 전역 o*에 기록) ----------
let oT = 0, oC = 0, oZ = 0, oEn = false, oEx = false, oKm = 0;

// a: 0..3 이동(D L R U), 4 대기
function tryMove(t, c, z, a) {
  const nt = t + 1;
  if (nt > maxTick) return false;
  let b;
  if (a === 4) {
    if (esc[c] >= 0) return false;
    b = c;
  } else {
    if (esc[c] >= 0 && esc[c] !== a) return false;
    const nr = ((c / W) | 0) + DR[a];
    const nc = (c % W) + DC[a];
    if (nr < 0 || nr >= H || nc < 0 || nc >= W) return false;
    b = nr * W + nc;
    if (esc[b] >= 0 && esc[b] !== a) return false;
    const ct = tp[c];
    const bt0 = tp[b];
    if (bt0 === 0) return false;
    if (ct === 1 && (bt0 === 2 || bt0 === 4)) return false;
    if (ct === 2 && bt0 === 1) return false;
  }
  const bt = tp[b];
  let nz = z, en = false, ex = false;
  if (bt === 1) {
    if (z === 0) en = true;
    nz = 1;
  } else if (bt === 2 || bt === 4) {
    if (z === 1) ex = true;
    nz = 0;
  }
  if (bt === 1) {
    const e = evictAt(b, nt);
    if (e >= 0) { b = e; nz = 0; ex = true; }
  }
  oT = nt; oC = b; oZ = nz; oEn = en; oEx = ex; oKm = 0;
  return true;
}

function tryRide(t, li, i, j) {
  const ld = lineData[li];
  const arr = t + ld.off[j] - ld.off[i];
  if (arr > maxTick || arr <= t) return false;
  let b = ld.at[j];
  let nz = 1, ex = false;
  const e = evictAt(b, arr);
  if (e >= 0) { b = e; nz = 0; ex = true; }
  oT = arr; oC = b; oZ = nz; oEn = false; oEx = ex;
  oKm = ld.kmc[j] - ld.kmc[i];
  return true;
}

// ---------- 1단계: 최소 도착 틱 h (요금 무관) ----------
const INF16 = 30000;
const h = new Int16Array((maxTick + 1) * N * 2).fill(INF16);
function hv() {
  if (tp[oC] === 4) return oT;
  return h[(oT * N + oC) * 2 + oZ];
}
for (let t = maxTick; t >= 0; t--) {
  for (let c = 0; c < N; c++) {
    const ct = tp[c];
    if (ct === 0 || ct === 4) continue;
    for (let z = 0; z < 2; z++) {
      if (ct === 1 && z === 0) continue;
      if (ct === 2 && z === 1) continue;
      let best = INF16;
      for (let a = 0; a < 5; a++) {
        if (tryMove(t, c, z, a)) {
          const v = hv();
          if (v < best) best = v;
        }
      }
      if (z === 1 && isPlat[c] === 1 && ct === 1) {
        const L = rides.get(t * N + c);
        if (L !== undefined) {
          for (let q = 0; q < L.length; q += 3) {
            if (tryRide(t, L[q], L[q + 1], L[q + 2])) {
              const v = hv();
              if (v < best) best = v;
            }
          }
        }
      }
      h[(t * N + c) * 2 + z] = best;
    }
  }
}

const T = h[(0 * N + S) * 2 + 0];

// ---------- 요금 ----------
function F(x) {
  if (x <= 10) return 1450;
  if (x <= 50) return 1450 + 100 * Math.ceil((x - 10) / 5);
  return 2250 + 100 * Math.ceil((x - 50) / 8);
}

// ---------- 2단계: 상태 (t, 칸, zone, k, code) 위 DP ----------
// code: 0 = 통행 없음/열림, 1..31 = 퇴장 후 (code-1)틱 경과한 대기 통행(PEND)
// k 압축: x>50 이면 F(x+m)-F(x) 가 (x-50) mod 8 에만 의존 → 51..58 로 접는다.
function kcls(x) { return x <= 50 ? x : 51 + ((x - 51) % 8); }
const KM = 64;
// 상태 키는 틱별 Map 에 (c, z, k, code) 로 저장 (Map 크기 한도 회피)
function skey(c, z, k, code) {
  return ((c * 2 + z) * KM + k) * 32 + code;
}

// dEntry[c]: 밖/G 칸 c 에서 (밖·G 칸만 걸어) 안 칸으로 입장하는 걸음을 마칠 때까지의 최소 틱.
// 대기 통행의 남은 창이 이보다 작으면 이어질 수 없으므로 NONE 과 같다.
const DINF = 1 << 20;
const dEntry = new Int32Array(N).fill(DINF);
{
  const q = [];
  for (let g = 0; g < N; g++) {
    if (tp[g] !== 3) continue;
    const gr = (g / W) | 0, gc = g % W;
    for (let a = 0; a < 4; a++) {
      const nr = gr + DR[a], nc = gc + DC[a];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const x = nr * W + nc;
      if (tp[x] === 1 && (esc[x] < 0 || esc[x] === a)) { dEntry[g] = 1; q.push(g); break; }
    }
  }
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi];
    const ur = (u / W) | 0, uc = u % W;
    for (let a = 0; a < 4; a++) {
      const nr = ur + DR[a], nc = uc + DC[a];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const v = nr * W + nc;
      if ((tp[v] === 2 || tp[v] === 3) && dEntry[v] === DINF) { dEntry[v] = dEntry[u] + 1; q.push(v); }
    }
  }
}

// 가능한 행동들을 후보 객체로 전개 (최적 도착 T로 이어지는 것만)
function mk(t, z, k, code, tok, ride) {
  const arrive = tp[oC] === 4;
  if (arrive) {
    if (oT !== T) return null;
  } else if (h[(oT * N + oC) * 2 + oZ] !== T) {
    return null;
  }
  let fare = 0, kk = k, board = 0;
  let pend = (z === 0 && code > 0);
  let pe = pend ? t - (code - 1) : 0;
  if (ride) {
    fare += F(kk + oKm) - F(kk);
    kk += oKm;
    board = 1;
  }
  if (oEn) {
    if (!(pend && oT - pe <= 30)) { fare += 1450; kk = 0; }
    pend = false;
  }
  if (oEx) { pend = true; pe = oT; }
  let nk, ncode;
  if (oZ === 1) { nk = kcls(kk); ncode = 0; }
  else if (pend && oT - pe <= 30 && pe + 30 - oT >= dEntry[oC]) { nk = kcls(kk); ncode = oT - pe + 1; }
  else { nk = 0; ncode = 0; }
  return { tok: tok, val: fare * 10000 + board, arrive: arrive, t: oT, c: oC, z: oZ, k: nk, code: ncode };
}

function expand(t, c, z, k, code) {
  const out = [];
  for (let a = 0; a < 5; a++) {
    if (tryMove(t, c, z, a)) {
      const cd = mk(t, z, k, code, ACH[a], false);
      if (cd !== null) out.push(cd);
    }
  }
  if (z === 1 && isPlat[c] === 1 && tp[c] === 1) {
    const L = rides.get(t * N + c);
    if (L !== undefined) {
      for (let q = 0; q < L.length; q += 3) {
        const li = L[q], i = L[q + 1], j = L[q + 2];
        if (tryRide(t, li, i, j)) {
          const cd = mk(t, z, k, code, lineData[li].tok[j], true);
          if (cd !== null) out.push(cd);
        }
      }
    }
  }
  return out;
}

const memo = [];
for (let t = 0; t <= maxTick; t++) memo.push(new Map());
function solve(t, c, z, k, code) {
  const key = skey(c, z, k, code);
  const mt = memo[t];
  const m = mt.get(key);
  if (m !== undefined) return m;
  const cands = expand(t, c, z, k, code);
  let best = Infinity;
  for (let q = 0; q < cands.length; q++) {
    const cd = cands[q];
    const v = cd.val + (cd.arrive ? 0 : solve(cd.t, cd.c, cd.z, cd.k, cd.code));
    if (v < best) best = v;
  }
  mt.set(key, best);
  return best;
}

const rmemo = new Map();
function recon(t, c, z, k, code) {
  const key = t * 1e10 + skey(c, z, k, code);
  const m = rmemo.get(key);
  if (m !== undefined) return m;
  const best = solve(t, c, z, k, code);
  const cands = expand(t, c, z, k, code);
  let bestTok = null;
  let group = [];
  for (let q = 0; q < cands.length; q++) {
    const cd = cands[q];
    const v = cd.val + (cd.arrive ? 0 : solve(cd.t, cd.c, cd.z, cd.k, cd.code));
    if (v !== best) continue;
    if (bestTok === null || cd.tok < bestTok) { bestTok = cd.tok; group = [cd]; }
    else if (cd.tok === bestTok) group.push(cd);
  }
  let suf = null;
  for (let q = 0; q < group.length; q++) {
    const cd = group[q];
    const s = cd.arrive ? '' : recon(cd.t, cd.c, cd.z, cd.k, cd.code);
    if (suf === null || s < suf) suf = s;
  }
  const res = bestTok + suf;
  rmemo.set(key, res);
  return res;
}

if (S < 0 || T >= INF16) {
  console.log('불가');
} else {
  console.log(recon(0, S, 0, 0, 0));
}
