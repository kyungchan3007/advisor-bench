'use strict';
// 막차 러너 풀이기
// 1) (틱, 칸, 개찰구 진입방향) 시간확장 그래프에서 가장 빠른 도착 틱 T* 를 BFS 로 구한다.
// 2) 역방향으로 "T* 에 도착할 수 있는" 노드만 남긴다.
// 3) 남은 노드 위에서 요금 상태(통행 누적거리 D, 마지막 퇴장 틱, 확정요금 F, 승차수, 문자열)를
//    틱 순서로 DP 하며, 동일 키/지배 관계인 상태를 가지치기한다.

const fs = require('fs');
const lvl = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const H = lvl.grid.length;
const W = lvl.grid[0].length;
const N = H * W;
const maxTick = lvl.maxTick;

const OUT = 0, IN = 1, GATE = 2, WALL = 3;
const DR = [1, 0, 0, -1];
const DC = [0, -1, 1, 0];
const CH = ['D', 'L', 'R', 'U'];

const zone = new Uint8Array(N);
const esc = new Int8Array(N).fill(-1);
let S = -1, E = -1;
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = lvl.grid[r][c];
    const i = r * W + c;
    switch (ch) {
      case '.': case 'P': zone[i] = IN; break;
      case '>': zone[i] = IN; esc[i] = 2; break;
      case '<': zone[i] = IN; esc[i] = 1; break;
      case '^': zone[i] = IN; esc[i] = 3; break;
      case 'v': zone[i] = IN; esc[i] = 0; break;
      case ',': zone[i] = OUT; break;
      case 'S': zone[i] = OUT; S = i; break;
      case 'E': zone[i] = OUT; E = i; break;
      case 'G': zone[i] = GATE; break;
      default: zone[i] = WALL;
    }
  }
}

// 역 건물
const rooms = (lvl.rooms || []).map((rm) => ({
  close: rm.close,
  ev: rm.evict[0] * W + rm.evict[1],
}));
const roomOf = new Int16Array(N).fill(-1);
(lvl.rooms || []).forEach((rm, idx) => {
  const [r0, c0, r1, c1] = rm.rect;
  for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const i = r * W + c;
      if (zone[i] === IN && roomOf[i] < 0) roomOf[i] = idx;
    }
  }
});

// 노선: 칸별 승차 후보
const rideAt = new Array(N).fill(null);
for (const line of lvl.lines || []) {
  const n = line.stations.length;
  const tcum = [0], kcum = [0];
  for (let i = 0; i < n - 1; i++) {
    tcum.push(tcum[i] + line.travel[i]);
    kcum.push(kcum[i] + line.km[i]);
  }
  for (let i = 0; i < n - 1; i++) {
    const seen = new Set();
    const targets = [];
    for (let j = i + 1; j < n; j++) {
      const nm = line.stations[j].name;
      if (seen.has(nm)) continue;
      seen.add(nm);
      targets.push({
        cell: line.stations[j].at[0] * W + line.stations[j].at[1],
        dt: tcum[j] - tcum[i],
        km: kcum[j] - kcum[i],
        str: '[' + line.id + '>' + nm + ']',
        entry: false,
        exit: false,
      });
    }
    const cell = line.stations[i].at[0] * W + line.stations[i].at[1];
    (rideAt[cell] || (rideAt[cell] = [])).push({
      first: line.first, last: line.last, headway: line.headway, off: tcum[i], targets,
    });
  }
}

// 걷기 / 대기 전이 (노드 = 칸*2 + 개찰구 진입방향(0 밖에서, 1 안에서))
const walkTr = new Array(2 * N).fill(null);
for (let cell = 0; cell < N; cell++) {
  const z = zone[cell];
  if (z === WALL || cell === E) continue;
  const r = (cell / W) | 0, c = cell % W;
  for (let mode = 0; mode < (z === GATE ? 2 : 1); mode++) {
    const list = [];
    for (let k = 0; k < 4; k++) {
      const nr = r + DR[k], nc = c + DC[k];
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      const n = nr * W + nc;
      const zn = zone[n];
      if (zn === WALL) continue;
      if (z === OUT && zn === IN) continue;
      if (z === IN && zn === OUT) continue;
      if (esc[cell] >= 0 && esc[cell] !== k) continue;
      if (esc[n] >= 0 && esc[n] !== k) continue;
      let dm = 0;
      if (zn === GATE) dm = z === GATE ? mode : (z === IN ? 1 : 0);
      list.push({
        n, mode: dm, str: CH[k], km: -1,
        entry: z === GATE && mode === 0 && zn === IN,
        exit: z === GATE && mode === 1 && zn === OUT,
      });
    }
    if (esc[cell] < 0) {
      list.push({ n: cell, mode, str: 'W', km: -1, entry: false, exit: false });
    }
    walkTr[cell * 2 + mode] = list;
  }
}

function emit(t2, n, dm, desc, cb) {
  let fc = n, fm = dm, ev = false;
  const rm = roomOf[n];
  if (rm >= 0 && t2 >= rooms[rm].close) {
    fc = rooms[rm].ev;
    fm = 0;
    ev = true;
  }
  return cb(t2, fc, fm, desc, ev);
}

// cb 가 true 를 돌려주면 즉시 중단하고 true 반환
function forEachSucc(t, node, cb) {
  const cell = node >> 1;
  if (cell === E) return false;
  const t2 = t + 1;
  if (t2 <= maxTick) {
    const ws = walkTr[node];
    if (ws) {
      for (let i = 0; i < ws.length; i++) {
        const w = ws[i];
        if (emit(t2, w.n, w.mode, w, cb)) return true;
      }
    }
  }
  const rl = rideAt[cell];
  if (rl && (node & 1) === 0) {
    for (let a = 0; a < rl.length; a++) {
      const ln = rl[a];
      const d = t - ln.off;
      if (d < ln.first || d > ln.last || (d - ln.first) % ln.headway !== 0) continue;
      for (let b = 0; b < ln.targets.length; b++) {
        const tg = ln.targets[b];
        const tt = t + tg.dt;
        if (tt > maxTick || tt <= t) continue;
        if (emit(tt, tg.cell, 0, tg, cb)) return true;
      }
    }
  }
  return false;
}

function fare(D) {
  if (D <= 10) return 1450;
  if (D <= 50) return 1450 + 100 * Math.ceil((D - 10) / 5);
  return 2250 + 100 * Math.ceil((D - 50) / 8);
}

function main() {
  const NODES = 2 * N;
  // ---- 1. 최단 도착 틱
  const reach = new Array(maxTick + 1).fill(null);
  reach[0] = new Uint8Array(NODES);
  reach[0][S * 2] = 1;
  let best = Infinity;
  for (let t = 0; t <= maxTick && t < best; t++) {
    const r = reach[t];
    if (!r) continue;
    for (let node = 0; node < NODES; node++) {
      if (!r[node]) continue;
      forEachSucc(t, node, (t2, fc, fm) => {
        if (t2 > maxTick || t2 >= best) return false;
        if (fc === E) { best = t2; return false; }
        (reach[t2] || (reach[t2] = new Uint8Array(NODES)))[fc * 2 + fm] = 1;
        return false;
      });
    }
  }
  if (best === Infinity) return '불가';

  // ---- 2. 역방향 가지치기
  const good = new Array(best + 1).fill(null);
  for (let t = best - 1; t >= 0; t--) {
    const r = reach[t];
    if (!r) continue;
    const g = new Uint8Array(NODES);
    let any = false;
    for (let node = 0; node < NODES; node++) {
      if (!r[node]) continue;
      const ok = forEachSucc(t, node, (t2, fc, fm) => {
        if (t2 > best) return false;
        if (fc === E) return t2 === best;
        const gg = good[t2];
        return !!(gg && gg[fc * 2 + fm]);
      });
      if (ok) { g[node] = 1; any = true; }
    }
    if (any) good[t] = g;
  }
  if (!good[0] || !good[0][S * 2]) return '불가';

  // ---- 3. 요금 DP
  function lexLess(a, b) {
    if (a.F !== b.F) return a.F < b.F;
    if (a.r !== b.r) return a.r < b.r;
    return a.s < b.s;
  }
  // a 가 b 를 지배(b 는 버려도 됨)하는가
  function dominates(a, b) {
    if (a.D === b.D) return lexLess(a, b);
    return a.D <= b.D && a.F <= b.F && a.r <= b.r && a.s < b.s;
  }
  function addState(L, node, ns) {
    let arr = L[node];
    if (!arr) { L[node] = [ns]; return; }
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.ex === ns.ex && dominates(e, ns)) return;
    }
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const e = arr[i];
      if (e.ex === ns.ex && dominates(ns, e)) continue;
      arr[w++] = e;
    }
    arr.length = w;
    arr.push(ns);
  }

  const layers = new Array(best + 1).fill(null);
  layers[0] = new Array(NODES).fill(null);
  layers[0][S * 2] = [{ F: 0, D: 0, ex: -1, r: 0, s: '', act: false }];
  let bestFinal = null, bestTotal = 0;

  for (let t = 0; t < best; t++) {
    const L = layers[t];
    if (!L) continue;
    layers[t] = null;
    for (let node = 0; node < NODES; node++) {
      const arr = L[node];
      if (!arr) continue;
      const succs = [];
      forEachSucc(t, node, (t2, fc, fm, desc, ev) => {
        if (t2 > best) return false;
        if (fc === E) {
          if (t2 === best) succs.push([t2, fc, fm, desc, ev]);
        } else {
          const gg = good[t2];
          if (gg && gg[fc * 2 + fm]) succs.push([t2, fc, fm, desc, ev]);
        }
        return false;
      });
      if (!succs.length) continue;
      for (let si = 0; si < succs.length; si++) {
        const [t2, fc, fm, desc, ev] = succs[si];
        for (let k = 0; k < arr.length; k++) {
          const st = arr[k];
          let F = st.F, D = st.D, ex = st.ex, act = st.act, r = st.r;
          if (desc.km >= 0) { D += desc.km; r++; }
          if (desc.entry) {
            if (act && ex >= 0 && t2 - ex <= 30) {
              ex = -1;
            } else {
              if (act) F += fare(D);
              act = true; D = 0; ex = -1;
            }
          }
          if (desc.exit || ev) { ex = t2; act = true; }
          if (act && ex >= 0 && t2 - ex > 30) {
            F += fare(D); act = false; D = 0; ex = -1;
          }
          const ns = { F, D, ex, r, s: st.s + desc.str, act };
          if (fc === E) {
            const total = F + (act ? fare(D) : 0);
            if (
              !bestFinal || total < bestTotal ||
              (total === bestTotal && (r < bestFinal.r || (r === bestFinal.r && ns.s < bestFinal.s)))
            ) {
              bestFinal = ns; bestTotal = total;
            }
          } else {
            const L2 = layers[t2] || (layers[t2] = new Array(NODES).fill(null));
            addState(L2, fc * 2 + fm, ns);
          }
        }
      }
    }
  }
  return bestFinal ? bestFinal.s : '불가';
}

console.log(main());
