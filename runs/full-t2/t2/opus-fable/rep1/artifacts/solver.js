'use strict';
// 막차 러너 풀이기
// 사용: node solver.js <level.json>            → 가장 좋은 풀이 출력
//       node solver.js <level.json> --check S  → 행동 문자열 S 재생 결과 출력(검증용)
const fs = require('fs');

const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const grid = level.grid;
const H = grid.length;
const W = H ? grid[0].length : 0;
const N = H * W;
const MAXT = level.maxTick | 0;

// ---------- 맵 ----------
const WALL = 0, IN = 1, OUT = 2, GATE = 3;
const ZIN = 1, ZOUT = 0; // 마지막으로 있던 구역 (개찰구 위에서 의미가 있음)
const type = new Uint8Array(N);
const esc = new Int8Array(N).fill(-1); // 에스컬레이터 방향 (DIRS 인덱스)
const isE = new Uint8Array(N);
let start = -1;
// 사전순: D < L < R < U
const DIRS = [
  { tok: 'D', dr: 1, dc: 0 },
  { tok: 'L', dr: 0, dc: -1 },
  { tok: 'R', dr: 0, dc: 1 },
  { tok: 'U', dr: -1, dc: 0 },
];
const ARROW = { 'v': 0, '<': 1, '>': 2, '^': 3 };
for (let r = 0; r < H; r++) {
  for (let c = 0; c < W; c++) {
    const ch = grid[r][c];
    const i = r * W + c;
    if (ch === '.' || ch === 'P') type[i] = IN;
    else if (ch in ARROW) { type[i] = IN; esc[i] = ARROW[ch]; }
    else if (ch === ',') type[i] = OUT;
    else if (ch === 'S') { type[i] = OUT; start = i; }
    else if (ch === 'E') { type[i] = OUT; isE[i] = 1; }
    else if (ch === 'G') type[i] = GATE;
    else type[i] = WALL;
  }
}
const cellOf = (at) => {
  if (!Array.isArray(at) || at.length < 2) return -1;
  const r = at[0], c = at[1];
  if (!(r >= 0 && r < H && c >= 0 && c < W)) return -1;
  return r * W + c;
};

// ---------- 역 건물 (폐쇄 · 강제 퇴장) ----------
const roomsAt = new Array(N); // 안 칸 → 그 칸을 포함하는 방 목록 (rooms 순서)
for (const room of level.rooms || []) {
  const [r1, c1, r2, c2] = room.rect;
  const ev = cellOf(room.evict);
  const close = room.close;
  for (let r = Math.max(0, r1); r <= Math.min(H - 1, r2); r++) {
    for (let c = Math.max(0, c1); c <= Math.min(W - 1, c2); c++) {
      const i = r * W + c;
      if (type[i] !== IN) continue;
      (roomsAt[i] || (roomsAt[i] = [])).push({ close, ev });
    }
  }
}
// 틱 t에 안 칸 i에 있으면 쫓겨나는 칸 (없으면 -1)
function evictAt(i, t) {
  const rs = roomsAt[i];
  if (!rs) return -1;
  for (const rm of rs) if (t >= rm.close && rm.ev >= 0) return rm.ev;
  return -1;
}

// ---------- 노선 ----------
const toMilli = (k) => Math.round(Number(k) * 1000);
// 행동 토큰 표 (0~3: D L R U, 4: W, 그 뒤: 승차)
const TOKS = ['D', 'L', 'R', 'U', 'W'];
const TID_W = 4;
const tokIdx = new Map(TOKS.map((s, i) => [s, i]));
const tidOf = (s) => {
  let v = tokIdx.get(s);
  if (v === undefined) { v = TOKS.length; TOKS.push(s); tokIdx.set(s, v); }
  return v;
};
const lines = (level.lines || []).map((L) => {
  const st = L.stations || [];
  const cum = [0];
  const kcum = [0];
  for (let i = 0; i + 1 < st.length; i++) {
    cum.push(cum[i] + (Number(L.travel[i]) || 0));
    kcum.push(kcum[i] + toMilli(L.km[i] || 0));
  }
  const cells = st.map((s) => cellOf(s.at));
  // i번째 역에서 갈 수 있는 하차역: 이름마다 가장 가까운 뒤 역
  const dests = st.map((_, i) => {
    const seen = new Set();
    const out = [];
    for (let j = i + 1; j < st.length; j++) {
      const nm = st[j].name;
      if (seen.has(nm)) continue;
      seen.add(nm);
      if (cells[j] < 0) continue;
      const tok = '[' + L.id + '>' + nm + ']';
      out.push({ tok, tid: tidOf(tok), dt: cum[j] - cum[i], km: kcum[j] - kcum[i], cell: cells[j] });
    }
    return out;
  });
  return { id: L.id, first: Number(L.first), headway: Number(L.headway), last: Number(L.last), cum, cells, dests };
});
function trainAt(L, i, t) {
  const d = t - L.cum[i];
  if (d < L.first || d > L.last) return false;
  if (!(L.headway > 0)) return d === L.first;
  return (d - L.first) % L.headway === 0;
}
const linesAt = new Array(N); // 칸 → 그 칸에 승강장이 있는 노선 번호
lines.forEach((L, li) => {
  const s = new Set();
  L.cells.forEach((c) => { if (c >= 0) s.add(c); });
  for (const c of s) (linesAt[c] || (linesAt[c] = [])).push(li);
});

// ---------- 행동 ----------
// 칸 c, 틱 t, 구역 z에서 가능한 행동. 결과: {tok, kind, n0(퇴장 전 칸), nc, nt, km, ev}
const K_MOVE = 0, K_WAIT = 1, K_RIDE = 2;
function actions(c, t, z, limit) {
  const out = [];
  if (isE[c]) return out;
  const e = esc[c];
  if (t + 1 <= limit) {
    for (const mv of movesOf[c]) {
      const n = mv.n, nt = t + 1;
      const ev = type[n] === IN ? evictAt(n, nt) : -1;
      out.push({ tok: TOKS[mv.tid], kind: K_MOVE, n0: n, nc: ev >= 0 ? ev : n, nt, km: 0, ev: ev >= 0 });
    }
  }
  if (e < 0 && t + 1 <= limit) {
    const ev = type[c] === IN ? evictAt(c, t + 1) : -1;
    out.push({ tok: 'W', kind: K_WAIT, n0: c, nc: ev >= 0 ? ev : c, nt: t + 1, km: 0, ev: ev >= 0 });
  }
  if (z === ZIN && type[c] === IN && linesAt[c]) {
    for (const li of linesAt[c]) {
      const L = lines[li];
      // 지금 이 칸에 서 있는 그 노선 열차의 역 (여럿이면 가장 앞 역)
      let si = -1;
      for (let i = 0; i < L.cells.length; i++) {
        if (L.cells[i] === c && trainAt(L, i, t)) { si = i; break; }
      }
      if (si < 0) continue;
      for (const ds of L.dests[si]) {
        const nt = t + ds.dt;
        if (nt > limit || nt < t) continue;
        const ev = type[ds.cell] === IN ? evictAt(ds.cell, nt) : -1;
        out.push({ tok: ds.tok, kind: K_RIDE, n0: ds.cell, nc: ev >= 0 ? ev : ds.cell, nt, km: ds.km, ev: ev >= 0 });
      }
    }
  }
  return out;
}
// 각 칸에서 안 칸에 처음 발을 디디기까지 최소 걸음 수 (하한; 재입장 가능성 판정용)
function canStep(c, d) {
  if (isE[c] || type[c] === WALL) return -1;
  if (esc[c] >= 0 && esc[c] !== d) return -1;
  const r = (c / W) | 0, col = c % W;
  const nr = r + DIRS[d].dr, ncol = col + DIRS[d].dc;
  if (nr < 0 || nr >= H || ncol < 0 || ncol >= W) return -1;
  const n = nr * W + ncol;
  const tn = type[n], tc = type[c];
  if (tn === WALL) return -1;
  if (esc[n] >= 0 && esc[n] !== d) return -1;
  if ((tc === IN && tn === OUT) || (tc === OUT && tn === IN)) return -1;
  return n;
}
// 칸마다 정적으로 가능한 걸음 (E에서는 없음)
const movesOf = new Array(N);
for (let c = 0; c < N; c++) {
  const ms = [];
  for (let d = 0; d < 4; d++) { const n = canStep(c, d); if (n >= 0) ms.push({ tid: d, n }); }
  movesOf[c] = ms;
}
const distIn = new Int32Array(N).fill(1 << 29);
{
  const pred = Array.from({ length: N }, () => []);
  for (let c = 0; c < N; c++) for (let d = 0; d < 4; d++) { const n = canStep(c, d); if (n >= 0) pred[n].push(c); }
  const q = [];
  for (let c = 0; c < N; c++) if (type[c] === IN) { distIn[c] = 0; q.push(c); }
  for (let qi = 0; qi < q.length; qi++) {
    const u = q[qi];
    for (const p of pred[u]) if (type[p] !== IN && distIn[p] > distIn[u] + 1) { distIn[p] = distIn[u] + 1; q.push(p); }
  }
}

// 행동 뒤 구역
function nextZone(z, a) {
  if (a.ev) return ZOUT;
  if (a.kind === K_MOVE) {
    const tn = type[a.n0];
    if (tn === IN) return ZIN;
    if (tn === OUT) return ZOUT;
  }
  return z;
}

// ---------- 요금 ----------
function fareOf(m) { // m: milli-km
  if (m <= 10000) return 1450;
  if (m <= 50000) return 1450 + Math.ceil((m - 10000) / 5000) * 100;
  return 2250 + Math.ceil((m - 50000) / 8000) * 100;
}
const BASE = fareOf(0);
// 통행 상태: km(-1 = 통행 없음), ex(-1 = 안에 있음 / 퇴장 틱)
// 반환: [추가요금, 새 km, 새 ex]  (요금은 늘어나는 만큼 그때그때 더함)
function applyFare(z, km, ex, a) {
  let f = 0;
  const nt = a.nt;
  if (a.kind === K_MOVE) {
    const tn = type[a.n0];
    if (tn === IN && z === ZOUT) { // 입장
      if (km >= 0 && ex >= 0 && nt - ex <= 30) ex = -1; // 같은 통행 이어짐
      else { f += BASE; km = 0; ex = -1; }
    } else if (tn === OUT && z === ZIN) { // 퇴장
      if (km >= 0) ex = nt;
    }
  } else if (a.kind === K_RIDE) {
    if (km < 0) { f += BASE; km = 0; } // (정상 상황에서는 일어나지 않음)
    f += fareOf(km + a.km) - fareOf(km);
    km += a.km;
  }
  if (a.ev) { // 강제 퇴장 = 퇴장
    const zAfterMove = a.kind === K_MOVE ? (type[a.n0] === IN ? ZIN : type[a.n0] === OUT ? ZOUT : z) : z;
    if (km >= 0 && (zAfterMove === ZIN || ex < 0)) ex = nt;
  }
  // 30틱 안에 다시 들어갈 수 없게 된 통행은 정리 (미래 요금에 영향 없음)
  if (km >= 0 && ex >= 0 && nt + distIn[a.nc] > ex + 30) { km = -1; ex = -1; }
  return [f, km, ex];
}

// ---------- 검증 모드 ----------
const checkIdx = process.argv.indexOf('--check');
if (checkIdx >= 0) {
  const s = process.argv[checkIdx + 1];
  let c = start, t = 0, z = ZOUT, km = -1, ex = -1, fare = 0, boards = 0, p = 0;
  while (p < s.length) {
    const acts = actions(c, t, z, Infinity);
    const a = acts.find((x) => s.startsWith(x.tok, p));
    if (!a) { console.log(`불법 행동 @${p} tick ${t} cell [${(c / W) | 0},${c % W}] : ${s.slice(p)}`); process.exit(1); }
    const [df, nkm, nex] = applyFare(z, km, ex, a);
    fare += df; if (a.kind === K_RIDE) boards++;
    z = nextZone(z, a); km = nkm; ex = nex; c = a.nc; t = a.nt; p += a.tok.length;
    if (isE[c] && p < s.length) { console.log('E 도착 뒤 행동이 남음'); process.exit(1); }
  }
  console.log(JSON.stringify({ arrived: !!isE[c], tick: t, fare, boards, overMax: t > MAXT }));
  process.exit(0);
}

// ---------- 1단계: 가장 이른 도착 틱 (칸 · 틱 · 구역만 보면 됨) ----------
function solve() {
  if (start < 0) return '불가';
  const S2 = N * 2;
  const reach = [];
  let Tstar = -1;
  reach[0] = new Uint8Array(S2);
  reach[0][start * 2 + ZOUT] = 1;
  for (let t = 0; t <= MAXT; t++) {
    if (!reach[t]) reach[t] = new Uint8Array(S2);
    const cur = reach[t];
    // 이 틱의 상태들 (시간 0 짜리 승차가 있으면 같은 틱에 추가될 수 있음)
    const q = [];
    for (let k = 0; k < S2; k++) if (cur[k]) q.push(k);
    let found = false;
    for (let qi = 0; qi < q.length; qi++) {
      const k = q[qi];
      const c = k >> 1, z = k & 1;
      if (isE[c]) { found = true; continue; }
      for (const a of actions(c, t, z, MAXT)) {
        const nk = a.nc * 2 + nextZone(z, a);
        if (!reach[a.nt]) reach[a.nt] = new Uint8Array(S2);
        if (!reach[a.nt][nk]) {
          reach[a.nt][nk] = 1;
          if (a.nt === t) q.push(nk);
        }
      }
    }
    if (found) { Tstar = t; break; }
  }
  if (Tstar < 0) return '불가';

  // ---------- 2단계: T*에 정확히 E에 닿을 수 있는 (칸, 틱, 구역) ----------
  const good = new Array(Tstar + 1);
  good[Tstar] = new Uint8Array(S2);
  for (let k = 0; k < S2; k++) if (reach[Tstar][k] && isE[k >> 1]) good[Tstar][k] = 1;
  for (let t = Tstar - 1; t >= 0; t--) {
    const g = good[t] = new Uint8Array(S2);
    const cur = reach[t];
    let changed = true;
    while (changed) {
      changed = false;
      for (let k = 0; k < S2; k++) {
        if (!cur[k] || g[k]) continue;
        const c = k >> 1, z = k & 1;
        for (const a of actions(c, t, z, Tstar)) {
          if (good[a.nt][a.nc * 2 + nextZone(z, a)]) { g[k] = 1; changed = true; break; }
        }
      }
    }
  }

  // ---------- 3단계: 요금 · 승차 횟수 · 사전순 (뒤에서부터 메모 재귀) ----------
  // 상태 = (칸, 틱, 구역, 통행 km, 퇴장 틱). 값은 형식 배열에 저장.
  const T1 = Tstar + 1;
  const kmIds = new Map();
  const kmId = (km) => {
    let v = kmIds.get(km);
    if (v === undefined) { v = kmIds.size; kmIds.set(km, v); }
    return v;
  };
  // 상태 값: 남은 요금, 남은 승차 수, 첫 행동 토큰 번호, 다음 상태 번호
  // 상태 찾기: (칸·틱)마다 연결 리스트 (HEAD → SL), 보조키 SK
  let cap = 1 << 18;
  let SF = new Int32Array(cap), SB = new Int32Array(cap), ST = new Int32Array(cap), SN = new Int32Array(cap);
  let SK = new Int32Array(cap), SL = new Int32Array(cap);
  const HEAD = new Int32Array(N * T1); // 0 = 없음 (0번 상태는 도착 전용)
  let nStates = 1; // 0번 = 도착(E)
  const BUSY = -2, DEAD = -3, TERMTOK = -1;
  ST[0] = TERMTOK;
  const newState = () => {
    if (nStates === cap) {
      cap = Math.floor(cap * 1.5);
      const g = (a) => { const b = new Int32Array(cap); b.set(a); return b; };
      SF = g(SF); SB = g(SB); ST = g(ST); SN = g(SN); SK = g(SK); SL = g(SL);
    }
    return nStates++;
  };
  const fullStr = (id) => { let s = ''; while (id > 0) { s += TOKS[ST[id]]; id = SN[id]; } return s; };

  // 행동 하나를 적용하고 결과 상태를 풀이. 반환: 상태 번호(없으면 -1), gDf = 추가 요금
  let gDf = 0;
  function step(z, km, ex, kind, n0, ev, nt, dkm) {
    const nc = ev >= 0 ? ev : n0;
    let nz = z;
    let f = 0;
    if (kind === K_MOVE) {
      const tn = type[n0];
      if (tn === IN) {
        if (z === ZOUT) { // 입장
          if (km >= 0 && ex >= 0 && nt - ex <= 30) ex = -1;
          else { f += BASE; km = 0; ex = -1; }
        }
        nz = ZIN;
      } else if (tn === OUT) {
        if (z === ZIN && km >= 0) ex = nt; // 퇴장
        nz = ZOUT;
      }
    } else if (kind === K_RIDE) {
      if (km < 0) { f += BASE; km = 0; }
      f += fareOf(km + dkm) - fareOf(km);
      km += dkm;
    }
    if (ev >= 0) { // 강제 퇴장
      if (km >= 0 && (nz === ZIN || ex < 0)) ex = nt;
      nz = ZOUT;
    }
    if (km >= 0 && ex >= 0 && nt + distIn[nc] > ex + 30) { km = -1; ex = -1; }
    if (isE[nc]) { gDf = f; return nt === Tstar ? 0 : -1; }
    if (!good[nt][nc * 2 + nz]) return -1;
    const r = V(nc, nt, nz, km, ex);
    gDf = f;
    return r;
  }

  function V(c, t, z, km, ex) {
    const k1 = c * T1 + t;
    const k2 = ((km < 0 ? 0 : kmId(km) + 1) * 32 + (ex < 0 ? 31 : t - ex)) * 2 + z;
    for (let s = HEAD[k1]; s !== 0; s = SL[s]) {
      if (SK[s] === k2) return ST[s] < 0 ? -1 : s; // BUSY(순환) 또는 DEAD
    }
    const id = newState();
    SK[id] = k2; SL[id] = HEAD[k1]; HEAD[k1] = id;
    ST[id] = BUSY;
    const fb = depth * 4; // 이 호출의 최선 후보 (FR[fb..fb+3] = 요금, 승차, 토큰, 다음 상태)
    depth++;
    FR[fb + 3] = -1;
    const nt1 = t + 1;
    if (nt1 <= Tstar) {
      for (const mv of movesOf[c]) {
        const ev = type[mv.n] === IN ? evictAt(mv.n, nt1) : -1;
        consider(fb, step(z, km, ex, K_MOVE, mv.n, ev, nt1, 0), mv.tid, 0);
      }
      if (esc[c] < 0) {
        const ev = type[c] === IN ? evictAt(c, nt1) : -1;
        consider(fb, step(z, km, ex, K_WAIT, c, ev, nt1, 0), TID_W, 0);
      }
    }
    if (z === ZIN && type[c] === IN && linesAt[c]) {
      for (const li of linesAt[c]) {
        const L = lines[li];
        let si = -1;
        for (let i = 0; i < L.cells.length; i++) if (L.cells[i] === c && trainAt(L, i, t)) { si = i; break; }
        if (si < 0) continue;
        for (const ds of L.dests[si]) {
          const nt = t + ds.dt;
          if (nt > Tstar || nt < t) continue;
          const ev = type[ds.cell] === IN ? evictAt(ds.cell, nt) : -1;
          consider(fb, step(z, km, ex, K_RIDE, ds.cell, ev, nt, ds.km), ds.tid, 1);
        }
      }
    }
    depth--;
    const bn = FR[fb + 3];
    if (bn < 0) { ST[id] = DEAD; return -1; }
    SF[id] = FR[fb]; SB[id] = FR[fb + 1]; ST[id] = FR[fb + 2]; SN[id] = bn;
    return id;
  }
  // 재귀 깊이별 최선 후보 저장 (클로저 할당을 피하려고)
  let depth = 0;
  const FR = [];
  function consider(fb, child, tid, isRide) {
    if (child < 0) return;
    const f = gDf + SF[child];
    const b = isRide + SB[child];
    if (FR[fb + 3] >= 0) {
      const bf = FR[fb], bb = FR[fb + 1];
      if (f !== bf) { if (f > bf) return; }
      else if (b !== bb) { if (b > bb) return; }
      else {
        const ta = TOKS[tid], tb = TOKS[FR[fb + 2]];
        let less;
        if (ta.startsWith(tb) || tb.startsWith(ta)) less = ta + fullStr(child) < tb + fullStr(FR[fb + 3]);
        else less = ta < tb;
        if (!less) return;
      }
    }
    FR[fb] = f; FR[fb + 1] = b; FR[fb + 2] = tid; FR[fb + 3] = child;
  }

  const res = good[0][start * 2 + ZOUT] ? V(start, 0, ZOUT, -1, -1) : -1;
  if (process.argv.includes('--stats')) {
    let goodCnt = 0;
    for (const g of good) for (const x of g) goodCnt += x;
    const mu = process.memoryUsage();
    process.stderr.write(`T*=${Tstar} good=${goodCnt} states=${nStates} kms=${kmIds.size} rss=${(mu.rss / 1048576) | 0}MB\n`);
  }
  if (res < 0) return '불가';
  return fullStr(res);
}

process.stdout.write(solve() + '\n');
