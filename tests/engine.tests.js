// 규칙 엔진 테스트. 브라우저(tests/engine.test.html)와 Node(node tests/run-node.mjs) 둘 다에서 돈다.
import * as E from '../js/engine.js';

// 정해진 순서의 주사위 눈을 내는 rng (눈 d → (d-1)/6 + 작은 값)
const fixedDice = (...vals) => { let i = 0; return () => (vals[i++ % vals.length] - 1) / 6 + 0.01; };
const seq = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };

function baseState(players = 4) {
  const ps = [['a', '민지', 'red'], ['b', '준호', 'blue'], ['c', '서연', 'green'], ['d', '도윤', 'yellow'], ['e', '하린', 'pink'], ['f', '지우', 'purple'], ['g', '시우', 'orange']]
    .slice(0, players).map(([id, name, color]) => ({ id, name, color }));
  const s = E.newGame(ps, {}, seq());
  s.turnIdx = 0;
  s.current = null;
  return E.nextTurn({ ...s, turnIdx: s.turnOrder.length - 1 }); // a 차례로 시작
}

// 보드를 직접 배치한다: { 7: ['blue','red'] } (아래 → 위)
function place(state, layout) {
  const all = Object.keys(state.turtles);
  const board = { 0: [] };
  const placed = new Set();
  for (const [pos, stack] of Object.entries(layout)) { board[pos] = stack.slice(); stack.forEach(c => placed.add(c)); }
  board[0] = all.filter(c => !placed.has(c)).concat(layout[0] || []).filter((c, i, a) => a.indexOf(c) === i);
  return { ...state, board };
}

export const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => {
  const A = JSON.stringify(a), B = JSON.stringify(b);
  if (A !== B) throw new Error(`${msg} 기대 ${B}, 실제 ${A}`);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || '조건 실패'); };

test('알 카드 구성은 24장 87알(1·2·6알 3장씩, 3·4·5알 5장씩), 덱은 24장 전부', () => {
  eq(E.EGG_CARDS.length, 24);
  eq(E.diceSum(E.EGG_CARDS), 87);
  const count = v => E.EGG_CARDS.filter(x => x === v).length;
  eq([1, 2, 3, 4, 5, 6].map(count), [3, 3, 5, 5, 5, 3]);
  const s = baseState();
  eq(s.deck.length, 24);
});

test('이동 거리 = 합 × 개수, 계속 가능 여부', () => {
  eq(E.moveDistance([6]), 6);
  eq(E.moveDistance([2, 3]), 10);
  eq(E.moveDistance([1, 2, 4]), 21);
  ok(E.canContinue([3]));
  ok(E.canContinue([3, 4]));
  ok(!E.canContinue([1, 1, 1]), '3개면 더 못 굴림');
  ok(!E.canContinue([5, 4]), '합 9는 실패');
  eq(E.safeOutcomes([3]), 4);
  eq(E.safeOutcomes([6, 1]), 0);
});

test('위치 계산: 도착칸과 21번 통과', () => {
  eq(E.destination(0, 6), { to: 6, passed: false });
  eq(E.destination(18, 3), { to: 21, passed: true });
  eq(E.destination(18, 5), { to: 2, passed: true });
  eq(E.destination(21, 3), { to: 3, passed: false });
  eq(E.destination(21, 21), { to: 21, passed: true }, '21번에서 21칸이면 제자리 + 카드');
  eq(E.destination(0, 21), { to: 21, passed: true });
});

test('2~3명이면 1인당 거북이 2마리, 4명 이상이면 1마리', () => {
  const s2 = E.newGame([{ id: 'a', name: 'A', color: 'red' }, { id: 'b', name: 'B', color: 'blue' }], {}, seq());
  eq(Object.keys(s2.turtles).length, 4);
  eq(E.turtlesOf(s2, 'a').length, 2);
  eq(s2.phase, 'chooseTurtle');
  const s4 = baseState(4);
  eq(Object.keys(s4.turtles).length, 4);
  eq(s4.phase, 'roll');
  eq(s4.board[0].length, 4, '모두 뗏목에서 출발');
});

test('업기: 다른 거북이가 있는 칸에 멈추면 위에 올라간다', () => {
  let s = place(baseState(), { 4: ['blue'] });
  s = E.act(s, { type: 'roll' }, fixedDice(4)); // red: 4
  eq(s.phase, 'decide');
  s = E.act(s, { type: 'stop' });
  eq(s.board[4], ['blue', 'red']);
});

test('업기: 위 거북이만 함께 가고 아래 거북이는 남는다 + 결정권은 맨 위 주인', () => {
  let s = place(baseState(), { 3: ['green', 'red', 'blue'] }); // a(red) 위에 b(blue)
  s = E.act(s, { type: 'roll' }, fixedDice(2));
  eq(s.current.decider, 'b', '결정권은 맨 위 blue의 주인');
  ok(!E.isLegal(s, { type: 'stop' }, 'a'), '굴린 사람은 결정 못 함');
  s = E.act(s, { type: 'stop' });
  eq(s.board[3], ['green']);
  eq(s.board[5], ['red', 'blue']);
});

test('업힌 채 실패: 움직이는 거북이와 그 위만 뗏목으로', () => {
  let s = place(baseState(), { 6: ['green', 'red', 'blue'] });
  s = E.act(s, { type: 'roll' }, fixedDice(5));
  s = E.act(s, { type: 'more' }, fixedDice(4)); // 합 9 실패
  eq(s.board[6], ['green']);
  ok(s.board[0].includes('red') && s.board[0].includes('blue'));
  eq(s.events.map(e => e.type), ['roll', 'bust']);
  eq(E.currentPlayer(s), 'b', '실패하면 다음 차례');
});

test('뗏목에서는 쌓이지 않는다', () => {
  let s = place(baseState(), { 2: ['red', 'blue'] });
  s = E.act(s, { type: 'roll' }, fixedDice(4));
  s = E.act(s, { type: 'more' }, fixedDice(6));
  ok(!s.board[2]);
  eq(E.positionOf(s, 'blue').pos, 0);
  eq(E.stackFrom(s, 'red'), ['red'], '뗏목 위 거북이는 혼자 움직임');
});

test('주사위 3개면 자동 이동', () => {
  let s = baseState();
  s = E.act(s, { type: 'roll' }, fixedDice(1));
  s = E.act(s, { type: 'more' }, fixedDice(2));
  s = E.act(s, { type: 'more' }, fixedDice(3)); // 6 × 3 = 18
  eq(E.positionOf(s, 'red').pos, 18);
  eq(E.currentPlayer(s), 'b');
});

test('21번 통과 시 무리의 맨 위 주인이 공개 카드를 가져간다', () => {
  let s = place(baseState(), { 19: ['red', 'blue'] });
  const top = s.deck[0];
  s = E.act(s, { type: 'roll' }, fixedDice(4)); // 19 + 4 = 23 → 2번, 통과
  s = E.act(s, { type: 'stop' });
  eq(s.board[2], ['red', 'blue']);
  eq(s.eggs.b, [top], 'blue 주인 b가 획득');
  eq(s.eggs.a, []);
  eq(s.deck.length, 23);
});

test('21칸 이동하면 제자리로 돌아오며 카드 획득', () => {
  let s = place(baseState(), { 21: ['red'] });
  s = E.act(s, { type: 'roll' }, fixedDice(1));
  s = E.act(s, { type: 'more' }, fixedDice(2));
  s = E.act(s, { type: 'more' }, fixedDice(4));
  eq(E.positionOf(s, 'red').pos, 21);
  eq(s.eggs.a.length, 1);
});

test('덱 소진 후 처음 21번 통과한 무리 맨 위 주인이 7알 보너스, 게임 종료', () => {
  let s = place(baseState(), { 20: ['red', 'green'] });
  s.deck = [];
  s = E.act(s, { type: 'roll' }, fixedDice(3));
  s = E.act(s, { type: 'stop' });
  eq(s.phase, 'ended');
  eq(s.bonusUid, 'c');
  eq(E.scoreOf(s, 'c'), { eggs: 7, cards: 1, bonus: true });
  ok(!E.isLegal(s, { type: 'roll' }), '종료 후 행동 불가');
});

test('동점 판정: 알 합계 → 카드 장수, 같으면 공동 순위', () => {
  const s = baseState();
  s.eggs = { a: [6, 4], b: [5, 3, 2], c: [3, 3, 4], d: [1] };
  s.bonusUid = null;
  const r = E.ranking(s);
  eq(r.map(x => x.uid), ['b', 'c', 'a', 'd']);
  eq(r.map(x => x.rank), [1, 1, 3, 4]);
});

test('2인 모드: 먼저 움직일 거북이를 고르고 두 마리를 차례로 움직인다', () => {
  let s = E.newGame([{ id: 'a', name: 'A', color: 'red' }, { id: 'b', name: 'B', color: 'blue' }], {}, seq());
  s = { ...s, turnIdx: 0 };
  s.current.roller = s.current.decider = 'a';
  const mine = E.turtlesOf(s, 'a');
  s = E.act(s, { type: 'choose', turtle: mine[1] });
  eq(s.current.turtle, mine[1]);
  s = E.act(s, { type: 'roll' }, fixedDice(3));
  s = E.act(s, { type: 'stop' });
  eq(E.currentPlayer(s), 'a', '두 번째 거북이 차례');
  eq(s.current.turtle, mine[0]);
  eq(s.phase, 'roll');
  s = E.act(s, { type: 'roll' }, fixedDice(2));
  s = E.act(s, { type: 'stop' });
  eq(E.currentPlayer(s), 'b');
  eq(s.phase, 'chooseTurtle');
});

test('변형 규칙: 알 카드로 2번째 주사위 대체, 쓴 카드는 점수에서 빠짐', () => {
  let s = baseState();
  s.settings = { ...s.settings, eggVariant: true };
  s.eggs.a = [3, 1];
  s = E.act(s, { type: 'roll' }, fixedDice(2));
  ok(E.legalActions(s).some(x => x.type === 'card'));
  s = E.act(s, { type: 'card', index: 0 });
  eq(s.current.dice, [2, 3]);
  eq(s.eggs.a, [1]);
  ok(!E.legalActions(s).some(x => x.type === 'card'), '턴당 1장');
});

test('잘못된 행동은 거부된다', () => {
  const s = baseState();
  let threw = false;
  try { E.act(s, { type: 'stop' }); } catch (e) { threw = true; }
  ok(threw, '굴리기 전에 멈춤 불가');
  ok(!E.isLegal(s, { type: 'roll' }, 'b'), '다른 사람 차례에 굴리기 불가');
});

test('무작위 한 판(4명)을 끝까지 하면 결과가 나온다', () => {
  const rng = seq();
  let s = baseState(4);
  let guard = 0;
  while (s.phase !== 'ended' && guard++ < 5000) {
    const acts = E.legalActions(s);
    let a = acts[0];
    if (s.phase === 'decide') a = E.safeOutcomes(s.current.dice) >= 3 && rng() < 0.6 ? { type: 'more' } : { type: 'stop' };
    s = E.act(s, a, rng);
    const total = Object.values(s.board).reduce((n, st) => n + st.length, 0);
    if (total !== 4) throw new Error('거북이 수가 맞지 않음');
  }
  eq(s.phase, 'ended');
  const all = s.turnOrder.reduce((n, u) => n + E.scoreOf(s, u).eggs, 0);
  ok(all <= 87 + 7, '알 총합이 범위 안');
});

export function runAll() {
  const results = [];
  for (const t of tests) {
    try { t.fn(); results.push({ name: t.name, pass: true }); }
    catch (e) { results.push({ name: t.name, pass: false, error: e.message }); }
  }
  return results;
}
