'use strict';
// 막차 러너 풀이기
// 1) (칸, 틱) 단위 도달 가능성으로 최소 도착 틱 T 를 구한다.
// 2) 틱 T 에 E 로 갈 수 있는 (칸, 틱) 만 남기고(good), 남은 승차 수·거리의 하한(mb, mk)을 구한다.
// 3) 요금 상태(구역, 통행 거리 K, 재입장 남은 틱 w)를 넣은 라벨 탐색 + 지배 관계 가지치기로
//    최소 비용 OPT = (요금, 승차 횟수) 를 정확히 구한다.
// 4) "지금까지 비용 + 하한 <= OPT" 인 상태만 펼쳐 뒤에서부터 남은 최소 비용을 계산하고,
//    앞에서부터 최적을 유지하는 행동 중 사전순 가장 작은 것을 고른다.
const fs = require('fs');
const lvl = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const DBG = process.argv[3] === 'dbg';
const dbg = (...a) => { if (DBG) process.stderr.write(a.join(' ') + '\n'); };

const grid = lvl.grid;
const H = grid.length;
let W = 0;
for (const row of grid) W = Math.max(W, row.length);
const N = H * W;
const maxTick = lvl.maxTick;

// zone: -1 벽, 0 밖, 1 안, 2 개찰구
const zone = new Int8Array(N).fill(-1);
const esc = new Int8Array(N).fill(-1);
const isE = new Uint8Array(N);
let S = -1;
const DR = [1, 0, 0, -1];
const DC = [0, -1, 1, 0];
const MOVE_TOK = ['D', 'L', 'R', 'U', 'W'];
for (let r = 0; r < H; r++) {
  const row = grid[r];
  for (let c = 0; c < W; c++) {
    const ch = c < row.length ? row[c] : '#';
    const i = r * W + c;
    switch (ch) {
      case '.': case 'P': zone[i] = 1; break;
      case 'v': zone[i] = 1; esc[i] = 0; break;
      case '<': zone[i] = 1; esc[i] = 1; break;
      case '>': zone[i] = 1; esc[i] = 2; break;
      case '^': zone[i] = 1; esc[i] = 3; break;
      case ',': zone[i] = 0; break;
      case 'S': zone[i] = 0; if (S < 0) S = i; break;
      case 'E': zone[i] = 0; isE[i] = 1; break;
      case 'G': zone[i] = 2; break;
      default: zone[i] = -1;
    }
  }
}
const inGrid = (at) => Array.isArray(at) && at[0] >= 0 && at[0] < H && at[1] >= 0 && at[1] < W;
const cellOf = (at) => at[0] * W + at[1];

// 역 건물: 칸마다 그 칸을 포함하는 방 목록 (목록 순서)
const rooms = lvl.rooms || [];
const roomClose = rooms.map((rm) => (typeof rm.close === 'number' ? rm.close : 9999));
const roomEvict = rooms.map((rm) => (inGrid(rm.evict) ? cellOf(rm.evict) : -1));
const roomsOf = new Array(N).fill(null);
rooms.forEach((rm, idx) => {
  if (roomEvict[idx] < 0) return;
  const [r1, c1, r2, c2] = rm.rect;
  for (let r = Math.max(0, r1); r <= Math.min(H - 1, r2); r++) {
    for (let c = Math.max(0, c1); c <= Math.min(W - 1, c2); c++) {
      const i = r * W + c;
      if (zone[i] !== 1) continue;
      (roomsOf[i] || (roomsOf[i] = [])).push(idx);
    }
  }
});
function evictAt(c, t) {
  const rl = roomsOf[c];
  if (rl === null) return -1;
  for (let k = 0; k < rl.length; k++) if (t >= roomClose[rl[k]]) return roomEvict[rl[k]];
  return -1;
}

// 거리 단위: 소수 km 대비 정수 배율
let decimals = 0;
for (const ln of lvl.lines || []) for (const k of ln.km || []) {
  const s = String(k);
  const p = s.indexOf('.');
  if (p >= 0 && s.indexOf('e') < 0) decimals = Math.max(decimals, s.length - p - 1);
}
decimals = Math.min(decimals, 6);
const SC = Math.pow(10, decimals);
const ceilDiv = (a, b) => Math.floor((a + b - 1) / b);
function fare(K) {
  if (K <= 10 * SC) return 1450;
  if (K <= 50 * SC) return 1450 + ceilDiv(K - 10 * SC, 5 * SC) * 100;
  return 2250 + ceilDiv(K - 50 * SC, 8 * SC) * 100;
}
// 비용 단위: (요금/50) * BW + 승차 횟수
const BW = 512;
const fareC = (K) => (fare(K) / 50) * BW;

// 열차: (틱, 칸) -> 탈 수 있는 구간들
const TOKS = MOVE_TOK.slice();
const tokIdx = new Map();
const rideMap = new Map();
for (const ln0 of lvl.lines || []) {
  let ln = ln0;
  let st = ln.stations;
  // km/travel 이 역 수만큼 있으면 마지막 역 -> 첫 역 구간이 있는 순환선으로 본다
  if (st.length >= 2 && ln.km.length === st.length && ln.travel.length === st.length) {
    st = st.concat([st[0]]);
    ln = { ...ln, stations: st };
  }
  const n = st.length;
  if (n < 2) continue;
  const cumT = [0], cumK = [0];
  for (let i = 0; i + 1 < n; i++) {
    cumT.push(cumT[i] + ln.travel[i]);
    cumK.push(cumK[i] + Math.round(ln.km[i] * SC));
  }
  const at = st.map((s) => (inGrid(s.at) ? cellOf(s.at) : -1));
  const deps = [];
  if (ln.headway > 0) for (let d = ln.first; d <= ln.last && d <= maxTick; d += ln.headway) deps.push(d);
  else if (ln.first <= ln.last) deps.push(ln.first);
  const seen = new Set();
  for (let i = 0; i + 1 < n; i++) {
    if (at[i] < 0) continue;
    const dests = [];
    const names = new Set();
    for (let j = i + 1; j < n; j++) {
      if (names.has(st[j].name)) continue;
      names.add(st[j].name);
      dests.push(j);
    }
    for (const d of deps) {
      const t = d + cumT[i];
      if (t > maxTick) break;
      const key = t * N + at[i];
      if (seen.has(key)) continue; // 같은 칸·틱에 같은 노선이 둘 서면 앞 역 기준
      seen.add(key);
      for (const j of dests) {
        const t2 = d + cumT[j];
        if (t2 > maxTick || t2 <= t || at[j] < 0) continue;
        let arr = rideMap.get(key);
        if (!arr) rideMap.set(key, (arr = []));
        const ts = '[' + ln.id + '>' + st[j].name + ']';
        let ti = tokIdx.get(ts);
        if (ti === undefined) { ti = TOKS.length; TOKS.push(ts); tokIdx.set(ts, ti); }
        arr.push({ tok: ti, c2: at[j], t2, km: cumK[j] - cumK[i] });
      }
    }
  }
}

// 행동 열거: 결과를 a* 버퍼에 채우고 개수를 돌려준다.
//   aTok 토큰 번호(TOKS), aStep 행동 직후 칸, aFin 강제 퇴장까지 반영한 칸, aT2 틱, aEv 강제 퇴장 여부, aKm 탄 거리(-1 걷기)
let MAXA = 64;
for (const arr of rideMap.values()) MAXA = Math.max(MAXA, arr.length + 8);
const aTok = new Int32Array(MAXA), aStep = new Int32Array(MAXA), aFin = new Int32Array(MAXA);
const aT2 = new Int32Array(MAXA), aEv = new Uint8Array(MAXA), aKm = new Float64Array(MAXA);
function actions(c, t) {
  let n = 0;
  const r = (c / W) | 0, col = c - r * W;
  const z1 = zone[c], e1 = esc[c];
  const t2 = t + 1;
  if (t2 <= maxTick) {
    for (let d = 0; d < 5; d++) {
      let c2;
      if (d === 4) {
        if (e1 >= 0) continue;
        c2 = c;
      } else {
        if (e1 >= 0 && e1 !== d) continue;
        const r2 = r + DR[d], cc2 = col + DC[d];
        if (r2 < 0 || r2 >= H || cc2 < 0 || cc2 >= W) continue;
        c2 = r2 * W + cc2;
        const z2 = zone[c2];
        if (z2 < 0) continue;
        if (esc[c2] >= 0 && esc[c2] !== d) continue;
        if ((z1 === 0 && z2 === 1) || (z1 === 1 && z2 === 0)) continue;
      }
      let fin = c2, ev = 0;
      if (zone[c2] === 1) {
        const e = evictAt(c2, t2);
        if (e >= 0) { fin = e; ev = 1; }
      }
      aTok[n] = d; aStep[n] = c2; aFin[n] = fin; aT2[n] = t2; aEv[n] = ev; aKm[n] = -1; n++;
    }
  }
  if (z1 === 1) {
    const rides = rideMap.get(t * N + c);
    if (rides) for (const rd of rides) {
      let fin = rd.c2, ev = 0;
      const e = evictAt(rd.c2, rd.t2);
      if (e >= 0) { fin = e; ev = 1; }
      aTok[n] = rd.tok; aStep[n] = rd.c2; aFin[n] = fin; aT2[n] = rd.t2; aEv[n] = ev; aKm[n] = rd.km; n++;
    }
  }
  return n;
}

const T0 = Date.now();
function main() {
  if (S < 0) return '불가';
  // ---- 1) 도달 가능성, 최소 도착 틱 T
  const reach = [], lists = [];
  for (let t = 0; t <= maxTick; t++) { reach.push(new Uint8Array(N)); lists.push([]); }
  reach[0][S] = 1; lists[0].push(S);
  let T = -1;
  for (let t = 0; t <= maxTick; t++) {
    for (const c of lists[t]) if (isE[c]) { T = t; break; }
    if (T >= 0) break;
    for (const c of lists[t]) {
      const na = actions(c, t);
      for (let i = 0; i < na; i++) {
        const fin = aFin[i], t2 = aT2[i];
        if (!reach[t2][fin]) { reach[t2][fin] = 1; lists[t2].push(fin); }
      }
    }
  }
  dbg('T', T, 'time', Date.now() - T0);
  if (T < 0) return '불가';

  // ---- 2) good / 남은 승차 수 하한 mb / 남은 거리 하한 mk
  const INF = 1 << 30;
  const good = [], mb = [], mk = [];
  for (let t = 0; t <= T; t++) { good.push(new Uint8Array(N)); mb.push(null); mk.push(null); }
  mb[T] = new Int32Array(N); mk[T] = new Int32Array(N);
  for (const c of lists[T]) if (isE[c]) good[T][c] = 1;
  for (let t = T - 1; t >= 0; t--) {
    const g = good[t];
    const B = (mb[t] = new Int32Array(N)), Kk = (mk[t] = new Int32Array(N));
    for (const c of lists[t]) {
      if (isE[c]) continue;
      let bb = INF, kk = INF;
      const na = actions(c, t);
      for (let i = 0; i < na; i++) {
        const fin = aFin[i], t2 = aT2[i], km = aKm[i];
        if (t2 > T || !good[t2][fin]) continue;
        const b2 = mb[t2][fin] + (km >= 0 ? 1 : 0);
        const k2 = mk[t2][fin] + (km >= 0 ? km : 0);
        if (b2 < bb) bb = b2;
        if (k2 < kk) kk = k2;
      }
      if (bb < INF) { g[c] = 1; B[c] = bb; Kk[c] = kk; }
    }
  }
  for (let t = 0; t <= maxTick; t++) { reach[t] = null; lists[t] = null; }
  if (!good[0][S]) return '불가';

  // 개찰구를 거쳐 안 칸까지 걷는 최소 칸 수 (재입장 가능성 하한용)
  const distIn = new Int32Array(N).fill(INF);
  {
    const q = new Int32Array(N);
    let qh = 0, qt = 0;
    for (let c = 0; c < N; c++) if (zone[c] === 1) { distIn[c] = 0; q[qt++] = c; }
    while (qh < qt) {
      const c = q[qh++];
      const r = (c / W) | 0, col = c - r * W;
      for (let d = 0; d < 4; d++) {
        const r2 = r + DR[d], cc2 = col + DC[d];
        if (r2 < 0 || r2 >= H || cc2 < 0 || cc2 >= W) continue;
        const c2 = r2 * W + cc2;
        const z2 = zone[c2];
        if (z2 !== 0 && z2 !== 2) continue;
        if (zone[c] === 1 && z2 === 0) continue;
        if (distIn[c2] !== INF) continue;
        distIn[c2] = distIn[c] + 1;
        q[qt++] = c2;
      }
    }
  }

  // 상태: (cell, lz, K, w)
  //   lz: 개찰구 위일 때 직전 구역이 안이면 1
  //   w : 밖에서 재입장으로 통행을 이어갈 수 있는 남은 틱 (0 이면 이어갈 통행 없음, K=0)
  //   K : 진행 중(또는 이어갈 수 있는) 통행의 누적 거리
  // 비용은 통행이 끝날 때(창 만료 / 도착) 요금을 더하고, 승차마다 1 을 더한다.
  // 결과는 e* 버퍼: eTok, eFin, eLz, eK, eW, eT2, eCost, eTerm(도착)
  const eTok = new Int32Array(MAXA), eFin = new Int32Array(MAXA), eLz = new Uint8Array(MAXA);
  const eK = new Float64Array(MAXA), eW = new Int32Array(MAXA), eT2 = new Int32Array(MAXA);
  const eCost = new Float64Array(MAXA), eTerm = new Uint8Array(MAXA);
  function expand(cell, lz, K, w, t) {
    const z = zone[cell];
    const effZ = z === 2 ? lz : z;
    const na = actions(cell, t);
    let n = 0;
    for (let i = 0; i < na; i++) {
      const fin = aFin[i], t2 = aT2[i], km = aKm[i], step = aStep[i];
      if (t2 > T || !good[t2][fin]) continue;
      let K2 = K, w2 = w, cost = 0, eff2;
      if (km >= 0) {
        cost = 1; K2 = K + km; eff2 = 1; w2 = 0;
      } else {
        const z2 = zone[step];
        eff2 = z2 === 2 ? effZ : z2;
        if (effZ === 0 && eff2 === 1) { // 입장
          if (w <= 0) K2 = 0;
          w2 = 0;
        } else if (effZ === 1 && eff2 === 0) { // 퇴장
          w2 = 30;
        } else if (effZ === 0 && eff2 === 0) {
          if (w > 0) {
            w2 = w - 1;
            if (w2 === 0) { cost += fareC(K); K2 = 0; }
          }
        }
      }
      if (aEv[i]) { eff2 = 0; w2 = 30; } // 강제 퇴장
      eTok[n] = aTok[i]; eFin[n] = fin; eT2[n] = t2;
      if (isE[fin]) {
        if (w2 > 0) cost += fareC(K2);
        eLz[n] = 0; eK[n] = 0; eW[n] = 0; eCost[n] = cost; eTerm[n] = 1; n++;
        continue;
      }
      if (eff2 === 1) w2 = 0;
      else if (w2 === 0) K2 = 0;
      eLz[n] = zone[fin] === 2 ? eff2 : 0; eK[n] = K2; eW[n] = w2; eCost[n] = cost; eTerm[n] = 0; n++;
    }
    return n;
  }
  // 남은 비용 하한
  function LB(cell, t, lz, K, w) {
    const z = zone[cell];
    const eff = z === 2 ? lz : z;
    const b = mb[t][cell], k = mk[t][cell];
    let f;
    if (eff === 1) f = fareC(K + k);
    else if (w === 0) f = b > 0 ? fareC(k) : 0;
    else if (distIn[cell] <= w) f = fareC(K + k);
    else f = fareC(K) + (b > 0 ? fareC(k) : 0);
    return f + b;
  }

  // ---- 3) 최소 비용 OPT: 지배 관계 라벨 탐색
  // 라벨 [g, K, w]. 밖 상태(eff=0)에서 w=0 은 통행 없음.
  let OPT = INF;
  {
    const lab = new Array(T + 1).fill(null);
    const dominates = (gA, KA, wA, gB, KB, wB, outside) => {
      if (!outside) return gA <= gB && KA <= KB;
      if (gA <= gB && (wA === 0 || (wB > 0 && KA <= KB && wA >= wB))) return true;
      if (wA > 0 && wB === 0 && gA + fareC(KA) <= gB) return true;
      return false;
    };
    const insert = (t, cell, lz, g, K, w) => {
      let m = lab[t];
      if (m === null) m = lab[t] = new Map();
      const key = cell * 2 + lz;
      let arr = m.get(key);
      if (arr === undefined) { m.set(key, [g, K, w]); return; }
      const z = zone[cell];
      const outside = (z === 2 ? lz : z) === 0;
      for (let i = 0; i < arr.length; i += 3) {
        if (dominates(arr[i], arr[i + 1], arr[i + 2], g, K, w, outside)) return;
      }
      let j = 0;
      for (let i = 0; i < arr.length; i += 3) {
        if (dominates(g, K, w, arr[i], arr[i + 1], arr[i + 2], outside)) continue;
        arr[j] = arr[i]; arr[j + 1] = arr[i + 1]; arr[j + 2] = arr[i + 2]; j += 3;
      }
      arr.length = j;
      arr.push(g, K, w);
    };
    insert(0, S, 0, 0, 0, 0);
    let nl = 0;
    for (let t = 0; t < T; t++) {
      const m = lab[t];
      if (m === null) continue;
      for (const [key, arr] of m) {
        const cell = key >> 1, lz = key & 1;
        for (let i = 0; i < arr.length; i += 3) {
          const g = arr[i];
          nl++;
          const ne = expand(cell, lz, arr[i + 1], arr[i + 2], t);
          for (let e = 0; e < ne; e++) {
            const g2 = g + eCost[e];
            if (eTerm[e]) { if (g2 < OPT) OPT = g2; continue; }
            insert(eT2[e], eFin[e], eLz[e], g2, eK[e], eW[e]);
          }
        }
      }
      lab[t] = null;
    }
    dbg('labels', nl, 'OPT', OPT, 'time', Date.now() - T0);
  }
  if (OPT >= INF) return '불가';

  // ---- 4) f + LB <= OPT 인 상태만 펼친다
  // 칸마다 슬롯: 안 1개(통행 중), 밖 31개(w=0..30), 개찰구 32개(lz=0 의 w=0..30, lz=1)
  const slotN = new Int8Array(N);
  for (let c = 0; c < N; c++) slotN[c] = zone[c] === 1 ? 1 : zone[c] === 0 ? 31 : zone[c] === 2 ? 32 : 0;
  const slotOf = (cell, lz, w) => {
    const z = zone[cell];
    if (z === 1) return 0;
    if (z === 2 && lz === 1) return 31;
    return w;
  };
  let pool = new Int32Array(1 << 20);
  let poolLen = 0;
  // layers[t]: Map K -> { idx: Int32Array(N) (-1 없음), cells: number[] }
  const layers = [];
  for (let t = 0; t <= T; t++) layers.push(new Map());
  const getLayer = (t, K, create) => {
    let L = layers[t].get(K);
    if (L === undefined && create) {
      L = { K, idx: new Int32Array(N).fill(-1), cells: [] };
      layers[t].set(K, L);
    }
    return L;
  };
  const slotAddr = (t, K, cell, slot, create) => {
    const L = getLayer(t, K, create);
    if (L === undefined) return -1;
    let base = L.idx[cell];
    if (base < 0) {
      if (!create) return -1;
      const n = slotN[cell];
      if (poolLen + n > pool.length) {
        const np = new Int32Array(pool.length * 2);
        np.set(pool);
        pool = np;
      }
      base = poolLen;
      pool.fill(INF, base, base + n);
      poolLen += n;
      L.idx[cell] = base;
      L.cells.push(cell);
    }
    return base + slot;
  };
  pool[slotAddr(0, 0, S, 0, true)] = 0;
  let nstates = 0;
  for (let t = 0; t < T; t++) {
    for (const L of layers[t].values()) {
      const K = L.K;
      for (const cell of L.cells) {
        const base = L.idx[cell], n = slotN[cell], z = zone[cell];
        for (let s = 0; s < n; s++) {
          const f = pool[base + s];
          if (f >= INF) continue;
          nstates++;
          const lz = z === 2 && s === 31 ? 1 : 0, w = z === 1 || s === 31 ? 0 : s;
          const ne = expand(cell, lz, K, w, t);
          for (let e = 0; e < ne; e++) {
            if (eTerm[e]) continue;
            const f2 = f + eCost[e];
            const fin = eFin[e], t2 = eT2[e], lz2 = eLz[e], K2 = eK[e], w2 = eW[e];
            if (f2 + LB(fin, t2, lz2, K2, w2) > OPT) continue;
            const a = slotAddr(t2, K2, fin, slotOf(fin, lz2, w2), true);
            if (f2 < pool[a]) pool[a] = f2;
          }
        }
      }
    }
  }
  dbg('states', nstates, 'pool', poolLen, 'time', Date.now() - T0);

  // 뒤에서부터 남은 최소 비용 h (f < INF 인 상태만)
  const hval = new Int32Array(poolLen).fill(INF);
  const succVal = (e) => {
    if (eTerm[e]) return eCost[e];
    const fin = eFin[e];
    const a = slotAddr(eT2[e], eK[e], fin, slotOf(fin, eLz[e], eW[e]), false);
    if (a < 0 || hval[a] >= INF) return INF;
    return eCost[e] + hval[a];
  };
  for (let t = T - 1; t >= 0; t--) {
    for (const L of layers[t].values()) {
      const K = L.K;
      for (const cell of L.cells) {
        const base = L.idx[cell], n = slotN[cell], z = zone[cell];
        for (let s = 0; s < n; s++) {
          if (pool[base + s] >= INF) continue;
          const lz = z === 2 && s === 31 ? 1 : 0, w = z === 1 || s === 31 ? 0 : s;
          let best = INF;
          const ne = expand(cell, lz, K, w, t);
          for (let e = 0; e < ne; e++) {
            const v = succVal(e);
            if (v < best) best = v;
          }
          hval[base + s] = best;
        }
      }
    }
  }
  dbg('backward time', Date.now() - T0);

  // ---- 5) 사전순 복원
  let cell = S, lz = 0, K = 0, w = 0, t = 0, out = '';
  let target = hval[slotAddr(0, 0, S, 0, false)];
  if (target !== OPT) dbg('WARN target', target, 'OPT', OPT);
  for (;;) {
    let bt = null, be = -1;
    const ne = expand(cell, lz, K, w, t);
    for (let e = 0; e < ne; e++) {
      if (succVal(e) !== target) continue;
      const tok = TOKS[eTok[e]];
      if (bt === null || tok < bt) { bt = tok; be = e; }
    }
    if (bt === null) return '불가';
    out += bt;
    if (eTerm[be]) break;
    target -= eCost[be];
    cell = eFin[be]; lz = eLz[be]; K = eK[be]; w = eW[be]; t = eT2[be];
  }
  return out;
}

process.stdout.write(main() + '\n');
