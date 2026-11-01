'use strict';
// 막차 러너 풀이기 — node solver.js <level.json>
// 1) (칸, 틱) 그래프에서 최단 도착 틱 T* 계산 (요금은 이동 가능 여부에 영향이 없다)
// 2) T*에 도착하는 데 쓰일 수 있는 (칸, 틱)만 남기고(역방향 도달성)
// 3) 그 위에서 요금 상태까지 포함해 (요금, 승차 수, 문자열) 최소를 틱 순으로 DP

const fs = require('fs');
const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));

const grid = level.grid;
const H = grid.length;
const W = grid[0].length;
const N = H * W;
const maxTick = level.maxTick;

const OUT = 0, IN = 1, GATE = 2, WALL = 3;
const zoneOf = (ch) => {
  switch (ch) {
    case '.': case 'P': case '>': case '<': case '^': case 'v': return IN;
    case ',': case 'S': case 'E': return OUT;
    case 'G': return GATE;
    default: return WALL;
  }
};
const ARROW = { '>': 'R', '<': 'L', '^': 'U', 'v': 'D' };

const chOf = new Array(N);
const zone = new Uint8Array(N);
let S = -1, E = -1;
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const i = r * W + c;
    chOf[i] = ch;
    zone[i] = zoneOf(ch);
    if (ch === 'S') S = i;
    if (ch === 'E') E = i;
  }
}

// 역 건물
const rooms = level.rooms || [];
const roomOf = new Int16Array(N).fill(-1);
for (let k = 0; k < rooms.length; k++) {
  const [r0, c0, r1, c1] = rooms[k].rect;
  for (let r = Math.max(0, r0); r <= Math.min(H - 1, r1); r++) {
    for (let c = Math.max(0, c0); c <= Math.min(W - 1, c1); c++) {
      const i = r * W + c;
      if (zone[i] === IN && roomOf[i] < 0) roomOf[i] = k;
    }
  }
}
const closeT = rooms.map((x) => x.close);
const evictCell = rooms.map((x) => x.evict[0] * W + x.evict[1]);

// 열차: (틱, 칸) -> [{opts}]
const boardMap = new Map();
for (const line of level.lines || []) {
  const st = line.stations;
  const n = st.length;
  const cumT = [0], cumK = [0];
  for (let i = 0; i < n - 1; i++) {
    cumT.push(cumT[i] + line.travel[i]);
    cumK.push(cumK[i] + line.km[i]);
  }
  const cells = st.map((s) => s.at[0] * W + s.at[1]);
  // 역 i에서 탈 때 내릴 수 있는 곳 (같은 이름은 가장 가까운 뒤 역)
  const alight = [];
  for (let i = 0; i < n; i++) {
    const seen = new Set();
    const list = [];
    for (let j = i + 1; j < n; j++) {
      if (seen.has(st[j].name)) continue;
      seen.add(st[j].name);
      list.push({
        dt: cumT[j] - cumT[i],
        km: cumK[j] - cumK[i],
        cell: cells[j],
        str: '[' + line.id + '>' + st[j].name + ']',
      });
    }
    alight.push(list);
  }
  for (let d = line.first; d <= line.last; d += line.headway) {
    for (let i = 0; i < n - 1; i++) {
      const t = d + cumT[i];
      if (t > maxTick) break;
      if (alight[i].length === 0) continue;
      const key = t * N + cells[i];
      let arr = boardMap.get(key);
      if (!arr) boardMap.set(key, (arr = []));
      for (const o of alight[i]) arr.push(o);
    }
    if (line.headway <= 0) break;
  }
}

const DIRS = [['D', 1, 0], ['L', 0, -1], ['R', 0, 1], ['U', -1, 0]];

// cb(dest, t2, str, km, ride, enter, evict)
function emit(cb, dest, t2, str, km, ride, enter) {
  let evict = false;
  if (zone[dest] === IN) {
    const k = roomOf[dest];
    if (k >= 0 && t2 >= closeT[k]) {
      dest = evictCell[k];
      evict = true;
    }
  }
  cb(dest, t2, str, km, ride, enter, evict);
}

function expand(cell, t, cb) {
  if (cell === E) return;
  const r = (cell / W) | 0, c = cell - r * W;
  const ch = chOf[cell];
  const zc = zone[cell];
  const t2 = t + 1;
  if (t2 <= maxTick) {
    const esc = ARROW[ch];
    for (let k = 0; k < 4; k++) {
      const [dc, dr, dcol] = DIRS[k];
      const nr = r + dr, nc = c + dcol;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const ncell = nr * W + nc;
      const nz = zone[ncell];
      if (nz === WALL) continue;
      if (esc !== undefined && esc !== dc) continue;
      const nesc = ARROW[chOf[ncell]];
      if (nesc !== undefined && nesc !== dc) continue;
      if ((zc === IN && nz === OUT) || (zc === OUT && nz === IN)) continue;
      emit(cb, ncell, t2, dc, 0, false, nz === IN && zc !== IN);
    }
    if (esc === undefined) emit(cb, cell, t2, 'W', 0, false, false);
  }
  const list = boardMap.get(t * N + cell);
  if (list !== undefined) {
    for (let k = 0; k < list.length; k++) {
      const o = list[k];
      const tt = t + o.dt;
      if (tt > maxTick) continue;
      emit(cb, o.cell, tt, o.str, o.km, true, false);
    }
  }
}

function fare(d) {
  if (d <= 10) return 1450;
  if (d <= 50) return 1450 + 100 * Math.ceil((d - 10) / 5);
  return 1450 + 800 + 100 * Math.ceil((d - 50) / 8);
}

function main() {
  if (S < 0 || E < 0) return '불가';
  const size = (maxTick + 1) * N;

  // 1) 순방향 도달성 + 최단 도착 틱
  const reach = new Uint8Array(size);
  reach[S] = 1;
  let T = -1;
  for (let t = 0; t <= maxTick; t++) {
    if (reach[t * N + E]) { T = t; break; }
    const base = t * N;
    for (let cell = 0; cell < N; cell++) {
      if (!reach[base + cell]) continue;
      expand(cell, t, (dest, t2) => { reach[t2 * N + dest] = 1; });
    }
  }
  if (T < 0) return '불가';

  // 2) 역방향: T*에 E로 도착할 수 있는 노드
  const good = new Uint8Array((T + 1) * N);
  good[T * N + E] = 1;
  for (let t = T - 1; t >= 0; t--) {
    const base = t * N;
    for (let cell = 0; cell < N; cell++) {
      if (!reach[base + cell]) continue;
      let ok = false;
      expand(cell, t, (dest, t2) => {
        if (!ok && t2 <= T && good[t2 * N + dest]) ok = true;
      });
      if (ok) good[base + cell] = 1;
    }
  }
  if (!good[S]) return '불가';

  // 3) 요금 상태 DP
  // es: 0 = 통행 없음, 1 = 통행 중(안/개찰구에서 아직 퇴장 안 함), >=2 : 퇴장 틱 = es-2 (30틱 이내)
  const KE = 1024, KD = 65536;
  const maps = new Array(T + 1).fill(null);
  const startEntry = { cell: S, es: 0, d: 0, F: 0, r: 0, str: '' };
  maps[0] = new Map([[(S * KE + 0) * KD, startEntry]]);

  const better = (a, b) => {
    if (a.F !== b.F) return a.F < b.F;
    if (a.r !== b.r) return a.r < b.r;
    return a.str < b.str;
  };

  for (let t = 0; t < T; t++) {
    const cur = maps[t];
    maps[t] = null;
    if (!cur) continue;

    // 퇴장 직후 상태끼리 지배 관계 정리: (칸, d)가 같고 퇴장 틱이 같거나 늦으며 모든 면에서 안 나쁜 것이 있으면 제거
    const groups = new Map();
    const entries = [];
    for (const en of cur.values()) {
      if (en.es >= 2) {
        const gk = en.cell * KD + en.d;
        let g = groups.get(gk);
        if (!g) groups.set(gk, (g = []));
        g.push(en);
      } else entries.push(en);
    }
    for (const g of groups.values()) {
      if (g.length > 1) {
        g.sort((a, b) => b.es - a.es);
        const kept = [];
        for (const b of g) {
          let dominated = false;
          for (const a of kept) {
            if (a.F <= b.F && a.r <= b.r && (a.F < b.F || a.r < b.r || a.str < b.str)) {
              dominated = true;
              break;
            }
          }
          if (!dominated) kept.push(b);
        }
        for (const x of kept) entries.push(x);
      } else entries.push(g[0]);
    }

    for (const en of entries) {
      expand(en.cell, t, (dest, t2, str, km, ride, enter, evict) => {
        if (t2 > T || !good[t2 * N + dest]) return;
        let es = en.es, d = en.d, F = en.F, r = en.r;
        if (ride) { d += km; r++; }
        if (enter) {
          if (es === 0) es = 1;
          else if (es >= 2) {
            if (t2 - (es - 2) > 30) { F += fare(d); d = 0; }
            es = 1;
          }
        }
        if (es === 1 && (evict || zone[dest] === OUT)) es = t2 + 2;
        if (es >= 2 && t2 - (es - 2) > 30) { F += fare(d); d = 0; es = 0; }
        const key = (dest * KE + es) * KD + d;
        let m = maps[t2];
        if (!m) maps[t2] = (m = new Map());
        const old = m.get(key);
        const cand = { cell: dest, es, d, F, r, str: en.str + str };
        if (old === undefined || better(cand, old)) m.set(key, cand);
      });
    }
  }

  const fin = maps[T];
  if (!fin) return '불가';
  let best = null, bestFee = 0;
  for (const en of fin.values()) {
    if (en.cell !== E) continue;
    const fee = en.F + (en.es !== 0 ? fare(en.d) : 0);
    if (
      best === null ||
      fee < bestFee ||
      (fee === bestFee && (en.r < best.r || (en.r === best.r && en.str < best.str)))
    ) {
      best = en;
      bestFee = fee;
    }
  }
  return best ? best.str : '불가';
}

console.log(main());
