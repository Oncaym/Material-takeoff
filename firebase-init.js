// ============================================================
//  firebase-init.js  (ES module)
//  初始化 Firebase + Firestore,把句柄挂到 window.__fb,
//  然后派发 'fb-ready' 事件给 cloud-sync.js 使用。
//  注意:这里的 config 不是密码,可以放在前端代码里。
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, onSnapshot,
  collection, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA-X9SpJkRxZrS8TrDX7TWpLurNIIvzdXI",
  authDomain: "material-takeoff-tool.firebaseapp.com",
  projectId: "material-takeoff-tool",
  storageBucket: "material-takeoff-tool.firebasestorage.app",
  messagingSenderId: "800642172072",
  appId: "1:800642172072:web:f6a092c0837a7982576e9d",
  measurementId: "G-R814QQKWPG"
};

try {
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  window.__fb = { db, doc, getDoc, setDoc, onSnapshot, collection, getDocs, serverTimestamp };
  window.dispatchEvent(new Event("fb-ready"));
} catch (e) {
  console.error("[firebase] init failed:", e);
  window.__fbError = e;
  window.dispatchEvent(new Event("fb-error"));
}
