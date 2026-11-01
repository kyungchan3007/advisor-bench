'use strict';
// 막차 러너 풀이기. 설계: PLAN.md
//  A단계: (칸,틱) 시간 전개 BFS로 최소 도착 틱 T*, 역방향으로 최적 시간 경로 위의 (칸,틱) 집합 good
//  B단계: good 안에서 틱 순서로 라벨 DP (요금 상태 + 파레토 지배 + 사전순 rank)
const fs = require('fs');

const IN = 1, OUT = 2, GATE = 3;
const M_NONE = 0, M_IN = 1, M_OUT = 2;
const K_MOVE = 0, K_WAIT = 1, K_RIDE = 2;
const DR = [1, 0, 0, -1], DC = [0, -1, 1, 0]; // D L R U (토큰 사전순)
const MOVE_CH = ['D', 'L', 'R', 'U', 'W'];

// 요금 (km는 1000배 정수)
function fare(K) {
  if (K <= 10000) return 1450;
  if (K <= 50000) return 1450 + 100 * Math.floor((K - 10000 + 4999) / 5000);
  return 2250 + 100 * Math.floor((K - 50000 + 7999) / 8000);
}

function solve(level, opts) {
  opts = opts || {};
  const noPrune = !!opts.noPrune;
  const maxTick = level.maxTick;
  const grid = level.grid;
  const H = grid.length;
  const W = H ? grid[0].length : 0;
  const N = H * W;

  // ---------- 격자 ----------
  const zone = new Uint8Array(N);
  const isP = new Uint8Array(N);
  const isExit = new Uint8Array(N);
  const escDir = new Int8Array(N).fill(-1);
  let start = -1, hasExit = false;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = grid[r][c], id = r * W + c;
      switch (ch) {
        case '.': zone[id] = IN; break;
        case 'P': zone[id] = IN; isP[id] = 1; break;
        case '>': zone[id] = IN; escDir[id] = 2; break;
        case '<': zone[id] = IN; escDir[id] = 1; break;
        case '^': zone[id] = IN; escDir[id] = 3; break;
        case 'v': zone[id] = IN; escDir[id] = 0; break;
        case ',': zone[id] = OUT; break;
        case 'S': zone[id] = OUT; if (start < 0) start = id; break;
        case 'E': zone[id] = OUT; isExit[id] = 1; hasExit = true; break;
        case 'G': zone[id] = GATE; break;
        default: zone[id] = 0;
      }
    }
  }
  if (start < 0 || !hasExit) return '불가';

  // ---------- 방 (폐쇄 / 강제 퇴장) ----------
  const closeT = new Int32Array(N).fill(0x3fffffff);
  const evictCell = new Int32Array(N).fill(-1);
  for (const room of level.rooms || []) {
    const [t, l, b, r] = room.rect;
    const ev = room.evict[0] * W + room.evict[1];
    for (let rr = Math.max(0, t); rr <= Math.min(H - 1, b); rr++) {
      for (let cc = Math.max(0, l); cc <= Math.min(W - 1, r); cc++) {
        const id = rr * W + cc;
        if (zone[id] !== IN) continue;
        if (room.close < closeT[id]) { closeT[id] = room.close; evictCell[id] = ev; }
      }
    }
  }

  // ---------- 노선 ----------
  const tokens = ['D', 'L', 'R', 'U', 'W'];
  const lines = [];
  const rideRaw = new Map(); // cell -> [{tok, line, i, j, dt, dkm, dest}]
  for (const ln of level.lines || []) {
    const n = ln.stations.length;
    const pre = new Array(n).fill(0), cumK = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
      if (!(ln.travel[i - 1] >= 1)) throw new Error('travel < 1');
      pre[i] = pre[i - 1] + ln.travel[i - 1];
      cumK[i] = cumK[i - 1] + Math.round(ln.km[i - 1] * 1000);
    }
    const at = ln.stations.map(s => s.at[0] * W + s.at[1]);
    const L = { id: ln.id, n, pre, cumK, first: ln.first, headway: ln.headway, last: ln.last };
    lines.push(L);
    for (let i = 0; i < n - 1; i++) {
      if (!isP[at[i]]) continue;
      const seen = new Set();
      for (let j = i + 1; j < n; j++) {
        const nm = ln.stations[j].name;
        if (seen.has(nm)) continue;
        seen.add(nm);
        if (zone[at[j]] === 0) continue;
        const tokStr = '[' + ln.id + '>' + nm + ']';
        const o = { tokStr, line: L, i, j, dt: pre[j] - pre[i], dkm: cumK[j] - cumK[i], dest: at[j], tok: -1 };
        if (!rideRaw.has(at[i])) rideRaw.set(at[i], []);
        rideRaw.get(at[i]).push(o);
      }
    }
  }
  const tokMap = new Map();
  const rideOpts = new Array(N).fill(null);
  for (const [cell, arr] of rideRaw) {
    arr.sort((a, b) => (a.tokStr < b.tokStr ? -1 : a.tokStr > b.tokStr ? 1 : a.i - b.i));
    for (const o of arr) {
      if (!tokMap.has(o.tokStr)) { tokMap.set(o.tokStr, tokens.length); tokens.push(o.tokStr); }
      o.tok = tokMap.get(o.tokStr);
    }
    rideOpts[cell] = arr;
  }

  function trainAt(L, i, t) {
    const d = t - L.pre[i];
    if (d < L.first || d > L.last) return false;
    return L.headway > 0 ? (d - L.first) % L.headway === 0 : d === L.first;
  }

  // ---------- 후속 생성기 ----------
  const MAXO = 5 + 64;
  let eCap = MAXO;
  for (const arr of rideOpts) if (arr && arr.length + 5 > eCap) eCap = arr.length + 5;
  const eTok = new Int32Array(eCap), eLand = new Int32Array(eCap), eCell2 = new Int32Array(eCap);
  const eT2 = new Int32Array(eCap), eDkm = new Int32Array(eCap), eKind = new Uint8Array(eCap);
  const eEv = new Uint8Array(eCap);
  let eN = 0;

  function emit(kind, tok, n, t2, dkm) {
    const ev = zone[n] === IN && t2 >= closeT[n];
    eTok[eN] = tok; eLand[eN] = n; eCell2[eN] = ev ? evictCell[n] : n;
    eT2[eN] = t2; eDkm[eN] = dkm; eKind[eN] = kind; eEv[eN] = ev ? 1 : 0;
    eN++;
  }

  function expand(c, t, T) {
    eN = 0;
    if (isExit[c]) return;
    const r = (c / W) | 0, col = c - r * W;
    const zc = zone[c], ed = escDir[c];
    for (let d = 0; d < 4; d++) {
      if (ed >= 0 && ed !== d) continue;
      const nr = r + DR[d], nc = col + DC[d];
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      const n = nr * W + nc, zn = zone[n];
      if (zn === 0) continue;
      if (escDir[n] >= 0 && escDir[n] !== d) continue;
      if ((zc === IN && zn === OUT) || (zc === OUT && zn === IN)) continue;
      if (t + 1 > T) continue;
      emit(K_MOVE, d, n, t + 1, 0);
    }
    if (ed < 0 && t + 1 <= T) emit(K_WAIT, 4, c, t + 1, 0);
    if (isP[c]) {
      const arr = rideOpts[c];
      if (arr) {
        let lastTok = -1;
        for (let q = 0; q < arr.length; q++) {
          const o = arr[q];
          if (o.tok === lastTok) continue;
          if (t + o.dt > T || !trainAt(o.line, o.i, t)) continue;
          lastTok = o.tok;
          emit(K_RIDE, o.tok, o.dest, t + o.dt, o.dkm);
        }
      }
    }
  }

  // ---------- A단계 ----------
  const reach = new Uint8Array((maxTick + 1) * N);
  reach[start] = 1;
  let Tstar = -1;
  for (let t = 0; t <= maxTick && Tstar < 0; t++) {
    const base = t * N;
    for (let c = 0; c < N; c++) if (reach[base + c] && isExit[c]) { Tstar = t; break; }
    if (Tstar >= 0) break;
    for (let c = 0; c < N; c++) {
      if (!reach[base + c]) continue;
      expand(c, t, maxTick);
      for (let q = 0; q < eN; q++) reach[eT2[q] * N + eCell2[q]] = 1;
    }
  }
  if (Tstar < 0) return '불가';

  // ---------- A'단계 ----------
  const good = new Uint8Array((Tstar + 1) * N);
  for (let c = 0; c < N; c++) if (isExit[c] && reach[Tstar * N + c]) good[Tstar * N + c] = 1;
  for (let t = Tstar - 1; t >= 0; t--) {
    const base = t * N;
    for (let c = 0; c < N; c++) {
      if (!reach[base + c] || isExit[c]) continue;
      expand(c, t, Tstar);
      for (let q = 0; q < eN; q++) {
        if (good[eT2[q] * N + eCell2[q]]) { good[base + c] = 1; break; }
      }
    }
  }
  if (!good[start]) return '불가';

  // ---------- B단계 ----------
  // 항목: 라벨이면서 비행 중 항목. t2 = 도착 틱, cell = 최종 칸
  function Item(parent, tok, cell, t2, mode, k, te, closed, b) {
    this.parent = parent; this.tok = tok; this.cell = cell; this.t2 = t2;
    this.mode = mode; this.k = k; this.te = te; this.closed = closed; this.b = b;
    this.dead = false;
  }
  const root = new Item(null, -1, start, 0, M_NONE, 0, 0, 0, 0);

  function lex(ca, ba, cb, bb, aEarlier) {
    return ca < cb || (ca === cb && (ba < bb || (ba === bb && aEarlier)));
  }
  // A가 B를 지배? (같은 틱, 같은 칸)
  function dom(A, B, aEarlier) {
    const ma = A.mode, mb = B.mode;
    if (ma === M_IN || mb === M_IN) {
      if (ma !== mb) return false;
      return A.k <= B.k && lex(A.closed, A.b, B.closed, B.b, aEarlier);
    }
    if (ma === M_OUT && mb === M_OUT) {
      return A.te >= B.te && A.k <= B.k && lex(A.closed, A.b, B.closed, B.b, aEarlier);
    }
    if (ma === M_NONE && mb === M_NONE) return lex(A.closed, A.b, B.closed, B.b, aEarlier);
    if (ma === M_OUT) return lex(A.closed + fare(A.k), A.b, B.closed, B.b, aEarlier);
    return lex(A.closed, A.b, B.closed, B.b, aEarlier);
  }
  function sameKey(A, B) {
    return A.mode === B.mode && A.k === B.k && A.te === B.te && A.closed === B.closed && A.b === B.b;
  }

  const cellLists = new Array(N).fill(null);
  const touched = [];
  let F = [root];
  let maxF = 0, totalItems = 0;
  for (let t = 0; t < Tstar; t++) {
    const next = [];
    for (let fi = 0; fi < F.length; fi++) {
      const it = F[fi];
      if (it.t2 !== t) { next.push(it); continue; }
      expand(it.cell, t, Tstar);
      for (let q = 0; q < eN; q++) {
        const cell2 = eCell2[q], t2 = eT2[q];
        if (!good[t2 * N + cell2]) continue;
        // 요금 적용
        let mode = it.mode, k = it.k, te = it.te, closed = it.closed, b = it.b;
        const kind = eKind[q];
        if (kind === K_RIDE) { k += eDkm[q]; b += 1; }
        else {
          const zl = zone[eLand[q]];
          if (zl === IN && mode !== M_IN) {
            if (mode === M_OUT && t2 - te <= 30) mode = M_IN;
            else {
              if (mode === M_OUT) closed += fare(k);
              mode = M_IN; k = 0;
            }
          } else if (zl === OUT && mode === M_IN) { mode = M_OUT; te = t2; }
        }
        if (eEv[q]) { mode = M_OUT; te = t2; }
        if (mode === M_OUT && t2 - te >= 30) { closed += fare(k); mode = M_NONE; k = 0; te = 0; }
        next.push(new Item(it, eTok[q], cell2, t2, mode, k, te, closed, b));
      }
    }
    // 지배 판정
    for (let i = 0; i < next.length; i++) {
      const x = next[i];
      if (x.t2 !== t + 1) continue;
      let lst = cellLists[x.cell];
      if (lst === null) { lst = cellLists[x.cell] = []; touched.push(x.cell); }
      let xDead = false;
      let w = 0;
      for (let j = 0; j < lst.length; j++) {
        const a = lst[j];
        if (noPrune ? sameKey(a, x) : dom(a, x, true)) { xDead = true; break; }
      }
      if (xDead) { x.dead = true; continue; }
      for (let j = 0; j < lst.length; j++) {
        const a = lst[j];
        if (noPrune ? sameKey(x, a) : dom(x, a, false)) a.dead = true;
        else lst[w++] = a;
      }
      lst.length = w;
      lst.push(x);
    }
    for (let i = 0; i < touched.length; i++) cellLists[touched[i]] = null;
    touched.length = 0;
    const F2 = [];
    for (let i = 0; i < next.length; i++) if (!next[i].dead) F2.push(next[i]);
    F = F2;
    totalItems += F.length;
    if (F.length > maxF) maxF = F.length;
  }
  if (opts.profile) process.stderr.write(`T*=${Tstar} maxF=${maxF} total=${totalItems}\n`);

  // 최종 선택
  let best = null, bestG = 0;
  for (const it of F) {
    if (it.t2 !== Tstar || !isExit[it.cell]) continue;
    const g = it.closed + (it.mode === M_NONE ? 0 : fare(it.k));
    if (best === null || g < bestG || (g === bestG && it.b < best.b)) { best = it; bestG = g; }
  }
  if (best === null) return '불가';
  const out = [];
  for (let p = best; p && p.parent; p = p.parent) out.push(tokens[p.tok]);
  out.reverse();
  return out.join('');
}

module.exports = { solve, fare };

if (require.main === module) {
  const level = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const profile = process.argv.includes('--profile');
  const noPrune = process.argv.includes('--no-prune');
  process.stdout.write(solve(level, { profile, noPrune }) + '\n');
}
