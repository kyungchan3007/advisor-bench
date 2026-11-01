'use strict';
// 막차 러너 풀이기
// 1) 이동만 보는 시간 확장 그래프에서 최소 도착 틱 T*를 구하고,
// 2) T*에 도착 가능한 노드만 남기고(역방향 가지치기),
// 3) 그 안에서 (요금, 승차 횟수, 문자열) 순으로 틱 단위 DP.
const fs = require('fs');
const T0 = Date.now();

const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = level.grid;
const H = grid.length;
const W = grid[0].length;
const MAXT = level.maxTick;
const NC = H * W;
const KS = 1000;

// zone: 0 밖, 1 안, 2 G, 3 벽
const zone = new Uint8Array(NC);
const arrow = new Int8Array(NC).fill(-1); // 0 D, 1 L, 2 R, 3 U
const DR = [1, 0, 0, -1];
const DC = [0, -1, 1, 0];
const DCH = ['D', 'L', 'R', 'U'];
let startCell = -1;
const isEnd = new Uint8Array(NC);
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const id = r * W + c;
    switch (ch) {
      case '.': case 'P': zone[id] = 1; break;
      case 'v': zone[id] = 1; arrow[id] = 0; break;
      case '<': zone[id] = 1; arrow[id] = 1; break;
      case '>': zone[id] = 1; arrow[id] = 2; break;
      case '^': zone[id] = 1; arrow[id] = 3; break;
      case 'G': zone[id] = 2; break;
      case '#': zone[id] = 3; break;
      case 'S': zone[id] = 0; startCell = id; break;
      case 'E': zone[id] = 0; isEnd[id] = 1; break;
      default: zone[id] = 0;
    }
  }
}

// 역 건물: 안 칸 -> 폐쇄 틱, 퇴장 칸 (겹치면 가장 이른 폐쇄를 적용)
const closeAt = new Int32Array(NC).fill(1e9);
const evictTo = new Int32Array(NC).fill(-1);
for (const room of level.rooms || []) {
  const [r0, c0, r1, c1] = room.rect;
  for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const id = r * W + c;
      if (zone[id] !== 1) continue;
      if (room.close < closeAt[id]) {
        closeAt[id] = room.close;
        evictTo[id] = room.evict[0] * W + room.evict[1];
      }
    }
  }
}

// 열차 시간표: tick -> Map(cell -> 탑승 선택지 목록)
const boardAt = [];
for (let t = 0; t <= MAXT; t++) boardAt.push(null);
for (const line of level.lines) {
  const n = line.stations.length;
  const cumT = [0];
  const cumK = [0];
  for (let i = 0; i < n - 1; i++) {
    cumT.push(cumT[i] + line.travel[i]);
    cumK.push(cumK[i] + Math.round(line.km[i] * KS));
  }
  for (let i = 0; i < n - 1; i++) {
    const at = line.stations[i].at;
    const cell = at[0] * W + at[1];
    const seen = new Set();
    const opts = [];
    for (let j = i + 1; j < n; j++) {
      const nm = line.stations[j].name;
      if (seen.has(nm)) continue;
      seen.add(nm);
      const a = line.stations[j].at;
      opts.push({
        dt: cumT[j] - cumT[i],
        km: cumK[j] - cumK[i],
        to: a[0] * W + a[1],
        str: '[' + line.id + '>' + nm + ']',
      });
    }
    if (!opts.length) continue;
    const hw = line.headway > 0 ? line.headway : 1e9;
    for (let d = line.first; d <= line.last; d += hw) {
      const tk = d + cumT[i];
      if (tk > MAXT) break;
      if (!boardAt[tk]) boardAt[tk] = new Map();
      const m = boardAt[tk];
      let arr = m.get(cell);
      if (!arr) { arr = []; m.set(cell, arr); }
      for (const o of opts) arr.push(o);
    }
  }
}

// km는 KS배 정수로 다룬다
function fare(km) {
  if (km <= 10 * KS) return 1450;
  if (km <= 50 * KS) return 1450 + 100 * Math.ceil((km - 10 * KS) / (5 * KS));
  return 2250 + 100 * Math.ceil((km - 50 * KS) / (8 * KS));
}

// ---- 이동 생성 ----
// 노드 = cell*2 + s (s는 G에서만 의미: 1이면 안쪽에서 온 것)
const MAXMV = 64;
const mvNode = new Int32Array(MAXMV);
const mvT = new Int32Array(MAXMV);
const mvKm = new Int32Array(MAXMV);
const mvBoard = new Uint8Array(MAXMV);
const mvEnt = new Uint8Array(MAXMV);
const mvExit = new Uint8Array(MAXMV);
const mvStr = new Array(MAXMV);
let mvN = 0;

function push(cell, s, t2, str, km, board, ent, exit) {
  if (t2 > MAXT) return;
  // 강제 퇴장
  if (zone[cell] === 1 && t2 >= closeAt[cell]) {
    cell = evictTo[cell];
    s = 0;
    exit = 1;
  }
  const i = mvN++;
  mvNode[i] = cell * 2 + s;
  mvT[i] = t2;
  mvStr[i] = str;
  mvKm[i] = km;
  mvBoard[i] = board;
  mvEnt[i] = ent;
  mvExit[i] = exit;
}

function genMoves(node, t) {
  mvN = 0;
  const cell = node >> 1;
  const s = node & 1;
  if (isEnd[cell]) return;
  const z = zone[cell];
  const r = (cell / W) | 0;
  const c = cell - r * W;
  const onEsc = arrow[cell] >= 0;
  // 대기
  if (!onEsc) push(cell, s, t + 1, 'W', 0, 0, 0, 0);
  for (let d = 0; d < 4; d++) {
    if (onEsc && arrow[cell] !== d) continue;
    const nr = r + DR[d];
    const nc = c + DC[d];
    if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
    const nid = nr * W + nc;
    const nz = zone[nid];
    if (nz === 3) continue;
    if (arrow[nid] >= 0 && arrow[nid] !== d) continue;
    if (z !== 2 && nz !== 2 && z !== nz) continue;
    let s2 = 0;
    let ent = 0;
    let exit = 0;
    if (nz === 2) {
      s2 = z === 2 ? s : (z === 1 ? 1 : 0);
    } else if (z === 2) {
      if (nz === 1 && s === 0) ent = 1;
      if (nz === 0 && s === 1) exit = 1;
    }
    push(nid, s2, t + 1, DCH[d], 0, 0, ent, exit);
  }
  // 열차 (안 칸 = 승강장)
  if (z === 1) {
    const m = boardAt[t];
    if (m) {
      const arr = m.get(cell);
      if (arr) {
        for (const o of arr) push(o.to, 0, t + o.dt, o.str, o.km, 1, 0, 0);
      }
    }
  }
}

const NN = NC * 2;
const startNode = startCell * 2;

// ---- 1단계: 도달 가능 (이동만) -> 최소 도착 틱 T ----
const layer = [];
for (let t = 0; t <= MAXT; t++) layer.push(new Uint8Array(NN));
layer[0][startNode] = 1;
let T = Infinity;
for (let t = 0; t <= MAXT && t < T; t++) {
  const L = layer[t];
  for (let n = 0; n < NN; n++) {
    if (!L[n]) continue;
    genMoves(n, t);
    for (let i = 0; i < mvN; i++) {
      const t2 = mvT[i];
      layer[t2][mvNode[i]] = 1;
      if (isEnd[mvNode[i] >> 1] && t2 < T) T = t2;
    }
  }
}
if (process.env.DBG) {
  let cnt = 0;
  for (const L of layer) for (let n = 0; n < NN; n++) cnt += L[n];
  console.error('T', T, 'reached nodes', cnt, Date.now() - T0, 'ms');
}
if (T === Infinity) {
  console.log('불가');
  process.exit(0);
}

// ---- 2단계: T에 E 도착이 가능한 노드만 남김 ----
const good = [];
for (let t = 0; t <= T; t++) good.push(new Uint8Array(NN));
for (let n = 0; n < NN; n++) if (layer[T][n] && isEnd[n >> 1]) good[T][n] = 1;
for (let t = T - 1; t >= 0; t--) {
  const L = layer[t];
  const G = good[t];
  for (let n = 0; n < NN; n++) {
    if (!L[n]) continue;
    genMoves(n, t);
    for (let i = 0; i < mvN; i++) {
      if (mvT[i] <= T && good[mvT[i]][mvNode[i]]) { G[n] = 1; break; }
    }
  }
}
layer.length = 0;
if (process.env.DBG) console.error('good done', Date.now() - T0, 'ms');

// ---- 3단계: 틱 단위 DP ----
// 상태: node, km(현재 통행 거리), e (-2 안, -1 통행 없음, >=0 퇴장 틱), fin(확정 요금), board, str
// 비교 키 = (fin, board, str). 같은 노드에서 같은 종류(e의 부류)이고
// km가 작거나 같고 e가 크거나 같으면서 키도 같거나 앞서면 다른 상태를 지배한다
// (요금은 km에 단조, 부분가법이라 어떤 이후 행동에서도 손해가 없다).
function keyLE(a, b) {
  if (a.fin !== b.fin) return a.fin < b.fin;
  if (a.board !== b.board) return a.board < b.board;
  return a.str <= b.str;
}
function insert(M2, ns) {
  const list = M2.get(ns.node);
  if (!list) { M2.set(ns.node, [ns]); return; }
  const cls = ns.e >= 0 ? 2 : ns.e + 2; // 0 안, 1 없음, 2 활성
  let n = list.length;
  for (let i = 0; i < n; i++) {
    const o = list[i];
    if (o.cls !== cls) continue;
    if (o.km <= ns.km && o.e >= ns.e && keyLE(o, ns)) return;
  }
  for (let i = 0; i < n; ) {
    const o = list[i];
    if (o.cls === cls && ns.km <= o.km && ns.e >= o.e && keyLE(ns, o)) {
      list[i] = list[--n];
    } else i++;
  }
  list.length = n;
  list.push(ns);
}

const cur = [];
for (let t = 0; t <= T; t++) cur.push(null);
cur[0] = new Map();
cur[0].set(startNode, [{ node: startNode, cls: 1, km: 0, e: -1, fin: 0, board: 0, str: '' }]);
let best = null;
let dbgStates = 0;
for (let t = 0; t < T; t++) {
  const M = cur[t];
  if (!M) continue;
  if (process.env.DBG) {
    let c = 0;
    for (const l of M.values()) c += l.length;
    dbgStates += c;
    if (t % 20 === 0) console.error('t', t, 'layer', c, 'total', dbgStates, Date.now() - T0, 'ms');
  }
  for (const list of M.values()) {
    for (const st of list) {
      genMoves(st.node, t);
      for (let i = 0; i < mvN; i++) {
        const t2 = mvT[i];
        const nn = mvNode[i];
        if (t2 > T || !good[t2][nn]) continue;
        let km = st.km;
        let e = st.e;
        let fin = st.fin;
        if (mvEnt[i]) {
          if (e >= 0 && t2 - e > 30) { fin += fare(km); km = 0; }
          else if (e === -1) km = 0;
          e = -2;
        }
        km += mvKm[i];
        if (mvExit[i]) e = t2;
        if (e >= 0 && t2 > e + 30) { fin += fare(km); km = 0; e = -1; }
        const ns = { node: nn, cls: e >= 0 ? 2 : e + 2, km, e, fin, board: st.board + mvBoard[i], str: st.str + mvStr[i] };
        if (isEnd[nn >> 1]) {
          if (e !== -1) ns.fin += fare(km);
          if (t2 === T && (!best || !keyLE(best, ns))) best = ns;
          continue;
        }
        let M2 = cur[t2];
        if (!M2) { M2 = new Map(); cur[t2] = M2; }
        insert(M2, ns);
      }
    }
  }
  cur[t] = null;
}
if (process.env.DBG) console.error('phase3 states', dbgStates, Date.now() - T0, 'ms');
console.log(best ? best.str : '불가');
