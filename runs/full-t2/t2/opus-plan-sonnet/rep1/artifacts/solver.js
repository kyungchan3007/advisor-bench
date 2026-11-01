'use strict';
// 막차 러너 풀이기. 접근 방법은 PLAN.md / README 주석 참고.
const fs = require('fs');
const DEBUG = !!process.env.DEBUG;
const T0 = Date.now();
function dbg(...a) { if (DEBUG) console.error(...a); }
function warn(...a) { if (DEBUG) console.error('경고:', ...a); }

// ---------- 로드 ----------
let raw = fs.readFileSync(process.argv[2], 'utf8');
if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
const LV = JSON.parse(raw);
const grid = LV.grid;
const H = grid.length;
let W = 0;
for (const row of grid) if (row.length > W) W = row.length;
const N = H * W;
const maxTick = LV.maxTick === undefined ? 400 : LV.maxTick;

// km 스케일 (정수 가정, 아니면 x1000)
let KS = 1;
for (const ln of LV.lines || []) for (const k of ln.km) if (!Number.isInteger(k)) KS = 1000;
if (KS !== 1) warn('km가 정수가 아님: x1000 스케일');
function fare(K) {
  if (K <= 10 * KS) return 1450;
  if (K <= 50 * KS) return 1450 + 100 * Math.ceil((K - 10 * KS) / (5 * KS));
  return 2250 + 100 * Math.ceil((K - 50 * KS) / (8 * KS));
}

// 칸 분류
const WALL = 0, IN = 1, OUT = 2, GATE = 3;
const zone = new Uint8Array(N);
const escDir = new Int8Array(N).fill(-1);
const isE = new Uint8Array(N);
let S = -1;
// DIRS 순서 = 토큰 사전순 D<L<R<U
const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0], DCH = ['D', 'L', 'R', 'U'];
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = c < grid[r].length ? grid[r][c] : '#';
    const id = r * W + c;
    switch (ch) {
      case '.': case 'P': zone[id] = IN; break;
      case '>': zone[id] = IN; escDir[id] = 2; break;
      case '<': zone[id] = IN; escDir[id] = 1; break;
      case '^': zone[id] = IN; escDir[id] = 3; break;
      case 'v': zone[id] = IN; escDir[id] = 0; break;
      case ',': zone[id] = OUT; break;
      case 'S': zone[id] = OUT; if (S < 0) S = id; break;
      case 'E': zone[id] = OUT; isE[id] = 1; break;
      case 'G': zone[id] = GATE; break;
      default: zone[id] = WALL; if (ch !== '#') warn('알 수 없는 칸', ch);
    }
  }
}
if (S < 0) { console.log('불가'); process.exit(0); }

const walkTo = new Int32Array(N * 4).fill(-1);
const canWait = new Uint8Array(N);
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const id = r * W + c;
    if (zone[id] === WALL) continue;
    canWait[id] = escDir[id] < 0 ? 1 : 0;
    for (let d = 0; d < 4; d++) {
      const nr = r + DR[d], nc = c + DC[d];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const n = nr * W + nc;
      if (zone[n] === WALL) continue;
      if (escDir[id] >= 0 && escDir[id] !== d) continue;
      if (escDir[n] >= 0 && escDir[n] !== d) continue;
      if ((zone[id] === IN && zone[n] === OUT) || (zone[id] === OUT && zone[n] === IN)) continue;
      walkTo[id * 4 + d] = n;
    }
  }
}

// 방
const rooms = LV.rooms || [];
const roomsAt = new Array(N).fill(null);
const roomClose = [], roomEvict = [];
rooms.forEach((rm, k) => {
  const [r1, c1, r2, c2] = rm.rect;
  roomClose.push(rm.close);
  roomEvict.push(rm.evict[0] * W + rm.evict[1]);
  for (let r = Math.max(0, r1); r <= Math.min(H - 1, r2); r++) {
    for (let c = Math.max(0, c1); c <= Math.min(W - 1, c2); c++) {
      const id = r * W + c;
      if (zone[id] !== IN) continue;
      if (!roomsAt[id]) roomsAt[id] = [];
      roomsAt[id].push(k);
    }
  }
});
function evictAt(n, t2) {
  const rl = roomsAt[n];
  if (rl === null) return -1;
  for (let i = 0; i < rl.length; i++) if (t2 >= roomClose[rl[i]]) return roomEvict[rl[i]];
  return -1;
}

// 토큰
const tokStr = ['D', 'L', 'R', 'U', 'W'];
const tokMap = new Map();
function tokId(s) {
  let v = tokMap.get(s);
  if (v === undefined) { v = tokStr.length; tokStr.push(s); tokMap.set(s, v); }
  return v;
}

// 노선
const lines = [];
const platAt = new Array(N).fill(null);
(LV.lines || []).forEach((ln, li) => {
  const n = ln.stations.length;
  const prefix = new Array(n).fill(0);
  const kmPre = new Array(n).fill(0);
  for (let i = 1; i < n; i++) {
    prefix[i] = prefix[i - 1] + ln.travel[i - 1];
    kmPre[i] = kmPre[i - 1] + Math.round(ln.km[i - 1] * KS);
    if (ln.travel[i - 1] < 1) warn('travel < 1', ln.id);
  }
  if (/[\]>]/.test(ln.id)) warn('노선 id에 특수문자', ln.id);
  const at = ln.stations.map(s => s.at[0] * W + s.at[1]);
  const opts = [];
  for (let i = 0; i < n; i++) {
    const seen = new Set(), o = [];
    for (let j = i + 1; j < n; j++) {
      const nm = ln.stations[j].name;
      if (seen.has(nm)) continue;
      seen.add(nm);
      o.push({ tok: tokId('[' + ln.id + '>' + nm + ']'), dt: prefix[j] - prefix[i], km: kmPre[j] - kmPre[i], dest: at[j] });
    }
    opts.push(o);
  }
  lines.push({ first: ln.first, headway: ln.headway, last: ln.last, prefix, opts });
  for (let i = 0; i < n; i++) {
    if (!platAt[at[i]]) platAt[at[i]] = [];
    platAt[at[i]].push(li * 4096 + i);
  }
});
// 토큰 순위 (JS '<' 비교)
const tokRank = new Int32Array(tokStr.length);
{
  const order = tokStr.map((_, i) => i).sort((a, b) => (tokStr[a] < tokStr[b] ? -1 : tokStr[a] > tokStr[b] ? 1 : 0));
  order.forEach((id, rank) => { tokRank[id] = rank; });
}
function trainAt(L, i, t) {
  const x = t - L.prefix[i];
  if (x < L.first || x > L.last) return false;
  if (L.headway <= 0) return x === L.first;
  return (x - L.first) % L.headway === 0;
}

// ---------- 전이 (공유) ----------
const MV = 8192;
const mvTok = new Int32Array(MV), mvT2 = new Int32Array(MV), mvN = new Int32Array(MV), mvKm = new Int32Array(MV), mvRide = new Uint8Array(MV);
function genMoves(t, c, sig, limit) {
  let m = 0;
  if (t + 1 > limit) return 0;
  for (let d = 0; d < 4; d++) {
    const n = walkTo[c * 4 + d];
    if (n >= 0) { mvTok[m] = d; mvT2[m] = t + 1; mvN[m] = n; mvKm[m] = 0; mvRide[m] = 0; m++; }
  }
  if (canWait[c]) { mvTok[m] = 4; mvT2[m] = t + 1; mvN[m] = c; mvKm[m] = 0; mvRide[m] = 0; m++; }
  if (sig === 1) {
    const pl = platAt[c];
    if (pl !== null) {
      for (let p = 0; p < pl.length; p++) {
        const li = (pl[p] / 4096) | 0, i = pl[p] % 4096;
        const L = lines[li];
        if (!trainAt(L, i, t)) continue;
        const o = L.opts[i];
        for (let q = 0; q < o.length; q++) {
          const oo = o[q];
          if (t + oo.dt > limit) continue;
          if (m >= MV) break;
          mvTok[m] = oo.tok; mvT2[m] = t + oo.dt; mvN[m] = oo.dest; mvKm[m] = oo.km; mvRide[m] = 1; m++;
        }
      }
    }
  }
  return m;
}
let sFinal = 0, sSig2 = 0, sEntered = false, sExited = false;
function settle(sig, n, t2, ride) {
  let sig2 = sig, entered = false, exited = false;
  if (!ride) {
    const z = zone[n];
    if (z === IN && sig === 0) { entered = true; sig2 = 1; }
    else if (z === OUT && sig === 1) { exited = true; sig2 = 0; }
  }
  let fin = n;
  if (zone[n] === IN) {
    const ev = evictAt(n, t2);
    if (ev >= 0) { fin = ev; sig2 = 0; exited = true; }
  }
  sFinal = fin; sSig2 = sig2; sEntered = entered; sExited = exited;
}

// ---------- 1단계: 최소 도착 틱 ----------
const reach = new Array(maxTick + 1).fill(null);
reach[0] = new Uint8Array(2 * N);
reach[0][S * 2] = 1;
let Tstar = -1;
for (let t = 0; t <= maxTick; t++) {
  const r = reach[t];
  if (r === null) continue;
  let found = false;
  for (let v = 0; v < 2 * N; v++) if (r[v] === 1 && isE[v >> 1]) { found = true; break; }
  if (found) { Tstar = t; break; }
  for (let v = 0; v < 2 * N; v++) {
    if (r[v] !== 1) continue;
    const c = v >> 1, sig = v & 1;
    const m = genMoves(t, c, sig, maxTick);
    for (let k = 0; k < m; k++) {
      settle(sig, mvN[k], mvT2[k], mvRide[k] === 1);
      const t2 = mvT2[k];
      let r2 = reach[t2];
      if (r2 === null) { r2 = reach[t2] = new Uint8Array(2 * N); }
      r2[sFinal * 2 + sSig2] = 1;
    }
  }
}
dbg('T* =', Tstar, 'stage1 ms', Date.now() - T0);
if (Tstar < 0) { console.log('불가'); process.exit(0); }

// ---------- 2단계: alive ----------
const alive = new Array(Tstar + 1).fill(null);
for (let t = 0; t <= Tstar; t++) if (reach[t] !== null) alive[t] = new Uint8Array(2 * N);
for (let v = 0; v < 2 * N; v++) if (reach[Tstar][v] === 1 && isE[v >> 1]) alive[Tstar][v] = 1;
for (let t = Tstar - 1; t >= 0; t--) {
  const r = reach[t];
  if (r === null) continue;
  const a = alive[t];
  for (let v = 0; v < 2 * N; v++) {
    if (r[v] !== 1) continue;
    const c = v >> 1, sig = v & 1;
    const m = genMoves(t, c, sig, Tstar);
    for (let k = 0; k < m; k++) {
      settle(sig, mvN[k], mvT2[k], mvRide[k] === 1);
      const a2 = alive[mvT2[k]];
      if (a2 !== null && a2[sFinal * 2 + sSig2] === 1) { a[v] = 1; break; }
    }
  }
}
if (alive[0][S * 2] !== 1) { console.log('불가'); process.exit(0); }
dbg('stage2 ms', Date.now() - T0);

// ---------- 3단계: 정확 상태 ----------
const kIntern = new Map();
const kVal = [], kFare = [];
function internK(K) {
  let id = kIntern.get(K);
  if (id === undefined) { id = kVal.length; kVal.push(K); kFare.push(fare(K)); kIntern.set(K, id); }
  return id;
}
internK(0);

let CAP = 1 << 16, nS = 0;
let sC = new Int32Array(CAP), sSig = new Uint8Array(CAP), sAct = new Uint8Array(CAP), sK = new Int32Array(CAP),
  sGr = new Uint8Array(CAP), sF = new Int32Array(CAP), sR = new Int32Array(CAP), sPr = new Uint8Array(CAP),
  sT = new Int16Array(CAP), sH = new Float64Array(CAP);
function growArr(a, Ctor) { const b = new Ctor(CAP); b.set(a); return b; }
function growAll() {
  const old = CAP; CAP *= 2;
  sC = growArr(sC, Int32Array); sSig = growArr(sSig, Uint8Array); sAct = growArr(sAct, Uint8Array); sK = growArr(sK, Int32Array);
  sGr = growArr(sGr, Uint8Array); sF = growArr(sF, Int32Array); sR = growArr(sR, Int32Array); sPr = growArr(sPr, Uint8Array);
  sT = growArr(sT, Int16Array); sH = growArr(sH, Float64Array);
}
const KMUL = 1048576;
function mkKey(c, sig, kId, gr) { return ((c * 2 + sig) * KMUL + kId) * 32 + gr; }

// 후속 생성 (3,4,5단계 공유)
const oTok = new Int32Array(MV), oT2 = new Int32Array(MV), oC = new Int32Array(MV), oSig = new Uint8Array(MV),
  oAct = new Uint8Array(MV), oK = new Int32Array(MV), oGr = new Uint8Array(MV), oDF = new Int32Array(MV), oDR = new Int32Array(MV),
  oKey = new Float64Array(MV);
function succ(t, s) {
  const c = sC[s], sig = sSig[s], act = sAct[s] === 1;
  const K0 = act ? kVal[sK[s]] : 0;
  const te = (act && sig === 0) ? t - sGr[s] : 0;
  const m = genMoves(t, c, sig, Tstar);
  let o = 0;
  for (let k = 0; k < m; k++) {
    const t2 = mvT2[k];
    settle(sig, mvN[k], t2, mvRide[k] === 1);
    const fin = sFinal, sig2 = sSig2;
    const a2 = alive[t2];
    if (a2 === null || a2[fin * 2 + sig2] !== 1) continue;
    let act2 = act, K = K0, te2 = te, dF = 0;
    if (mvRide[k] === 1) K += mvKm[k];
    if (sEntered) {
      if (!act2) { K = 0; act2 = true; }
      else if (t2 - te > 30) { dF += fare(K); K = 0; }
    }
    if (sExited) te2 = t2;
    if (sig2 === 0 && act2 && t2 - te2 >= 30) { dF += fare(K); act2 = false; K = 0; }
    const gr = sig2 === 1 ? 31 : (act2 ? t2 - te2 : 30);
    const kId = act2 ? internK(K) : 0;
    oTok[o] = mvTok[k]; oT2[o] = t2; oC[o] = fin; oSig[o] = sig2; oAct[o] = act2 ? 1 : 0; oK[o] = kId; oGr[o] = gr;
    oDF[o] = dF; oDR[o] = mvRide[k]; oKey[o] = mkKey(fin, sig2, kId, gr);
    o++;
  }
  return o;
}

function newState(t, c, sig, act, kId, gr, F, R) {
  if (nS >= CAP) growAll();
  const s = nS++;
  sC[s] = c; sSig[s] = sig; sAct[s] = act; sK[s] = kId; sGr[s] = gr; sF[s] = F; sR[s] = R; sPr[s] = 0; sT[s] = t; sH[s] = Infinity;
  return s;
}

const layerIdx = new Array(Tstar + 1).fill(null);
const layerMap = new Array(Tstar + 1).fill(null);
for (let t = 0; t <= Tstar; t++) { layerIdx[t] = []; layerMap[t] = new Map(); }
const startState = newState(0, S, 0, 0, 0, 30, 0, 0);
layerIdx[0].push(startState);
layerMap[0].set(mkKey(S, 0, 0, 30), startState);

function dominates(a, b) {
  // a가 b를 엄격 지배?
  if (sF[a] > sF[b] || sR[a] > sR[b]) return false;
  if (sF[a] === sF[b] && sR[a] === sR[b]) return false;
  const ka = sAct[a] ? kVal[sK[a]] : -1, kb = sAct[b] ? kVal[sK[b]] : -1;
  if (ka > kb) return false;
  if (sSig[a] === 0) {
    const ra = sAct[a] ? 30 - sGr[a] : 1e9, rb = sAct[b] ? 30 - sGr[b] : 1e9;
    if (ra < rb) return false;
  }
  return true;
}
function prune(list) {
  if (list.length < 2) return 0;
  const groups = new Map();
  for (const s of list) {
    const v = sC[s] * 2 + sSig[s];
    let g = groups.get(v);
    if (g === undefined) groups.set(v, g = []);
    g.push(s);
  }
  let cnt = 0;
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    g.sort((a, b) => {
      if (sF[a] !== sF[b]) return sF[a] - sF[b];
      if (sR[a] !== sR[b]) return sR[a] - sR[b];
      const ka = sAct[a] ? kVal[sK[a]] : -1, kb = sAct[b] ? kVal[sK[b]] : -1;
      if (ka !== kb) return ka - kb;
      const ra = sAct[a] ? 30 - sGr[a] : 1e9, rb = sAct[b] ? 30 - sGr[b] : 1e9;
      return rb - ra;
    });
    const keep = [];
    for (const b of g) {
      let dom = false;
      for (let i = 0; i < keep.length; i++) if (dominates(keep[i], b)) { dom = true; break; }
      if (dom) { sPr[b] = 1; cnt++; } else keep.push(b);
    }
  }
  return cnt;
}

let totalStates = 0, totalPruned = 0, maxLayer = 0;
for (let t = 0; t < Tstar; t++) {
  const list = layerIdx[t];
  totalStates += list.length;
  if (list.length > maxLayer) maxLayer = list.length;
  totalPruned += prune(list);
  for (let li = 0; li < list.length; li++) {
    const s = list[li];
    if (sPr[s] === 1 || isE[sC[s]] === 1) continue;
    const F = sF[s], R = sR[s];
    const o = succ(t, s);
    for (let k = 0; k < o; k++) {
      const t2 = oT2[k];
      const mp = layerMap[t2];
      const F2 = F + oDF[k], R2 = R + oDR[k];
      const ex = mp.get(oKey[k]);
      if (ex === undefined) {
        const ns = newState(t2, oC[k], oSig[k], oAct[k], oK[k], oGr[k], F2, R2);
        mp.set(oKey[k], ns);
        layerIdx[t2].push(ns);
      } else if (F2 < sF[ex] || (F2 === sF[ex] && R2 < sR[ex])) {
        sF[ex] = F2; sR[ex] = R2;
      }
    }
  }
}
totalStates += layerIdx[Tstar].length;
dbg('stage3 ms', Date.now() - T0, 'states', totalStates, 'pruned', totalPruned, 'maxLayer', maxLayer, 'K count', kVal.length);

// ---------- 4단계: 역방향 h ----------
for (let t = Tstar; t >= 0; t--) {
  const list = layerIdx[t];
  for (let li = 0; li < list.length; li++) {
    const s = list[li];
    if (sPr[s] === 1) continue;
    if (isE[sC[s]] === 1) { sH[s] = (sAct[s] ? kFare[sK[s]] : 0) * 1024; continue; }
    if (t === Tstar) continue;
    const o = succ(t, s);
    let best = Infinity;
    for (let k = 0; k < o; k++) {
      const ns = layerMap[oT2[k]].get(oKey[k]);
      if (ns === undefined) continue;
      const hh = sH[ns];
      if (hh === Infinity) continue;
      const v = oDF[k] * 1024 + oDR[k] + hh;
      if (v < best) best = v;
    }
    sH[s] = best;
  }
}
const opt = sH[startState];
dbg('stage4 ms', Date.now() - T0, 'opt fare', Math.floor(opt / 1024), 'rides', opt % 1024);
if (opt === Infinity) { console.log('불가'); process.exit(0); }

// ---------- 5단계: 사전순 최소 복원 (동일 접두사 전선 유지) ----------
let frontier = new Map([[startState, 0]]);
const out = [];
for (;;) {
  for (const s of frontier.keys()) if (isE[sC[s]] === 1) { frontier = null; break; }
  if (frontier === null) break;
  let bestRank = Infinity, bestTok = -1;
  let cand = [];
  for (const [s, acc] of frontier) {
    const t = sT[s];
    const o = succ(t, s);
    for (let k = 0; k < o; k++) {
      const ns = layerMap[oT2[k]].get(oKey[k]);
      if (ns === undefined || sPr[ns] === 1) continue;
      const hh = sH[ns];
      if (hh === Infinity) continue;
      const acc2 = acc + oDF[k] * 1024 + oDR[k];
      if (acc2 + hh !== opt) continue;
      const rk = tokRank[oTok[k]];
      if (rk < bestRank) { bestRank = rk; bestTok = oTok[k]; cand = []; }
      if (rk === bestRank) cand.push([ns, acc2]);
    }
  }
  if (bestTok < 0) { dbg('복원 실패'); console.log('불가'); process.exit(0); }
  out.push(tokStr[bestTok]);
  frontier = new Map();
  for (const [ns, acc2] of cand) frontier.set(ns, acc2);
  if (frontier.size > 1) dbg('동률 전선', frontier.size, tokStr[bestTok]);
}
dbg('done ms', Date.now() - T0);
console.log(out.join(''));
