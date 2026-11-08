// Mahe for mobile — 규칙 엔진 (순수 함수)
// Firebase·화면을 모른다. 상태는 JSON으로 직렬화 가능한 순수 객체이고,
// 모든 함수는 입력 상태를 바꾸지 않고 새 상태를 돌려준다.

export const BOARD_SIZE = 21;      // 1~21번 칸, 21번이 알 해변
export const RAFT = 0;             // 출발 뗏목
export const MAX_DICE = 3;
export const BUST_OVER = 7;        // 합이 7을 넘으면 실패
export const BONUS_EGGS = 7;
export const EGG_CARDS = [6, 6, 5, 5, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 2, 2, 2, 2, 2, 1, 1, 1, 1, 1]; // 총 72알
export const DECK_SIZE = 20;       // 24장 중 4장은 보지 않고 뺀다

export const COLORS = [
  { id: 'red',    name: '빨강', hex: '#ef4444' },
  { id: 'orange', name: '주황', hex: '#f97316' },
  { id: 'yellow', name: '노랑', hex: '#facc15' },
  { id: 'green',  name: '초록', hex: '#22c55e' },
  { id: 'blue',   name: '파랑', hex: '#3b82f6' },
  { id: 'purple', name: '보라', hex: '#a855f7' },
  { id: 'pink',   name: '분홍', hex: '#ec4899' },
];
export const COLOR_BY_ID = Object.fromEntries(COLORS.map(c => [c.id, c]));
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 7;

export const DEFAULT_SETTINGS = { eggVariant: false, probHint: true, decisionSec: 30 };

// ---------- 난수 ----------
export function cryptoRandom() {
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    const a = new Uint32Array(1);
    globalThis.crypto.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

export function rollDie(rng = cryptoRandom) {
  return 1 + Math.floor(rng() * 6);
}

export function shuffle(list, rng = cryptoRandom) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 주사위 계산 ----------
export const diceSum = dice => dice.reduce((s, d) => s + d, 0);
export const isBust = dice => diceSum(dice) > BUST_OVER;
export function canContinue(dice) {
  return dice.length > 0 && dice.length < MAX_DICE && !isBust(dice);
}
export function moveDistance(dice) {
  return diceSum(dice) * dice.length;
}
// 다음 주사위 하나가 안전할(합 7 이하) 확률의 분자 (분모 6)
export function safeOutcomes(dice) {
  return Math.max(0, Math.min(6, BUST_OVER - diceSum(dice)));
}

// 위치 계산: 합 = 현재칸 + 이동칸, 도착칸 = 합 mod 21 (0이면 21)
export function destination(from, dist) {
  const total = from + dist;
  const to = total % BOARD_SIZE === 0 ? BOARD_SIZE : total % BOARD_SIZE;
  const passed = Math.floor(total / BOARD_SIZE) > Math.floor(from / BOARD_SIZE);
  return { to, passed };
}

// ---------- 상태 조회 ----------
const clone = o => JSON.parse(JSON.stringify(o));

export function positionOf(state, color) {
  for (const [pos, stack] of Object.entries(state.board)) {
    const idx = stack.indexOf(color);
    if (idx >= 0) return { pos: Number(pos), idx };
  }
  return null;
}

// color 거북이와 그 위에 올라탄 거북이들 (아래 → 위). 뗏목에서는 쌓이지 않는다.
export function stackFrom(state, color) {
  const p = positionOf(state, color);
  if (!p) return [];
  if (p.pos === RAFT) return [color];
  return state.board[p.pos].slice(p.idx);
}

export function ownerOf(state, color) {
  return state.turtles[color] ? state.turtles[color].owner : null;
}

// 결정권자: 움직이는 거북이 위 맨 위 거북이의 주인
export function deciderFor(state, color) {
  const s = stackFrom(state, color);
  return ownerOf(state, s[s.length - 1] || color);
}

export const currentPlayer = state => state.turnOrder[state.turnIdx];
export const nameOf = (state, uid) => (state.names && state.names[uid]) || '?';
export const turtlesOf = (state, uid) => Object.keys(state.turtles).filter(c => state.turtles[c].owner === uid);

export function scoreOf(state, uid) {
  const cards = state.eggs[uid] || [];
  const bonus = state.bonusUid === uid ? BONUS_EGGS : 0;
  return { eggs: diceSum(cards) + bonus, cards: cards.length + (bonus ? 1 : 0), bonus: !!bonus };
}

// 순위: 알 합계 → 카드 장수. 완전히 같으면 공동 순위.
export function ranking(state) {
  const rows = state.turnOrder.map(uid => ({ uid, name: nameOf(state, uid), ...scoreOf(state, uid), list: (state.eggs[uid] || []).slice() }));
  rows.sort((a, b) => b.eggs - a.eggs || b.cards - a.cards);
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    r.rank = prev && prev.eggs === r.eggs && prev.cards === r.cards ? prev.rank : i + 1;
  });
  return rows;
}

const label = (state, color) => `${COLOR_BY_ID[color].name}(${nameOf(state, ownerOf(state, color))})`;

// ---------- 게임 만들기 ----------
// players: [{ id, name, color }] 좌석 순서. 2~3명이면 1인당 거북이 2마리.
export function newGame(players, settings = {}, rng = cryptoRandom) {
  if (players.length < MIN_PLAYERS || players.length > MAX_PLAYERS) throw new Error('인원은 2~7명');
  const used = new Set(players.map(p => p.color));
  if (used.size !== players.length) throw new Error('색이 겹칩니다');
  const spare = COLORS.map(c => c.id).filter(c => !used.has(c));
  const turtles = {};
  const names = {};
  const eggs = {};
  for (const p of players) {
    turtles[p.color] = { owner: p.id };
    names[p.id] = p.name;
    eggs[p.id] = [];
  }
  if (players.length <= 3) {
    for (const p of players) turtles[spare.shift()] = { owner: p.id };
  }
  const deck = shuffle(EGG_CARDS, rng).slice(0, DECK_SIZE);
  const turnOrder = players.map(p => p.id);
  const state = {
    turnOrder,
    turnIdx: Math.floor(rng() * turnOrder.length),
    names,
    turtles,
    board: { [RAFT]: Object.keys(turtles) },
    deck,
    eggs,
    bonusUid: null,
    settings: { ...DEFAULT_SETTINGS, ...settings },
    phase: 'roll',
    current: null,
    seq: 0,
    events: [],
    log: [],
  };
  return startTurn(state);
}

function startTurn(state) {
  const p = currentPlayer(state);
  const mine = turtlesOf(state, p);
  state.current = { roller: p, decider: p, turtle: null, dice: [], usedCard: null, moved: [] };
  if (mine.length > 1) {
    state.phase = 'chooseTurtle';
  } else {
    state.current.turtle = mine[0];
    state.phase = 'roll';
  }
  return state;
}

function pushLog(state, text) {
  state.log = [{ text }].concat(state.log || []).slice(0, 30);
}

// ---------- 이동과 실패 ----------
export function applyMove(state0, turtle, dice) {
  const state = clone(state0);
  const { pos: from } = positionOf(state, turtle);
  const group = stackFrom(state, turtle);
  const dist = moveDistance(dice);
  const { to, passed } = destination(from, dist);

  // 출발칸에서 무리를 떼어낸다
  if (from === RAFT) state.board[RAFT] = state.board[RAFT].filter(c => c !== turtle);
  else state.board[from] = state.board[from].slice(0, state.board[from].length - group.length);
  if (!state.board[from].length && from !== RAFT) delete state.board[from];
  // 도착칸 위에 쌓는다
  state.board[to] = (state.board[to] || []).concat(group);

  const events = [{ type: 'move', turtle, group, from, to, dist, dice: dice.slice() }];
  pushLog(state, `${label(state, turtle)} ${dice.join('+')}=${diceSum(dice)} × ${dice.length} = ${dist}칸 이동${group.length > 1 ? ` (${group.length}마리 함께)` : ''}`);

  if (passed) {
    const topColor = group[group.length - 1];
    const winner = ownerOf(state, topColor);
    if (state.deck.length) {
      const card = state.deck.shift();
      state.eggs[winner] = (state.eggs[winner] || []).concat(card);
      events.push({ type: 'egg', owner: winner, card, color: topColor });
      pushLog(state, `${nameOf(state, winner)} 알 ${card}개 카드 획득! (남은 카드 ${state.deck.length}장)`);
    } else if (!state.bonusUid) {
      state.bonusUid = winner;
      state.phase = 'ended';
      events.push({ type: 'bonus', owner: winner, card: BONUS_EGGS, color: topColor });
      events.push({ type: 'end' });
      pushLog(state, `${nameOf(state, winner)} 7알 해변 보너스! 게임 종료`);
    }
  }
  return { state, events };
}

export function applyBust(state0, turtle) {
  const state = clone(state0);
  const { pos: from } = positionOf(state, turtle);
  const group = stackFrom(state, turtle);
  if (from !== RAFT) {
    state.board[from] = state.board[from].slice(0, state.board[from].length - group.length);
    if (!state.board[from].length) delete state.board[from];
    state.board[RAFT] = state.board[RAFT].concat(group);
  }
  const events = [{ type: 'bust', turtle, group, from }];
  pushLog(state, `${label(state, turtle)} 합 ${diceSum(state.current.dice)}! 7 초과로 ${from === RAFT ? '뗏목에 그대로' : `${group.length > 1 ? `${group.length}마리가 ` : ''}뗏목으로 복귀`}`);
  return { state, events };
}

export function nextTurn(state0) {
  const state = clone(state0);
  state.turnIdx = (state.turnIdx + 1) % state.turnOrder.length;
  return startTurn(state);
}

// 거북이 한 마리의 이동이 끝난 뒤: 같은 플레이어의 다음 거북이 또는 다음 차례
function finishTurtle(state0, turtle) {
  if (state0.phase === 'ended') return state0;
  const state = clone(state0);
  const p = currentPlayer(state);
  const moved = (state.current.moved || []).concat(turtle);
  const remaining = turtlesOf(state, p).filter(c => !moved.includes(c));
  if (remaining.length) {
    state.current = { roller: p, decider: p, turtle: remaining[0], dice: [], usedCard: null, moved };
    state.phase = 'roll';
    return state;
  }
  return nextTurn(state);
}

// ---------- 행동 ----------
// action: {type:'choose', turtle} | {type:'roll'} | {type:'more'} | {type:'stop'} | {type:'card', index}
export function actorFor(state, action) {
  if (!state.current || state.phase === 'ended') return null;
  if (action.type === 'choose' || action.type === 'roll') return state.current.roller;
  return state.current.decider;
}

export function legalActions(state) {
  const c = state.current;
  switch (state.phase) {
    case 'chooseTurtle':
      return turtlesOf(state, c.roller).filter(t => !(c.moved || []).includes(t)).map(turtle => ({ type: 'choose', turtle }));
    case 'roll':
      return [{ type: 'roll' }];
    case 'decide': {
      const acts = [{ type: 'more' }, { type: 'stop' }];
      if (state.settings.eggVariant && c.usedCard == null && c.dice.length < MAX_DICE) {
        (state.eggs[c.decider] || []).forEach((v, index) => acts.push({ type: 'card', index, value: v }));
      }
      return acts;
    }
    default:
      return [];
  }
}

export function isLegal(state, action, uid) {
  if (uid !== undefined && actorFor(state, action) !== uid) return false;
  return legalActions(state).some(a => a.type === action.type
    && (a.type !== 'choose' || a.turtle === action.turtle)
    && (a.type !== 'card' || a.index === action.index));
}

// 행동을 적용해 새 상태를 돌려준다. 잘못된 행동이면 예외.
// 주사위 값은 rng로 만든다(행동 권한이 있는 기기에서 굴린다).
export function act(state0, action, rng = cryptoRandom) {
  if (!isLegal(state0, action)) throw new Error('지금 할 수 없는 행동입니다: ' + action.type);
  let state = clone(state0);
  let events = [];
  const c = state.current;

  if (action.type === 'choose') {
    c.turtle = action.turtle;
    state.phase = 'roll';
  } else if (action.type === 'roll' || action.type === 'more' || action.type === 'card') {
    let value;
    if (action.type === 'card') {
      const cards = state.eggs[c.decider].slice();
      value = cards.splice(action.index, 1)[0];
      state.eggs[c.decider] = cards;
      c.usedCard = value;
      pushLog(state, `${nameOf(state, c.decider)} 알 카드 ${value}을(를) 주사위 대신 사용`);
    } else {
      value = rollDie(rng);
    }
    c.dice = c.dice.concat(value);
    events.push({ type: 'roll', dice: c.dice.slice(), byCard: action.type === 'card' });
    if (c.dice.length === 1) c.decider = deciderFor(state, c.turtle);

    if (isBust(c.dice)) {
      const r = applyBust(state, c.turtle);
      state = r.state; events = events.concat(r.events);
      state = finishTurtle(state, c.turtle);
    } else if (c.dice.length >= MAX_DICE) {
      const r = applyMove(state, c.turtle, c.dice);
      state = r.state; events = events.concat(r.events);
      state = finishTurtle(state, c.turtle);
    } else {
      state.phase = 'decide';
    }
  } else if (action.type === 'stop') {
    const r = applyMove(state, c.turtle, c.dice);
    state = r.state; events = events.concat(r.events);
    state = finishTurtle(state, c.turtle);
  }

  state.seq = (state0.seq || 0) + 1;
  state.events = events;
  return state;
}

// 제한시간이 지났을 때 대신 할 행동: 거북이 선택 → 첫 번째, 굴리기 → 굴림, 결정 → 멈춤
export function timeoutAction(state) {
  if (state.phase === 'chooseTurtle') return legalActions(state)[0];
  if (state.phase === 'roll') return { type: 'roll' };
  if (state.phase === 'decide') return { type: 'stop' };
  return null;
}

// 화면에 보여줄 한 줄 안내
export function turnText(state) {
  if (state.phase === 'ended') return '게임 종료';
  const c = state.current;
  const roller = nameOf(state, c.roller);
  if (state.phase === 'chooseTurtle') return `${roller} 차례 · 먼저 움직일 거북이 고르기`;
  const t = c.turtle ? COLOR_BY_ID[c.turtle].name : '';
  if (state.phase === 'roll') return `${roller} 차례 · ${t} 거북이`;
  const decider = nameOf(state, c.decider);
  return c.decider === c.roller ? `${roller} 차례 · ${t} 거북이 · 결정: ${roller}` : `${roller} 차례 · ${t} 거북이 · 결정: ${decider}(맨 위)`;
}
