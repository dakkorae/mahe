// 세로·가로 배치 전환, 화면 꺼짐 방지, 진동·효과음
export function watchOrientation(onChange) {
  const apply = () => {
    const land = window.innerWidth / window.innerHeight > 1;
    document.body.classList.toggle('landscape', land);
    document.body.classList.toggle('portrait', !land);
    document.body.classList.toggle('short', window.innerHeight < 500);
    onChange && onChange(land);
  };
  window.addEventListener('resize', apply);
  window.addEventListener('orientationchange', () => setTimeout(apply, 200));
  apply();
}

// ---------- 화면 꺼짐 방지 ----------
let wakeLock = null, wantWake = false;
export async function keepAwake(on) {
  wantWake = on;
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* 지원하지 않거나 거부됨 */ }
}
document.addEventListener('visibilitychange', () => { if (wantWake && document.visibilityState === 'visible') keepAwake(true); });

// ---------- 진동·효과음 ----------
let audio = null;
export function sound(on) { localStorage && (() => { try { localStorage.setItem('mahe_sound', on ? '1' : '0'); } catch (e) {} })(); }
export function soundOn() { try { return localStorage.getItem('mahe_sound') !== '0'; } catch (e) { return true; } }
export function chime(kind = 'turn') {
  if (navigator.vibrate) { try { navigator.vibrate(kind === 'bust' ? [80, 60, 80] : kind === 'egg' ? [40, 40, 120] : 60); } catch (e) {} }
  if (!soundOn()) return;
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const notes = kind === 'bust' ? [330, 220] : kind === 'egg' ? [660, 880, 1320] : kind === 'dice' ? [520] : [660, 990];
    notes.forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = kind === 'bust' ? 'sawtooth' : 'sine';
      o.frequency.value = f;
      const t0 = audio.currentTime + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t0); o.stop(t0 + 0.2);
    });
  } catch (e) {}
}
// 사용자가 처음 화면을 누를 때 오디오를 깨운다 (iOS)
window.addEventListener('pointerdown', () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume(); } catch (e) {} }, { once: true });
