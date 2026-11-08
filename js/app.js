// Mahe for mobile — 화면 구성과 흐름 (첫 화면 → 대기실 → 게임 → 결과)
import * as E from './engine.js';
import { unwrap, overdueAction, createLocalGame } from './game.js';
import * as Room from './room.js';
import { watchOrientation, keepAwake, chime, soundOn, sound } from './layout.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function store(k, v) {
  try {
    if (v === undefined) return localStorage.getItem(k);
    if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
  } catch (e) { return null; }
}
let toastTimer;
function toast(msg) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}
let boardToastTimer;
function boardToast(msg) {
  const t = $('toastBoard'); t.textContent = msg; t.classList.add('show');
  clearTimeout(boardToastTimer); boardToastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}
const colorDot = (color, letter = '', sm = false) => `<span class="dot${sm ? ' sm' : ''}" style="background:${E.COLOR_BY_ID[color] ? E.COLOR_BY_ID[color].hex : '#999'}">${esc(letter)}</span>`;
const initial = name => (String(name || '?').trim()[0] || '?').toUpperCase();
const DIE_FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// ---------- 앱 상태 ----------
const app = {
  mode: null,            // 'online' | 'local'
  code: null,
  room: null,            // { meta, players, game }
  unwatch: null,
  local: null,
  localUnsub: null,
  state: null,           // 엔진 상태(화면에 반영된 것)
  node: null,
  shownVersion: -1,
  animToken: 0,
  busy: false,
  scene: null,
  sceneReady: null,
  lastOverdueTry: -1,
  view: 'home',
};
const me = () => (app.mode === 'online' ? Room.myUid() : null);
const isHost = () => app.mode === 'local' || (app.room && app.room.meta && app.room.meta.hostUid === Room.myUid());

// ---------- 시작 ----------
function setProgress(p, text) { $('progressBar').style.width = Math.round(p * 100) + '%'; if (text) $('loadingText').textContent = text; }

async function boot() {
  watchOrientation(() => app.scene && app.scene.resize());
  setProgress(0.15, '3D 엔진 불러오는 중…');
  app.sceneReady = loadScene();
  await app.sceneReady.catch(() => {});
  setProgress(0.7, '접속 준비 중…');
  if (Room.onlineAvailable()) {
    try {
      await Room.initOnline();
      setProgress(0.95);
      // 새로고침·앱 전환 후 같은 방으로 복귀
      const q = new URLSearchParams(location.search);
      const saved = store('mahe_room');
      if (saved && (!q.get('room') || q.get('room') === saved)) {
        const res = await Room.joinRoom(saved, store('mahe_name') || '', store('mahe_color'));
        if (res.ok) { $('loading').hidden = true; enterRoom(saved); return; }
        store('mahe_room', null);
      }
    } catch (e) {
      console.error(e);
      app.onlineError = e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation'
        ? 'Firebase에서 익명 로그인이 꺼져 있어요 (SETUP.md 3단계)'
        : '온라인 연결에 실패했어요: ' + (e.code || e.message);
    }
  }
  $('loading').hidden = true;
  showHome();
}

async function loadScene() {
  const mod = await import('./scene3d.js');
  if (!mod.webglAvailable()) { app.noWebgl = true; return null; }
  const saved = store('mahe_quality') || 'auto';
  const lowEnd = (navigator.deviceMemory && navigator.deviceMemory <= 3) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
  const q = saved === 'auto' ? (lowEnd ? 'medium' : 'high') : saved;
  let lastDrop = 0;
  app.scene = mod.createScene($('board'), {
    quality: q,
    onDiceRolled: ev => { renderDice(ev.dice, ev.byCard ? ev.dice.length - 1 : -1); chime(E.isBust(ev.dice) ? 'bust' : 'dice'); },
    onFps: fps => {
      // 자동 품질: 프레임이 낮으면 한 단계씩 낮춘다
      if ((store('mahe_quality') || 'auto') !== 'auto' || $('game').hidden) return;
      const now = performance.now();
      if (fps < 38 && now - lastDrop > 4000) {
        const next = { high: 'medium', medium: 'low' }[app.scene.quality];
        if (next) { lastDrop = now; app.scene.setQuality(next); }
      }
    },
  });
  return app.scene;
}

// ---------- 첫 화면 ----------
function brand() {
  return `<div class="brand"><div class="turtles">🐢🥚🐢</div><h1>Mahe<small>FOR MOBILE</small></h1></div>`;
}

function showHome() {
  app.view = 'home';
  showScreen();
  const q = new URLSearchParams(location.search);
  const invite = (q.get('room') || '').replace(/\D/g, '').slice(0, 4);
  const online = Room.onlineAvailable() && !app.onlineError;
  const name = store('mahe_name') || '';
  const offlineNote = !Room.onlineAvailable()
    ? `<p class="notice">온라인 방을 쓰려면 <b>js/firebase-config.js</b>에 Firebase 설정값을 넣어야 해요 (SETUP.md 참고). 지금은 <b>한 기기로 하기</b>만 할 수 있어요.</p>`
    : app.onlineError ? `<p class="notice">${esc(app.onlineError)}</p>` : '';
  $('screen').className = 'screen wide';
  $('screen').innerHTML = brand() + (invite && online ? `
    <section class="card">
      <div class="eyebrow">INVITATION</div>
      <h2>방 ${esc(invite)}에 초대받았어요</h2>
      <label class="field"><span>닉네임</span><input id="inName" maxlength="12" value="${esc(name)}" placeholder="예: 민지" autocomplete="nickname"></label>
      <button class="btn orange block" data-act="join" data-code="${esc(invite)}">참가하기</button>
      <p class="muted center" style="margin:10px 0 0"><a href="${esc(location.pathname)}">처음 화면으로</a></p>
    </section>` : `
    <section class="card">
      ${offlineNote}
      <label class="field"><span>닉네임</span><input id="inName" maxlength="12" value="${esc(name)}" placeholder="예: 민지" autocomplete="nickname"></label>
      <div class="stack">
        <button class="btn orange block" data-act="create" ${online ? '' : 'disabled'}>방 만들기</button>
        <div class="divider">또는 방 코드로 참가</div>
        <div class="row" style="gap:8px">
          <input id="inCode" class="field code-input" style="flex:1;height:48px;border:2px solid var(--line);border-radius:12px;margin:0;min-width:0" inputmode="numeric" maxlength="4" placeholder="0000" ${online ? '' : 'disabled'}>
          <button class="btn" data-act="join" ${online ? '' : 'disabled'}>참가</button>
        </div>
      </div>
    </section>
    <section class="card">
      <h2>한 기기로 하기</h2>
      <p class="muted" style="margin-top:0">휴대폰 한 대를 돌려 가며 여러 명이 함께 해요. 인터넷 방이 없어도 돼요.</p>
      <button class="btn ghost block" data-act="hotseat">한 기기로 시작</button>
    </section>
    <section class="card">
      <h2>규칙 한눈에</h2>
      <ol class="muted" style="margin:0;padding-left:18px">
        <li>주사위를 굴리고, 더 굴릴지 멈출지 정해요 (최대 3개).</li>
        <li>합이 <b>7을 넘으면</b> 실패! 거북이가 뗏목으로 돌아가요.</li>
        <li>멈추면 <b>합 × 주사위 개수</b>만큼 앞으로 가요.</li>
        <li>다른 거북이 칸에 멈추면 등에 올라타요. 맨 위 거북이 주인이 결정해요.</li>
        <li>21번 해변을 지나면 맨 위 거북이 주인이 알 카드를 가져가요.</li>
        <li>카드가 다 떨어진 뒤 처음 21번을 지나면 7알 보너스와 함께 끝! 알이 많은 사람이 승리.</li>
      </ol>
    </section>`);
  const codeIn = $('inCode');
  if (codeIn) codeIn.addEventListener('input', () => { codeIn.value = codeIn.value.replace(/\D/g, '').slice(0, 4); });
}

function readName() {
  const v = ($('inName') && $('inName').value || '').trim().slice(0, 12);
  if (!v) { toast('닉네임을 먼저 적어 주세요'); $('inName') && $('inName').focus(); return null; }
  store('mahe_name', v);
  return v;
}

function showScreen() {
  $('screen').hidden = false;
  $('game').hidden = true;
  keepAwake(false);
}

// ---------- 온라인 방 ----------
async function createRoom() {
  const name = readName(); if (!name) return;
  try {
    const code = await Room.createRoom(name, store('mahe_color') || 'blue');
    enterRoom(code);
  } catch (e) { console.error(e); toast(e.message || '방을 만들지 못했어요'); }
}

async function joinRoom(code) {
  const name = readName(); if (!name) return;
  code = code || ($('inCode') && $('inCode').value);
  try {
    const res = await Room.joinRoom(code, name, store('mahe_color'));
    if (!res.ok) return toast(res.error);
    enterRoom(res.code);
  } catch (e) { console.error(e); toast('참가하지 못했어요: ' + (e.code || e.message)); }
}

function enterRoom(code) {
  if (app.unwatch) app.unwatch();
  app.mode = 'online';
  app.code = code;
  app.shownVersion = -1;
  app.state = null;
  store('mahe_room', code);
  const u = new URL(location.href);
  if (u.searchParams.has('room')) { u.searchParams.delete('room'); history.replaceState(null, '', u); }
  app.unwatch = Room.watchRoom(code, room => onRoom(room));
}

function onRoom(room) {
  const prevStatus = app.room && app.room.meta && app.room.meta.status;
  app.room = room;
  if (!room.meta) { leaveLocal(); toast('방이 닫혔어요'); return; }
  if (!room.players[Room.myUid()]) { leaveLocal(); toast('방에서 나왔어요'); return; }
  Room.maybeTakeHost(app.code, room);
  if (room.meta.status === 'lobby') {
    if (prevStatus && prevStatus !== 'lobby') { app.shownVersion = -1; app.state = null; }
    renderLobby();
  } else if (room.game) {
    onGameNode(room.game);
  }
}

function leaveLocal() {
  if (app.unwatch) app.unwatch();
  if (app.localUnsub) app.localUnsub();
  app.unwatch = app.localUnsub = null;
  app.mode = null; app.code = null; app.room = null; app.local = null; app.state = null; app.node = null; app.shownVersion = -1;
  store('mahe_room', null);
  app.scene && app.scene.reset();
  $('result').hidden = true;
  showHome();
}

let qrCache = {};
function qrImage(url) {
  if (!qrCache[url] && window.QRCode) {
    try {
      const tmp = document.createElement('div');
      new QRCode(tmp, { text: url, width: 320, height: 320, colorDark: '#0f172a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
      const c = tmp.querySelector('canvas');
      qrCache[url] = c ? c.toDataURL() : (tmp.querySelector('img') || {}).src;
    } catch (e) { /* QR 없이 진행 */ }
  }
  return qrCache[url] ? `<div class="qr"><img src="${qrCache[url]}" alt="참가용 QR 코드"></div>` : '';
}

function renderLobby() {
  app.view = 'lobby';
  showScreen();
  $('result').hidden = true;
  const room = app.room, my = Room.myUid();
  const host = isHost();
  const players = Object.entries(room.players).sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
  const used = new Set(players.filter(([id]) => id !== my).map(([, p]) => p.color));
  const mine = room.players[my];
  const s = { ...E.DEFAULT_SETTINGS, ...(room.meta.settings || {}) };
  const link = Room.joinLink(app.code);
  const n = players.length;
  const dup = new Set(players.map(([, p]) => p.color)).size !== n;

  // 입력 중인 요소가 있으면 포커스를 잃지 않게 바뀐 부분만 다시 그리기 어렵기 때문에, 대기실은 단순 재렌더
  $('screen').className = 'screen wide';
  $('screen').innerHTML = brand() + `
  <section class="card">
    <div class="eyebrow center">ROOM CODE</div>
    <div class="bigcode">${esc(app.code)}</div>
    ${host ? qrImage(link) : ''}
    <p class="muted center" style="margin:6px 0 10px">${host ? 'QR을 찍거나 링크로 들어오면 바로 참가해요.<br>' : ''}같은 주소에서 이 코드를 입력해도 돼요.</p>
    <button class="btn ghost block small" data-act="share">참가 링크 ${navigator.share ? '보내기' : '복사'}</button>
  </section>
  <section class="card">
    <h2>참가자 ${n}/${E.MAX_PLAYERS}</h2>
    <ul class="plist">
      ${players.map(([id, p]) => `<li>${colorDot(p.color, initial(p.name))}
        <span class="pname">${esc(p.name)}${id === room.meta.hostUid ? '<span class="tag">HOST</span>' : ''}${id === my ? '<span class="tag me">나</span>' : ''}</span>
        <span class="online ${p.connected === false ? 'off' : ''}" title="${p.connected === false ? '연결 끊김' : '접속 중'}"></span></li>`).join('')}
    </ul>
    <p class="muted" style="margin:8px 0 0">${n <= 3 ? `2~3명이면 거북이를 <b>1인당 2마리</b>씩 자동으로 받아요.` : '1인당 거북이 1마리로 해요.'}</p>
  </section>
  <section class="card">
    <h2>내 거북이 색</h2>
    <div class="swatches">
      ${E.COLORS.map(c => `<button class="swatch ${mine && mine.color === c.id ? 'on' : ''}" style="background:${c.hex}" data-act="color" data-color="${c.id}" ${used.has(c.id) ? 'disabled' : ''} aria-label="${c.name}">${mine && mine.color === c.id ? '✓' : ''}</button>`).join('')}
    </div>
  </section>
  <section class="card">
    <h2>방 설정 ${host ? '' : '<span class="muted">(호스트가 정해요)</span>'}</h2>
    ${settingsForm(s, !host)}
  </section>
  <section class="card stack">
    ${host
      ? `<button class="btn green block" data-act="start" ${n >= 2 && !dup ? '' : 'disabled'}>게임 시작</button>
         ${n < 2 ? '<p class="muted center" style="margin:0">2명 이상 모이면 시작할 수 있어요</p>' : dup ? '<p class="muted center" style="margin:0">색이 겹치는 사람이 있어요</p>' : ''}`
      : '<p class="center muted" style="margin:0">호스트가 게임을 시작하길 기다리는 중…</p>'}
    <button class="btn ghost block" data-act="leave">${host ? '방 닫기' : '나가기'}</button>
  </section>`;
}

function settingsForm(s, readOnly) {
  const dis = readOnly ? 'disabled' : '';
  return `
    <label class="toggle"><span>변형 규칙<small>2·3번째 주사위 대신 알 카드 1장 사용</small></span><input type="checkbox" data-set="eggVariant" ${s.eggVariant ? 'checked' : ''} ${dis}></label>
    <label class="toggle"><span>확률 힌트<small>"다음 주사위가 안전할 확률" 표시</small></span><input type="checkbox" data-set="probHint" ${s.probHint ? 'checked' : ''} ${dis}></label>
    <label class="toggle"><span>결정 제한시간<small>시간이 지나면 자동으로 진행</small></span>
      <select data-set="decisionSec" ${dis}>${[15, 30, 45, 60, 90].map(v => `<option value="${v}" ${s.decisionSec === v ? 'selected' : ''}>${v}초</option>`).join('')}</select></label>`;
}

function readSettings(root) {
  const s = { ...E.DEFAULT_SETTINGS };
  root.querySelectorAll('[data-set]').forEach(el => {
    const k = el.dataset.set;
    s[k] = el.type === 'checkbox' ? el.checked : Number(el.value);
  });
  return s;
}

async function shareLink() {
  const link = Room.joinLink(app.code);
  if (navigator.share) {
    try { await navigator.share({ title: 'Mahe for mobile', text: `방 코드 ${app.code}로 들어와!`, url: link }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  try { await navigator.clipboard.writeText(link); toast('참가 링크를 복사했어요'); }
  catch (e) { prompt('이 링크를 보내 주세요', link); }
}

// ---------- 한 기기로 하기 ----------
let hotseatRows = null;
function showHotseatSetup() {
  app.view = 'hotseat';
  showScreen();
  if (!hotseatRows) {
    const myName = store('mahe_name') || '플레이어1';
    hotseatRows = [{ name: myName, color: 'blue' }, { name: '플레이어2', color: 'red' }];
  }
  const s = { ...E.DEFAULT_SETTINGS, decisionSec: 30 };
  $('screen').className = 'screen wide';
  $('screen').innerHTML = brand() + `
  <section class="card">
    <h2>함께 할 사람 (${hotseatRows.length}/7)</h2>
    <div id="hsList">
    ${hotseatRows.map((r, i) => `<div class="hs-row">
      ${colorDot(r.color, initial(r.name))}
      <input data-hs-name="${i}" maxlength="12" value="${esc(r.name)}" aria-label="${i + 1}번 이름">
      <select data-hs-color="${i}" aria-label="${i + 1}번 색">${E.COLORS.map(c => `<option value="${c.id}" ${r.color === c.id ? 'selected' : ''} ${hotseatRows.some((o, j) => j !== i && o.color === c.id) ? 'disabled' : ''}>${c.name}</option>`).join('')}</select>
      <button class="icon-btn" data-act="hs-del" data-i="${i}" aria-label="빼기" ${hotseatRows.length <= 2 ? 'disabled' : ''}>✕</button>
    </div>`).join('')}
    </div>
    <button class="btn ghost block small" data-act="hs-add" ${hotseatRows.length >= 7 ? 'disabled' : ''}>+ 사람 추가</button>
    <p class="muted" style="margin:8px 0 0">${hotseatRows.length <= 3 ? '2~3명이면 1인당 거북이 2마리씩이에요.' : '1인당 거북이 1마리예요.'}</p>
  </section>
  <section class="card" id="hsSettings">
    <h2>설정</h2>
    <label class="toggle"><span>변형 규칙<small>2·3번째 주사위 대신 알 카드 1장 사용</small></span><input type="checkbox" data-set="eggVariant"></label>
    <label class="toggle"><span>확률 힌트<small>"다음 주사위가 안전할 확률" 표시</small></span><input type="checkbox" data-set="probHint" checked></label>
  </section>
  <section class="card stack">
    <button class="btn green block" data-act="hs-start">게임 시작</button>
    <button class="btn ghost block" data-act="home">처음 화면으로</button>
  </section>`;
  void s;
}

function syncHotseatInputs() {
  document.querySelectorAll('[data-hs-name]').forEach(el => { hotseatRows[+el.dataset.hsName].name = el.value.trim().slice(0, 12); });
  document.querySelectorAll('[data-hs-color]').forEach(el => { hotseatRows[+el.dataset.hsColor].color = el.value; });
}

function startHotseat() {
  syncHotseatInputs();
  const rows = hotseatRows.map((r, i) => ({ id: 'p' + (i + 1), name: r.name || `플레이어${i + 1}`, color: r.color }));
  if (new Set(rows.map(r => r.color)).size !== rows.length) return toast('색이 겹치지 않게 골라 주세요');
  const settings = { ...readSettings($('hsSettings')), decisionSec: 30 };
  app.mode = 'local';
  app.code = null;
  app.local = createLocalGame(rows, settings);
  app.shownVersion = -1;
  app.state = null;
  app.scene && app.scene.reset();
  app.localUnsub = app.local.subscribe(node => onGameNode(node));
}

// ---------- 게임 화면 ----------
function showGame() {
  if (!$('game').hidden) return;
  $('screen').hidden = true;
  $('game').hidden = false;
  app.view = 'game';
  keepAwake(true);
  if (app.noWebgl) $('noWebgl').hidden = false;
  requestAnimationFrame(() => app.scene && app.scene.resize());
}

function playerConnected(uid) {
  if (app.mode !== 'online') return true;
  const p = app.room && app.room.players && app.room.players[uid];
  return !!p && p.connected !== false;
}

function onGameNode(node) {
  if (!node || node.version === app.shownVersion) return;
  const state = unwrap(node);
  if (!state) return;
  const prev = app.state;
  const sequential = prev && node.version === app.shownVersion + 1;
  app.node = node;
  app.shownVersion = node.version;
  app.state = state;
  showGame();
  if (state.phase !== 'ended') $('result').hidden = true;

  const token = ++app.animToken;
  app.busy = true;
  renderPanel(state, { busy: true, keepDice: sequential });
  const finish = () => {
    if (token !== app.animToken) return;
    app.busy = false;
    renderPanel(state);
    if (state.phase === 'ended') { showResult(state); chime('egg'); }
    else if (sequential && myAction(state)) chime('turn');
    if (sequential && state.events.some(e => e.type === 'egg')) {
      const ev = state.events.find(e => e.type === 'egg');
      boardToast(`${E.nameOf(state, ev.owner)} 알 ${ev.card}개 획득!`);
      chime('egg');
    }
  };
  if (app.scene) {
    app.scene.setLabels(color => {
      const owner = state.turtles[color] && state.turtles[color].owner;
      return owner ? E.nameOf(state, owner).slice(0, 5) : color;
    });
    app.scene.highlight(state.current && state.current.turtle);
    app.scene.apply(state, sequential ? state.events : null).then(finish);
  } else {
    renderTextBoard(state);
    finish();
  }
}

// 이 기기에서 지금 누를 수 있는 행동이 있나
function myAction(state) {
  if (!state.current || state.phase === 'ended') return false;
  if (app.mode === 'local') return true;
  const uid = me();
  return state.phase === 'decide' ? state.current.decider === uid : state.current.roller === uid;
}

function renderDice(dice, cardIdx = -1) {
  const area = $('diceArea');
  const bust = E.isBust(dice);
  area.classList.toggle('bust', bust);
  const s = app.state;
  const slots = [0, 1, 2].map(i => dice[i] != null
    ? `<span class="die ${(i === cardIdx || (s && s.current && s.current.usedCard != null && i === dice.length - 1 && cardIdx === -2)) ? 'card' : ''}" aria-label="주사위 ${dice[i]}">${dice[i]}</span>`
    : `<span class="die empty">${i === 0 ? '?' : '+'}</span>`).join('');
  let calc = '';
  if (dice.length) {
    const sum = E.diceSum(dice);
    calc = bust
      ? `<span class="calc"><span class="bad">합 ${sum} · 7 초과!</span><small>뗏목으로 돌아가요</small></span>`
      : `<span class="calc">합 ${sum} × ${dice.length}개<small>= ${E.moveDistance(dice)}칸 이동</small></span>`;
  } else {
    calc = `<span class="calc"><small>합 × 개수만큼 이동</small></span>`;
  }
  area.innerHTML = slots + calc;
}

function renderPanel(state, { busy = false, keepDice = false } = {}) {
  const c = state.current;
  $('roomBadge').textContent = app.mode === 'online' ? app.code : '한 기기';
  $('deckLeft').textContent = state.deck.length;
  const oc = $('openCard');
  if (state.deck.length) { oc.textContent = `공개 카드: 알 ${state.deck[0]}개`; oc.classList.remove('bonus'); }
  else if (state.phase !== 'ended') { oc.textContent = '🏖️ 7알 보너스 해변!'; oc.classList.add('bonus'); }
  else { oc.textContent = '게임 끝'; oc.classList.add('bonus'); }

  // 턴 안내
  if (state.phase === 'ended') $('turnLine').textContent = '게임 종료!';
  else {
    const roller = E.nameOf(state, c.roller), decider = E.nameOf(state, c.decider);
    const t = c.turtle ? `${colorDot(c.turtle, '', true)} ` : '';
    let line = `<span class="who">${esc(roller)}</span> 차례`;
    if (state.phase === 'decide') line += c.decider === c.roller ? ` · ${t}결정: ${esc(roller)}` : ` · ${t}결정: <span class="who">${esc(decider)}</span>(맨 위)`;
    else if (state.phase === 'roll') line += ` · ${t}${E.COLOR_BY_ID[c.turtle].name} 거북이`;
    else line += ' · 먼저 움직일 거북이 고르기';
    $('turnLine').innerHTML = line;
  }

  if (!keepDice) renderDice(c ? c.dice : []);

  // 행동 버튼
  const acts = $('actions');
  const uid = me();
  const local = app.mode === 'local';
  if (state.phase === 'ended' || !c) {
    acts.innerHTML = `<button class="btn orange" data-act="show-result">결과 보기</button>`;
  } else {
    const actorUid = state.phase === 'decide' ? c.decider : c.roller;
    const mine = local || actorUid === uid;
    const who = local ? `${esc(E.nameOf(state, actorUid))}: ` : '';
    const dis = busy || !mine ? 'disabled' : '';
    let html = '';
    if (!mine) {
      const off = !playerConnected(actorUid) ? ' (연결 끊김 · 곧 자동 진행)' : '';
      html = `<div class="wait">${esc(E.nameOf(state, actorUid))} ${state.phase === 'decide' ? '결정' : state.phase === 'roll' ? '굴리기' : '선택'} 중…${off}</div>`;
    } else if (state.phase === 'chooseTurtle') {
      html = E.legalActions(state).map(a => `<button class="btn" style="background:${E.COLOR_BY_ID[a.turtle].hex}" data-act="game" data-type="choose" data-turtle="${a.turtle}" ${dis}>${who}${E.COLOR_BY_ID[a.turtle].name} 먼저</button>`).join('');
    } else if (state.phase === 'roll') {
      html = `<button class="btn orange" data-act="game" data-type="roll" ${dis}>🎲 ${who}주사위 굴리기</button>`;
    } else if (state.phase === 'decide') {
      const dist = E.moveDistance(c.dice);
      html = `<button class="btn" data-act="game" data-type="more" ${dis}>🎲 ${who}한 번 더</button>
              <button class="btn green" data-act="game" data-type="stop" ${dis}>멈추고 이동 (${dist}칸)</button>`;
      if (state.settings.probHint) {
        const ok = E.safeOutcomes(c.dice);
        html += `<div class="hint">다음 주사위가 안전할 확률 <b>${ok}/6</b>${ok === 0 ? ' · 무조건 실패!' : ''}</div>`;
      }
      const cards = E.legalActions(state).filter(a => a.type === 'card');
      if (cards.length) {
        html += `<div class="cards-use">알 카드로 대신 쓰기:${cards.map(a => `<button data-act="game" data-type="card" data-index="${a.index}" ${dis}>${a.value}</button>`).join('')}<span>(쓴 카드는 점수에서 빠져요)</span></div>`;
      }
    }
    acts.innerHTML = html;
  }

  // 점수판
  const ranks = state.turnOrder.map(id => ({ id, ...E.scoreOf(state, id) }));
  $('scores').innerHTML = ranks.map(r => {
    const cols = E.turtlesOf(state, r.id);
    const cls = ['score', r.id === uid ? 'me' : '', c && c.roller === r.id && state.phase !== 'ended' ? 'turn' : '', playerConnected(r.id) ? '' : 'off'].join(' ');
    return `<div class="${cls}" title="알 ${r.eggs}개 · 카드 ${r.cards}장"><span class="dots">${cols.map(col => colorDot(col, initial(E.nameOf(state, r.id)), true)).join('')}</span>
      <span class="sname">${esc(E.nameOf(state, r.id))}</span><span class="sval">🥚${r.eggs}<small>·${r.cards}장</small></span></div>`;
  }).join('');

  $('logList').innerHTML = (state.log || []).slice(0, 12).map(l => `<li>${esc(l.text)}</li>`).join('');
  updateTimer();
  if (!app.scene) renderTextBoard(state);
}

function renderTextBoard(state) {
  const rows = [];
  for (let i = 0; i <= E.BOARD_SIZE; i++) {
    const st = state.board[i];
    if (!st || !st.length) continue;
    rows.push(`<li value="${i}">${i === 0 ? '뗏목' : i + '번 칸'}: ${st.map(c => `${E.COLOR_BY_ID[c].name}(${esc(E.nameOf(state, state.turtles[c].owner))})`).join(i === 0 ? ', ' : ' ↑ ')}</li>`);
  }
  $('textBoard').innerHTML = rows.join('');
}

function updateTimer() {
  const t = $('timer');
  const node = app.node, state = app.state;
  if (app.mode !== 'online' || !node || !state || state.phase === 'ended' || !node.deadline) { t.hidden = true; return; }
  const total = (state.settings.decisionSec || 30) * 1000;
  const left = Math.max(0, node.deadline - Room.serverNow());
  t.hidden = false;
  t.firstElementChild.style.width = Math.min(100, (left / total) * 100) + '%';
}

async function sendGameAction(action) {
  if (app.busy) return;
  const v = app.shownVersion;
  app.busy = true;
  document.querySelectorAll('#actions button').forEach(b => { b.disabled = true; });
  try {
    let ok;
    if (app.mode === 'local') ok = await app.local.send(action, v);
    else ok = await Room.sendAction(app.code, action, v);
    if (!ok && app.shownVersion === v) { app.busy = false; renderPanel(app.state); }
  } catch (e) {
    console.error(e);
    toast('전송하지 못했어요. 연결을 확인해 주세요');
    app.busy = false;
    renderPanel(app.state);
  }
}

// 호스트 기기: 제한시간 초과·연결 끊김 자동 처리
setInterval(() => {
  if (app.view !== 'game') return;
  updateTimer();
  if (app.mode !== 'online' || !isHost() || !app.node || app.busy) return;
  if (app.lastOverdueTry === app.node.version) return;
  const act = overdueAction(app.node, app.room && app.room.players, Room.serverNow());
  if (!act) return;
  app.lastOverdueTry = app.node.version;
  Room.sendAction(app.code, act, app.node.version, true).catch(e => console.warn(e));
}, 500);

function showResult(state) {
  const rows = E.ranking(state);
  const host = isHost();
  const winners = rows.filter(r => r.rank === 1).map(r => r.name);
  $('result').innerHTML = `<div class="card">
    <p class="title-big">🏆 ${esc(winners.join(', '))} 승리!</p>
    <ol class="rank-list">
      ${rows.map(r => `<li class="${r.rank === 1 ? 'first' : ''}">
        <span class="rank-no">${r.rank}</span>
        <span class="dots">${E.turtlesOf(state, r.uid).map(c => colorDot(c, initial(r.name), true)).join('')}</span>
        <span class="pname">${esc(r.name)}<br><span class="rank-cards">카드 ${r.cards}장${r.list.length ? ' · ' + r.list.join(', ') : ''}${r.bonus ? ' · 🏖️ 보너스 7' : ''}</span></span>
        <span class="rank-eggs">🥚 ${r.eggs}</span></li>`).join('')}
    </ol>
    <div class="stack">
      ${host ? `<button class="btn green block" data-act="again">같은 멤버로 다시 하기</button>
                <button class="btn ghost block" data-act="${app.mode === 'local' ? 'home-confirm' : 'to-lobby'}">${app.mode === 'local' ? '처음 화면으로' : '대기실로'}</button>`
             : '<p class="muted center" style="margin:0">호스트가 다음 판을 정하는 중…</p>'}
      <button class="btn ghost block small" data-act="hide-result">보드 보기</button>
    </div></div>`;
  $('result').hidden = false;
}

// ---------- 설정 메뉴 ----------
function openMenu() {
  $('selQuality').value = store('mahe_quality') || 'auto';
  $('chkSound').checked = soundOn();
  $('btnLeave').textContent = app.mode === 'online' && isHost() ? '방 닫기' : '게임에서 나가기';
  const extra = $('menuExtra');
  extra.innerHTML = app.mode === 'online' ? `<p class="muted">방 코드 <b>${esc(app.code)}</b> · ${isHost() ? '내가 호스트' : '호스트: ' + esc((app.room.players[app.room.meta.hostUid] || {}).name || '?')}</p>` : '';
  $('menu').hidden = false;
}

// ---------- 이벤트 ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const act = el.dataset.act;
  switch (act) {
    case 'create': return createRoom();
    case 'join': return joinRoom(el.dataset.code);
    case 'hotseat': store('mahe_name', ($('inName') && $('inName').value.trim()) || store('mahe_name') || ''); hotseatRows = null; return showHotseatSetup();
    case 'home': hotseatRows = null; return showHome();
    case 'home-confirm': return leaveLocal();
    case 'share': return shareLink();
    case 'color': {
      store('mahe_color', el.dataset.color);
      return Room.setMyColor(app.code, el.dataset.color).catch(() => toast('색을 바꾸지 못했어요'));
    }
    case 'start':
      try { await Room.startGame(app.code, app.room); } catch (err) { toast(err.message); }
      return;
    case 'leave':
      if (isHost() && !confirm('방을 닫을까요? 모두 방에서 나가게 돼요.')) return;
      await Room.leaveRoom(app.code, app.room);
      return leaveLocal();
    case 'hs-add': syncHotseatInputs(); {
      const free = E.COLORS.find(c => !hotseatRows.some(r => r.color === c.id));
      hotseatRows.push({ name: `플레이어${hotseatRows.length + 1}`, color: free.id });
    } return showHotseatSetup();
    case 'hs-del': syncHotseatInputs(); hotseatRows.splice(+el.dataset.i, 1); return showHotseatSetup();
    case 'hs-start': return startHotseat();
    case 'game': {
      const a = { type: el.dataset.type };
      if (a.type === 'choose') a.turtle = el.dataset.turtle;
      if (a.type === 'card') a.index = Number(el.dataset.index);
      return sendGameAction(a);
    }
    case 'show-result': return showResult(app.state);
    case 'hide-result': $('result').hidden = true; return;
    case 'again':
      $('result').hidden = true;
      if (app.mode === 'local') { app.scene && app.scene.reset(); app.state = null; app.local.restart(); }
      else { try { await Room.startGame(app.code, app.room); } catch (err) { toast(err.message); } }
      return;
    case 'to-lobby': return Room.backToLobby(app.code);
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.set && app.view === 'lobby' && isHost()) {
    Room.setSettings(app.code, readSettings($('screen'))).catch(() => toast('설정을 저장하지 못했어요'));
  }
  if (el.dataset.hsColor !== undefined) { syncHotseatInputs(); showHotseatSetup(); }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  if (e.target.id === 'inCode') joinRoom();
  else if (e.target.id === 'inName' && app.view === 'home') {
    const inviteBtn = document.querySelector('[data-act="join"][data-code]');
    if (inviteBtn) joinRoom(inviteBtn.dataset.code);
  }
});

$('btnMenu').addEventListener('click', openMenu);
$('btnCloseMenu').addEventListener('click', () => { $('menu').hidden = true; });
$('menu').addEventListener('click', e => { if (e.target.id === 'menu') $('menu').hidden = true; });
$('selQuality').addEventListener('change', e => {
  const v = e.target.value;
  store('mahe_quality', v);
  if (app.scene) app.scene.setQuality(v === 'auto' ? 'high' : v);
});
$('chkSound').addEventListener('change', e => sound(e.target.checked));
$('btnLeave').addEventListener('click', async () => {
  $('menu').hidden = true;
  if (app.mode === 'online') {
    if (!confirm(isHost() ? '방을 닫을까요? 모두 게임에서 나가게 돼요.' : '게임에서 나갈까요? 내 거북이는 자동으로 진행돼요.')) return;
    if (isHost()) await Room.closeRoom(app.code).catch(() => {});
    else await Room.leaveRoom(app.code, app.room);
  } else if (!confirm('게임을 그만할까요?')) return;
  leaveLocal();
});

// 테스트·디버그용
window.__mahe = app;

boot();
