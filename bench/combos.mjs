// 조합 정의 — 캡틴 모델 · 감독관 · 서브에이전트 · 요청 문장

export const MODELS = { opus: 'opus', sonnet: 'sonnet', fable: 'fable' };
export const CAPTAIN_EFFORT = 'high';

// 서브에이전트 (.claude/agents/*.md). 모두 Sonnet · effort medium
export const AGENTS = {
  explorer: {
    description: '탐색: 코드를 읽고 구조 · 문제 위치를 보고한다. 수정하지 않는다.',
    tools: 'Read, Glob, Grep',
    body: '맡은 범위의 코드를 읽고, 파일 · 함수 · 줄 번호와 함께 짧게 보고하라. 파일을 고치지 마라.',
  },
  researcher: {
    description: '조사: 문서를 읽고 규칙을 빠짐없이 정리한다. 수정하지 않는다.',
    tools: 'Read, Glob, Grep, WebFetch',
    body: '맡은 문서를 끝까지 읽고 규칙 · 경계값 · 예외를 빠짐없이 목록으로 정리해 보고하라. 파일을 고치지 마라.',
  },
  worker: {
    description: '일꾼: 맡은 코드를 고치거나 새로 짜고, 실행해 확인한다.',
    tools: 'Read, Write, Edit, Glob, Grep, Bash',
    body: '맡은 범위만 구현하라. 고친 뒤 직접 실행해 확인하고, 바꾼 파일과 확인 결과를 짧게 보고하라.',
  },
};

const DELEGATE_T1 =
  '\n\n일은 팀에게 나눠 맡기세요: 탐색(explorer)에게 코드 조사를, 조사(researcher)에게 docs 문서 정리를, 일꾼(worker)에게 수정을 맡기고, 당신은 계획과 최종 확인을 맡으세요.';
const WORKER1 = '\n\n구현은 일꾼(worker) 서브에이전트에게 맡기고, 당신은 설계와 검토를 맡으세요.';
const WORKER2 =
  '\n\n일꾼(worker) 서브에이전트 두 명을 동시에 돌려 일을 나눠 맡기고, 당신은 설계 · 통합 · 검토를 맡으세요. 두 일꾼이 같은 파일을 고치지 않게 나누세요.';

// mode: solo | plan (Opus 계획 → Sonnet 구현, 두 세션)
export const COMBOS = {
  t1: {
    'opus-solo': { model: 'opus' },
    'team-advisor': { model: 'opus', advisor: 'fable', agents: ['explorer', 'researcher', 'worker'] },
    'team-advisor-delegate': { model: 'opus', advisor: 'fable', agents: ['explorer', 'researcher', 'worker'], extra: DELEGATE_T1 },
    'team-delegate': { model: 'opus', agents: ['explorer', 'researcher', 'worker'], extra: DELEGATE_T1 },
  },
  t2: {
    'opus-solo': { model: 'opus' },
    'sonnet-solo': { model: 'sonnet' },
    'opus-fable': { model: 'opus', advisor: 'fable' },
    'sonnet-fable': { model: 'sonnet', advisor: 'fable' },
    'sonnet-opus': { model: 'sonnet', advisor: 'opus' },
    'opus-worker1': { model: 'opus', agents: ['worker'], extra: WORKER1 },
    'opus-worker2': { model: 'opus', agents: ['worker'], extra: WORKER2 },
    'opus-plan-sonnet': { model: 'opus', mode: 'plan', implementer: 'sonnet' },
  },
};

export const PROMPT = {
  t1: 'TASK.md의 과제를 수행하세요.',
  t2: 'TASK.md의 과제를 수행하세요.',
};

export const PLAN_PROMPT =
  'TASK.md의 과제를 직접 구현하지 말고, 구현 담당이 그대로 따라 짤 수 있는 설계 문서 PLAN.md만 쓰세요. 규칙 해석 · 자료구조 · 알고리즘 · 함정 · 검증 방법을 모두 담으세요.';
export const IMPL_PROMPT = 'PLAN.md 설계대로 TASK.md의 과제를 구현하세요.';

export const ADVISOR_LINE = '- 큰 계획을 세우기 전, 같은 오류가 두 번 날 때, 끝내기 전에는 감독관(advisor)에게 확인하세요.';

export function claudeMd(task, combo) {
  const lines = ['# 작업 안내', '', '- 과제는 `TASK.md`, 규칙은 `docs/` 에 있습니다.'];
  if (combo.advisor) lines.push(ADVISOR_LINE);
  return lines.join('\n') + '\n';
}

export function agentFile(name) {
  const a = AGENTS[name];
  return `---\nname: ${name}\ndescription: ${a.description}\nmodel: sonnet\neffort: medium\ntools: ${a.tools}\n---\n\n${a.body}\n`;
}
