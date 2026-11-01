'use strict';
// 막차 러너 풀이기
// 1단계: (틱, 노드) 시간축 도달성으로 최소 도착 틱 T* 를 구하고, T* 에 닿을 수 있는 상태(good)만 남긴다.
// 2단계: (틱, 노드, k, te) 메모 DFS 로 (요금, 승차) 최소 비용을 구한다.
//   노드 = 칸*2 + st (st: 개찰구 칸에서 어느 쪽에서 왔는가, 그 외 칸은 안=1 밖=0)
//   k = 현재 통행의 누적 km, te = 마지막 퇴장 틱(밖에서 통행이 살아 있을 때만, 아니면 -1)
// 3단계: 최적 비용을 만족하는 상태 집합(frontier)을 토큰 단위로 따라가며 사전순 최소 문자열을 복원한다.
const fs = require('fs');

const INF = Infinity;
const UNIT = 1024; // 비용 = 요금 * 1024 + 승차 횟수

function fare(k) {
  if (k <= 10) return 1450;
  if (k <= 50) return 1450 + Math.ceil((k - 10) / 5) * 100;
  return 2250 + Math.ceil((k - 50) / 8) * 100;
}

function solve(L) {
  const H = L.grid.length, COLS = L.grid[0].length, N = H * COLS, NN = N * 2;
  const maxTick = L.maxTick;
  const zone = new Int8Array(N).fill(-1); // -1 벽, 0 밖, 1 안, 2 개찰구
  const arrow = new Int8Array(N).fill(-1); // 0 D, 1 L, 2 R, 3 U
  const isE = new Uint8Array(N);
  const closeAt = new Float64Array(N).fill(Infinity);
  const evictCell = new Int32Array(N).fill(-1);
  let start = -1;
  const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0]; // D L R U
  const DCH = ['D', 'L', 'R', 'U'];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < COLS; c++) {
      const ch = L.grid[r][c], i = r * COLS + c;
      if (ch === '.' || ch === 'P') zone[i] = 1;
      else if (ch === '>') { zone[i] = 1; arrow[i] = 2; }
      else if (ch === '<') { zone[i] = 1; arrow[i] = 1; }
      else if (ch === '^') { zone[i] = 1; arrow[i] = 3; }
      else if (ch === 'v') { zone[i] = 1; arrow[i] = 0; }
      else if (ch === ',' || ch === 'S' || ch === 'E') {
        zone[i] = 0;
        if (ch === 'S') start = i;
        if (ch === 'E') isE[i] = 1;
      } else if (ch === 'G') zone[i] = 2;
    }
  }
  for (const rm of L.rooms) {
    const [r0, c0, r1, c1] = rm.rect;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= H || c < 0 || c >= COLS) continue;
        const i = r * COLS + c;
        if (zone[i] === 1 && evictCell[i] < 0) {
          closeAt[i] = rm.close;
          evictCell[i] = rm.evict[0] * COLS + rm.evict[1];
        }
      }
    }
  }
  // 노선 전처리
  const lines = L.lines;
  const stationsAt = new Array(N).fill(null);
  const lineInfo = lines.map((ln, li) => {
    const n = ln.stations.length;
    const cum = [0], kmc = [0];
    for (let i = 0; i < n - 1; i++) { cum.push(cum[i] + ln.travel[i]); kmc.push(kmc[i] + ln.km[i]); }
    const cells = ln.stations.map(s => s.at[0] * COLS + s.at[1]);
    const dests = [];
    for (let i = 0; i < n; i++) {
      const seen = new Set(), list = [];
      for (let j = i + 1; j < n; j++) {
        const nm = ln.stations[j].name;
        if (seen.has(nm)) continue;
        seen.add(nm);
        list.push({ j, dt: cum[j] - cum[i], km: kmc[j] - kmc[i], cell: cells[j], code: 5 + li * 1024 + j });
      }
      dests.push(list);
      if (!stationsAt[cells[i]]) stationsAt[cells[i]] = [];
      stationsAt[cells[i]].push({ li, i });
    }
    return { cum, dests };
  });

  // 전이 생성: emit(code, t2, node2, enter, exit, dkm)
  function gen(t, node, lim, emit) {
    const cell = node >> 1, st = node & 1, z = zone[cell];
    if (isE[cell]) return;
    const r = (cell / COLS) | 0, c = cell - r * COLS, ar = arrow[cell];
    const t2 = t + 1;
    if (t2 <= lim) {
      for (let dir = 0; dir < 4; dir++) {
        if (ar >= 0 && ar !== dir) continue;
        const nr = r + DR[dir], nc = c + DC[dir];
        if (nr < 0 || nr >= H || nc < 0 || nc >= COLS) continue;
        const nci = nr * COLS + nc, nz = zone[nci];
        if (nz < 0) continue;
        const na = arrow[nci];
        if (na >= 0 && na !== dir) continue;
        let enter = false, ex = false, nst;
        if (nz === 1) {
          if (z === 0) continue;
          enter = (z === 2 && st === 0);
          nst = 1;
        } else if (nz === 0) {
          if (z === 1) continue;
          ex = (z === 2 && st === 1);
          nst = 0;
        } else {
          nst = (z === 2) ? st : z;
        }
        let fc = nci;
        if (nz === 1 && t2 >= closeAt[nci]) { fc = evictCell[nci]; nst = 0; ex = true; }
        emit(dir, t2, fc * 2 + nst, enter, ex, 0);
      }
      if (ar < 0) {
        if (z === 1 && t2 >= closeAt[cell]) emit(4, t2, evictCell[cell] * 2, false, true, 0);
        else emit(4, t2, node, false, false, 0);
      }
    }
    if (z === 1 && st === 1) {
      const sa = stationsAt[cell];
      if (sa) {
        for (const { li, i } of sa) {
          const ln = lines[li], info = lineInfo[li];
          const d = t - info.cum[i];
          if (d < ln.first || d > ln.last) continue;
          if (ln.headway > 0 ? (d - ln.first) % ln.headway !== 0 : d !== ln.first) continue;
          for (const ds of info.dests[i]) {
            const tt = t + ds.dt;
            if (tt > lim) continue;
            if (tt >= closeAt[ds.cell]) emit(ds.code, tt, evictCell[ds.cell] * 2, false, true, ds.km);
            else emit(ds.code, tt, ds.cell * 2 + 1, false, false, ds.km);
          }
        }
      }
    }
  }

  // ---- 1단계: 도달성
  const reach = [];
  for (let t = 0; t <= maxTick; t++) reach.push(new Uint8Array(NN));
  const startNode = start * 2;
  reach[0][startNode] = 1;
  const eNodes = [];
  for (let i = 0; i < N; i++) if (isE[i]) eNodes.push(i * 2);
  let T = -1;
  for (let t = 0; t <= maxTick && T < 0; t++) {
    const rt = reach[t];
    const queue = [];
    for (let n = 0; n < NN; n++) if (rt[n]) queue.push(n);
    for (let qi = 0; qi < queue.length; qi++) {
      gen(t, queue[qi], maxTick, (code, t2, n2) => {
        const row = reach[t2];
        if (!row[n2]) { row[n2] = 1; if (t2 === t) queue.push(n2); }
      });
    }
    for (const e of eNodes) if (rt[e]) { T = t; break; }
  }
  if (T < 0) return '불가';

  // ---- good: T* 에 E 로 닿을 수 있는 상태
  const good = [];
  for (let t = 0; t <= T; t++) good.push(new Uint8Array(NN));
  for (const e of eNodes) if (reach[T][e]) good[T][e] = 1;
  for (let t = T; t >= 0; t--) {
    const rt = reach[t], gt = good[t];
    let changed = true;
    while (changed) {
      changed = false;
      for (let n = 0; n < NN; n++) {
        if (!rt[n] || gt[n]) continue;
        let found = false;
        gen(t, n, T, (code, t2, n2) => { if (good[t2][n2]) found = true; });
        if (found) { gt[n] = 1; changed = true; }
      }
    }
  }
  if (!good[0][startNode]) return '불가';

  // ---- 2단계: 메모 DFS
  let aCost = 0, aK = 0, aTe = -1;
  // k 값 인터닝: 상태에는 id 를 들고 다니고, 요금 계산 때만 값으로 바꾼다 (id 0 = 값 0)
  const kIds = new Map(), kVals = [];
  function internK(v) {
    let id = kIds.get(v);
    if (id === undefined) {
      id = kVals.length;
      if (id >= 65536) throw new Error('k id overflow');
      kIds.set(v, id);
      kVals.push(v);
    }
    return id;
  }
  internK(0);
  function applyFare(code, k, te, t2, enter, ex, dkm) {
    const kv = kVals[k];
    let kv2 = kv, te2 = te, cost = 0;
    if (code >= 5) { cost += (fare(kv + dkm) - fare(kv)) * UNIT + 1; kv2 = kv + dkm; }
    if (enter) {
      if (!(te >= 0 && t2 - te <= 30)) { cost += 1450 * UNIT; kv2 = 0; }
      te2 = -1;
    }
    if (ex) te2 = t2;
    else if (te2 >= 0 && t2 - te2 > 30) { kv2 = 0; te2 = -1; }
    aCost = cost; aK = internK(kv2); aTe = te2;
  }
  function keyOf(t, node, k, te) {
    return ((t * NN + node) * 65536 + k) * 32 + (te < 0 ? 31 : t - te);
  }
  const memo = new Map(), inprog = new Map();
  let depth = 0, low = INF;
  function dfs(t, node, k, te) {
    if (isE[node >> 1]) return t === T ? 0 : INF;
    const key = keyOf(t, node, k, te);
    const m = memo.get(key);
    if (m !== undefined) return m;
    const ip = inprog.get(key);
    if (ip !== undefined) { if (ip < low) low = ip; return INF; }
    const my = depth++;
    inprog.set(key, my);
    const outerLow = low;
    low = INF;
    let best = INF;
    gen(t, node, T, (code, t2, n2, enter, ex, dkm) => {
      if (!good[t2][n2]) return;
      applyFare(code, k, te, t2, enter, ex, dkm);
      const c0 = aCost, k2 = aK, te2 = aTe;
      const v = dfs(t2, n2, k2, te2);
      if (v !== INF && c0 + v < best) best = c0 + v;
    });
    depth--;
    inprog.delete(key);
    if (low >= my) { memo.set(key, best); low = outerLow; }
    else if (outerLow < low) low = outerLow;
    return best;
  }
  const total = dfs(0, startNode, 0, -1);
  if (total === INF) return '불가';

  // ---- 3단계: 복원
  function tokStr(code) {
    if (code < 4) return DCH[code];
    if (code === 4) return 'W';
    const li = (code - 5) >> 10, j = (code - 5) & 1023;
    return '[' + lines[li].id + '>' + lines[li].stations[j].name + ']';
  }
  let frontier = new Map();
  const s0 = { t: 0, node: startNode, k: 0, te: -1, acc: 0 };
  frontier.set(keyOf(0, startNode, 0, -1), s0);
  let out = '';
  for (;;) {
    let done = false;
    for (const s of frontier.values()) if (isE[s.node >> 1]) done = true;
    if (done) break;
    let bestTok = null;
    let cands = [];
    for (const s of frontier.values()) {
      gen(s.t, s.node, T, (code, t2, n2, enter, ex, dkm) => {
        if (!good[t2][n2]) return;
        applyFare(code, s.k, s.te, t2, enter, ex, dkm);
        const c0 = aCost, k2 = aK, te2 = aTe;
        const v = dfs(t2, n2, k2, te2);
        if (v === INF || s.acc + c0 + v !== total) return;
        cands.push({ tok: tokStr(code), st: { t: t2, node: n2, k: k2, te: te2, acc: s.acc + c0 } });
      });
    }
    if (cands.length === 0) return '불가'; // 일어나선 안 됨
    for (const cd of cands) if (bestTok === null || cd.tok < bestTok) bestTok = cd.tok;
    const nf = new Map();
    for (const cd of cands) {
      if (cd.tok !== bestTok) continue;
      nf.set(keyOf(cd.st.t, cd.st.node, cd.st.k, cd.st.te), cd.st);
    }
    out += bestTok;
    frontier = nf;
  }
  return out;
}

module.exports = { solve, fare };

if (require.main === module) {
  const L = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  console.log(solve(L));
}
