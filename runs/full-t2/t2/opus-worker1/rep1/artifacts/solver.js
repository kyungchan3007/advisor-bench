'use strict';
// 막차 러너 풀이기. 사용법: node solver.js levels/01-sample.json
// 구조: parseLevel -> successors(모든 전이의 단일 출처) -> 1~5단계(solve)

const fs = require('fs');

const DIRS = [
  { ch: 'D', dr: 1, dc: 0 },
  { ch: 'L', dr: 0, dc: -1 },
  { ch: 'R', dr: 0, dc: 1 },
  { ch: 'U', dr: -1, dc: 0 },
];
const ESC_DIR = { '>': 'R', '<': 'L', '^': 'U', v: 'D' };
const ZONE_WALL = 0, ZONE_IN = 1, ZONE_OUT = 2, ZONE_GATE = 3;
const BOARD_UNIT = 1024; // 비용 = 요금 * 1024 + 승차 횟수 (승차 횟수 < 1024 가정)

// ---------------------------------------------------------------- 레벨 파싱

function zoneOfChar(ch) {
  if (ch === '#') return ZONE_WALL;
  if (ch === 'G') return ZONE_GATE;
  if (ch === ',' || ch === 'S' || ch === 'E') return ZONE_OUT;
  return ZONE_IN; // . P > < ^ v
}

function parseLevel(json) {
  const H = json.grid.length;
  const W = json.grid[0].length;
  const n = H * W;
  const zone = new Uint8Array(n);
  const esc = new Array(n).fill(''); // 에스컬레이터면 허용 이동 문자(D/L/R/U)
  const isP = new Uint8Array(n);
  let S = -1, E = -1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = json.grid[r][c];
      const cell = r * W + c;
      zone[cell] = zoneOfChar(ch);
      if (ESC_DIR[ch]) esc[cell] = ESC_DIR[ch];
      if (ch === 'P') isP[cell] = 1;
      if (ch === 'S') S = cell;
      if (ch === 'E') E = cell;
    }
  }

  // 안 칸마다 닫히는 틱과 퇴장 칸 (겹치면 close가 가장 작은 것, 같으면 목록 앞)
  const closeAt = new Array(n).fill(Infinity);
  const evictTo = new Array(n).fill(-1);
  for (const room of json.rooms || []) {
    const [r0, c0, r1, c1] = room.rect;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (r < 0 || r >= H || c < 0 || c >= W) continue;
        const cell = r * W + c;
        if (zone[cell] !== ZONE_IN) continue;
        if (room.close < closeAt[cell]) {
          closeAt[cell] = room.close;
          evictTo[cell] = room.evict[0] * W + room.evict[1];
        }
      }
    }
  }

  // 노선: 누적 시간/거리(km는 x1000 정수), 칸별 승강장 목록
  const lines = json.lines.map((ln) => {
    const m = ln.stations.length;
    const cumT = [0];
    const cumK = [0];
    for (let i = 0; i < m - 1; i++) {
      cumT.push(cumT[i] + ln.travel[i]);
      cumK.push(cumK[i] + Math.round(ln.km[i] * 1000));
    }
    return {
      id: ln.id,
      names: ln.stations.map((s) => s.name),
      cells: ln.stations.map((s) => s.at[0] * W + s.at[1]),
      cumT, cumK,
      first: ln.first, headway: ln.headway, last: ln.last,
    };
  });
  const boardAt = new Array(n).fill(null).map(() => []);
  lines.forEach((ln, li) => {
    ln.cells.forEach((cell, i) => {
      if (isP[cell]) boardAt[cell].push({ li, i });
    });
  });

  // travel 0 구간이 있으면 같은 틱 안 전이가 생겨 2·4단계에서 고정점 반복이 필요
  const hasZeroTravel = json.lines.some((ln) => ln.travel.some((x) => x <= 0));

  return { H, W, n, zone, esc, S, E, closeAt, evictTo, lines, boardAt, hasZeroTravel,
    maxTick: json.maxTick };
}

// ---------------------------------------------------------------- 요금

// K는 km x 1000 정수
function fare(K) {
  if (K <= 10000) return 1450;
  if (K <= 50000) return 1450 + Math.ceil((K - 10000) / 5000) * 100;
  return 2250 + Math.ceil((K - 50000) / 8000) * 100;
}

// 노선 li의 i번째 역에 틱 t에 열차가 서 있는가
function trainAt(L, li, i, t) {
  const ln = L.lines[li];
  const d = t - ln.cumT[i]; // 첫 역 출발 틱
  if (d < ln.first || d > ln.last) return false;
  if (ln.headway <= 0) return d === ln.first;
  return (d - ln.first) % ln.headway === 0;
}

// ---------------------------------------------------------------- 전이 (단일 출처)

// 상태 s = { cell, side(0 밖/1 안; G에서는 온 쪽), k(통행 거리 x1000, 통행 없으면 -1), te(밖에서 통행이
// 열려 있을 때 퇴장 틱, 아니면 -1) }. 틱 t에서의 상태.
// 행동 하나를 마친 결과(틱 nt)를 만든다: 입장/퇴장, 강제 퇴장, 도착, 30틱 만료를 모두 여기서 처리.
// 반환 edge = { tok, cell, side, k, te, t, cost, done }
function arrive(L, s, cell, nt, tok, kAdd, boardInc) {
  let side = s.side, k = s.k, te = s.te, cost = boardInc;
  const z = L.zone[cell];
  const nside = z === ZONE_IN ? 1 : z === ZONE_OUT ? 0 : side;
  if (side === 0 && nside === 1) { // 입장
    if (k >= 0 && nt - te > 30) { cost += fare(k) * BOARD_UNIT; k = -1; } // 30틱 지나 이전 통행 확정
    if (k < 0) k = 0; // 새 통행 (열린 통행이 30틱 이내면 k 유지 = 이어짐)
    te = -1;
  } else if (side === 1 && nside === 0) { // 퇴장
    te = nt;
  }
  side = nside;
  if (k >= 0) k += kAdd;

  // 강제 퇴장 (닫힌 역의 안 칸)
  if (L.zone[cell] === ZONE_IN && L.closeAt[cell] <= nt) {
    cell = L.evictTo[cell];
    side = 0;
    te = nt;
  }

  // 도착
  if (cell === L.E) {
    if (k >= 0) cost += fare(k) * BOARD_UNIT;
    return { tok, cell, side, k: -1, te: -1, t: nt, cost, done: true };
  }

  // 밖에서 30틱 초과하면 통행 확정
  if (side === 0 && k >= 0 && nt - te > 30) {
    cost += fare(k) * BOARD_UNIT;
    k = -1;
    te = -1;
  }
  return { tok, cell, side, k, te, t: nt, cost, done: false };
}

function successors(L, s, t) {
  const out = [];
  const { W, H, zone, esc } = L;
  const r = Math.floor(s.cell / W), c = s.cell % W;
  const here = esc[s.cell];

  // 대기 (에스컬레이터 위에서는 불가)
  if (here === '') out.push(arrive(L, s, s.cell, t + 1, 'W', 0, 0));

  // 이동
  for (const d of DIRS) {
    if (here !== '' && here !== d.ch) continue; // 에스컬레이터는 화살표 방향으로만 나감
    const nr = r + d.dr, nc = c + d.dc;
    if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
    const ncell = nr * W + nc;
    const zt = zone[ncell];
    if (zt === ZONE_WALL) continue;
    const zh = zone[s.cell];
    if ((zh === ZONE_IN && zt === ZONE_OUT) || (zh === ZONE_OUT && zt === ZONE_IN)) continue;
    if (esc[ncell] !== '' && esc[ncell] !== d.ch) continue; // 에스컬레이터는 화살표 방향으로만 진입
    out.push(arrive(L, s, ncell, t + 1, d.ch, 0, 0));
  }

  // 승차 (승강장 칸 = 안 칸이므로 side는 항상 1)
  for (const { li, i } of L.boardAt[s.cell]) {
    if (!trainAt(L, li, i, t)) continue;
    const ln = L.lines[li];
    const seen = new Set();
    for (let j = i + 1; j < ln.names.length; j++) {
      if (seen.has(ln.names[j])) continue; // 이름별로 가장 가까운 뒤 역만
      seen.add(ln.names[j]);
      const tok = '[' + ln.id + '>' + ln.names[j] + ']';
      out.push(arrive(L, s, ln.cells[j], t + ln.cumT[j] - ln.cumT[i], tok,
        ln.cumK[j] - ln.cumK[i], 1));
    }
  }
  return out;
}

// ---------------------------------------------------------------- 풀이

function solve(L) {
  const { n, maxTick } = L;
  const start = { cell: L.S, side: 0, k: -1, te: -1 };
  const lightIdx = (cell, side) => cell * 2 + side;

  // 1단계: 요금 무시 도달 가능성 Reach[t], 최소 도착 틱 best (A*)
  const reach = [];
  const list = [];
  for (let t = 0; t <= maxTick; t++) { reach.push(new Uint8Array(n * 2)); list.push([]); }
  const addReach = (t, cell, side) => {
    const idx = lightIdx(cell, side);
    if (!reach[t][idx]) { reach[t][idx] = 1; list[t].push(idx); }
  };
  addReach(0, start.cell, 0);
  let best = Infinity;
  for (let t = 0; t <= maxTick && t <= best; t++) {
    for (let i = 0; i < list[t].length; i++) { // 같은 틱 전이로 목록이 늘 수 있음
      const idx = list[t][i];
      const s = { cell: idx >> 1, side: idx & 1, k: -1, te: -1 };
      for (const e of successors(L, s, t)) {
        if (e.t > maxTick) continue;
        if (e.done) { if (e.t < best) best = e.t; } else addReach(e.t, e.cell, e.side);
      }
    }
  }
  if (best === Infinity) return '불가';

  // 2단계: 역방향 가능성 Good[t] (E에 틱 best로 도착 가능한 상태)
  const good = [];
  for (let t = 0; t <= best; t++) good.push(new Uint8Array(n * 2));
  for (let t = best; t >= 0; t--) {
    let changed;
    do { // travel 0 구간이 있을 때만 같은 틱 전이 때문에 고정점까지 반복
      changed = false;
      for (const idx of list[t]) {
        if (good[t][idx]) continue;
        const s = { cell: idx >> 1, side: idx & 1, k: -1, te: -1 };
        for (const e of successors(L, s, t)) {
          const ok = e.done ? e.t === best
            : e.t <= best && good[e.t][lightIdx(e.cell, e.side)] === 1;
          if (ok) { good[t][idx] = 1; changed = true; break; }
        }
      }
    } while (changed && L.hasZeroTravel);
  }

  // 3단계: 전체 상태 열거 (Good 안에서만). 상태 = (cell, side, k, te) @ 틱
  const kIndex = new Map();
  // create=true는 3단계에서만. 4·5단계 조회에서 처음 보는 k면 -1(없음)을 돌려준다.
  const kId = (k, create) => {
    if (k < 0) return 0;
    let id = kIndex.get(k);
    if (id === undefined) {
      if (!create) return -1;
      id = kIndex.size + 1;
      kIndex.set(k, id);
    }
    return id;
  };
  const stateKey = (s, t, create) => {
    const id = kId(s.k, create);
    if (id < 0) return -1;
    const dt = s.te < 0 ? 31 : t - s.te; // 0..30 (밖에서 통행 열림) 또는 31
    return ((s.cell * 2 + s.side) * 65536 + id) * 32 + dt;
  };
  const maps = [], states = []; // maps[t]: key -> 인덱스, states[t][인덱스] = { cell, side, k, te }
  for (let t = 0; t <= best; t++) { maps.push(new Map()); states.push([]); }
  const intern = (e, t) => {
    const key = stateKey(e, t, true);
    let idx = maps[t].get(key);
    if (idx === undefined) {
      idx = states[t].length;
      states[t].push({ cell: e.cell, side: e.side, k: e.k, te: e.te });
      maps[t].set(key, idx);
    }
    return idx;
  };
  intern(start, 0); // 시작 상태 = states[0][0]
  for (let t = 0; t <= best; t++) {
    for (let i = 0; i < states[t].length; i++) {
      for (const e of successors(L, states[t][i], t)) {
        if (e.done || e.t > best) continue;
        if (good[e.t][lightIdx(e.cell, e.side)]) intern(e, e.t);
      }
    }
  }

  // 4단계 준비: vals[t][인덱스] = 그 상태에서 남은 최소 (요금*1024 + 승차 횟수)
  const vals = states.map((arr) => new Float64Array(arr.length).fill(Infinity));

  // 간선 e를 탔을 때 (간선 비용 + 다음 상태의 남은 가치). 3단계와 같은 필터, 없으면 Infinity.
  const edgeTotal = (e) => {
    if (e.done) return e.t === best ? e.cost : Infinity;
    if (e.t > best || !good[e.t][lightIdx(e.cell, e.side)]) return Infinity;
    const key = stateKey(e, e.t, false);
    if (key < 0) return Infinity;
    const idx = maps[e.t].get(key);
    return idx === undefined ? Infinity : e.cost + vals[e.t][idx];
  };

  // 4단계: 역방향 가치. 틱 내림차순 (같은 틱 전이는 travel 0 구간이 있을 때만 반복)
  for (let t = best; t >= 0; t--) {
    let changed;
    do {
      changed = false;
      for (let i = 0; i < states[t].length; i++) {
        for (const e of successors(L, states[t][i], t)) {
          const v = edgeTotal(e);
          if (v < vals[t][i]) { vals[t][i] = v; changed = true; }
        }
      }
    } while (changed && L.hasZeroTravel);
  }

  // 5단계: 사전순 복원. 프런티어 = 최적 경로 위의 상태들 { s(상태), t, acc(누적 비용) }
  const optimal = vals[0][0];
  const TICK_STRIDE = 2 ** 40; // frontier 키 = t * TICK_STRIDE + stateKey
  let frontier = new Map([[0, { s: start, t: 0, acc: 0 }]]);
  let answer = '';
  for (;;) {
    let bestTok = null;
    const cands = []; // { e, acc }  (acc = e까지 포함한 누적 비용)
    for (const f of frontier.values()) {
      for (const e of successors(L, f.s, f.t)) {
        if (f.acc + edgeTotal(e) !== optimal) continue;
        cands.push({ e, acc: f.acc + e.cost });
        if (bestTok === null || e.tok < bestTok) bestTok = e.tok;
      }
    }
    answer += bestTok;
    const next = new Map();
    let finished = false;
    for (const { e, acc } of cands) {
      if (e.tok !== bestTok) continue;
      if (e.done) finished = true; // 도착: 접두사가 더 작으므로 여기서 끝
      else next.set(e.t * TICK_STRIDE + stateKey(e, e.t, false), { s: e, t: e.t, acc });
    }
    if (finished) return answer;
    frontier = next;
  }
}

// ---------------------------------------------------------------- 진입점

function main() {
  const json = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const L = parseLevel(json);
  process.stdout.write(solve(L) + '\n');
}

main();
