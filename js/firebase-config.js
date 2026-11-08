// Firebase 설정값 — mahe-for-mobile 프로젝트
// (이 값들은 공개되어도 괜찮은 값입니다. 데이터 보호는 database.rules.json 보안 규칙이 맡습니다.)
export const firebaseConfig = {
  apiKey: "AIzaSyDSQvuHwmLAqWNlJDzms4LUCxeUWEAONnA",
  authDomain: "mahe-for-mobile.firebaseapp.com",
  databaseURL: "https://mahe-for-mobile-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "mahe-for-mobile",
  storageBucket: "mahe-for-mobile.firebasestorage.app",
  messagingSenderId: "1082395378458",
  appId: "1:1082395378458:web:505d748f68bbbd9623e2a3",
};

export const isConfigured = !!firebaseConfig.databaseURL && !firebaseConfig.databaseURL.includes('여기에');
