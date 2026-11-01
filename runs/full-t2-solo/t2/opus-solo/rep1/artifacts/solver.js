'use strict';
// 막차 러너 풀이기
// 1) (칸, 틱) 도달 가능성 BFS → 가장 이른 도착 틱 T*
// 2) (E, T*) 로 이어지는 (칸, 틱)만 남기는 역방향 가지치기
// 3) 요금 상태(구역 / 30틱 재입장 창 / 통행 거리)를 붙인 상태로 틱 순서 전방 탐색.
//    상태마다 (최소 비용, 그 비용의 사전순 최소 문자열)을 유지하고,
//    문자열은 트라이 노드(부모, 토큰)로 저장해 층(틱)별 순위로 비교한다.
//    같은 칸의 상태끼리는 "비용상 지배 + 문자열 타이브레이크"로 지운다.
const fs = require('fs');

const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = level.grid;
const H = grid.length;
const W = grid.reduce((m, r) => Math.max(m, r.length), 0);
const N = H * W;
const maxTick = level.maxTick;

// ---------- 맵 ----------
const WALL = 0, IN = 1, OUT = 2, GATE = 3;
const type = new Uint8Array(N);
const esc = new Int8Array(N).fill(-1); // 0:D 1:L 2:R 3:U
const isE = new Uint8Array(N);
let start = -1;
const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0]; // D L R U
const ESC_DIR = { 'v': 0, '<': 1, '>': 2, '^': 3 };
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const p = r * W + c;
    if (ch === '.' || ch === 'P') type[p] = IN;
    else if (ch in ESC_DIR) { type[p] = IN; esc[p] = ESC_DIR[ch]; }
    else if (ch === ',') type[p] = OUT;
    else if (ch === 'S') { type[p] = OUT; if (start < 0) start = p; }
    else if (ch === 'E') { type[p] = OUT; isE[p] = 1; }
    else if (ch === 'G') type[p] = GATE;
    else type[p] = WALL;
  }
}
if (start < 0) { console.log('불가'); process.exit(0); }

// ---------- 역 폐쇄 ----------
const cellRooms = new Array(N).fill(null);
for (const room of level.rooms || []) {
  const [r0, c0, r1, c1] = room.rect;
  const ev = room.evict[0] * W + room.evict[1];
  for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++)
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const p = r * W + c;
      if (type[p] !== IN) continue;
      (cellRooms[p] || (cellRooms[p] = [])).push({ close: room.close, ev });
    }
}
// 틱 t 에 칸 p 에 서 있을 때 쫓겨나는 칸 (-1: 안 쫓겨남)
function evictTo(p, t) {
  const rs = cellRooms[p];
  if (!rs) return -1;
  for (const r of rs) if (t >= r.close) return r.ev;
  return -1;
}

// ---------- 운임 ----------
// 거리는 1/1000 km 정수로 다룬다
function fare(k) {
  if (k <= 10000) return 1450;
  if (k <= 50000) return 1450 + 100 * Math.floor((k - 10000 + 4999) / 5000);
  return 2250 + 100 * Math.floor((k - 50000 + 7999) / 8000);
}

// ---------- 행동 토큰 ----------
// 토큰은 정수 id 로 다루고, tokOrd[id] 는 JS 문자열 비교 순서
const tokStr = [], tokIdx = new Map();
function tokId(str) {
  let id = tokIdx.get(str);
  if (id === undefined) { id = tokStr.length; tokIdx.set(str, id); tokStr.push(str); }
  return id;
}
for (const ch of ["D", "L", "R", "U", "W"]) tokId(ch);
const T_W = 4;

// ---------- 노선 ----------
// cellBoard[p] = [{line, i}]  : 칸 p 가 line 의 i 번째 역 승강장
const lines = [];
const cellBoard = new Array(N).fill(null);
for (const L of level.lines || []) {
  const n = L.stations.length;
  const pre = [0], cum = [0];
  for (let i = 0; i + 1 < n; i++) {
    pre.push(pre[i] + L.travel[i]);
    cum.push(cum[i] + Math.round(L.km[i] * 1000));
  }
  const cells = L.stations.map(s => s.at[0] * W + s.at[1]);
  const dests = [];
  for (let i = 0; i < n; i++) {
    const list = [];
    const seen = new Set();
    for (let j = i + 1; j < n; j++) {
      const nm = L.stations[j].name;
      if (seen.has(nm)) continue;
      seen.add(nm);
      list.push({ j, tok: tokId('[' + L.id + '>' + nm + ']') });
    }
    dests.push(list);
  }
  const line = { id: L.id, pre, cum, cells, dests, first: L.first, headway: L.headway, last: L.last };
  lines.push(line);
  for (let i = 0; i < n; i++) {
    const p = cells[i];
    if (p < 0 || p >= N) continue;
    (cellBoard[p] || (cellBoard[p] = [])).push({ line, i });
  }
}
const tokOrd = new Int32Array(tokStr.length);
{
  const ids = tokStr.map((_, i) => i).sort((a, b) => (tokStr[a] < tokStr[b] ? -1 : tokStr[a] > tokStr[b] ? 1 : 0));
  ids.forEach((id, i) => { tokOrd[id] = i; });
}
function trainAt(line, i, t) {
  const d = t - line.pre[i];
  if (d < line.first || d > line.last) return false;
  if (line.headway > 0) return (d - line.first) % line.headway === 0;
  return d === line.first;
}

// ---------- 이동 생성 ----------
// 칸 p, 틱 t 에서 가능한 행동. 콜백 cb(tok, mid, fin, t2, km, evicted, ride)
//  mid: 행동 직후 칸(쫓겨나기 전), fin: 최종 칸
function moves(p, t, cb) {
  const r = (p / W) | 0, c = p - r * W;
  const e = esc[p];
  for (let d = 0; d < 4; d++) {
    if (e >= 0 && e !== d) continue;
    const nr = r + DR[d], nc = c + DC[d];
    if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
    const q = nr * W + nc;
    const tq = type[q];
    if (tq === WALL) continue;
    if (esc[q] >= 0 && esc[q] !== d) continue;
    const tp = type[p];
    if ((tp === IN && tq === OUT) || (tp === OUT && tq === IN)) continue;
    const t2 = t + 1;
    if (t2 > maxTick) continue;
    const ev = tq === IN ? evictTo(q, t2) : -1;
    cb(d, q, ev >= 0 ? ev : q, t2, 0, ev >= 0, false);
  }
  if (e < 0 && t + 1 <= maxTick) {
    const ev = type[p] === IN ? evictTo(p, t + 1) : -1;
    cb(T_W, p, ev >= 0 ? ev : p, t + 1, 0, ev >= 0, false);
  }
  const bl = cellBoard[p];
  if (bl && type[p] === IN) {
    const seenTok = new Set();
    for (const { line, i } of bl) {
      if (!trainAt(line, i, t)) continue;
      for (const { j, tok } of line.dests[i]) {
        if (seenTok.has(tok)) continue;
        seenTok.add(tok);
        const t2 = t + line.pre[j] - line.pre[i];
        if (t2 > maxTick || t2 <= t) continue;
        const q = line.cells[j];
        if (q < 0 || q >= N || type[q] === WALL) continue;
        const ev = type[q] === IN ? evictTo(q, t2) : -1;
        cb(tok, q, ev >= 0 ? ev : q, t2, line.cum[j] - line.cum[i], ev >= 0, true);
      }
    }
  }
}

// ---------- 1) 도달 가능성 ----------
const reach = [];
for (let t = 0; t <= maxTick; t++) reach.push(new Uint8Array(N));
reach[0][start] = 1;
let Tstar = -1;
for (let t = 0; t <= maxTick && Tstar < 0; t++) {
  const R = reach[t];
  for (let p = 0; p < N; p++) {
    if (!R[p]) continue;
    if (isE[p]) { Tstar = t; break; }
  }
  if (Tstar >= 0) break;
  for (let p = 0; p < N; p++) {
    if (!R[p]) continue;
    moves(p, t, (tok, mid, fin, t2) => { reach[t2][fin] = 1; });
  }
}
if (Tstar < 0) { console.log('불가'); process.exit(0); }

// ---------- 2) 쓸모 있는 (칸, 틱) ----------
const useful = [];
for (let t = 0; t <= Tstar; t++) useful.push(new Uint8Array(N));
for (let p = 0; p < N; p++) if (reach[Tstar][p] && isE[p]) useful[Tstar][p] = 1;
for (let t = Tstar - 1; t >= 0; t--) {
  const R = reach[t], U = useful[t];
  for (let p = 0; p < N; p++) {
    if (!R[p] || isE[p]) continue;
    let ok = false;
    moves(p, t, (tok, mid, fin, t2) => {
      if (!ok && t2 <= Tstar && useful[t2][fin]) ok = true;
    });
    if (ok) U[p] = 1;
  }
}

// ---------- 3) 요금 상태 ----------
// phase: 0 = 밖(열린 통행 없음), 1 = 안, 2+r = 밖(통행 열림, 재입장 여유 r틱, 0..30)
const NPH = 33;
const kIds = new Map(), kVals = [];
function kId(k) {
  let id = kIds.get(k);
  if (id === undefined) { id = kVals.length; kIds.set(k, id); kVals.push(k); }
  return id;
}
kId(0);
const encode = (p, ph, kid) => p + N * (ph + NPH * kid);

// entryBy[t][p]: 밖(개찰구 포함)의 쓸모 있는 상태 (p,t) 에서 밖에서만 걸어 안 칸에 들어설 수 있는
// 가장 이른 틱 (쓸모 있는 상태만 거침). 재입장 마감 t+r 이 이보다 이르면 통행은 이미 끝난 것과 같다.
const NOENTRY = 0x7fff;
const entryBy = [];
for (let t = 0; t <= Tstar; t++) entryBy.push(new Int16Array(N).fill(NOENTRY));
for (let t = Tstar - 1; t >= 0; t--) {
  const U = useful[t], EB = entryBy[t];
  for (let p = 0; p < N; p++) {
    if (!U[p] || type[p] === IN || isE[p]) continue;
    let best = NOENTRY;
    moves(p, t, (tok, mid, fin, t2, km, evicted, ride) => {
      if (ride || t2 > Tstar || !useful[t2][fin]) return;
      if (type[mid] === IN) { if (t2 < best) best = t2; }
      else if (type[fin] !== IN) { const v = entryBy[t2][fin]; if (v < best) best = v; }
    });
    EB[p] = best;
  }
}
// 50km 초과 구간의 운임 증가분은 8km 주기 → (50, 58]km 로 접는다
function normK(k) {
  if (k > 58000) k = 50000 + ((k - 50001) % 8000) + 1;
  return k;
}

// 상태 (p,t,ph,k) 에서 행동 하나의 결과 → [ph2, k2, cost] (fin, t2 는 moves 가 줌)
function transition(ph, k, t, mid, evicted, t2, km, ride, fin) {
  const [ph2, k2, cost] = transition0(ph, k, t, mid, evicted, t2, km, ride);
  if (ph2 >= 2 && t2 + ph2 - 2 < entryBy[t2][fin]) return [0, 0, cost];
  return [ph2, normK(k2), cost];
}
function transition0(ph, k, t, mid, evicted, t2, km, ride) {
  let cost = 0;
  if (ph >= 2) {
    const r = ph - 2 - (t2 - t);
    if (r < 0) { ph = 0; k = 0; } else ph = 2 + r;
  }
  if (ride) {
    const k2 = k + km;
    cost += fare(k2) - fare(k);
    k = k2;
  } else {
    const tm = type[mid];
    if (tm === IN && ph !== 1) {
      if (ph === 0) { k = 0; cost += 1450; }
      ph = 1;
    } else if (tm === OUT && ph === 1) {
      ph = 2 + 30;
    }
  }
  if (evicted) ph = 2 + 30;
  return [ph, k, cost];
}

function decode(key) {
  const p = key % N;
  const rest = (key - p) / N;
  const ph = rest % NPH;
  const kid = (rest - ph) / NPH;
  return [p, ph, kVals[kid]];
}

// 비용 값 = 요금 * BMUL + 승차 횟수 (사전식 비교를 숫자 하나로)
const BMUL = 4096;

// ---------- 4) 트라이 노드 (경로 문자열) ----------
let cap = 1 << 16;
let nLayer = new Int32Array(cap), nParent = new Int32Array(cap), nTok = new Int32Array(cap), nRank = new Int32Array(cap);
let nNodes = 0;
function newNode(layer, parent, tok) {
  if (nNodes === cap) {
    cap *= 2;
    const grow = a => { const b = new Int32Array(cap); b.set(a); return b; };
    nLayer = grow(nLayer); nParent = grow(nParent); nTok = grow(nTok); nRank = grow(nRank);
  }
  nLayer[nNodes] = layer; nParent[nNodes] = parent; nTok[nNodes] = tok;
  return nNodes++;
}
// 문자열(x)+토큰 cx 와 문자열(y)+토큰 cy 비교. x, y 는 순위가 매겨진(확정된) 노드.
// 같은 틱에 끝나는 서로 다른 경로의 문자열은 서로의 접두사가 될 수 없으므로 층 순위로 결정된다.
function cmpCand(x, cx, y, cy) {
  for (;;) {
    if (x === y) return tokOrd[cx] - tokOrd[cy];
    const lx = nLayer[x], ly = nLayer[y];
    if (lx === ly) return nRank[x] - nRank[y];
    if (lx > ly) { cx = nTok[x]; x = nParent[x]; }
    else { cy = nTok[y]; y = nParent[y]; }
  }
}

// ---------- 5) 전방 탐색 ----------
// layers[t] = { map: key -> idx, keys[], h[], node[] }
const layers = [];
for (let t = 0; t <= Tstar; t++) layers.push({ map: new Map(), keys: [], h: [], node: [] });
{
  const L0 = layers[0], k0 = encode(start, 0, kId(0));
  const root = newNode(0, -1, -1);
  nRank[root] = 0;
  L0.map.set(k0, 0); L0.keys.push(k0); L0.h.push(0); L0.node.push(root);
}

// 층 t 확정: 문자열 순으로 순위를 매기고, 같은 칸에서 지배되는 상태를 지운다.
//  C = h - fare(k)  (지금 열린 통행 요금을 뺀 확정 비용)
//  a 가 b 보다 비용상 나쁘지 않음 (모든 미래에 대해 총비용 a <= b):
//   - 둘 다 안:       k_a <= k_b, C_a <= C_b
//   - 둘 다 밖(열림):  r_a >= r_b, k_a <= k_b, C_a <= C_b   (재입장 창이 길수록 손해 없음)
//   - a 밖(열림), b 밖(통행 없음): h_a <= h_b              (이어 타기는 새 통행보다 비싸지 않음)
//  여기에 비용이 엄격히 작거나 (C 또는 h 가 <) 문자열이 사전순으로 앞서면 b 를 지운다.
function finalizeLayer(t) {
  const L = layers[t];
  const n = L.keys.length;
  if (n === 0) return;
  // 순위
  const ord = new Array(n);
  for (let i = 0; i < n; i++) ord[i] = i;
  if (t > 0) {
    const nd = L.node;
    ord.sort((a, b) => cmpCand(nParent[nd[a]], nTok[nd[a]], nParent[nd[b]], nTok[nd[b]]));
    for (let i = 0; i < n; i++) nRank[nd[ord[i]]] = i;
  }
  if (n < 2) return;
  // 지배 제거
  const P = new Int32Array(n), PH = new Int8Array(n), K = new Float64Array(n), C = new Float64Array(n), R = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const [p, ph, k] = decode(L.keys[i]);
    P[i] = p; PH[i] = ph; K[i] = k; C[i] = L.h[i] - (ph >= 1 ? fare(k) * BMUL : 0);
    R[i] = nRank[L.node[i]];
  }
  const H_ = L.h;
  ord.sort((a, b) => P[a] - P[b] || C[a] - C[b] || H_[a] - H_[b] || R[a] - R[b]);
  const dead = new Uint8Array(n);
  let any = false;
  const front = [];
  for (let s = 0; s < n; ) {
    let e = s + 1;
    while (e < n && P[ord[e]] === P[ord[s]]) e++;
    if (e - s > 1) {
      front.length = 0;
      for (let x = s; x < e; x++) {
        const b = ord[x];
        for (let y = 0; y < front.length; y++) {
          const a = front[y];
          let dom = false;
          if (PH[a] === 1 && PH[b] === 1) {
            dom = K[a] <= K[b] && C[a] <= C[b] && (C[a] < C[b] || R[a] < R[b]);
          } else if (PH[a] >= 2 && PH[b] >= 2) {
            dom = PH[a] >= PH[b] && K[a] <= K[b] && C[a] <= C[b] && (C[a] < C[b] || R[a] < R[b]);
          } else if (PH[a] >= 2 && PH[b] === 0) {
            dom = H_[a] <= H_[b] && (H_[a] < H_[b] || R[a] < R[b]);
          }
          if (dom) { dead[b] = 1; any = true; break; }
        }
        if (!dead[b]) front.push(b);
      }
    }
    s = e;
  }
  if (!any) return;
  const NL = { map: null, keys: [], h: [], node: [] };
  for (let i = 0; i < n; i++) {
    if (dead[i]) continue;
    NL.keys.push(L.keys[i]); NL.h.push(L.h[i]); NL.node.push(L.node[i]);
  }
  layers[t] = NL;
}

for (let t = 0; t < Tstar; t++) {
  finalizeLayer(t);
  const L = layers[t];
  L.map = null; // 더 이상 찾지 않음
  for (let idx = 0; idx < L.keys.length; idx++) {
    const [p, ph, k] = decode(L.keys[idx]);
    const h = L.h[idx], pn = L.node[idx];
    moves(p, t, (tok, mid, fin, t2, km, evicted, ride) => {
      if (t2 > Tstar || !useful[t2][fin]) return;
      const [ph2, k2, cost] = transition(ph, k, t, mid, evicted, t2, km, ride, fin);
      const nh = h + cost * BMUL + (ride ? 1 : 0);
      const key = encode(fin, ph2, kId(k2));
      const L2 = layers[t2];
      const i2 = L2.map.get(key);
      if (i2 === undefined) {
        L2.map.set(key, L2.keys.length); L2.keys.push(key); L2.h.push(nh); L2.node.push(newNode(t2, pn, tok));
      } else {
        const oh = L2.h[i2];
        if (nh < oh || (nh === oh && cmpCand(pn, tok, nParent[L2.node[i2]], nTok[L2.node[i2]]) < 0)) {
          L2.h[i2] = nh;
          const nd = L2.node[i2];
          nParent[nd] = pn; nTok[nd] = tok;
        }
      }
    });
  }
}

// ---------- 6) 답 ----------
finalizeLayer(Tstar);
const LT = layers[Tstar];
let best = -1;
for (let i = 0; i < LT.keys.length; i++) {
  if (!isE[LT.keys[i] % N]) continue;
  if (best < 0 || LT.h[i] < LT.h[best] || (LT.h[i] === LT.h[best] && nRank[LT.node[i]] < nRank[LT.node[best]])) best = i;
}
if (best < 0) { console.log('불가'); process.exit(0); }
const toks = [];
for (let x = LT.node[best]; nParent[x] >= 0; x = nParent[x]) toks.push(tokStr[nTok[x]]);
console.log(toks.reverse().join(''));

if (process.argv[3] === '--debug') {
  let nk = 0;
  for (const L of layers) nk += L.keys.length;
  console.error(`T*=${Tstar} fare=${Math.floor(LT.h[best] / BMUL)} rides=${LT.h[best] % BMUL} keptKeys=${nk} nodes=${nNodes} kvals=${kVals.length} time=${process.uptime().toFixed(2)}s mem=${(process.memoryUsage().rss / 1048576).toFixed(0)}MB`);
}
