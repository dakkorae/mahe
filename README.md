# Mahe for mobile 🐢🥚

보드게임 마헤(Mahé)의 규칙을 각자 스마트폰으로 함께 하는 실시간 다중접속 웹게임입니다.
호스트가 방을 만들고 게스트가 4자리 코드·링크·QR로 참가합니다. 2~7명, 15~20분.

- **배포**: GitHub Pages (빌드 도구 없음, HTML/CSS/JS)
- **실시간 동기화**: Firebase 익명 로그인 + Realtime Database
- **3D**: Three.js (CDN, import map). 섬·칸·거북이·주사위는 모두 코드로 만든 카툰풍 모델이라 별도 에셋 파일이 없습니다.

👉 **처음 연결하는 방법은 [SETUP.md](SETUP.md)** 를 따라 하세요.

## 기능

| PRD | 내용 | 상태 |
|---|---|---|
| F1–F2 | 방 만들기·참가(코드/링크/QR), 대기실, 7색 중 색 고르기, 접속 상태 | ✅ |
| F3–F7 | 턴 진행, 결정권 이전(맨 위 거북이 주인), 업기, 알 카드, 7알 보너스 종료, 동점 규칙 | ✅ |
| F8 | 2~3인 모드(1인 2마리, 먼저 움직일 거북이 선택) | ✅ |
| F9 | 같은 멤버로 다시 하기 / 대기실로 | ✅ |
| F10 | 결정 제한시간(15~90초), 초과 시 자동 굴림·자동 멈춤 | ✅ |
| F11–F12 | 3D 보드·거북이·주사위, 세로/가로/태블릿/PC 반응형 | ✅ |
| F13 | 변형 규칙(알 카드로 2·3번째 주사위 대체) | ✅ |
| F14 | 확률 힌트 | ✅ |
| F15 | 헤엄·숨쉬기 동작, 알 파티클, 물보라, 효과음·진동 | ✅ |
| F16 | 그래픽 품질 자동/높음/보통/낮음 | ✅ |
| F17 | 최근 행동 기록 | ✅ |
| — | **한 기기로 하기(핫시트)**: Firebase 없이 한 휴대폰으로 돌려 가며 | ✅ |

예외 처리: 게스트 연결 끊김(자동 진행·재접속 시 자리 복구), 호스트 연결 끊김(가장 먼저 들어온 접속자에게 호스트 이전), 새로고침 복귀, 버튼 연타(버전 확인 트랜잭션으로 한 번만 반영), 7명 초과·색 중복·게임 중 참가 거절.

## 파일 구성

```
index.html              화면 뼈대, import map
css/style.css           세로·가로 반응형 스타일
js/firebase-config.js   ← Firebase 설정값 (SETUP.md 5단계)
js/engine.js            규칙 엔진 (순수 함수, Firebase·화면 모름)
js/game.js              턴 진행·동기화 (트랜잭션용 상태 포장, 제한시간, 핫시트)
js/room.js              방·대기실·접속 상태·호스트 이전 (Firebase)
js/scene3d.js           Three.js 3D 보드·거북이·주사위·카메라·연출
js/layout.js            세로·가로 전환, 화면 꺼짐 방지, 진동·효과음
js/app.js               화면 흐름 (첫 화면 → 대기실 → 게임 → 결과)
database.rules.json     Realtime Database 보안 규칙
firebase.json           (선택) Firebase CLI·에뮬레이터 설정
tests/engine.test.html  브라우저에서 여는 규칙 엔진 테스트
tests/run-node.mjs      같은 테스트를 Node로: node tests/run-node.mjs
```

## 로컬에서 실행

```bash
python3 -m http.server 8080      # 아무 정적 서버나 OK
# http://localhost:8080            → 한 기기로 하기
# http://localhost:8080/tests/engine.test.html → 엔진 테스트
```

Firebase 없이 온라인 흐름까지 시험하려면 Firebase 에뮬레이터를 켜고 `?emu=1`을 붙입니다 (localhost에서만 동작).

```bash
npx firebase-tools emulators:start --only auth,database --project demo-mahe
# http://localhost:8080/?emu=1
```

## 동기화 구조

- `rooms/{code}/meta` 호스트·상태·방 설정, `players/{uid}` 이름·색·접속, `game` 게임 상태
- `game` = `{ version, roller, decider, phase, at, deadline, s }` — `s`는 엔진 상태 JSON 문자열
  (Realtime Database가 빈 배열을 지우는 문제를 피하고, 보안 규칙이 볼 값만 밖으로 뺌)
- 행동 권한이 있는 기기가 주사위를 굴려 엔진으로 새 상태를 계산하고 `runTransaction`으로 기록.
  보안 규칙이 `version + 1`과 행동자(roller/decider/호스트)를 검사합니다.
- 제한시간 초과·연결 끊김은 호스트 기기가 대신 처리합니다.
