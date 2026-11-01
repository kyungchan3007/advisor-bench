// 막차 러너 기준 엔진 — 시뮬레이터(판정) + 기준 풀이(정답 생성). 모델에게는 주지 않는다.

export const INSIDE = new Set(['.', 'P', '>', '<', '^', 'v']);
export const OUTSIDE = new Set([',', 'S', 'E']);
export const WINDOW = 30;
const ARROW = { '>': 'R', '<': 'L', '^': 'U', v: 'D' };
const DIRS = { D: [1, 0], L: [0, -1], R: [0, 1], U: [-1, 0] };
const MOVE_ORDER = ['D', 'L', 'R', 'U', 'W']; // 문자열 사전순

export function fare(km) {
  if (km <= 10) return 1450;
  if (km <= 50) return 1450 + Math.ceil((km - 10) / 5) * 100;
  return 1450 + 800 + Math.ceil((km - 50) / 8) * 100;
}

export function parseLevel(level) {
  const grid = level.grid.map((row) => [...row]);
  const H = grid.length;
  const W = grid[0].length;
  let start;
  let goal;
  for (let r = 0; r < H; r++) {
    if (grid[r].length !== W) throw new Error(`row ${r} width`);
    for (let c = 0; c < W; c++) {
      if (grid[r][c] === 'S') start = [r, c];
      if (grid[r][c] === 'E') goal = [r, c];
    }
  }
  // 승강장 칸 → 그 칸에 서는 (노선, 역 순번) 목록
  const platforms = new Map();
  const lines = level.lines.map((l) => {
    const cum = [0];
    for (const t of l.travel) cum.push(cum.at(-1) + t);
    const kmc = [0];
    for (const k of l.km) kmc.push(kmc.at(-1) + k);
    if (cum.length !== l.stations.length) throw new Error(`line ${l.id} travel length`);
    const deps = [];
    for (let d = l.first; d <= l.last; d += l.headway) deps.push(d);
    const line = { ...l, cum, kmc, deps };
    l.stations.forEach((s, i) => {
      const [r, c] = s.at;
      if (grid[r][c] !== 'P') throw new Error(`line ${l.id} ${s.name} not on P`);
      const key = r * W + c;
      if (!platforms.has(key)) platforms.set(key, []);
      platforms.get(key).push({ line, i });
    });
    return line;
  });
  // 역 방: 안 칸 → 역 (폐쇄 틱 · 강제 퇴장 칸)
  const rooms = level.rooms ?? [];
  const roomAt = new Int32Array(H * W).fill(-1);
  rooms.forEach((room, k) => {
    const [r0, c0, r1, c1] = room.rect;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (INSIDE.has(grid[r][c])) roomAt[r * W + c] = k;
    const [er, ec] = room.evict;
    if (!OUTSIDE.has(grid[er][ec])) throw new Error(`room ${room.name} evict not outside`);
  });
  return { name: level.name, grid, H, W, start, goal, lines, platforms, rooms, roomAt, maxTick: level.maxTick };
}

// 틱 t가 끝났을 때 이 칸에 있으면 쫓겨나는가 → 강제 퇴장 칸, 아니면 null
export function evictAt(L, r, c, t) {
  const k = L.roomAt[r * L.W + c];
  if (k < 0) return null;
  const room = L.rooms[k];
  return t >= room.close ? room.evict : null;
}

// 열차가 이 역에 서는 시각이 t인가
function trainAt(line, i, t) {
  const d = t - line.cum[i];
  if (d < line.first || d > line.last) return false;
  return (d - line.first) % line.headway === 0;
}

// 한 칸 이동 가능 여부 (에스컬레이터 · 벽 · 안팎 직접 이동 금지)
function canStep(L, r, c, dir) {
  const from = L.grid[r][c];
  const [dr, dc] = DIRS[dir];
  const nr = r + dr;
  const nc = c + dc;
  if (nr < 0 || nc < 0 || nr >= L.H || nc >= L.W) return null;
  const to = L.grid[nr][nc];
  if (to === '#') return null;
  if (ARROW[from] && ARROW[from] !== dir) return null;
  if (ARROW[to] && ARROW[to] !== dir) return null;
  if ((INSIDE.has(from) && OUTSIDE.has(to)) || (OUTSIDE.has(from) && INSIDE.has(to))) return null;
  return [nr, nc];
}

// 행동 문자열 → 토큰
export function tokenize(actions) {
  const out = [];
  let i = 0;
  while (i < actions.length) {
    const ch = actions[i];
    if (ch === '[') {
      const j = actions.indexOf(']', i);
      if (j < 0) throw new Error('unclosed [');
      const body = actions.slice(i + 1, j);
      const k = body.indexOf('>');
      out.push({ board: true, line: body.slice(0, k), to: body.slice(k + 1) });
      i = j + 1;
    } else if ('DLRUW'.includes(ch)) {
      out.push({ move: ch });
      i++;
    } else if (/\s/.test(ch)) i++;
    else throw new Error(`bad char ${ch}`);
  }
  return out;
}

// 판정: 행동 문자열을 돌려 도착 틱 · 요금 · 승차 횟수와 궤적을 낸다
export function simulate(level, actions) {
  const L = level.grid ? (level.platforms ? level : parseLevel(level)) : level;
  let [r, c] = L.start;
  let t = 0;
  let paid = false;
  let dist = -1; // 열린 통행의 거리 (-1 = 없음)
  let exitAt = null;
  let fin = 0;
  let boardings = 0;
  const trace = [{ t, r, c, ev: 'start' }];
  const fail = (msg) => ({ ok: false, error: msg, tick: t, trace });
  const evict = () => {
    const to = paid ? evictAt(L, r, c, t) : null;
    if (!to) return;
    [r, c] = to;
    paid = false;
    exitAt = t;
    trace.push({ t, r, c, ev: 'evict' });
  };
  const closeIfExpired = () => {
    if (!paid && dist >= 0 && t - exitAt > WINDOW) {
      fin += fare(dist);
      dist = -1;
    }
  };
  let toks;
  try {
    toks = tokenize(actions);
  } catch (e) {
    return fail(e.message);
  }
  for (const tok of toks) {
    if (r === L.goal[0] && c === L.goal[1]) return fail('action after goal');
    if (tok.move) {
      if (tok.move === 'W') {
        if (ARROW[L.grid[r][c]]) return fail('wait on escalator');
        t++;
        closeIfExpired();
        trace.push({ t, r, c, ev: 'wait' });
        evict();
        continue;
      }
      const nxt = canStep(L, r, c, tok.move);
      if (!nxt) return fail(`blocked ${tok.move} at ${r},${c} t=${t}`);
      [r, c] = nxt;
      t++;
      closeIfExpired();
      const cell = L.grid[r][c];
      let ev = 'move';
      if (!paid && INSIDE.has(cell)) {
        paid = true;
        if (dist < 0) dist = 0;
        ev = 'enter';
      } else if (paid && OUTSIDE.has(cell)) {
        paid = false;
        exitAt = t;
        ev = 'exit';
      }
      trace.push({ t, r, c, ev });
      evict();
    } else {
      if (!paid) return fail('board outside gates');
      const here = (L.platforms.get(r * L.W + c) ?? []).filter((x) => x.line.id === tok.line);
      if (!here.length) return fail(`no line ${tok.line} at ${r},${c}`);
      const p = here.find((x) => trainAt(x.line, x.i, t));
      if (!p) return fail(`no train ${tok.line} at t=${t}`);
      const j = p.line.stations.findIndex((s, k) => k > p.i && s.name === tok.to);
      if (j < 0) return fail(`no stop ${tok.to} after on ${tok.line}`);
      dist += p.line.kmc[j] - p.line.kmc[p.i];
      t += p.line.cum[j] - p.line.cum[p.i];
      [r, c] = p.line.stations[j].at;
      boardings++;
      trace.push({ t, r, c, ev: 'ride', line: tok.line, to: tok.to });
      evict();
    }
    if (t > L.maxTick) return fail('over maxTick');
  }
  if (r !== L.goal[0] || c !== L.goal[1]) return fail('not at goal');
  if (dist >= 0) fin += fare(dist);
  return { ok: true, tick: t, fare: fin, boardings, trace };
}

// ---- 기준 풀이 ----
// 1) (칸, 안팎, 틱)으로 앞으로 펼쳐 가장 이른 도착 틱 T*를 찾는다 (요금과 무관)
// 2) 뒤에서부터 T*에 E로 갈 수 있는 (칸, 안팎, 틱)만 남긴다
// 3) 남은 상태만 (칸, 안팎, 열린 통행 거리, 재입장 남은 틱)으로 정확히 펼치며
//    같은 상태는 (확정 요금, 승차 횟수, 문자열) 사전순으로 가장 좋은 것만 남긴다
// opts.naive 로 일부러 틀린 가정을 넣어 함정 레벨을 고른다:
//   no-evict (강제 퇴장 칸으로 안 감) · no-reentry (한 번 나가면 다시 못 들어감)
//   no-window (30틱 재입장 무시) · no-last (막차 무시)

// (r,c,paid,t)에서 한 행동 → 다음 위치들
function moveList(L, r, c, paid) {
  L._mv ??= new Map();
  const key = (r * L.W + c) * 2 + (paid ? 1 : 0);
  let list = L._mv.get(key);
  if (list) return list;
  list = [];
  const cell = L.grid[r][c];
  for (const mv of MOVE_ORDER) {
    let nr = r;
    let nc = c;
    if (mv === 'W') {
      if (ARROW[cell]) continue;
    } else {
      const nxt = canStep(L, r, c, mv);
      if (!nxt) continue;
      [nr, nc] = nxt;
    }
    const to = L.grid[nr][nc];
    const enter = !paid && INSIDE.has(to);
    const exit = paid && OUTSIDE.has(to);
    list.push({ mv, nr, nc, np: enter ? true : exit ? false : paid, enter, exit, room: L.roomAt[nr * L.W + nc] });
  }
  L._mv.set(key, list);
  return list;
}

function steps(L, r, c, paid, t, naive) {
  const out = [];
  const cell = L.grid[r][c];
  for (const m of moveList(L, r, c, paid)) {
    let nr = m.nr;
    let nc = m.nc;
    let np = m.np;
    let exit = m.exit;
    if (np && m.room >= 0 && t + 1 >= L.rooms[m.room].close) {
      if (naive === 'no-evict') continue;
      [nr, nc] = L.rooms[m.room].evict;
      np = false;
      exit = true;
    }
    out.push({ tok: m.mv, r: nr, c: nc, paid: np, t: t + 1, km: 0, enter: m.enter, exit });
  }
  if (paid && cell === 'P') {
    for (const { line, i } of L.platforms.get(r * L.W + c)) {
      const d = t - line.cum[i];
      const ok = d >= line.first && (d - line.first) % line.headway === 0 && (naive === 'no-last' || d <= line.last);
      if (!ok) continue;
      for (let j = i + 1; j < line.stations.length; j++) {
        // 같은 이름이 뒤에 또 있으면 가장 가까운 것만 (판정과 같게)
        if (line.stations.findIndex((s, k) => k > i && s.name === line.stations[j].name) !== j) continue;
        const nt = t + line.cum[j] - line.cum[i];
        let [nr, nc] = line.stations[j].at;
        let np = true;
        let exit = false;
        const ev = evictAt(L, nr, nc, nt);
        if (ev) {
          if (naive === 'no-evict') continue;
          [nr, nc] = ev;
          np = false;
          exit = true;
        }
        out.push({ tok: `[${line.id}>${line.stations[j].name}]`, r: nr, c: nc, paid: np, t: nt, km: line.kmc[j] - line.kmc[i], enter: false, exit, ride: true });
      }
    }
  }
  return out;
}

export function solve(level, opts = {}) {
  const L = level.platforms ? level : parseLevel(level);
  const naive = opts.naive ?? null;
  const N = L.H * L.W;
  const X = naive === 'no-reentry' ? 2 : 1; // 나간 적 있음 표시 (틀린 가정용)
  const idx = (r, c, p, ex) => ((r * L.W + c) * 2 + (p ? 1 : 0)) * X + (X === 2 && ex ? 1 : 0);
  const S = N * 2 * X;
  const T = L.maxTick;
  const [gr, gc] = L.goal;

  // 1) 앞으로: reach[t]
  const reach = Array.from({ length: T + 1 }, () => null);
  const layer = (t) => (reach[t] ??= new Uint8Array(S));
  layer(0)[idx(L.start[0], L.start[1], false, false)] = 1;
  let Tstar = -1;
  for (let t = 0; t <= T && Tstar < 0; t++) {
    const cur = reach[t];
    if (!cur) continue;
    for (let k = 0; k < S; k++) {
      if (!cur[k]) continue;
      const ex = k % X;
      const p = Math.floor(k / X) % 2;
      const cellI = Math.floor(k / X / 2);
      const r = Math.floor(cellI / L.W);
      const c = cellI % L.W;
      if (r === gr && c === gc) {
        Tstar = t;
        break;
      }
      if (r === gr && c === gc) continue;
      for (const st of steps(L, r, c, p === 1, t, naive)) {
        if (st.t > T) continue;
        if (naive === 'no-reentry' && ex && st.enter) continue;
        layer(st.t)[idx(st.r, st.c, st.paid, ex || st.exit)] = 1;
      }
    }
  }
  if (opts.debug) console.error('T*', Tstar);
  if (Tstar < 0) return { found: false, actions: '불가' };

  // 2) 뒤로: good[t] = T*에 E에 닿을 수 있는 상태
  const good = Array.from({ length: Tstar + 1 }, () => null);
  good[Tstar] = new Uint8Array(S);
  for (let p = 0; p < 2; p++) for (let ex = 0; ex < X; ex++) if (reach[Tstar][idx(gr, gc, p, ex)]) good[Tstar][idx(gr, gc, p, ex)] = 1;
  for (let t = Tstar - 1; t >= 0; t--) {
    const cur = reach[t];
    if (!cur) continue;
    const g = (good[t] = new Uint8Array(S));
    for (let k = 0; k < S; k++) {
      if (!cur[k]) continue;
      const ex = k % X;
      const p = Math.floor(k / X) % 2;
      const cellI = Math.floor(k / X / 2);
      const r = Math.floor(cellI / L.W);
      const c = cellI % L.W;
      if (r === gr && c === gc) continue;
      for (const st of steps(L, r, c, p === 1, t, naive)) {
        if (st.t > Tstar || !good[st.t]) continue;
        if (naive === 'no-reentry' && ex && st.enter) continue;
        if (good[st.t][idx(st.r, st.c, st.paid, ex || st.exit)]) {
          g[k] = 1;
          break;
        }
      }
    }
  }

  if (opts.debug) console.error('good done');
  // 3) 정확한 요금 상태로 앞으로
  // 라벨 = (확정 요금 fin, 승차 b, 열린 통행 거리 d, 재입장 남은 틱 w, 문자열 s)
  // 같은 (칸, 안팎) 안에서 A가 B를 지배하면 B를 버린다:
  //   fin·b·d는 작거나 같고, w는 크거나 같고(통행 열림 여부는 같아야), 문자열은 사전순 앞
  //   (요금은 거리에 단조 · 합치는 게 따로 내는 것보다 안 비쌈 → A의 어떤 이어가기도 B보다 나쁘지 않다)
  const dominates = (A, B) =>
    (A.d >= 0) === (B.d >= 0) && A.fin <= B.fin && A.b <= B.b && A.d <= B.d && A.w >= B.w && A.s <= B.s;
  const layers = Array.from({ length: Tstar + 1 }, () => new Map());
  const put = (t, gkey, lab) => {
    const m = layers[t];
    let list = m.get(gkey);
    if (!list) m.set(gkey, (list = []));
    for (const x of list) if (dominates(x, lab)) return;
    for (let i = list.length - 1; i >= 0; i--) if (dominates(lab, list[i])) list.splice(i, 1);
    list.push(lab);
  };
  // 그룹 키: r,c,paid,ex
  put(0, `${L.start[0]},${L.start[1]},0,0`, { fin: 0, b: 0, d: -1, w: -1, s: '' });
  for (let t = 0; t < Tstar; t++) {
    for (const [gkey, list] of layers[t]) {
      const [r, c, p, ex] = gkey.split(',').map(Number);
      const st0 = steps(L, r, c, p === 1, t, naive);
      for (const v of list) {
        for (const st of st0) {
          if (st.t > Tstar || !good[st.t]) continue;
          if (naive === 'no-reentry' && ex && st.enter) continue;
          const nex = ex || (st.exit && X === 2) ? 1 : 0;
          if (!good[st.t][idx(st.r, st.c, st.paid, nex)]) continue;
          let nd = v.d;
          let nw = v.w;
          let fin = v.fin;
          if (p === 0 && nd >= 0) {
            nw = naive === 'no-window' ? -1 : v.w - (st.t - t);
            if (nw < 0) {
              fin += fare(nd);
              nd = -1;
              nw = -1;
            }
          }
          if (st.enter) {
            if (nd < 0) nd = 0;
            nw = -1;
          }
          nd = nd >= 0 ? nd + st.km : nd;
          if (st.exit) nw = WINDOW;
          if (st.paid) nw = -1;
          put(st.t, `${st.r},${st.c},${st.paid ? 1 : 0},${nex}`, { fin, b: v.b + (st.ride ? 1 : 0), d: nd, w: nw, s: v.s + st.tok });
        }
      }
    }
    if (opts.debug && t % 20 === 0) console.error('t', t, layers[t].size, [...layers[t].values()].reduce((a, l) => a + l.length, 0));
    layers[t] = null;
  }
  const better = (a, b) => (a.fin !== b.fin ? a.fin < b.fin : a.b !== b.b ? a.b < b.b : a.s < b.s);
  let best = null;
  for (const [gkey, list] of layers[Tstar]) {
    const [r, c] = gkey.split(',').map(Number);
    if (r !== gr || c !== gc) continue;
    for (const v of list) {
      const cand = { fin: v.fin + (v.d >= 0 ? fare(v.d) : 0), b: v.b, s: v.s };
      if (!best || better(cand, best)) best = cand;
    }
  }
  return { found: true, tick: Tstar, fare: best.fin, boardings: best.b, actions: best.s };
}
