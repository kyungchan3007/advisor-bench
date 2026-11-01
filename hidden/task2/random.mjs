// 무작위 레벨 spec — 시드로 재현 가능
const NAMES = [
  '시청', '을지로', '동대문', '성수', '건대', '잠실', '강남', '교대', '사당', '신림', '구로', '영등포', '당산', '홍대', '신촌',
  '충정로', '종로', '혜화', '창동', '노원', '왕십리', '옥수', '압구정', '신사', '논현', '선릉', '삼성', '수서', '가락', '천호',
  '광나루', '용산', '서울역', '공덕', '마포', '여의도', '노량진', '흑석', '동작', '이촌', '한남', '약수', '청구', '신당', '상왕십리',
];
const COLORS = ['#0052A4', '#00A84D', '#EF7C1C', '#00A5DE', '#996CAC', '#CD7C2F', '#747F00', '#E6186C', '#BDB092', '#B0CE18'];

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSpec(seed, o = {}) {
  const R = rng(seed);
  const pick = (a) => a[Math.floor(R() * a.length)];
  const int = (a, b) => a + Math.floor(R() * (b - a + 1));
  const [BR, BC] = o.blocks ?? [5, 7];
  const nSt = o.stations ?? int(8, 12);
  const cells = [];
  for (let r = 0; r < BR; r++) for (let c = 0; c < BC; c++) cells.push([r, c]);
  cells.sort(() => R() - 0.5);
  const names = NAMES.slice().sort(() => R() - 0.5);
  const stations = {};
  const list = [];
  for (let i = 0; i < nSt; i++) {
    const at = cells[i];
    const esc = R() < (o.esc ?? 0.2);
    const gates = esc ? 'W' : pick(['S', 'N', 'W', 'E', 'SN', 'WE', 'SW']);
    stations[names[i]] = { at, gates, esc };
    list.push(names[i]);
  }
  const free = cells.slice(nSt);
  const pockets = [];
  if (o.pocket) pockets.push(free.pop());
  const parks = free.filter(() => R() < (o.parks ?? 0.15));
  // 역 폐쇄 · 먼 비상 출구
  for (const n of list) {
    if (R() < (o.closeP ?? 0)) stations[n].close = int(o.closeMin ?? 30, o.closeMax ?? 160);
    if (R() < (o.farEvictP ?? 0)) {
      const other = pick(list);
      if (other !== n) stations[n].evictTo = { near: other, side: stations[other].gates[0] };
    }
  }
  const nLines = o.lines ?? int(3, 5);
  const lines = [];
  for (let k = 0; k < nLines; k++) {
    const len = int(3, Math.min(6, nSt));
    const stops = [];
    const usedBy = new Set(lines.flatMap((l) => l.stops));
    const pool = R() < (o.fresh ?? 0) && list.filter((x) => !usedBy.has(x)).length >= len ? list.filter((x) => !usedBy.has(x)) : list;
    let cur = pick(pool);
    stops.push(cur);
    while (stops.length < len) {
      // 가까운 역으로 이어 간다
      const cand = pool
        .filter((x) => !stops.includes(x))
        .map((x) => [x, Math.abs(stations[x].at[0] - stations[cur].at[0]) + Math.abs(stations[x].at[1] - stations[cur].at[1]) + R() * 2])
        .sort((a, b) => a[1] - b[1]);
      if (!cand.length) break;
      cur = cand[0][0];
      stops.push(cur);
    }
    const loop = stops.length >= 4 && R() < 0.25;
    const headway = pick([6, 8, 10, 12, 15]);
    const first = int(0, headway);
    lines.push({
      n: String(k + 1),
      color: COLORS[k % COLORS.length],
      stops,
      speed: pick([4, 5, 6, 8]),
      first,
      headway,
      last: first + headway * int(o.minTrains ?? 3, o.maxTrains ?? 12),
      offset: int(0, headway - 1),
      loop,
      oneway: R() < (o.oneway ?? 0.15),
    });
  }
  const sides = (n) => [...stations[n].gates];
  const s = pick(list);
  let gname = pick(list);
  for (let i = 0; i < 20 && gname === s; i++) gname = pick(list);
  let goal = { near: gname, side: pick(sides(gname)) };
  if (o.pocket) {
    // 목적지는 벽에 둘러싸인 포켓 안. 들어가는 길은 한 역의 강제 퇴장뿐
    const x = pick(list.filter((n) => n !== s));
    stations[x].evictPocket = pockets[0];
    stations[x].close = int(o.closeMin ?? 30, o.closeMax ?? 160);
    delete stations[x].evictTo;
    goal = { pocket: pockets[0] };
  }
  return {
    name: `seed-${seed}`,
    blocks: [BR, BC],
    maxTick: o.maxTick ?? 200,
    stations,
    parks,
    pockets,
    lines,
    start: { near: s, side: pick(sides(s)) },
    goal,
  };
}

// 노선 모양만 빌린 테마 레벨: 무작위 spec의 앞쪽 노선을 테마 모양으로 바꾼다
export function themeSpec(theme, seed, o = {}) {
  const spec = randomSpec(seed, o);
  const R = rng(seed * 7 + 1);
  const names = Object.keys(spec.stations);
  const at = (n) => spec.stations[n].at;
  const [BR, BC] = spec.blocks;
  // 가운데에서 각도 순으로 정렬한 역 (순환선용)
  const cr = (BR - 1) / 2;
  const cc = (BC - 1) / 2;
  const ang = (n) => Math.atan2(at(n)[0] - cr, at(n)[1] - cc);
  const ring = names
    .filter((n) => Math.abs(at(n)[0] - cr) + Math.abs(at(n)[1] - cc) >= 2)
    .sort((a, b) => ang(a) - ang(b));
  const base = spec.lines[0];
  const hw = base.headway;
  if (theme === 'loop' || theme === 'loop-radial') {
    const stops = ring.filter((_, i) => i % 2 === 0).slice(0, 8);
    spec.lines[0] = { ...base, n: '2', stops, loop: true, oneway: false, speed: 6 };
    if (theme === 'loop-radial') {
      const others = names.filter((n) => !stops.includes(n));
      for (let k = 1; k < Math.min(4, spec.lines.length); k++) {
        const hub = stops[(k * 2) % stops.length];
        const far = others.sort((a, b) => Math.hypot(at(b)[0] - at(hub)[0], at(b)[1] - at(hub)[1]) - Math.hypot(at(a)[0] - at(hub)[0], at(a)[1] - at(hub)[1]));
        const tail = far.slice(0, 2).sort((a, b) => Math.hypot(at(a)[0] - at(hub)[0], at(a)[1] - at(hub)[1]) - Math.hypot(at(b)[0] - at(hub)[0], at(b)[1] - at(hub)[1]));
        spec.lines[k] = { ...spec.lines[k], stops: [hub, ...tail], loop: false };
      }
    }
  }
  if (theme === 'express') {
    const stops = ring.slice(0, 7);
    spec.lines[0] = { ...base, n: '1', stops, loop: false, oneway: false, speed: 4 };
    spec.lines[1] = { ...spec.lines[1], n: '1급', stops: stops.filter((_, i) => i % 3 === 0 || i === stops.length - 1), loop: false, oneway: false, speed: 9, headway: hw * 2, last: base.last };
  }
  if (theme === 'branch') {
    const trunk = ring.slice(0, 3);
    const rest = names.filter((n) => !trunk.includes(n));
    spec.lines[0] = { ...base, n: 'A', stops: [...trunk, rest[0], rest[1]], loop: false, oneway: R() < 0.5, speed: 7 };
    spec.lines[1] = { ...spec.lines[1], n: 'B', stops: [...trunk, rest[2], rest[3]], loop: false, oneway: true, speed: 7 };
  }
  spec.name = `${theme}-${seed}`;
  return spec;
}
