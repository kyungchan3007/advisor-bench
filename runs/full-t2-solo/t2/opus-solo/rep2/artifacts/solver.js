'use strict';
// 막차 러너 풀이기
// 1) 칸·틱 단위 도달 가능성(앞/뒤)으로 최소 도착 틱 T와 "틱 T에 E에 닿을 수 있는" (칸, 틱)만 추린다.
// 2) 뒤에서부터 (칸, 틱, 개찰구 안인가) 상태마다 "앞으로의 경로"가 요금에 주는 영향을
//    (처음 재입장 틱, 지금 통행에 더해질 km, 그 뒤 통행 요금 합, 승차 횟수) 꼬리표의
//    파레토 집합으로 구한다. 이것으로 어떤 부분 경로든 "끝까지 갔을 때 최소 (요금, 승차)"를 정확히 안다.
// 3) 출발 상태의 최솟값이 정답 비용이다. 앞에서부터 사전순으로 가장 작은 행동 중
//    그 비용을 그대로 지킬 수 있는 것을 골라 문자열을 만든다.
const fs = require('fs');

const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const MAXT = L.maxTick | 0;
const grid = L.grid;
const H = grid.length;
const W = grid.reduce((m, r) => Math.max(m, r.length), 0);
const N = H * W;

// ---- 칸 ----
const Z_WALL = 0, Z_IN = 1, Z_OUT = 2, Z_G = 3;
const zone = new Uint8Array(N);
const esc = new Int8Array(N).fill(-1); // 에스컬레이터 방향 (0 D,1 L,2 R,3 U)
const isP = new Uint8Array(N);
const isE = new Uint8Array(N);
let start = -1;
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const i = r * W + c;
    switch (ch) {
      case '.': zone[i] = Z_IN; break;
      case 'P': zone[i] = Z_IN; isP[i] = 1; break;
      case 'v': zone[i] = Z_IN; esc[i] = 0; break;
      case '<': zone[i] = Z_IN; esc[i] = 1; break;
      case '>': zone[i] = Z_IN; esc[i] = 2; break;
      case '^': zone[i] = Z_IN; esc[i] = 3; break;
      case ',': zone[i] = Z_OUT; break;
      case 'S': zone[i] = Z_OUT; if (start < 0) start = i; break;
      case 'E': zone[i] = Z_OUT; isE[i] = 1; break;
      case 'G': zone[i] = Z_G; break;
      default: zone[i] = Z_WALL;
    }
  }
}
const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0], DTOK = ['D', 'L', 'R', 'U'];
const moveTo = new Int32Array(N * 4).fill(-1);
for (let i = 0; i < N; i++) {
  if (zone[i] === Z_WALL) continue;
  const r = (i / W) | 0, c = i % W;
  for (let d = 0; d < 4; d++) {
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
    const j = nr * W + nc;
    if (zone[j] === Z_WALL) continue;
    if (esc[i] >= 0 && esc[i] !== d) continue; // 에스컬레이터는 화살표 방향으로만 나간다
    if (esc[j] >= 0 && esc[j] !== d) continue; // 화살표 방향으로만 들어간다
    if ((zone[i] === Z_IN && zone[j] === Z_OUT) || (zone[i] === Z_OUT && zone[j] === Z_IN)) continue;
    moveTo[i * 4 + d] = j;
  }
}

// ---- 역 건물 ----
const roomClose = new Int32Array(N).fill(2147483647);
const roomEvict = new Int32Array(N).fill(-1);
const roomSet = new Uint8Array(N);
for (const rm of L.rooms || []) {
  const [r0, c0, r1, c1] = rm.rect;
  const ev = rm.evict[0] * W + rm.evict[1];
  for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const i = r * W + c;
      if (zone[i] !== Z_IN || roomSet[i]) continue;
      roomSet[i] = 1;
      roomClose[i] = rm.close;
      roomEvict[i] = ev;
    }
  }
}
function afterEvict(c, t) { // 행동을 마친 뒤 실제 위치
  return (zone[c] === Z_IN && roomEvict[c] >= 0 && t >= roomClose[c]) ? roomEvict[c] : c;
}

// ---- km 정수화와 운임 ----
let dec = 0;
for (const ln of L.lines) for (const k of ln.km) {
  const s = String(k);
  const p = s.indexOf('.');
  if (p >= 0) dec = Math.max(dec, s.length - p - 1);
  if (/e/i.test(s)) dec = 6;
}
dec = Math.min(dec, 6);
const SC = Math.pow(10, dec);
function fare(k) {
  if (k <= 10 * SC) return 1450;
  if (k <= 50 * SC) return 1450 + Math.ceil((k - 10 * SC) / (5 * SC)) * 100;
  return 2250 + Math.ceil((k - 50 * SC) / (8 * SC)) * 100;
}

// ---- 열차: (틱, 칸) -> 탈 수 있는 [토큰, 도착틱, 도착칸, km] ----
const rides = new Map();
let zeroRide = false;
for (const ln of L.lines) {
  const st = ln.stations;
  const n = st.length;
  const cum = [0], ckm = [0];
  for (let i = 0; i + 1 < n; i++) {
    cum.push(cum[i] + (ln.travel[i] | 0));
    ckm.push(ckm[i] + Math.round(ln.km[i] * SC));
  }
  const cellOf = st.map(s => s.at[0] * W + s.at[1]);
  // 각 역 i에서 내릴 수 있는 역 (이름별 가장 가까운 뒤 역)
  const targets = [];
  for (let i = 0; i < n; i++) {
    const seen = new Set(), arr = [];
    for (let j = i + 1; j < n; j++) {
      if (seen.has(st[j].name)) continue;
      seen.add(st[j].name);
      arr.push(j);
    }
    targets.push(arr);
  }
  const deps = [];
  if (ln.headway > 0) for (let d = ln.first; d <= ln.last; d += ln.headway) deps.push(d);
  else if (ln.first <= ln.last) deps.push(ln.first);
  for (const d of deps) {
    for (let i = 0; i < n; i++) {
      const t = d + cum[i];
      if (t < 0 || t > MAXT) continue;
      const c = cellOf[i];
      if (c < 0 || c >= N || !isP[c]) continue;
      for (const j of targets[i]) {
        const t2 = d + cum[j];
        if (t2 > MAXT || t2 < t) continue;
        const c2 = cellOf[j];
        if (c2 < 0 || c2 >= N) continue;
        if (t2 === t) zeroRide = true;
        const key = t * N + c;
        let a = rides.get(key);
        if (!a) rides.set(key, a = []);
        a.push(['[' + ln.id + '>' + st[j].name + ']', t2, c2, ckm[j] - ckm[i]]);
      }
    }
  }
}
for (const a of rides.values()) a.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));

// ---- 1단계: 칸·틱 도달 가능성 ----
function cellSucc(c, t, cb) {
  if (isE[c]) return;
  if (t + 1 <= MAXT) {
    for (let d = 0; d < 4; d++) {
      const j = moveTo[c * 4 + d];
      if (j >= 0) cb(afterEvict(j, t + 1), t + 1);
    }
    if (esc[c] < 0) cb(afterEvict(c, t + 1), t + 1);
  }
  if (isP[c]) {
    const a = rides.get(t * N + c);
    if (a) for (const rd of a) cb(afterEvict(rd[2], rd[1]), rd[1]);
  }
}

if (start < 0) { console.log('불가'); process.exit(0); }
const fwd = [];
for (let t = 0; t <= MAXT; t++) fwd.push(new Uint8Array(N));
fwd[0][start] = 1;
let T = -1;
for (let t = 0; t <= MAXT && T < 0; t++) {
  const f = fwd[t];
  const stack = [];
  for (let c = 0; c < N; c++) if (f[c]) stack.push(c);
  while (stack.length) {
    const c = stack.pop();
    cellSucc(c, t, (c2, t2) => {
      if (!fwd[t2][c2]) { fwd[t2][c2] = 1; if (t2 === t) stack.push(c2); }
    });
  }
  for (let c = 0; c < N; c++) if (f[c] && isE[c]) { T = t; break; }
}
if (T < 0) { console.log('불가'); process.exit(0); }

const useful = [];
for (let t = 0; t <= T; t++) useful.push(new Uint8Array(N));
for (let c = 0; c < N; c++) if (isE[c] && fwd[T][c]) useful[T][c] = 1;
for (let t = T; t >= 0; t--) {
  const f = fwd[t], u = useful[t];
  let changed = true;
  while (changed) {
    changed = false;
    for (let c = 0; c < N; c++) {
      if (!f[c] || u[c]) continue;
      let ok = false;
      cellSucc(c, t, (c2, t2) => { if (!ok && t2 <= T && useful[t2][c2]) ok = true; });
      if (ok) { u[c] = 1; changed = true; }
    }
  }
}

// ---- 2단계: 뒤에서부터 앞으로의 경로 꼬리표 ----
// 상태 (t, c, s): s=1 이면 지금 통행 중(개찰구 안), s=0 이면 아님.
// 꼬리표 (r, K, R, B):
//   s=1: K = 지금 통행이 끝날 때까지 더해질 km, R = 그 뒤 통행 요금 합, B = 앞으로의 승차 수 (r 안 씀)
//   s=0: r = 앞으로 처음 입장하는 틱 (없으면 INF, 이때 K=R=0),
//        K = 그 입장부터 이어지는 통행의 km, R = 그 뒤 통행 요금 합
// 앞쪽 상태와 합치는 식은 evalLabel 참고.
const INF = 1 << 30;
const NS = (T + 1) * N * 2;
const off = new Int32Array(NS);
const cnt = new Int32Array(NS); // 0 = 이 상태에서는 T에 E로 갈 수 없음
let cap = 1 << 20;
let LR = new Int32Array(cap), LK = new Float64Array(cap), LRe = new Float64Array(cap), LB = new Int32Array(cap);
let used = 0;
function grow(need) {
  if (used + need <= cap) return;
  while (used + need > cap) cap *= 2;
  const a = new Int32Array(cap); a.set(LR.subarray(0, used)); LR = a;
  const b = new Float64Array(cap); b.set(LK.subarray(0, used)); LK = b;
  const c = new Float64Array(cap); c.set(LRe.subarray(0, used)); LRe = c;
  const d = new Int32Array(cap); d.set(LB.subarray(0, used)); LB = d;
}
const sidx = (t, c, s) => ((t * N) + c) * 2 + s;

// 후보 파레토 집합 (임시)
let TC = 256;
let tR = new Int32Array(TC), tK = new Float64Array(TC), tRe = new Float64Array(TC), tB = new Int32Array(TC);
let tn = 0;
function dom(r1, k1, e1, b1, r2, k2, e2, b2, inside) { // 1이 2보다 나쁘지 않은가
  if (b1 > b2) return false;
  if (inside) return k1 <= k2 && e1 <= e2;
  if (r1 === INF) return true;
  if (r2 === INF) return false;
  return r1 <= r2 && k1 <= k2 && e1 <= e2;
}
function addCand(r, k, e, b, inside) {
  for (let i = 0; i < tn; i++) if (dom(tR[i], tK[i], tRe[i], tB[i], r, k, e, b, inside)) return;
  let m = 0;
  for (let i = 0; i < tn; i++) {
    if (dom(r, k, e, b, tR[i], tK[i], tRe[i], tB[i], inside)) continue;
    if (m !== i) { tR[m] = tR[i]; tK[m] = tK[i]; tRe[m] = tRe[i]; tB[m] = tB[i]; }
    m++;
  }
  tn = m;
  if (tn === TC) {
    TC *= 2;
    const a = new Int32Array(TC); a.set(tR); tR = a;
    const b2 = new Float64Array(TC); b2.set(tK); tK = b2;
    const c2 = new Float64Array(TC); c2.set(tRe); tRe = c2;
    const d2 = new Int32Array(TC); d2.set(tB); tB = d2;
  }
  tR[tn] = r; tK[tn] = k; tRe[tn] = e; tB[tn] = b; tn++;
}

// 상태 (t, c, s)에서 목적지 칸 j(쫓겨나기 전), 도착틱 t2, 열차 km, 승차 수를 붙인 행동 하나의 후보를 넣는다
function relax(t, c, s, j, t2, km, bAdd) {
  const z = zone[j];
  if (s === 1) {
    let exitCell = -1;
    if (z === Z_OUT) exitCell = j;
    else if (z === Z_IN) { const ev = afterEvict(j, t2); if (ev !== j) exitCell = ev; }
    if (exitCell < 0) { // 계속 안
      const q = sidx(t2, j, 1);
      const n = cnt[q], o = off[q];
      for (let i = o; i < o + n; i++) addCand(0, km + LK[i], LRe[i], LB[i] + bAdd, true);
    } else { // t2에 퇴장
      const q = sidx(t2, exitCell, 0);
      const n = cnt[q], o = off[q];
      for (let i = o; i < o + n; i++) {
        const r = LR[i];
        if (r === INF) addCand(0, km, 0, LB[i] + bAdd, true);
        else if (r - t2 <= 30) addCand(0, km + LK[i], LRe[i], LB[i] + bAdd, true);
        else addCand(0, km, fare(LK[i]) + LRe[i], LB[i] + bAdd, true);
      }
    }
  } else {
    if (z === Z_IN) { // t2에 입장
      const ev = afterEvict(j, t2);
      if (ev === j) {
        const q = sidx(t2, j, 1);
        const n = cnt[q], o = off[q];
        for (let i = o; i < o + n; i++) addCand(t2, LK[i], LRe[i], LB[i] + bAdd, false);
      } else { // 들어가자마자 쫓겨남: 입장과 퇴장이 같은 틱
        const q = sidx(t2, ev, 0);
        const n = cnt[q], o = off[q];
        for (let i = o; i < o + n; i++) {
          const r = LR[i];
          if (r === INF) addCand(t2, 0, 0, LB[i] + bAdd, false);
          else if (r - t2 <= 30) addCand(t2, LK[i], LRe[i], LB[i] + bAdd, false);
          else addCand(t2, 0, fare(LK[i]) + LRe[i], LB[i] + bAdd, false);
        }
      }
    } else {
      const q = sidx(t2, j, 0);
      const n = cnt[q], o = off[q];
      for (let i = o; i < o + n; i++) addCand(LR[i], LK[i], LRe[i], LB[i] + bAdd, false);
    }
  }
}

function computeState(t, c, s) {
  tn = 0;
  if (isE[c]) {
    if (t === T && s === 0) addCand(INF, 0, 0, 0, false);
  } else {
    if (t + 1 <= T) {
      for (let d = 0; d < 4; d++) {
        const j = moveTo[c * 4 + d];
        if (j >= 0) relax(t, c, s, j, t + 1, 0, 0);
      }
      if (esc[c] < 0) relax(t, c, s, c, t + 1, 0, 0);
    }
    if (s === 1 && isP[c]) {
      const a = rides.get(t * N + c);
      if (a) for (const rd of a) if (rd[1] <= T) relax(t, c, s, rd[2], rd[1], rd[3], 1);
    }
  }
  const q = sidx(t, c, s);
  grow(tn);
  off[q] = used; cnt[q] = tn;
  LR.set(tR.subarray(0, tn), used);
  LK.set(tK.subarray(0, tn), used);
  LRe.set(tRe.subarray(0, tn), used);
  LB.set(tB.subarray(0, tn), used);
  used += tn;
}
const sameSet = (o1, n1, o2, n2) => {
  if (n1 !== n2) return false;
  for (let i = o1; i < o1 + n1; i++) {
    let f = false;
    for (let k = o2; k < o2 + n2; k++) if (LR[i] === LR[k] && LK[i] === LK[k] && LRe[i] === LRe[k] && LB[i] === LB[k]) { f = true; break; }
    if (!f) return false;
  }
  return true;
};

for (let t = T; t >= 0; t--) {
  const u = useful[t], f = fwd[t];
  const list = [];
  for (let c = 0; c < N; c++) {
    if (!u[c] || !f[c]) continue;
    const z = zone[c];
    if (z === Z_IN || z === Z_G) { computeState(t, c, 1); list.push(c * 2 + 1); }
    if (z === Z_OUT || z === Z_G) { computeState(t, c, 0); list.push(c * 2); }
  }
  if (zeroRide) { // 0틱 열차: 같은 틱 안에서 바뀌지 않을 때까지 다시 계산
    for (let it = 0; it < 1000; it++) {
      let changed = false;
      for (const x of list) {
        const c = x >> 1, s = x & 1;
        if (s !== 1 || !isP[c] || !rides.has(t * N + c)) continue;
        const q = sidx(t, c, s);
        const o1 = off[q], n1 = cnt[q];
        computeState(t, c, s);
        if (!sameSet(o1, n1, off[q], cnt[q])) changed = true;
      }
      if (!changed) break;
    }
  }
}

// ---- 3단계: 앞쪽 상태 + 뒤쪽 꼬리표 = 끝까지 갔을 때의 최소 비용 ----
// 앞쪽 상태: { c, t, st(0 통행 없음, 1 안, 2 퇴장 후), te(퇴장 틱), km(지금 통행 km), paid(끝난 통행 요금), b(승차) }
const BMUL = 1 << 20;
function evalLabel(a) {
  const s = a.st === 1 ? 1 : 0;
  const q = sidx(a.t, a.c, s);
  const n = cnt[q], o = off[q];
  let best = Infinity;
  for (let i = o; i < o + n; i++) {
    const r = LR[i], K = LK[i], R = LRe[i];
    let fa;
    if (a.st === 1) fa = fare(a.km + K) + R;
    else if (a.st === 0) fa = r === INF ? 0 : fare(K) + R;
    else if (r === INF) fa = fare(a.km);
    else if (r - a.te <= 30) fa = fare(a.km + K) + R;
    else fa = fare(a.km) + fare(K) + R;
    const v = (a.paid + fa) * BMUL + a.b + LB[i];
    if (v < best) best = v;
  }
  return best;
}
// 앞쪽 상태 전이
function step(a, j, t2, km, bAdd) {
  let st = a.st, te = a.te, k = a.km + km, p = a.paid;
  if (st === 2 && t2 - te > 30) { p += fare(k); st = 0; k = 0; te = 0; }
  const z = zone[j];
  if (z === Z_IN) {
    if (st === 0) { st = 1; k = 0; } else if (st === 2) st = 1;
  } else if (z === Z_OUT) {
    if (st === 1) { st = 2; te = t2; }
  }
  let c = j;
  const ev = afterEvict(j, t2);
  if (ev !== j) { c = ev; if (st === 1) { st = 2; te = t2; } }
  return { c, t: t2, st, te, km: k, paid: p, b: a.b + bAdd };
}
function actions(a, cb) {
  const c = a.c, t = a.t;
  if (isE[c]) return;
  if (t + 1 <= T) {
    for (let d = 0; d < 4; d++) {
      const j = moveTo[c * 4 + d];
      if (j >= 0) cb(DTOK[d], step(a, j, t + 1, 0, 0));
    }
    if (esc[c] < 0) cb('W', step(a, c, t + 1, 0, 0));
  }
  if (a.st === 1 && isP[c]) {
    const rs = rides.get(t * N + c);
    if (rs) for (const rd of rs) if (rd[1] <= T) cb(rd[0], step(a, rd[2], rd[1], rd[3], 1));
  }
}
const labelKey = (a) => [a.c, a.t, a.st, a.te, a.km, a.paid, a.b].join(',');

const init = { c: start, t: 0, st: 0, te: 0, km: 0, paid: 0, b: 0 };
const OPT = evalLabel(init);
if (!(OPT < Infinity)) { console.log('불가'); process.exit(0); }
let cur = [init];
let out = '';
for (let guard = 0; guard < 100000; guard++) {
  if (cur.some(a => isE[a.c])) break;
  let bestTok = null, next = [], seen = new Set();
  for (const a of cur) {
    actions(a, (tok, b) => {
      if (bestTok !== null && tok > bestTok) return;
      if (evalLabel(b) !== OPT) return;
      if (bestTok === null || tok < bestTok) { bestTok = tok; next = []; seen = new Set(); }
      const k = labelKey(b);
      if (!seen.has(k)) { seen.add(k); next.push(b); }
    });
  }
  if (bestTok === null) break;
  out += bestTok;
  cur = next;
}
if (process.env.MR_STATS) process.stderr.write('T=' + T + ' fare=' + Math.floor(OPT / BMUL) + ' boards=' + (OPT % BMUL) + ' labels=' + used + '\n');
console.log(out);
