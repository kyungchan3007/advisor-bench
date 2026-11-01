// 실험 실행 — 과제 × 조합 × 반복마다 빈 폴더에서 Claude Code를 돌리고 숨은 테스트 · 레벨로 채점한다.
//
// 사용법:
//   node bench/run.mjs --task t1 --reps 2
//   node bench/run.mjs --task t2 --combos opus-solo,sonnet-solo --reps 1
//   node bench/run.mjs --task t2 --concurrency 2 --run my-run
//
// 결과: runs/<runId>/results.jsonl, runs/<runId>/<task>/<combo>/rep<n>/

import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTAIN_EFFORT, COMBOS, IMPL_PROMPT, MODELS, PLAN_PROMPT, PROMPT, agentFile, claudeMd } from './combos.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLAUDE_TIMEOUT_MS = 45 * 60 * 1000;
const LEVEL_TIMEOUT_MS = 10 * 1000;

function parseArgs(argv) {
  const opts = { task: 't1', combos: null, reps: 2, concurrency: 1, run: null };
  for (let i = 0; i < argv.length; i += 2) {
    const [key, value] = [argv[i], argv[i + 1]];
    if (key === '--task') opts.task = value;
    else if (key === '--combos') opts.combos = value.split(',');
    else if (key === '--reps') opts.reps = Number(value);
    else if (key === '--concurrency') opts.concurrency = Number(value);
    else if (key === '--run') opts.run = value;
    else throw new Error(`알 수 없는 인자: ${key}`);
  }
  if (!COMBOS[opts.task]) throw new Error(`알 수 없는 과제: ${opts.task}`);
  opts.combos ??= Object.keys(COMBOS[opts.task]);
  for (const c of opts.combos) if (!COMBOS[opts.task][c]) throw new Error(`알 수 없는 조합: ${c}`);
  return opts;
}

// Claude Code 안에서 돌리면 부모 세션 변수가 자식 claude로 넘어가 API 오류가 난다
const PARENT_SESSION_VARS = ['ANTHROPIC_BASE_URL', 'CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT'];

function exec(cmd, args, { cwd, env, timeoutMs }) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    for (const v of PARENT_SESSION_VARS) delete childEnv[v];
    const child = spawn(cmd, args, { cwd, env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut: signal === 'SIGKILL' });
    });
  });
}

const exists = (p) => fs.access(p).then(() => true, () => false);

// ---- 작업 폴더 ----
// 저장소 밖 임시 폴더에 만든다. 저장소 안에 두면 상위 폴더의 hidden/ 을 볼 수 있다.
async function prepareWorkdir(task, combo, settingsFor = combo) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `advisor-${task}-`));
  await fs.cp(path.join(ROOT, task === 't1' ? 'task1' : 'task2'), dir, { recursive: true });
  await writeClaudeConfig(dir, task, settingsFor);
  return dir;
}

async function writeClaudeConfig(dir, task, combo) {
  await fs.rm(path.join(dir, '.claude'), { recursive: true, force: true });
  await fs.mkdir(path.join(dir, '.claude/agents'), { recursive: true });
  const settings = combo.advisor ? { advisorModel: MODELS[combo.advisor] } : {};
  await fs.writeFile(path.join(dir, '.claude/settings.json'), JSON.stringify(settings, null, 2) + '\n');
  for (const a of combo.agents ?? []) await fs.writeFile(path.join(dir, `.claude/agents/${a}.md`), agentFile(a));
  await fs.writeFile(path.join(dir, 'CLAUDE.md'), claudeMd(task, combo));
}

// ---- Claude Code 한 세션 ----
async function runClaude({ model, prompt, cwd }) {
  const args = [
    '-p', prompt,
    '--model', MODELS[model],
    '--effort', CAPTAIN_EFFORT,
    '--output-format', 'stream-json', '--verbose',
    '--permission-mode', 'dontAsk',
    '--allowedTools', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Agent', 'Task', 'WebFetch',
    'Bash(node:*)', 'Bash(ls:*)', 'Bash(cat:*)', 'Bash(time:*)', 'Bash(head:*)', 'Bash(diff:*)',
    '--setting-sources', 'project',
    '--strict-mcp-config',
    '--no-session-persistence',
  ];
  const started = Date.now();
  const res = await exec('claude', args, { cwd, timeoutMs: CLAUDE_TIMEOUT_MS });
  const events = res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  const out = events.findLast((e) => e.type === 'result') ?? null;
  const blocks = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? []);
  const costByModel = {};
  for (const [id, u] of Object.entries(out?.modelUsage ?? {})) {
    const fam = /fable/.test(id) ? 'fable' : /opus/.test(id) ? 'opus' : /sonnet/.test(id) ? 'sonnet' : /haiku/.test(id) ? 'haiku' : id;
    costByModel[fam] = (costByModel[fam] ?? 0) + (u.costUSD ?? 0);
  }
  return {
    res,
    stats: {
      costUsd: out?.total_cost_usd ?? null,
      costByModel,
      durationMs: out?.duration_ms ?? Date.now() - started,
      turns: out?.num_turns ?? null,
      advisorCalls: blocks.filter((b) => b.type === 'server_tool_use' && b.name === 'advisor').length,
      delegations: blocks.filter((b) => b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task')).length,
      delegatedTo: blocks
        .filter((b) => b.type === 'tool_use' && (b.name === 'Agent' || b.name === 'Task'))
        .map((b) => b.input?.subagent_type ?? '?'),
      permissionDenials: out?.permission_denials?.length ?? null,
      claudeError: out ? Boolean(out.is_error) : true,
      claudeTimedOut: res.timedOut,
    },
  };
}

// ---- 채점 ----
async function gradeT1(work) {
  const res = await exec('node', ['--test', '--test-reporter=tap', path.join(ROOT, 'hidden/task1/farecard.test.mjs')], {
    cwd: ROOT,
    env: { FARECARD_DIR: work },
    timeoutMs: 60 * 1000,
  });
  const num = (name) => Number(res.stdout.match(new RegExp(`^# ${name} (\\d+)`, 'm'))?.[1] ?? 0);
  const failed = [...res.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]);
  return { pass: num('pass'), total: 36, failed };
}

async function gradeT2(work) {
  const dir = path.join(ROOT, 'hidden/task2/levels');
  const answers = JSON.parse(await fs.readFile(path.join(dir, 'answers.json'), 'utf8'));
  const solver = path.join(work, 'solver.js');
  const levels = {};
  if (!(await exists(solver))) return { pass: 0, total: Object.keys(answers).length, failed: Object.keys(answers), levels, missing: true };
  for (const [file, want] of Object.entries(answers)) {
    const t0 = Date.now();
    const res = await exec('node', [solver, path.join(dir, file)], { cwd: work, timeoutMs: LEVEL_TIMEOUT_MS });
    const got = res.stdout.trim().split('\n').at(-1) ?? '';
    levels[file] = { ok: !res.timedOut && got === want, ms: Date.now() - t0, timedOut: res.timedOut, got: got.slice(0, 400) };
  }
  const failed = Object.keys(levels).filter((f) => !levels[f].ok);
  return { pass: Object.keys(levels).length - failed.length, total: Object.keys(levels).length, failed, levels };
}

// ---- 한 번 실행 ----
async function runOne({ runDir, task, comboName, rep }) {
  const combo = COMBOS[task][comboName];
  const outDir = path.join(runDir, task, comboName, `rep${rep}`);
  await fs.mkdir(path.join(outDir, 'steps'), { recursive: true });
  const work = await prepareWorkdir(task, combo);
  const steps = [];
  const step = async (name, model, prompt) => {
    const { res, stats } = await runClaude({ model, prompt, cwd: work });
    await fs.writeFile(path.join(outDir, 'steps', `${name}.jsonl`), res.stdout || '');
    if (res.stderr) await fs.writeFile(path.join(outDir, 'steps', `${name}.stderr.txt`), res.stderr);
    steps.push({ name, model, ...stats });
  };

  if (combo.mode === 'plan') {
    await step('plan', combo.model, PLAN_PROMPT);
    await fs.rm(path.join(work, 'solver.js'), { force: true });
    await step('impl', combo.implementer, IMPL_PROMPT);
  } else {
    await step('main', combo.model, PROMPT[task] + (combo.extra ?? ''));
  }

  const grade = task === 't1' ? await gradeT1(work) : await gradeT2(work);
  // 산출물 보관
  const keep = task === 't1' ? ['src'] : ['solver.js', 'PLAN.md'];
  for (const k of keep) if (await exists(path.join(work, k))) await fs.cp(path.join(work, k), path.join(outDir, 'artifacts', k), { recursive: true });
  for (const f of await fs.readdir(work)) {
    if (/\.(m?js)$/.test(f) && !keep.includes(f)) await fs.cp(path.join(work, f), path.join(outDir, 'artifacts', f));
  }

  const sumOf = (k) => steps.reduce((s, x) => s + (x[k] ?? 0), 0);
  const costByModel = {};
  for (const s of steps) for (const [m, c] of Object.entries(s.costByModel)) costByModel[m] = (costByModel[m] ?? 0) + c;
  const row = {
    task,
    combo: comboName,
    rep,
    pass: grade.pass,
    total: grade.total,
    failed: grade.failed,
    costUsd: sumOf('costUsd'),
    costByModel,
    durationMs: sumOf('durationMs'),
    turns: sumOf('turns'),
    advisorCalls: sumOf('advisorCalls'),
    delegations: sumOf('delegations'),
    delegatedTo: steps.flatMap((s) => s.delegatedTo),
    permissionDenials: sumOf('permissionDenials'),
    claudeError: steps.some((s) => s.claudeError),
    claudeTimedOut: steps.some((s) => s.claudeTimedOut),
    steps,
    work,
  };
  await fs.writeFile(path.join(outDir, 'grade.json'), JSON.stringify(grade, null, 2));
  await fs.writeFile(path.join(outDir, 'row.json'), JSON.stringify(row, null, 2));
  return row;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const runId = opts.run ?? new Date().toISOString().replace(/[:.]/g, '-');
  const runDir = path.join(ROOT, 'runs', runId);
  await fs.mkdir(runDir, { recursive: true });
  const jobs = [];
  for (let rep = 1; rep <= opts.reps; rep++) for (const c of opts.combos) jobs.push({ task: opts.task, comboName: c, rep });
  console.log(`실행 ${jobs.length}개 → runs/${runId}`);
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++];
      const t0 = Date.now();
      const row = await runOne({ runDir, ...job });
      await fs.appendFile(path.join(runDir, 'results.jsonl'), JSON.stringify(row) + '\n');
      const cost = Object.entries(row.costByModel).map(([m, c]) => `${m} $${c.toFixed(2)}`).join(' · ');
      console.log(
        `${job.task} ${job.comboName} rep${job.rep}: ${row.pass}/${row.total} · $${row.costUsd.toFixed(2)} (${cost}) · ${Math.round((Date.now() - t0) / 1000)}s · advisor ${row.advisorCalls} · delegate ${row.delegations}`,
      );
    }
  };
  await Promise.all(Array.from({ length: opts.concurrency }, worker));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
