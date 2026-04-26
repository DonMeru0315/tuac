// Firebaseライブラリをインポートします。
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-app-compat.js";
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-auth-compat.js";
import "https://www.gstatic.com/firebasejs/9.6.1/firebase-firestore-compat.js";

// --- Firebase設定 ---
const firebaseConfig = {
  apiKey: "AIzaSyBMo_ZNtdyUF719Ob6sIcDw6K3tFiGbr7c",
  authDomain: "tuac-club-auto-log.firebaseapp.com",
  projectId: "tuac-club-auto-log",
  storageBucket: "tuac-club-auto-log.appspot.com",
  messagingSenderId: "374595743937",
  appId: "1:374595743937:web:95365478a5e5c0b0802440"
};

// Firebaseの初期化
firebase.initializeApp(firebaseConfig);
firebase.firestore().enablePersistence()
  .catch(err => console.error("Firestore オフライン対応エラー: ", err));

// --- インスタンスを 'export' して他のファイルから読み込めるようにする ---
export const auth = firebase.auth();
export const db = firebase.firestore();
export const firestore = firebase.firestore;
