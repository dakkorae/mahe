// Mahe for mobile — 방 만들기·참가·대기실·접속 상태 (Firebase 익명 로그인 + Realtime Database)
import { firebaseConfig, isConfigured } from './firebase-config.js';
import { applyActionToNode, wrapState } from './game.js';
import * as E from './engine.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
export const ROOM_TTL = 24 * 60 * 60 * 1000;

let fb = null;        // 불러온 SDK 함수들
let db = null, auth = null;
let uid = null;
let serverOffset = 0;
let presenceOff = null;

// 로컬 테스트용 에뮬레이터: localhost에서 ?emu=1
const params = new URLSearchParams(location.search);
const useEmulator = params.get('emu') === '1' && ['localhost', '127.0.0.1'].includes(location.hostname);

export const onlineAvailable = () => isConfigured || useEmulator;
export const myUid = () => uid;
export const serverNow = () => Date.now() + serverOffset;

export async function initOnline() {
  if (db) return uid;
  if (!onlineAvailable()) throw new Error('Firebase 설정이 필요합니다');
  const [app, authMod, dbMod] = await Promise.all([
    import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-database.js'),
  ]);
  fb = { ...app, ...authMod, ...dbMod };
  const config = useEmulator
    ? { apiKey: 'demo-key', projectId: 'demo-mahe', databaseURL: 'http://127.0.0.1:9000?ns=demo-mahe-default-rtdb' }
    : firebaseConfig;
  const fbApp = fb.initializeApp(config);
  auth = fb.getAuth(fbApp);
  db = fb.getDatabase(fbApp);
  if (useEmulator) {
    fb.connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    fb.connectDatabaseEmulator(db, '127.0.0.1', 9000);
  }
  uid = await new Promise((resolve, reject) => {
    const off = fb.onAuthStateChanged(auth, user => {
      if (user) { off(); resolve(user.uid); }
    });
    fb.signInAnonymously(auth).catch(e => { off(); reject(e); });
  });
  fb.onValue(fb.ref(db, '.info/serverTimeOffset'), s => { serverOffset = s.val() || 0; });
  return uid;
}

const roomPath = code => 'rooms/' + code;
const r = path => fb.ref(db, path);

function cleanName(name) { return String(name || '').trim().slice(0, 12); }

function freeColor(players, prefer) {
  const used = new Set(Object.values(players || {}).map(p => p.color));
  if (prefer && !used.has(prefer)) return prefer;
  const c = E.COLORS.find(c => !used.has(c.id));
  return c ? c.id : null;
}

export async function createRoom(name, preferColor) {
  name = cleanName(name);
  let code = null;
  for (let i = 0; i < 12; i++) {
    const c = String(1000 + Math.floor(Math.random() * 9000));
    const s = await fb.get(r(roomPath(c) + '/meta'));
    if (!s.exists()) { code = c; break; }
    // 24시간 지난 방은 정리하고 그 코드를 다시 쓴다
    if ((s.val().createdAt || 0) < serverNow() - ROOM_TTL) {
      try { await fb.remove(r(roomPath(c))); code = c; break; } catch (e) { /* 다른 코드로 */ }
    }
  }
  if (!code) throw new Error('방 코드를 만들지 못했어요. 다시 시도해 주세요');
  const now = serverNow();
  await fb.update(r(roomPath(code)), {
    meta: {
      hostUid: uid, status: 'lobby', createdAt: now,
      settings: { ...E.DEFAULT_SETTINGS },
    },
    ['players/' + uid]: { name, color: preferColor || 'blue', connected: true, joinedAt: now },
  });
  return code;
}

// 결과: { ok, code, error }
export async function joinRoom(code, name, preferColor) {
  code = String(code || '').trim();
  name = cleanName(name);
  if (!/^\d{4}$/.test(code)) return { ok: false, error: '방 코드는 숫자 4자리예요' };
  const metaSnap = await fb.get(r(roomPath(code) + '/meta'));
  if (!metaSnap.exists()) return { ok: false, error: '그런 방이 없어요. 코드를 다시 확인해 주세요' };
  const meta = metaSnap.val();
  const players = (await fb.get(r(roomPath(code) + '/players'))).val() || {};
  if (players[uid]) {
    await fb.update(r(`${roomPath(code)}/players/${uid}`), { name: name || players[uid].name, connected: true });
    return { ok: true, code };
  }
  if (meta.status !== 'lobby') return { ok: false, error: '게임이 진행 중이라 지금은 들어갈 수 없어요' };
  if (Object.keys(players).length >= E.MAX_PLAYERS) return { ok: false, error: '방이 가득 찼어요 (최대 7명)' };
  const color = freeColor(players, preferColor);
  await fb.set(r(`${roomPath(code)}/players/${uid}`), { name, color, connected: true, joinedAt: serverNow() });
  return { ok: true, code };
}

// 방 구독: cb({ meta, players, game }) — 방이 없어지면 meta=null
export function watchRoom(code, cb) {
  const cur = { meta: undefined, players: undefined, game: null };
  const offs = [];
  const emit = () => { if (cur.meta !== undefined && cur.players !== undefined) cb({ ...cur }); };
  offs.push(fb.onValue(r(roomPath(code) + '/meta'), s => { cur.meta = s.val(); emit(); }, () => { cur.meta = null; emit(); }));
  offs.push(fb.onValue(r(roomPath(code) + '/players'), s => { cur.players = s.val() || {}; emit(); }, () => { cur.players = {}; emit(); }));
  offs.push(fb.onValue(r(roomPath(code) + '/game'), s => { cur.game = s.val(); emit(); }, () => {}));
  startPresence(code);
  return () => { offs.forEach(off => off()); stopPresence(); };
}

function startPresence(code) {
  stopPresence();
  const meRef = r(`${roomPath(code)}/players/${uid}/connected`);
  presenceOff = fb.onValue(r('.info/connected'), async s => {
    if (s.val() !== true) return;
    try {
      await fb.onDisconnect(meRef).set(false);
      const exists = await fb.get(r(`${roomPath(code)}/players/${uid}`));
      if (exists.exists()) await fb.set(meRef, true);
    } catch (e) { /* 방이 사라짐 */ }
  });
}
function stopPresence() { if (presenceOff) { presenceOff(); presenceOff = null; } }

export async function setMyColor(code, color) {
  await fb.set(r(`${roomPath(code)}/players/${uid}/color`), color);
}

export async function setSettings(code, settings) {
  await fb.set(r(`${roomPath(code)}/meta/settings`), settings);
}

export async function leaveRoom(code, room) {
  stopPresence();
  if (!room || !room.meta) return;
  try {
    if (room.meta.hostUid === uid && (room.meta.status === 'lobby' || room.meta.status === 'ended')) {
      await fb.remove(r(roomPath(code)));
    } else if (room.meta.status === 'lobby') {
      await fb.onDisconnect(r(`${roomPath(code)}/players/${uid}/connected`)).cancel();
      await fb.remove(r(`${roomPath(code)}/players/${uid}`));
    } else {
      await fb.set(r(`${roomPath(code)}/players/${uid}/connected`), false);
    }
  } catch (e) { console.warn(e); }
}

export async function closeRoom(code) {
  stopPresence();
  await fb.remove(r(roomPath(code)));
}

// 호스트: 게임 시작 / 같은 멤버로 다시 하기
export async function startGame(code, room) {
  const list = Object.entries(room.players || {})
    .map(([id, p]) => ({ id, name: p.name, color: p.color, joinedAt: p.joinedAt || 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
  if (list.length < E.MIN_PLAYERS) throw new Error('2명 이상 모여야 시작할 수 있어요');
  const colors = list.map(p => p.color);
  if (new Set(colors).size !== colors.length) throw new Error('거북이 색이 겹치는 사람이 있어요');
  const state = E.newGame(list, room.meta.settings || {});
  const version = ((room.game && room.game.version) || 0) + 1;
  const node = wrapState(state, version, serverNow());
  await fb.set(r(roomPath(code) + '/game'), node);
  await fb.set(r(roomPath(code) + '/meta/status'), 'playing');
}

export async function backToLobby(code) {
  await fb.set(r(roomPath(code) + '/meta/status'), 'lobby');
}

export async function markEnded(code) {
  await fb.set(r(roomPath(code) + '/meta/status'), 'ended');
}

// 행동 보내기: version 확인으로 연타·동시 클릭은 한 번만 반영된다
export async function sendAction(code, action, expectedVersion, asHost = false) {
  const res = await fb.runTransaction(r(roomPath(code) + '/game'), node => {
    if (node === null) return node; // 캐시가 비어 있으면 서버 값으로 다시 시도된다
    return applyActionToNode(node, action, uid, { expectedVersion, asHost, now: serverNow() });
  }, { applyLocally: false });
  return res.committed;
}

// 호스트가 나갔으면 가장 먼저 들어온 접속 중인 사람이 호스트를 이어받는다
let takeoverTimer = null;
export function maybeTakeHost(code, room) {
  if (!room || !room.meta || !room.players) return;
  const host = room.players[room.meta.hostUid];
  const hostGone = !host || host.connected === false;
  if (!hostGone) { clearTimeout(takeoverTimer); takeoverTimer = null; return; }
  const next = Object.entries(room.players)
    .filter(([, p]) => p.connected !== false)
    .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0))[0];
  if (!next || next[0] !== uid || takeoverTimer) return;
  const oldHost = room.meta.hostUid;
  takeoverTimer = setTimeout(async () => {
    takeoverTimer = null;
    try {
      await fb.runTransaction(r(roomPath(code) + '/meta/hostUid'), cur => (cur === oldHost || cur === null ? uid : undefined));
    } catch (e) { console.warn('호스트 이전 실패', e); }
  }, 3000);
}

// 참가 링크
export function joinLink(code) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('room', code);
  if (useEmulator) u.searchParams.set('emu', '1');
  return u.toString();
}
