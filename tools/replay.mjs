// 풀이 재생 애니메이션 SVG — README에서 움직인다 (SMIL)
//   node tools/replay.mjs <level.json> <행동 문자열 | 파일> <out.svg> [제목]
// 위: 지하철 노선도 위로 열차가 달린다 / 아래: 길찾기 앱처럼 풀이 요약 (구간 막대 · 단계 목록)
import fs from 'node:fs';
import { parseLevel, simulate, tokenize } from '../hidden/task2/engine.mjs';

const TICK_S = 0.25; // 1틱 = 0.25초
const FONT = "'Apple SD Gothic Neo','Noto Sans KR','Malgun Gothic',sans-serif";
const INK = '#1f2328';
const SUB = '#6b7280';
const WALK = '#4b5563';
const EVICT = '#dc2626';
const START = '#2563eb';
const GOAL = '#16a34a';

const lineNo = (id) => id.replace(/[상하외내]$/, '');

export function renderReplay(levelJson, actions, title = '') {
  const L = parseLevel(levelJson);
  const sim = simulate(L, actions);
  const M = buildMap(L, sim.trace);
  const W = M.width;
  const body = [];
  let y = 0;

  // 제목 · 노선 범례
  body.push(`<text x="20" y="30" font-size="20" font-weight="bold" fill="${INK}">${esc(title || L.name)}</text>`);
  y = 44;
  const lineKeys = [...M.phys.values()].sort((a, b) => Number(a.no) - Number(b.no) || a.no.localeCompare(b.no));
  const lg = flow(lineKeys.map((p) => [(x, yy) => badge(x + 9, yy - 4, p.color, p.no, 9), `${p.no}호선`, 18]), W - 40, 12);
  body.push(`<g transform="translate(20 ${y})">${lg.svg}</g>`);
  y += lg.height;

  // 노선도
  body.push(`<g transform="translate(0 ${y})">${drawMap(L, M, sim)}</g>`);
  y += M.height;

  // 기호 범례
  const sym = flow(
    [
      [(x, yy) => `<circle cx="${x + 8}" cy="${yy - 4}" r="6" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`, '역', 16],
      [(x, yy) => `<rect x="${x}" y="${yy - 10}" width="26" height="12" rx="6" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`, '환승역', 26],
      [(x, yy) => `<g transform="translate(${x + 17} ${yy - 4})">${train('#00A84D', '2')}</g>`, '열차', 34],
      [(x, yy) => `<line x1="${x}" y1="${yy - 4}" x2="${x + 26}" y2="${yy - 4}" stroke="${WALK}" stroke-width="3.5" stroke-dasharray="0.1 6" stroke-linecap="round"/>`, '걸어간 길', 26],
      [(x, yy) => `<line x1="${x}" y1="${yy - 4}" x2="${x + 26}" y2="${yy - 4}" stroke="${EVICT}" stroke-width="3" stroke-dasharray="6 4"/>`, '역 폐쇄로 쫓겨남', 26],
      [(x, yy) => `<circle cx="${x + 8}" cy="${yy - 4}" r="7" fill="${INK}" stroke="#fde047" stroke-width="3"/>`, '승객', 16],
    ],
    W - 40,
    12,
  );
  body.push(`<g transform="translate(20 ${y + 4})">${sym.svg}</g>`);
  y += sym.height + 16;

  // 풀이 요약 (길찾기 앱)
  const R = drawRoute(L, M, sim, W);
  body.push(`<g transform="translate(0 ${y})">${R.svg}</g>`);
  y += R.height + 14;

  const out = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W}" font-family="${FONT}">`, `<rect width="100%" height="100%" rx="12" fill="#ffffff"/>`, ...body, '</svg>'];
  return { svg: out.join('\n'), sim };
}

// ── 지도 좌표 ─────────────────────────────────────────────
// 격자 칸 → 픽셀. 역 안 칸은 모두 그 역의 중심점으로 모은다
function buildMap(L, trace) {
  // 쓰는 부분(역 · 출발 · 도착 · 퇴장 칸 · 궤적)만 잘라 그린다
  const cells = [L.start, L.goal, ...trace.map((x) => [x.r, x.c])];
  for (const room of L.rooms) cells.push(room.rect.slice(0, 2), room.rect.slice(2), room.evict);
  const rs = cells.map((x) => x[0]), cs = cells.map((x) => x[1]);
  const r0 = Math.max(0, Math.min(...rs) - 1), r1 = Math.min(L.H - 1, Math.max(...rs) + 1);
  const c0 = Math.max(0, Math.min(...cs) - 1), c1 = Math.min(L.W - 1, Math.max(...cs) + 1);
  const P = Math.max(8, Math.min(20, 880 / (c1 - c0 + 1)));
  const pad = 30;
  const px = (c) => pad + (c - c0 + 0.5) * P;
  const py = (r) => pad + (r - r0 + 0.5) * P;
  const roomOf = (r, c) => L.roomAt[r * L.W + c];
  const center = L.rooms.map((room, k) => {
    let n = 0, sr = 0, sc = 0;
    const [r0, c0, r1, c1] = room.rect;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (roomOf(r, c) === k) { n++; sr += r; sc += c; }
    return n ? [px(sc / n), py(sr / n)] : [px((c0 + c1) / 2), py((r0 + r1) / 2)];
  });
  const byName = new Map(L.rooms.map((room, k) => [room.name, k]));
  const pt = (r, c) => {
    const k = roomOf(r, c);
    return k >= 0 ? center[k] : [px(c), py(r)];
  };
  const ptByName = new Map();
  for (const l of L.lines) {
    for (const s of l.stations) {
      const k = byName.get(s.name) ?? roomOf(s.at[0], s.at[1]);
      ptByName.set(s.name, k >= 0 ? center[k] : [px(s.at[1]), py(s.at[0])]);
    }
  }
  // 물리 노선(상 · 하행을 하나로) · 구간마다 지나는 노선
  const key = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const phys = new Map();
  for (const l of L.lines) {
    const no = lineNo(l.id);
    if (!phys.has(no)) phys.set(no, { no, color: l.color, segs: new Set() });
    for (let i = 0; i + 1 < l.stations.length; i++) phys.get(no).segs.add(key(l.stations[i].name, l.stations[i + 1].name));
  }
  const segLines = new Map();
  for (const p of phys.values()) for (const k of p.segs) { if (!segLines.has(k)) segLines.set(k, []); segLines.get(k).push(p.no); }
  // 같은 구간을 여러 노선이 지나면 나란히 벌려 그린다
  const GAP = 6;
  const offsetSeg = (aName, bName, no) => {
    const A = ptByName.get(aName), B = ptByName.get(bName);
    const list = segLines.get(key(aName, bName)) ?? [no];
    const k = list.indexOf(no) - (list.length - 1) / 2;
    const [U, V] = aName < bName ? [A, B] : [B, A];
    const len = Math.hypot(V[0] - U[0], V[1] - U[1]) || 1;
    const ox = (-(V[1] - U[1]) / len) * GAP * k, oy = ((V[0] - U[0]) / len) * GAP * k;
    return [[A[0] + ox, A[1] + oy], [B[0] + ox, B[1] + oy]];
  };
  const stationLines = new Map();
  for (const l of L.lines) for (const s of l.stations) { if (!stationLines.has(s.name)) stationLines.set(s.name, new Set()); stationLines.get(s.name).add(lineNo(l.id)); }
  return { pt, phys, ptByName, offsetSeg, stationLines, roomOf, width: Math.round(pad * 2 + (c1 - c0 + 1) * P), height: Math.round(pad * 2 + (r1 - r0 + 1) * P) };
}

// 탄 구간: 지나는 역들의 이름 · 도착 틱 · 거리
function rideStops(L, a, b) {
  const line = L.lines.find((l) => l.id === b.line);
  const i = line.stations.findIndex((s, k) => s.at[0] === a.r && s.at[1] === a.c && line.stations.slice(k + 1).some((x) => x.name === b.to));
  const j = line.stations.findIndex((s, k) => k > i && s.name === b.to);
  const stops = [];
  for (let k = i; k <= j; k++) stops.push({ name: line.stations[k].name, t: a.t + line.cum[k] - line.cum[i] });
  return { line, stops, km: line.kmc[j] - line.kmc[i], no: lineNo(line.id) };
}

// ── 노선도 ───────────────────────────────────────────────
function drawMap(L, M, sim) {
  const out = [];
  out.push(`<rect x="12" y="8" width="${M.width - 24}" height="${M.height - 16}" rx="10" fill="#f6f6f3"/>`);
  for (const p of M.phys.values()) {
    for (const k of p.segs) {
      const [A, B] = M.offsetSeg(...k.split('|'), p.no);
      out.push(seg(A, B, `stroke="${p.color}" stroke-width="5" stroke-linecap="round" opacity="0.3"`));
    }
  }
  // 궤적 (해당 틱에 나타난다)
  const tr = sim.trace;
  const at = (t) => `visibility="hidden"><set attributeName="visibility" to="visible" begin="${s(t)}s" fill="freeze"/>`;
  const frames = [{ t: 0, p: M.pt(tr[0].r, tr[0].c) }];
  const trains = [];
  const hides = [];
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (b.ev === 'ride') {
      const R = rideStops(L, a, b);
      const pts = [];
      for (let k = 0; k + 1 < R.stops.length; k++) {
        const [A, B] = M.offsetSeg(R.stops[k].name, R.stops[k + 1].name, R.no);
        if (k === 0) pts.push({ t: R.stops[0].t, p: A });
        pts.push({ t: R.stops[k + 1].t, p: B });
        out.push(`<line ${xy(A, B)} stroke="${R.line.color}" stroke-width="7" stroke-linecap="round" ${at(R.stops[k + 1].t)}</line>`);
      }
      trains.push({ pts, color: R.line.color, no: R.no });
      hides.push([a.t, b.t]);
      frames.push(...pts, { t: b.t, p: M.pt(b.r, b.c) });
      continue;
    }
    const A = M.pt(a.r, a.c), B = M.pt(b.r, b.c);
    if (b.ev === 'evict') out.push(`<line ${xy(A, B)} stroke="${EVICT}" stroke-width="3" stroke-dasharray="6 4" ${at(a.t)}</line>`);
    else if (A[0] !== B[0] || A[1] !== B[1]) out.push(`<line ${xy(A, B)} stroke="${WALK}" stroke-width="3.5" stroke-dasharray="0.1 6" stroke-linecap="round" ${at(a.t)}</line>`);
    frames.push({ t: b.t, p: B });
  }
  // 역 · 역명
  for (const [name, p] of M.ptByName) {
    if (M.stationLines.get(name).size > 1) out.push(`<rect x="${f(p[0] - 13)}" y="${f(p[1] - 8)}" width="26" height="16" rx="8" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`);
    else out.push(`<circle cx="${f(p[0])}" cy="${f(p[1])}" r="7" fill="#fff" stroke="${INK}" stroke-width="2.5"/>`);
    const w = textW(name, 12) + 8;
    out.push(`<rect x="${f(p[0] - w / 2)}" y="${f(p[1] - 29)}" width="${f(w)}" height="17" rx="4" fill="#fff" opacity="0.85"/><text x="${f(p[0])}" y="${f(p[1] - 16)}" font-size="12" font-weight="bold" text-anchor="middle" fill="${INK}">${esc(name)}</text>`);
  }
  out.push(pin(M.pt(...L.start), START, '출발'), pin(M.pt(...L.goal), GOAL, '도착'));
  // 열차
  for (const tn of trains) {
    const t0 = tn.pts[0].t, span = tn.pts.at(-1).t - t0 || 1;
    const kt = tn.pts.map((x) => ((x.t - t0) / span).toFixed(4)).join(';');
    const vals = tn.pts.map((x) => `${f(x.p[0])} ${f(x.p[1])}`).join(';');
    out.push(`<g visibility="hidden"><set attributeName="visibility" to="visible" begin="${s(t0)}s" dur="${s(span)}s"/><g><animateTransform attributeName="transform" type="translate" values="${vals}" keyTimes="${kt}" begin="${s(t0)}s" dur="${s(span)}s" fill="freeze"/>${train(tn.color, tn.no)}</g></g>`);
  }
  // 승객: 열차 안에서는 숨김
  const end = frames.at(-1).t || 1;
  const kt = frames.map((x) => (x.t / end).toFixed(4)).join(';');
  const vals = frames.map((x) => `${f(x.p[0])} ${f(x.p[1])}`).join(';');
  const hide = hides.map(([a, b]) => `<set attributeName="opacity" to="0" begin="${s(a)}s" dur="${s(b - a)}s"/>`).join('');
  out.push(`<g>${hide}<animateTransform attributeName="transform" type="translate" values="${vals}" keyTimes="${kt}" dur="${s(end)}s" fill="freeze"/><circle r="7" fill="${INK}" stroke="#fde047" stroke-width="3"/></g>`);
  return out.join('\n');
}

// ── 풀이 요약: 구간 막대 + 단계 목록 ──────────────────────
function drawRoute(L, M, sim, W) {
  const tr = sim.trace;
  const roomName = (r, c) => L.rooms[M.roomOf(r, c)]?.name ?? '';
  const bars = [];
  const bar = (kind, t0, t1, color, label) => {
    const last = bars.at(-1);
    if (last && last.kind === kind && kind !== 'ride') last.t1 = t1;
    else bars.push({ kind, t0, t1, color, label });
  };
  const steps = [{ t: 0, icon: 'start', text: '출발' }];
  let walk = null;
  let lastRoom = '';
  const flush = (text) => {
    if (!walk) return;
    const extra = walk.wait ? ` (기다림 ${walk.wait}틱 포함)` : '';
    steps.push({ t: walk.t0, icon: 'walk', text: `${text} · ${walk.t1 - walk.t0}틱${extra}` });
    walk = null;
  };
  for (let i = 1; i < tr.length; i++) {
    const a = tr[i - 1], b = tr[i];
    if (roomName(a.r, a.c)) lastRoom = roomName(a.r, a.c);
    if (b.ev === 'ride') {
      flush('승강장까지 걷기');
      const R = rideStops(L, a, b);
      bar('ride', a.t, b.t, R.line.color, R.no);
      const via = R.stops.length > 2 ? ` · ${R.stops.length - 2}개 역 지나침` : '';
      steps.push({ t: a.t, icon: 'ride', color: R.line.color, no: R.no, text: `${R.no}호선  ${R.stops[0].name} → ${b.to}`, sub: `${b.t - a.t}틱 · ${R.km}km${via}` });
      continue;
    }
    if (b.ev === 'evict') {
      flush('걷기');
      steps.push({ t: b.t, icon: 'evict', text: `${roomName(a.r, a.c) || lastRoom}역 폐쇄 → 강제 퇴장`, sub: '그 자리에서 개찰구 밖으로 내보내짐' });
      continue;
    }
    if (!walk) walk = { t0: a.t, t1: b.t, wait: 0 };
    walk.t1 = b.t;
    if (b.ev === 'wait') { walk.wait++; bar('wait', a.t, b.t, '#e5e7eb'); } else bar('walk', a.t, b.t, '#9ca3af');
    if (b.ev === 'enter') flush(`걸어서 ${roomName(b.r, b.c)}역 개찰구 통과`);
    if (b.ev === 'exit') flush(`${lastRoom}역 개찰구로 나감`);
  }
  flush('목적지까지 걷기');
  if (sim.ok) steps.push({ t: sim.tick, icon: 'goal', text: `도착 · 요금 ${sim.fare.toLocaleString('en-US')}원` });

  const out = [];
  const bx = 32, bwid = W - 64, by = 52;
  const head = sim.ok ? `${sim.tick}틱` : '실패';
  out.push(`<rect x="12" y="0" width="${W - 24}" height="__H__" rx="10" fill="#fff" stroke="#e5e7eb"/>`);
  out.push(`<text x="${bx}" y="36" font-size="24" font-weight="bold" fill="${sim.ok ? INK : EVICT}">${head}</text>`);
  out.push(`<text x="${f(bx + textW(head, 24) + 8)}" y="35" font-size="14" fill="${SUB}">${sim.ok ? `${sim.fare.toLocaleString('en-US')}원 · 승차 ${sim.boardings}번` : esc(sim.error)}</text>`);
  // 막대: 회색 = 걷기, 연회색 = 기다림, 노선 색 = 열차
  const total = sim.tick || tr.at(-1).t || 1;
  for (const b of bars) {
    const x = bx + (b.t0 / total) * bwid, w = Math.max(3, ((b.t1 - b.t0) / total) * bwid - 2);
    out.push(`<rect x="${f(x)}" y="${by}" width="${f(w)}" height="18" rx="9" fill="${b.color}"/>`);
    if (b.kind === 'ride' && w > 44) out.push(`<text x="${f(x + w / 2)}" y="${by + 13}" font-size="11" font-weight="bold" text-anchor="middle" fill="#fff">${esc(b.label)}호선</text>`);
  }
  out.push(`<text x="${bx}" y="${by + 32}" font-size="11" fill="${SUB}">0틱</text><text x="${bx + bwid}" y="${by + 32}" font-size="11" text-anchor="end" fill="${SUB}">${total}틱</text>`);
  // 단계 목록 (세로 타임라인)
  let y = by + 60;
  const cx = bx + 50;
  steps.forEach((st, k) => {
    const rowH = st.sub ? 42 : 30;
    if (steps[k + 1]) {
      out.push(st.icon === 'ride'
        ? `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + rowH}" stroke="${st.color}" stroke-width="5"/>`
        : `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + rowH}" stroke="#c4c8ce" stroke-width="3" stroke-dasharray="0.1 5" stroke-linecap="round"/>`);
    }
    out.push(`<text x="${bx}" y="${y + 4}" font-size="11" fill="${SUB}">${st.t}틱</text>`);
    if (st.icon === 'ride') out.push(badge(cx, y, st.color, st.no, 9));
    else out.push(`<circle cx="${cx}" cy="${y}" r="${st.icon === 'walk' ? 5 : 7}" fill="${{ start: START, goal: GOAL, evict: EVICT, walk: '#9ca3af' }[st.icon]}" stroke="#fff" stroke-width="2"/>`);
    out.push(`<text x="${cx + 18}" y="${y + 5}" font-size="14" ${st.icon === 'walk' ? `fill="${SUB}"` : `font-weight="bold" fill="${st.icon === 'evict' ? EVICT : INK}"`}>${esc(st.text)}</text>`);
    if (st.sub) out.push(`<text x="${cx + 18}" y="${y + 23}" font-size="12" fill="${SUB}">${esc(st.sub)}</text>`);
    y += rowH;
  });
  const H = y;
  return { svg: out.join('\n').replace('__H__', H), height: H };
}

// ── 그림 조각 ─────────────────────────────────────────────
// 호선 배지: 노선 색 원 + 흰 번호
function badge(cx, cy, color, no, r = 8) {
  const fs = String(no).length > 1 ? r * 0.95 : r * 1.15;
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="${r}" fill="${color}" stroke="#fff" stroke-width="1.5"/><text x="${f(cx)}" y="${f(cy + fs * 0.36)}" font-size="${f(fs)}" font-weight="bold" text-anchor="middle" fill="#fff">${esc(no)}</text>`;
}

// 열차: 노선 색 차량, 창문 · 전조등 · 호선 번호
function train(color, no) {
  return `<rect x="-17" y="-9" width="34" height="18" rx="7" fill="${color}" stroke="#fff" stroke-width="2"/><rect x="-13" y="-5" width="6" height="5" rx="1" fill="#fff"/><rect x="7" y="-5" width="6" height="5" rx="1" fill="#fff"/><text x="0" y="4" font-size="11" font-weight="bold" text-anchor="middle" fill="#fff">${esc(no)}</text><circle cx="14.5" cy="4" r="1.6" fill="#fde047"/><circle cx="-14.5" cy="4" r="1.6" fill="#fde047"/>`;
}

// 출발 · 도착 표지
function pin([cx, cy], color, label) {
  const w = textW(label, 12) + 12;
  return `<circle cx="${f(cx)}" cy="${f(cy)}" r="6" fill="${color}" stroke="#fff" stroke-width="2"/><rect x="${f(cx - w / 2)}" y="${f(cy + 10)}" width="${f(w)}" height="18" rx="9" fill="${color}"/><text x="${f(cx)}" y="${f(cy + 23)}" font-size="12" font-weight="bold" text-anchor="middle" fill="#fff">${esc(label)}</text>`;
}

// 아이콘 + 글자 묶음을 폭에 맞춰 줄바꿈
function flow(items, W, fs) {
  const out = [];
  let x = 0, y = 12;
  for (const [mark, label, mw] of items) {
    const w = mw + 6 + textW(label, fs) + 16;
    if (x + w > W && x > 0) { x = 0; y += 22; }
    out.push(mark(x, y), `<text x="${x + mw + 6}" y="${y}" font-size="${fs}" fill="#374151">${esc(label)}</text>`);
    x += w;
  }
  return { svg: out.join(''), height: y + 8 };
}

// 대략의 글자 폭 (한글 1em, 그 밖 0.6em)
function textW(t, fs) {
  return [...String(t)].reduce((n, ch) => n + fs * (ch.charCodeAt(0) > 0x2e00 ? 1 : ch === ' ' ? 0.3 : '()·,.'.includes(ch) ? 0.35 : 0.6), 0);
}

const f = (n) => (Math.round(n * 10) / 10).toString();
const s = (t) => (t * TICK_S).toFixed(2);
const xy = (A, B) => `x1="${f(A[0])}" y1="${f(A[1])}" x2="${f(B[0])}" y2="${f(B[1])}"`;
const seg = (A, B, attrs) => `<line ${xy(A, B)} ${attrs}/>`;

function esc(v) {
  return String(v).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const [levelPath, act, outPath, title] = process.argv.slice(2);
  const level = JSON.parse(fs.readFileSync(levelPath, 'utf8'));
  const actions = fs.existsSync(act) ? fs.readFileSync(act, 'utf8').trim() : act;
  tokenize(actions);
  const { svg, sim } = renderReplay(level, actions, title);
  fs.writeFileSync(outPath, svg);
  console.log(outPath, sim.ok ? `ok ${sim.tick} ${sim.fare}` : sim.error);
}
