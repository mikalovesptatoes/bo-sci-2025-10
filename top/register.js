// ==================================
// register.js（Firebase統合版・匿名OK）
// ==================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  setDoc,
  doc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// ==========================
// 🔧 Firebase 設定
// ==========================
const firebaseConfig = {
  apiKey: "AIzaSyAKyYY7AvQ4igwB3DATS9Wjq1ij5AlLCLw",
  authDomain: "bo-sci2025.firebaseapp.com",
  projectId: "bo-sci2025",
  storageBucket: "bo-sci2025.firebasestorage.app",
  messagingSenderId: "375176908811",
  appId: "1:375176908811:web:ea423d1547dcd34a89f70e",
  measurementId: "G-TKZJLRFGW5",
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ==========================
// 📝 フォーム送信処理
// ==========================
document
  .getElementById("registerForm")
  .addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();
    const confirm = document.getElementById("confirmPassword").value.trim();
    const nickname = document.getElementById("userName").value.trim();
    const school = document.getElementById("schoolSelect").value.trim();
    const errorMsg = document.getElementById("passwordError");
    const popup = document.getElementById("successPopup");

    // ✅ パスワード確認
    if (password && password !== confirm) {
      errorMsg.style.display = "block";
      return;
    } else {
      errorMsg.style.display = "none";
    }

    try {
      let userCredential;

      if (email && password) {
        // ✉️ 通常登録
        userCredential = await createUserWithEmailAndPassword(
          auth,
          email,
          password
        );
      } else {
        // 👤 匿名登録
        userCredential = await signInAnonymously(auth);
      }

      const user = userCredential.user;

      // Firestoreにユーザー情報保存
      await setDoc(doc(db, "users", user.uid), {
        email: email || "anonymous",
        nickname: nickname || "ゲスト",
        school: school || "",
        createdAt: new Date(),
        isAnonymous: user.isAnonymous,
      });

      // ✅ 成功ポップアップ表示
      popup.style.display = "flex";
      popup.addEventListener("click", () => {
        popup.style.display = "none";
        window.location.href = "/top/top.html";
      });
    } catch (err) {
      console.error("登録エラー:", err);
      alert("登録に失敗しました: " + err.message);
    }
  });
