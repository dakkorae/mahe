# Mahe for mobile — Firebase · GitHub Pages 연결 안내

코드는 모두 준비되어 있습니다. 아래 순서대로 **Firebase 프로젝트를 만들고, 설정값 1개 파일을 바꾸고, GitHub Pages를 켜면** 끝입니다. (약 15분)

> Firebase 설정 전에도 **한 기기로 하기(핫시트)** 모드는 바로 쓸 수 있어요.

---

## 1단계. Firebase 프로젝트 만들기

1. <https://console.firebase.google.com> 접속 → Google 계정으로 로그인
2. **프로젝트 추가(Create a project)** 클릭
3. 프로젝트 이름: `mahe-for-mobile` (라이헌트와 다른 새 프로젝트)
4. Google 애널리틱스: **사용 안 함**으로 꺼도 됩니다 → **프로젝트 만들기**

## 2단계. Realtime Database 만들기 + 보안 규칙

1. 왼쪽 메뉴 **빌드(Build) → Realtime Database** → **데이터베이스 만들기**
2. 위치: **싱가포르 (asia-southeast1)** 선택 → 다음
3. 보안 규칙: **잠금 모드로 시작** → 사용 설정
4. 상단 **규칙(Rules)** 탭 클릭 → 기존 내용을 모두 지우고, 이 저장소의 [`database.rules.json`](database.rules.json) 파일 내용을 **통째로 복사해 붙여넣기** → **게시(Publish)**
5. **데이터(Data)** 탭 맨 위에 보이는 주소를 복사해 둡니다.
   예: `https://mahe-for-mobile-default-rtdb.asia-southeast1.firebasedatabase.app`

## 3단계. 익명 로그인 켜기 (중요)

1. 왼쪽 메뉴 **빌드 → Authentication** → **시작하기**
2. **로그인 방법(Sign-in method)** 탭 → **익명(Anonymous)** 클릭
3. **사용 설정** 스위치 켜기 → **저장**

> 이걸 안 켜면 앱 첫 화면에 "익명 로그인이 꺼져 있어요" 안내가 나옵니다.

## 4단계. 웹 앱 등록하고 설정값 복사

1. 왼쪽 위 ⚙️ **프로젝트 설정** → 아래쪽 **내 앱** → **`</>` (웹)** 아이콘
2. 앱 닉네임: `mahe-web` → (Firebase Hosting은 체크하지 않음) → **앱 등록**
3. 화면에 나오는 `const firebaseConfig = { ... }` 안의 값들을 복사합니다.

## 5단계. 설정값을 저장소에 넣기

GitHub에서 [`js/firebase-config.js`](js/firebase-config.js) 파일을 열고 연필(✏️ Edit) 아이콘 → 아래처럼 값을 바꿔 넣고 **Commit changes**.

```js
export const firebaseConfig = {
  apiKey: "AIza...복사한 값",
  authDomain: "mahe-for-mobile.firebaseapp.com",
  databaseURL: "https://mahe-for-mobile-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mahe-for-mobile",
  storageBucket: "mahe-for-mobile.firebasestorage.app",
  messagingSenderId: "숫자...",
  appId: "1:...:web:...",
};
```

- 4단계 화면에 `databaseURL` 줄이 없으면, 2단계 5번에서 복사한 주소를 직접 넣으세요.
- 이 값들은 공개돼도 괜찮은 값입니다. 데이터는 2단계의 보안 규칙이 지킵니다.
- 직접 하기 어려우면 Claude에게 `firebaseConfig` 내용을 붙여 주면 대신 넣어서 커밋해 줍니다.

## 6단계. GitHub Pages 켜기

1. 저장소 <https://github.com/dakkorae/mahe> → **Settings** → 왼쪽 **Pages**
2. **Build and deployment → Source: Deploy from a branch**
3. **Branch**: 앱 코드가 있는 브랜치(`ccr-ff6514c9-h904jh`, 또는 main에 합친 뒤라면 `main`) / **`/ (root)`** → **Save**
4. 1~3분 뒤 위쪽에 주소가 뜹니다: **<https://dakkorae.github.io/mahe/>**

> 브랜치 이름을 `main`으로 쓰고 싶으면 PR을 만들어 main에 합친 뒤 3번에서 `main`을 고르면 됩니다.

## 7단계. 확인하기

1. 휴대폰 A에서 주소 열기 → 닉네임 입력 → **방 만들기** → 4자리 코드와 QR이 보이면 성공
2. 휴대폰 B로 QR 찍기(또는 코드 입력) → 대기실에 두 사람이 보이면 성공
3. 호스트가 **게임 시작** → 양쪽 화면에 같은 3D 보드가 보이고, 차례인 사람만 버튼이 켜지면 성공
4. 규칙 엔진 테스트: `https://dakkorae.github.io/mahe/tests/engine.test.html` → **17 / 17 통과**

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| "온라인 방을 쓰려면 … 설정값을 넣어야 해요" | 5단계가 아직 반영 안 됨. 커밋 후 1~2분 기다렸다가 새로고침 |
| "익명 로그인이 꺼져 있어요" | 3단계 다시 확인 |
| 방 만들기를 누르면 "PERMISSION_DENIED" | 2단계 4번(규칙 게시) 다시 확인 |
| 설정을 바꿨는데 화면이 그대로 | 휴대폰에서 새로고침, 그래도 같으면 시크릿 창으로 열기 (캐시) |
| 3D가 안 보이고 글자 목록만 보임 | 그 기기 브라우저가 WebGL을 지원하지 않음. 최신 Chrome·Safari로 열기 |
| 화면이 끊김 | ⚙️ 설정 → 그래픽 품질 **낮음** |

## 오래된 방 정리

방 데이터는 아주 작아서 무료 한도(Spark 요금제)로 충분합니다. 24시간이 지난 방은 같은 코드로 새 방을 만들 때 자동 정리되고, 필요하면 Firebase 콘솔 → Realtime Database → 데이터에서 `rooms`를 지워도 됩니다(게임 중이 아닐 때).
