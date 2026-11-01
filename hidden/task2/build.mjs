// 레벨 만들기 — 블록 격자 위에 역(방) · 건물 · 거리를 깔고 노선을 잇는다.
//
// spec:
//   name, blocks: [행, 열], bh, bw (블록 크기), maxTick
//   stations: { 이름: { at: [블록행, 블록열], gates: 'NSWE' 일부, esc: true면 한 방향 에스컬레이터 } }
//   parks: [[블록행, 블록열]]  — 건물 대신 거리로 비워 둘 블록
//   lines: [{ n, color, stops: [역 이름], speed, first, headway, last, loop, oneway, travel? }]
//   start / goal: { near: 역 이름, side: 'N'|'S'|'W'|'E' }  — 그 역 출입구 앞 거리 칸

export function buildLevel(spec) {
  const [BR, BC] = spec.blocks;
  const bh = spec.bh ?? 5;
  const bw = spec.bw ?? 7;
  const H = BR * (bh + 1) + 1;
  const W = BC * (bw + 1) + 1;
  const g = Array.from({ length: H }, () => Array(W).fill(','));
  const top = (br) => 1 + br * (bh + 1);
  const left = (bc) => 1 + bc * (bw + 1);
  const parks = new Set((spec.parks ?? []).map(([a, b]) => `${a},${b}`));
  const pockets = new Set((spec.pockets ?? []).map(([a, b]) => `${a},${b}`));
  const roomOf = new Map();
  for (const [name, st] of Object.entries(spec.stations)) roomOf.set(`${st.at[0]},${st.at[1]}`, name);

  for (let br = 0; br < BR; br++) {
    for (let bc = 0; bc < BC; bc++) {
      if (parks.has(`${br},${bc}`)) continue;
      const r0 = top(br);
      const c0 = left(bc);
      const isRoom = roomOf.has(`${br},${bc}`);
      const isPocket = pockets.has(`${br},${bc}`);
      for (let r = 0; r < bh; r++)
        for (let c = 0; c < bw; c++) {
          const edge = r === 0 || c === 0 || r === bh - 1 || c === bw - 1;
          g[r0 + r][c0 + c] = edge ? '#' : isRoom ? '.' : isPocket ? ',' : '#';
        }
    }
  }

  // 역 방: 출입구 · 에스컬레이터 · 승강장 칸
  const platformCells = {};
  const gateOut = {};
  for (const [name, st] of Object.entries(spec.stations)) {
    const r0 = top(st.at[0]);
    const c0 = left(st.at[1]);
    const mr = r0 + Math.floor(bh / 2);
    const mc = c0 + Math.floor(bw / 2);
    const gates = st.gates ?? 'S';
    gateOut[name] = {};
    for (const s of gates) {
      if (s === 'N') { g[r0][mc] = 'G'; gateOut[name].N = [r0 - 1, mc]; }
      if (s === 'S') { g[r0 + bh - 1][mc] = 'G'; gateOut[name].S = [r0 + bh, mc]; }
      if (s === 'W') { g[mr][c0] = 'G'; gateOut[name].W = [mr, c0 - 1]; }
      if (s === 'E') { g[mr][c0 + bw - 1] = 'G'; gateOut[name].E = [mr, c0 + bw]; }
    }
    // 승강장 후보: 출입구에서 먼 안쪽 칸부터
    const inner = [];
    for (let r = r0 + 1; r < r0 + bh - 1; r++) for (let c = c0 + 1; c < c0 + bw - 1; c++) inner.push([r, c]);
    if (st.esc) {
      // 가운데 열을 벽으로 막고 위는 들어가는 '>' · 아래는 나오는 '<'. 출입구는 서쪽
      for (let r = r0 + 1; r < r0 + bh - 1; r++) g[r][mc] = '#';
      g[r0 + 1][mc] = '>';
      g[r0 + bh - 2][mc] = '<';
    }
    const gatesCells = Object.values(gateOut[name]);
    const far = inner
      .filter(([r, c]) => g[r][c] === '.' && (!st.esc || c > mc))
      .map(([r, c]) => [r, c, Math.min(...gatesCells.map(([a, b]) => Math.abs(a - r) + Math.abs(b - c)))])
      .sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1]);
    platformCells[name] = far;
  }

  const used = {};
  const platformFor = (name, n) => {
    used[name] ??= {};
    if (used[name][n]) return used[name][n];
    const k = Object.keys(used[name]).length;
    const cell = platformCells[name][k % platformCells[name].length];
    g[cell[0]][cell[1]] = 'P';
    used[name][n] = [cell[0], cell[1]];
    return used[name][n];
  };

  const lines = [];
  for (const ln of spec.lines) {
    const stops = ln.stops.map((name) => ({ name, at: platformFor(name, ln.n) }));
    // 구간 거리(km) = 두 역 블록 사이 칸 수, 걸리는 틱 = 거리 / 속도
    const seg = (x, y) => {
      const [a, b] = [spec.stations[x].at, spec.stations[y].at];
      const km = Math.abs(a[0] - b[0]) * (bh + 1) + Math.abs(a[1] - b[1]) * (bw + 1);
      return [km, Math.max(1, Math.round(km / (ln.speed ?? 5)))];
    };
    const ring = ln.loop ? [...stops, stops[0]] : stops;
    const segs = [];
    for (let i = 0; i + 1 < ring.length; i++) segs.push(ln.seg?.[i] ?? seg(ring[i].name, ring[i + 1].name));
    const make = (id, st, sg, first) => ({
      id, color: ln.color, stations: st, km: sg.map((x) => x[0]), travel: sg.map((x) => x[1]), first, headway: ln.headway, last: ln.last,
    });
    const suffix = ln.loop ? ['외', '내'] : ['상', '하'];
    lines.push(make(ln.oneway ? ln.n : `${ln.n}${suffix[0]}`, ring, segs, ln.first));
    if (!ln.oneway) lines.push(make(`${ln.n}${suffix[1]}`, ring.slice().reverse(), segs.slice().reverse(), ln.first + (ln.offset ?? 0)));
  }

  // 벽으로 둘러싸인 거리 블록(포켓) 안 칸: 0 = 왼쪽 위, 1 = 오른쪽 아래
  const pocketCell = ([br, bc], k) => (k === 0 ? [top(br) + 1, left(bc) + 1] : [top(br) + bh - 2, left(bc) + bw - 2]);
  const place = (p, ch) => {
    const [r, c] = p.pocket ? pocketCell(p.pocket, 1) : gateOut[p.near][p.side];
    g[r][c] = ch;
    return [r, c];
  };
  const sp = place(spec.start, 'S');
  const gp = place(spec.goal, 'E');
  if (sp[0] === gp[0] && sp[1] === gp[1]) throw new Error('start == goal');
  // 역 폐쇄 · 강제 퇴장 칸 (기본: 첫 출입구 앞 거리)
  const rooms = Object.entries(spec.stations).map(([name, st]) => {
    const r0 = top(st.at[0]);
    const c0 = left(st.at[1]);
    let evict;
    if (st.evictPocket) evict = pocketCell(st.evictPocket, 0);
    else if (st.evictTo) evict = gateOut[st.evictTo.near][st.evictTo.side];
    else evict = Object.values(gateOut[name])[0];
    return { name, rect: [r0, c0, r0 + bh - 1, c0 + bw - 1], close: st.close ?? 9999, evict };
  });
  return { name: spec.name, maxTick: spec.maxTick, grid: g.map((row) => row.join('')), lines, rooms };
}
