'use strict';
// 막차 러너 풀이기. 설계는 DESIGN.md 참고.
const fs = require('fs');

function fare(k) {
  if (k <= 10) return 1450;
  if (k <= 50) return 1450 + 100 * Math.max(0, Math.ceil((k - 10) / 5 - 1e-9));
  return 2250 + 100 * Math.max(0, Math.ceil((k - 50) / 8 - 1e-9));
}

function solve(level) {
  const grid = level.grid || [];
  const H = grid.length;
  let W = 0;
  for (const r of grid) W = Math.max(W, r.length);
  const N = H * W;
  const N2 = N * 2;
  const T = Math.max(0, Math.floor(Number(level.maxTick)) || 0);
  if (N === 0) return '불가';

  // cat: 0 밖, 1 안, 2 G, 3 벽
  const cat = new Uint8Array(N).fill(3);
  const isE = new Uint8Array(N);
  const arrowDir = new Int8Array(N).fill(-1); // D0 L1 R2 U3
  const isP = new Uint8Array(N);
  let S = -1;
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const ch = c < grid[r].length ? grid[r][c] : '#';
      const i = r * W + c;
      switch (ch) {
        case '.': cat[i] = 1; break;
        case 'P': cat[i] = 1; isP[i] = 1; break;
        case '>': cat[i] = 1; arrowDir[i] = 2; break;
        case '<': cat[i] = 1; arrowDir[i] = 1; break;
        case '^': cat[i] = 1; arrowDir[i] = 3; break;
        case 'v': cat[i] = 1; arrowDir[i] = 0; break;
        case ',': cat[i] = 0; break;
        case 'S': cat[i] = 0; if (S < 0) S = i; break;
        case 'E': cat[i] = 0; isE[i] = 1; break;
        case 'G': cat[i] = 2; break;
        default: cat[i] = 3;
      }
    }
  }
  if (S < 0) return '불가';
  let anyE = false;
  for (let i = 0; i < N; i++) if (isE[i]) anyE = true;
  if (!anyE) return '불가';

  const nb = new Int32Array(N * 4).fill(-1);
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (r + 1 < H) nb[i * 4 + 0] = i + W;
      if (c > 0) nb[i * 4 + 1] = i - 1;
      if (c + 1 < W) nb[i * 4 + 2] = i + 1;
      if (r > 0) nb[i * 4 + 3] = i - W;
    }
  }

  // 방(강제 퇴장)
  const roomsOfCell = new Array(N).fill(null);
  const rooms = level.rooms || [];
  const roomClose = [];
  const roomEvict = [];
  for (let ri = 0; ri < rooms.length; ri++) {
    const rm = rooms[ri];
    const rect = rm.rect || [0, 0, -1, -1];
    const close = rm.close === undefined || rm.close === null ? Infinity : Number(rm.close);
    roomClose.push(close);
    let ev = -1;
    if (Array.isArray(rm.evict)) {
      const er = rm.evict[0], ec = rm.evict[1];
      if (Number.isInteger(er) && Number.isInteger(ec) && er >= 0 && er < H && ec >= 0 && ec < W) ev = er * W + ec;
    }
    roomEvict.push(ev);
    for (let r = Math.max(0, rect[0]); r <= Math.min(H - 1, rect[2]); r++) {
      for (let c = Math.max(0, rect[1]); c <= Math.min(W - 1, rect[3]); c++) {
        const i = r * W + c;
        if (cat[i] !== 1) continue;
        if (!roomsOfCell[i]) roomsOfCell[i] = [];
        roomsOfCell[i].push(ri);
      }
    }
  }
  // 첫 번째로 닫힌 방의 evict 칸, 없으면 -1
  function evictOf(t, c) {
    const rl = roomsOfCell[c];
    if (rl === null) return -1;
    for (let q = 0; q < rl.length; q++) {
      if (t >= roomClose[rl[q]]) return roomEvict[rl[q]];
    }
    return -1;
  }

  // 노선
  const tokStr = ['D', 'L', 'R', 'U', 'W'];
  const entriesAt = new Array(N).fill(null);
  let hasZero = false;
  let maxMoves = 5;
  const lines = level.lines || [];
  for (const ln of lines) {
    const st = ln.stations || [];
    const n = st.length;
    if (n < 2) continue;
    const cum = [0], cumKm = [0];
    for (let i = 1; i < n; i++) {
      cum.push(cum[i - 1] + (Number((ln.travel || [])[i - 1]) || 0));
      cumKm.push(cumKm[i - 1] + (Number((ln.km || [])[i - 1]) || 0));
    }
    const cellOf = st.map((s) => {
      const a = s.at;
      if (!Array.isArray(a)) return -1;
      const r = a[0], c = a[1];
      if (!Number.isInteger(r) || !Number.isInteger(c) || r < 0 || r >= H || c < 0 || c >= W) return -1;
      const i = r * W + c;
      return isP[i] ? i : -1;
    });
    const tokOfJ = new Array(n).fill(-1);
    const first = Number(ln.first), last = Number(ln.last), headway = Number(ln.headway);
    if (!(first <= last)) continue; // 열차 없음
    for (let i = 0; i < n - 1; i++) {
      if (cellOf[i] < 0) continue;
      const seen = new Set();
      const targets = [];
      for (let j = i + 1; j < n; j++) {
        const nm = st[j].name;
        if (seen.has(nm)) continue;
        seen.add(nm);
        if (cellOf[j] < 0) continue;
        const off = cum[j] - cum[i];
        if (!(off >= 0) || !Number.isInteger(off)) continue;
        if (off === 0) hasZero = true;
        let dk = 0;
        for (let q = i; q < j; q++) dk += Number((ln.km || [])[q]) || 0;
        if (tokOfJ[j] < 0) {
          tokOfJ[j] = tokStr.length;
          tokStr.push('[' + ln.id + '>' + nm + ']');
        }
        targets.push({ tcell: cellOf[j], off, dk, tok: tokOfJ[j] });
      }
      if (!targets.length) continue;
      const c = cellOf[i];
      if (!entriesAt[c]) entriesAt[c] = [];
      entriesAt[c].push({ cum: cum[i], first, last, headway, targets });
    }
  }
  for (let c = 0; c < N; c++) {
    if (!entriesAt[c]) continue;
    let s = 5;
    for (const e of entriesAt[c]) s += e.targets.length;
    if (s > maxMoves) maxMoves = s;
  }

  // ---- 공용 전이 함수 ----
  const mvT = new Int32Array(maxMoves);
  const mvC = new Int32Array(maxMoves);
  const mvS = new Uint8Array(maxMoves);
  const mvEnter = new Uint8Array(maxMoves);
  const mvExit = new Uint8Array(maxMoves);
  const mvRide = new Uint8Array(maxMoves);
  const mvDk = new Float64Array(maxMoves);
  const mvTok = new Int32Array(maxMoves);
  let nmv = 0;

  function push(nt, d, side, tok, dk, ride) {
    let s = side, enter = 0, exit = 0, nc = d;
    const k = cat[d];
    if (k === 1) {
      if (s === 0) enter = 1;
      s = 1;
      const ev = evictOf(nt, d);
      if (ev >= 0) { exit = 1; nc = ev; s = 0; }
    } else if (k === 0) {
      if (s === 1) exit = 1;
      s = 0;
    }
    const q = nmv++;
    mvT[q] = nt; mvC[q] = nc; mvS[q] = s; mvEnter[q] = enter; mvExit[q] = exit;
    mvRide[q] = ride; mvDk[q] = dk; mvTok[q] = tok;
  }

  // (t, c, side) 에서 가능한 모든 전이를 mv* 에 채우고 개수를 반환
  function genMoves(t, c, side) {
    nmv = 0;
    if (cat[c] === 3 || isE[c]) return 0;
    if (t < maxTickG) {
      const nt = t + 1;
      const sd = arrowDir[c];
      const cc = cat[c];
      for (let dir = 0; dir < 4; dir++) {
        if (sd >= 0 && dir !== sd) continue;
        const d = nb[c * 4 + dir];
        if (d < 0) continue;
        const cd = cat[d];
        if (cd === 3) continue;
        if ((cc === 0 && cd === 1) || (cc === 1 && cd === 0)) continue;
        const ad = arrowDir[d];
        if (ad >= 0 && ad !== dir) continue;
        push(nt, d, side, dir, 0, 0);
      }
      if (sd < 0) push(nt, c, side, 4, 0, 0);
    }
    const es = entriesAt[c];
    if (es !== null && side === 1) {
      for (let a = 0; a < es.length; a++) {
        const e = es[a];
        const d = t - e.cum;
        if (d < e.first || d > e.last) continue;
        if (e.headway > 0) { if ((d - e.first) % e.headway !== 0) continue; }
        else if (d !== e.first) continue;
        const tg = e.targets;
        for (let b = 0; b < tg.length; b++) {
          const nt = t + tg[b].off;
          if (nt > maxTickG) continue;
          push(nt, tg[b].tcell, 1, tg[b].tok, tg[b].dk, 1);
        }
      }
    }
    return nmv;
  }
  const maxTickG = T;

  // 라벨 갱신 함수 (결과는 nm, nte, nF, nk, nB)
  let nm = 0, nte = 0, nF = 0, nk = 0, nB = 0;
  function childLabel(m, te, F, k, B, q) {
    const nt = mvT[q];
    if (mvEnter[q]) {
      if (m === 0) { m = 1; k = 0; te = 0; }
      else if (m === 2) {
        if (nt - te <= 30) { m = 1; te = 0; }
        else { F += fare(k); m = 1; k = 0; te = 0; }
      }
    }
    k += mvDk[q];
    B += mvRide[q];
    if (mvExit[q] && m === 1) { m = 2; te = nt; }
    if (m === 2 && nt - te > 30) { F += fare(k); m = 0; }
    if (m === 0) { te = 0; k = 0; }
    else if (m === 1) te = 0;
    nm = m; nte = te; nF = F; nk = k; nB = B;
  }

  // ---- 1. 도달성 ----
  const NS = (T + 1) * N;
  const R = new Uint8Array(NS);
  const tickHeadR = new Int32Array(T + 1).fill(-1);
  const tnextR = new Int32Array(NS);
  R[S] = 1;
  tickHeadR[0] = S;
  tnextR[S] = -1;
  let Tstar = Infinity;
  for (let t = 0; t <= T && t <= Tstar; t++) {
    while (tickHeadR[t] >= 0) {
      const idx = tickHeadR[t];
      tickHeadR[t] = tnextR[idx];
      const c = idx - t * N;
      const n = genMoves(t, c, cat[c] === 1 ? 1 : 0);
      for (let q = 0; q < n; q++) {
        const nt = mvT[q], nc = mvC[q];
        const ni = nt * N + nc;
        if (R[ni]) continue;
        R[ni] = 1;
        if (isE[nc] && nt < Tstar) Tstar = nt;
        tnextR[ni] = tickHeadR[nt];
        tickHeadR[nt] = ni;
      }
    }
  }
  if (Tstar === Infinity) return '불가';

  // ---- 2. 역방향 유용성 ----
  const U = new Uint8Array((Tstar + 1) * N);
  for (let c = 0; c < N; c++) if (isE[c] && R[Tstar * N + c]) U[Tstar * N + c] = 1;
  for (let t = Tstar; t >= 0; t--) {
    let changed = true;
    while (changed) {
      changed = false;
      const base = t * N;
      for (let c = 0; c < N; c++) {
        if (!R[base + c] || U[base + c]) continue;
        const n = genMoves(t, c, cat[c] === 1 ? 1 : 0);
        for (let q = 0; q < n; q++) {
          if (mvT[q] <= Tstar && U[mvT[q] * N + mvC[q]]) { U[base + c] = 1; changed = true; break; }
        }
      }
      if (!hasZero) break;
    }
  }
  if (!U[S]) return '불가';

  // ---- 3. 라벨 DP ----
  let cap = 1 << 16;
  let lmode = new Uint8Array(cap), lte = new Int32Array(cap), lF = new Int32Array(cap);
  let lk = new Float64Array(cap), lB = new Int32Array(cap), lnext = new Int32Array(cap);
  let lalive = new Uint8Array(cap), lgood = new Uint8Array(cap), lkey = new Int32Array(cap);
  let ltick = new Int32Array(cap), tn = new Int32Array(cap);
  let nl = 0;
  function grow() {
    cap *= 2;
    const g = (A, C) => { const x = new C(cap); x.set(A); return x; };
    lmode = g(lmode, Uint8Array); lte = g(lte, Int32Array); lF = g(lF, Int32Array);
    lk = g(lk, Float64Array); lB = g(lB, Int32Array); lnext = g(lnext, Int32Array);
    lalive = g(lalive, Uint8Array); lgood = g(lgood, Uint8Array); lkey = g(lkey, Int32Array);
    ltick = g(ltick, Int32Array); tn = g(tn, Int32Array);
  }
  const head = new Int32Array((Tstar + 1) * N2).fill(-1);
  const tickHead = new Int32Array(Tstar + 1).fill(-1);

  // a 가 b 를 지배하여 b 를 제거해도 되는가
  function removes(m, teA, FA, kA, BA, teB, FB, kB, BB) {
    if (m === 2 && teA < teB) return false;
    if (FA > FB || kA > kB || BA > BB) return false;
    if (FA < FB || BA < BB) return true;
    return kA === kB && (m !== 2 || teA === teB);
  }

  function addLabel(t, key, m, te, F, k, B) {
    const hi = t * N2 + key;
    let p = head[hi];
    while (p >= 0) {
      if (lmode[p] === m && removes(m, lte[p], lF[p], lk[p], lB[p], te, F, k, B)) return;
      p = lnext[p];
    }
    let prev = -1;
    p = head[hi];
    while (p >= 0) {
      const nx = lnext[p];
      if (lmode[p] === m && removes(m, te, F, k, B, lte[p], lF[p], lk[p], lB[p])) {
        lalive[p] = 0;
        if (prev < 0) head[hi] = nx; else lnext[prev] = nx;
      } else prev = p;
      p = nx;
    }
    if (nl >= cap) grow();
    const id = nl++;
    lmode[id] = m; lte[id] = te; lF[id] = F; lk[id] = k; lB[id] = B;
    lalive[id] = 1; lgood[id] = 0; lkey[id] = key; ltick[id] = t;
    lnext[id] = head[hi]; head[hi] = id;
    tn[id] = tickHead[t]; tickHead[t] = id;
  }
  function findLabel(t, key, m, te, F, k, B) {
    let p = head[t * N2 + key];
    while (p >= 0) {
      if (lmode[p] === m && lF[p] === F && lB[p] === B && lk[p] === k && (m !== 2 || lte[p] === te)) return p;
      p = lnext[p];
    }
    return -1;
  }

  addLabel(0, S * 2, 0, 0, 0, 0, 0);
  for (let t = 0; t <= Tstar; t++) {
    while (tickHead[t] >= 0) {
      const p = tickHead[t];
      tickHead[t] = tn[p];
      if (!lalive[p]) continue;
      const c = lkey[p] >> 1, side = lkey[p] & 1;
      const n = genMoves(t, c, side);
      const m = lmode[p], te = lte[p], F = lF[p], k = lk[p], B = lB[p];
      for (let q = 0; q < n; q++) {
        const nt = mvT[q];
        if (nt > Tstar || !U[nt * N + mvC[q]]) continue;
        childLabel(m, te, F, k, B, q);
        addLabel(nt, mvC[q] * 2 + mvS[q], nm, nte, nF, nk, nB);
      }
    }
  }

  // ---- 4. 목표값 ----
  let bestF = Infinity, bestB = Infinity;
  const total = (p) => lF[p] + (lmode[p] === 2 ? fare(lk[p]) : 0);
  for (let c = 0; c < N; c++) {
    if (!isE[c]) continue;
    for (let s = 0; s < 2; s++) {
      for (let p = head[Tstar * N2 + c * 2 + s]; p >= 0; p = lnext[p]) {
        if (!lalive[p]) continue;
        const tf = total(p);
        if (tf < bestF || (tf === bestF && lB[p] < bestB)) { bestF = tf; bestB = lB[p]; }
      }
    }
  }
  if (bestF === Infinity) return '불가';
  const isGoal = new Uint8Array(cap);
  for (let c = 0; c < N; c++) {
    if (!isE[c]) continue;
    for (let s = 0; s < 2; s++) {
      for (let p = head[Tstar * N2 + c * 2 + s]; p >= 0; p = lnext[p]) {
        if (lalive[p] && total(p) === bestF && lB[p] === bestB) { lgood[p] = 1; isGoal[p] = 1; }
      }
    }
  }

  // ---- 5. good 역전파 ----
  // 틱별 정렬 (살아 있는 라벨만)
  const cnt = new Int32Array(Tstar + 2);
  for (let p = 0; p < nl; p++) if (lalive[p]) cnt[ltick[p] + 1]++;
  for (let t = 0; t <= Tstar; t++) cnt[t + 1] += cnt[t];
  const order = new Int32Array(cnt[Tstar + 1]);
  const fillp = cnt.slice();
  for (let p = 0; p < nl; p++) if (lalive[p]) order[fillp[ltick[p]]++] = p;

  function hasGoodChild(p, collect) {
    const t = ltick[p];
    const c = lkey[p] >> 1, side = lkey[p] & 1;
    const n = genMoves(t, c, side);
    const m = lmode[p], te = lte[p], F = lF[p], k = lk[p], B = lB[p];
    let found = false;
    for (let q = 0; q < n; q++) {
      const nt = mvT[q];
      if (nt > Tstar || !U[nt * N + mvC[q]]) continue;
      childLabel(m, te, F, k, B, q);
      const id = findLabel(nt, mvC[q] * 2 + mvS[q], nm, nte, nF, nk, nB);
      if (id >= 0 && lgood[id]) {
        if (!collect) return true;
        found = true;
      }
    }
    return found;
  }
  for (let t = Tstar; t >= 0; t--) {
    let changed = true;
    while (changed) {
      changed = false;
      for (let i = cnt[t]; i < cnt[t + 1]; i++) {
        const p = order[i];
        if (lgood[p]) continue;
        if (hasGoodChild(p, false)) { lgood[p] = 1; changed = true; }
      }
      if (!hasZero) break;
    }
  }

  // ---- 6. 사전순 탐욕 추출 ----
  const start = findLabel(0, S * 2, 0, 0, 0, 0, 0);
  if (start < 0 || !lgood[start]) return '불가';
  let frontier = [{ id: start, rem: '' }];
  let out = '';
  for (;;) {
    for (const it of frontier) if (it.rem === '' && isGoal[it.id]) return out;
    const next = [];
    const seen = new Set();
    const add = (id, rem) => {
      const key = id + '|' + rem;
      if (seen.has(key)) return;
      seen.add(key);
      next.push({ id, rem });
    };
    for (const it of frontier) {
      if (it.rem !== '') { add(it.id, it.rem); continue; }
      const p = it.id;
      const t = ltick[p];
      const n = genMoves(t, lkey[p] >> 1, lkey[p] & 1);
      const m = lmode[p], te = lte[p], F = lF[p], k = lk[p], B = lB[p];
      const toks = [], cids = [];
      for (let q = 0; q < n; q++) {
        const nt = mvT[q];
        if (nt > Tstar || !U[nt * N + mvC[q]]) continue;
        childLabel(m, te, F, k, B, q);
        const id = findLabel(nt, mvC[q] * 2 + mvS[q], nm, nte, nF, nk, nB);
        if (id >= 0 && lgood[id]) { toks.push(tokStr[mvTok[q]]); cids.push(id); }
      }
      for (let i = 0; i < toks.length; i++) add(cids[i], toks[i]);
    }
    if (!next.length) return '불가';
    let minCh = next[0].rem[0];
    for (const it of next) if (it.rem[0] < minCh) minCh = it.rem[0];
    frontier = [];
    const seen2 = new Set();
    for (const it of next) {
      if (it.rem[0] !== minCh) continue;
      const rem = it.rem.slice(1);
      const key = it.id + '|' + rem;
      if (seen2.has(key)) continue;
      seen2.add(key);
      frontier.push({ id: it.id, rem });
    }
    out += minCh;
  }
}

function main() {
  const file = process.argv[2];
  if (!file) { console.error('usage: node solver.js <level.json>'); process.exit(2); }
  const level = JSON.parse(fs.readFileSync(file, 'utf8'));
  console.log(solve(level));
}

main();
