// ① Firebase 설정값 — Firebase 콘솔 > 프로젝트 설정 > 내 앱(웹)에서 복사한 값으로 바꿔 넣으세요.
//    (이 값들은 공개되어도 괜찮은 값입니다. 데이터 보호는 database.rules.json 보안 규칙이 맡습니다.)
export const firebaseConfig = {
  apiKey: "여기에-apiKey",
  authDomain: "mahe-for-mobile.firebaseapp.com",
  databaseURL: "여기에-databaseURL",
  projectId: "mahe-for-mobile",
  storageBucket: "mahe-for-mobile.firebasestorage.app",
  messagingSenderId: "여기에-messagingSenderId",
  appId: "여기에-appId",
};

export const isConfigured = !!firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes('여기에');
