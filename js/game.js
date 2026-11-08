// Mahe for mobile — 턴 진행·동기화
// 온라인: rooms/{code}/game 노드를 runTransaction으로 갱신한다.
// 노드 모양: { version, roller, decider, phase, at, deadline, s }  (s = 엔진 상태 JSON 문자열)
// 엔진 상태를 문자열로 저장하는 이유: Realtime Database는 빈 배열·null을 지워 버려
// 그대로 저장하면 상태가 깨진다. 보안 규칙이 확인할 값(version, roller, decider)만 따로 꺼내 둔다.
import * as E from './engine.js';

export const ANIM_GRACE_MS = 3000;     // 애니메이션 시간만큼 제한시간에 여유를 준다
export const ABSENT_GRACE_MS = 4000;   // 행동할 사람이 접속이 끊겼으면 이만큼 기다린 뒤 자동 처리

export function wrapState(state, version, now) {
  const sec = (state.settings && state.settings.decisionSec) || 30;
  const node = {
    version,
    phase: state.phase,
    roller: state.current ? state.current.roller : '',
    decider: state.current ? state.current.decider : '',
    at: now,
    deadline: state.phase === 'ended' ? 0 : now + sec * 1000 + ANIM_GRACE_MS,
    s: JSON.stringify(state),
  };
  return node;
}

export function unwrap(node) {
  if (!node || !node.s) return null;
  try { return JSON.parse(node.s); } catch (e) { return null; }
}

// 트랜잭션 안에서 부른다: 현재 노드에 행동을 적용한 새 노드, 적용할 수 없으면 undefined
export function applyActionToNode(node, action, uid, { expectedVersion, asHost = false, now = Date.now(), rng } = {}) {
  if (!node) return undefined;
  if (expectedVersion != null && node.version !== expectedVersion) return undefined;
  const state = unwrap(node);
  if (!state) return undefined;
  const actorOk = E.isLegal(state, action, uid) || (asHost && E.isLegal(state, action));
  if (!actorOk) return undefined;
  const next = E.act(state, action, rng);
  return wrapState(next, node.version + 1, now);
}

// 호스트 기기가 주기적으로 확인: 제한시간이 지났거나 행동할 사람이 나갔으면 대신 할 행동
export function overdueAction(node, players, now) {
  if (!node || node.phase === 'ended') return null;
  const state = unwrap(node);
  if (!state || !state.current) return null;
  const actorUid = state.phase === 'decide' ? state.current.decider : state.current.roller;
  const actor = players && players[actorUid];
  const absent = !actor || actor.connected === false;
  if (now > node.deadline || (absent && now > node.at + ABSENT_GRACE_MS)) return E.timeoutAction(state);
  return null;
}

// ---------- 한 기기 모드(핫시트) ----------
export function createLocalGame(players, settings) {
  let state = E.newGame(players, settings);
  let version = 1;
  const listeners = new Set();
  const emit = () => listeners.forEach(fn => fn(wrapState(state, version, Date.now())));
  return {
    subscribe(fn) { listeners.add(fn); fn(wrapState(state, version, Date.now())); return () => listeners.delete(fn); },
    async send(action, expectedVersion) {
      if (expectedVersion != null && expectedVersion !== version) return false;
      if (!E.isLegal(state, action)) return false;
      state = E.act(state, action);
      version++;
      emit();
      return true;
    },
    restart(newSettings) {
      state = E.newGame(players, newSettings || settings);
      version++;
      emit();
    },
    get state() { return state; },
  };
}
