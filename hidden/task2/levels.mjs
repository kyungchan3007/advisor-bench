// 공개 예시 5개 + 숨은 레벨 23개를 만들고 기준 풀이로 정답을 적는다
//   node hidden/task2/levels.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildLevel } from './build.mjs';
import { simulate, solve } from './engine.mjs';
import { randomSpec, themeSpec } from './random.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BIG = { blocks: [10, 14], stations: 35, parks: 0.05, minTrains: 2, maxTrains: 12, maxTick: 400, lines: 14, fresh: 0.4, closeP: 0.3, farEvictP: 0.15 };
const OPT = {
  S: { blocks: [4, 5], stations: 7, parks: 0.05, minTrains: 3, maxTrains: 10, maxTick: 150, lines: 3, esc: 0.3, closeP: 0.3, farEvictP: 0.2 },
  N: BIG,
  P: { ...BIG, pocket: true },
  M: { ...BIG, closeP: 0.5, farEvictP: 0.3 },
};

// [파일 이름, 설정, 시드, 테마, 분류]
// 분류: pocket = 강제 퇴장으로만 가는 목적지 · evict = 강제 퇴장이 지름길 · exit = 나갔다 다시 들어가기
//       last = 막차 · normal = 함정 없음
export const SAMPLES = [
  ['01-sample', 'S', 7001],
  ['02-sample', 'S', 7002],
  ['03-sample', 'S', 7004],
  ['04-sample', 'S', 7014],
  ['05-sample', 'S', 7039],
];
export const HIDDEN = [
  ['h01', 'P', 100, null, 'pocket'],
  ['h02', 'P', 115, null, 'pocket'],
  ['h03', 'P', 123, null, 'pocket'],
  ['h04', 'P', 138, null, 'pocket'],
  ['h05', 'P', 206, null, 'pocket'],
  ['h06', 'P', 241, null, 'pocket'],
  ['h07', 'P', 244, null, 'pocket'],
  ['h08', 'N', 311, null, 'evict'],
  ['h09', 'N', 360, null, 'evict'],
  ['h10', 'M', 411, null, 'evict'],
  ['h11', 'M', 457, null, 'evict'],
  ['h12', 'N', 310, null, 'exit'],
  ['h13', 'N', 331, null, 'exit'],
  ['h14', 'M', 437, null, 'exit'],
  ['h15', 'M', 441, null, 'exit'],
  ['h16', 'N', 304, null, 'last'],
  ['h17', 'N', 323, null, 'last'],
  ['h18', 'N', 332, null, 'last'],
  ['h19', 'M', 445, null, 'last'],
  ['h20', 'N', 308, null, 'normal'],
  ['h21', 'N', 313, null, 'normal'],
  ['h22', 'M', 403, null, 'normal'],
  ['h23', 'M', 446, null, 'normal'],
];
const THEME_NAME = { loop: '순환선', 'loop-radial': '순환선 + 방사선', express: '급행 · 완행', branch: '갈래 노선' };

export function makeLevel([file, set, seed, theme]) {
  const spec = theme ? themeSpec(theme, seed, OPT[set]) : randomSpec(seed, OPT[set]);
  const lv = buildLevel(spec);
  lv.name = theme ? `${THEME_NAME[theme]} ${seed}` : `${file} (${seed})`;
  return lv;
}

function write(list, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const answers = {};
  const meta = {};
  for (const item of list) {
    const lv = makeLevel(item);
    const t0 = Date.now();
    const ref = solve(lv);
    const ms = Date.now() - t0;
    const sim = simulate(lv, ref.actions);
    if (!sim.ok) throw new Error(`${item[0]}: 기준 풀이가 판정 실패 ${sim.error}`);
    fs.writeFileSync(path.join(dir, `${item[0]}.json`), JSON.stringify(lv, null, 1) + '\n');
    answers[`${item[0]}.json`] = ref.actions;
    meta[item[0]] = { kind: item[4] ?? 'sample', tick: ref.tick, fare: ref.fare, boardings: ref.boardings, ms, size: `${lv.grid.length}x${lv.grid[0].length}`, lines: lv.lines.length };
    console.log(item[0], JSON.stringify(meta[item[0]]));
  }
  fs.writeFileSync(path.join(dir, 'answers.json'), JSON.stringify(answers, null, 1) + '\n');
  return meta;
}

write(SAMPLES, path.join(ROOT, 'task2/levels'));
const meta = write(HIDDEN, path.join(ROOT, 'hidden/task2/levels'));
fs.writeFileSync(path.join(ROOT, 'hidden/task2/levels/meta.json'), JSON.stringify(meta, null, 1) + '\n');
