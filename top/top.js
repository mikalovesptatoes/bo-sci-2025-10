// =============================
// Firebase 設定 & 初期化
// =============================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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

// =============================
// top.js（Firebase Firestore + UI統合版・完全版）
// =============================

// ---------- ユーティリティ ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ---------- DOM取得（存在しない要素は後で補完） ----------
let hero = document.getElementById("hero") || $(".background-slideshow");
let captionBox = document.getElementById("caption");
let nextBtn = document.getElementById("nextBtn");
let prevBtn = document.getElementById("prevBtn");

// 背景スライド用の画像群
const bgImages = $$(".background-slideshow img").filter((img) =>
  img.getAttribute("src")
);
const slideContainerImgs = $$(".slide-container img").filter((img) =>
  img.getAttribute("src")
);
const allImages = (bgImages.length ? bgImages : []).concat(
  slideContainerImgs.filter((img) => !bgImages.includes(img))
);

let currentIndex = 0;

// ---------- 足りないUIを自動補完 ----------
(function ensureUI() {
  if (!hero) {
    const wrap = document.createElement("div");
    wrap.id = "hero";
    const bs = $(".background-slideshow");
    if (bs && bs.parentNode) {
      bs.parentNode.insertBefore(wrap, bs);
      wrap.appendChild(bs);
      hero = wrap;
    }
  }

  if (!captionBox) {
    captionBox = document.createElement("div");
    captionBox.id = "caption";
    captionBox.setAttribute("aria-live", "polite");
    (hero || document.body).appendChild(captionBox);
  }

  const makeBtn = (id, className, label, html) => {
    const b = document.createElement("button");
    b.id = id;
    b.className = `nav-btn ${className}`;
    b.setAttribute("aria-label", label);
    b.innerHTML = html;
    (hero || document.body).appendChild(b);
    return b;
  };
})();

// ---------- スライド表示制御 ----------
function applyActiveState(index) {
  allImages.forEach((img, i) => img.classList.toggle("active", i === index));
}

function showSlide(index) {
  if (!allImages.length) return;
  currentIndex = (index + allImages.length) % allImages.length;
  applyActiveState(currentIndex);

  captionBox.classList.remove("show");
  if (hero) hero.classList.remove("focused");

  const currentImage = allImages[currentIndex];
  const floatingTitle = document.getElementById("floatingTitle");
  if (!floatingTitle) return;

  const rawCaption = currentImage?.getAttribute("data-caption") || "";
  const isInvalid = ["作品タイトル", "", " "].includes(rawCaption.trim());
  if (floatingTitle) {
    floatingTitle.textContent = "";
    floatingTitle.style.visibility = "hidden";
  }
  if (captionBox) {
    captionBox.textContent = "";
    captionBox.style.visibility = "hidden";
  }

  if (isInvalid) {
    floatingTitle.textContent = "";
    floatingTitle.style.opacity = 0;
    floatingTitle.style.visibility = "hidden";
    return;
  }

  if (document.body.classList.contains("focused")) {
    floatingTitle.textContent = rawCaption;
    floatingTitle.style.opacity = 0;
    floatingTitle.style.transform = "translateY(20px)";
    setTimeout(() => {
      floatingTitle.style.opacity = 1;
      floatingTitle.style.transform = "translateY(0)";
    }, 100);
  } else {
    floatingTitle.textContent = "";
    floatingTitle.style.opacity = 0;
    floatingTitle.style.visibility = "hidden";
  }
}

showSlide(0);

const floatingTitleInit = document.getElementById("floatingTitle");
if (floatingTitleInit) {
  floatingTitleInit.textContent = "";
  floatingTitleInit.style.opacity = 0;
  floatingTitleInit.style.visibility = "hidden";
}

let autoTimer = null;
function startAuto() {
  stopAuto();
  autoTimer = setInterval(() => showSlide(currentIndex + 1), 8000);
}
function stopAuto() {
  if (autoTimer) clearInterval(autoTimer);
}
startAuto();

// ボタンイベント
nextBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  showSlide(currentIndex + 1);
  startAuto();
});
prevBtn?.addEventListener("click", (e) => {
  e.stopPropagation();
  showSlide(currentIndex - 1);
  startAuto();
});

// ✅ 一度だけ focused にする
const heroCenter = document.getElementById("heroCenter");
const projectText = document.getElementById("projectText");
const tapHint = document.getElementById("tapHint");
const floatingTitle = document.getElementById("floatingTitle");

let focused = false;

document
  .querySelector(".background-slideshow")
  ?.addEventListener("click", (e) => {
    if (
      e.target.closest(".login-box") ||
      e.target.closest(".popup") ||
      e.target.classList.contains("nav-btn")
    )
      return;

    focused = !focused;
    document.body.classList.toggle("focused", focused);

    if (focused) {
      if (projectText) {
        projectText.style.opacity = "0";
        projectText.style.pointerEvents = "none";
      }
      if (tapHint) tapHint.textContent = "";

      const currentImage = allImages[currentIndex];
      const titleText = currentImage?.dataset?.title || "";
      const captionText = currentImage?.dataset?.caption || "";

      const invalid = ["", " ", "作品タイトル"];
      const displayTitle = invalid.includes(titleText.trim()) ? "" : titleText;

      if (floatingTitle) {
        floatingTitle.textContent = displayTitle;
        floatingTitle.classList.toggle("show", !!displayTitle);
        floatingTitle.style.visibility = displayTitle ? "visible" : "hidden";
      }

      captionBox.innerHTML = `<div class="caption-text">${captionText}</div>`;
      captionBox.classList.add("show");
    } else {
      if (projectText) {
        projectText.style.opacity = "1";
        projectText.style.pointerEvents = "auto";
      }
      if (tapHint) tapHint.textContent = "クリックして作品を前面で鑑賞";
      if (floatingTitle) {
        floatingTitle.textContent = "";
        floatingTitle.classList.remove("show");
        floatingTitle.style.visibility = "hidden";
      }
      captionBox.classList.remove("show");
    }
  });

// =============================
// 「作品を制作してみる」関連ポップアップ
// =============================

const startCreateBtns = document.querySelectorAll(".start-create");
// const headerCreateBtn = document.getElementById("headerCreateBtn");

const choicePopup = document.getElementById("choicePopup");
const confirmPopup = document.getElementById("confirmPopup");
const withAccount = document.getElementById("withAccount");
const withoutAccount = document.getElementById("withoutAccount");
const proceedGuest = document.getElementById("proceedGuest");
const closeChoicePopup = document.getElementById("closeChoicePopup");

// 🔹中央・下部（.start-create）→ choicePopupを出す
document.querySelectorAll(".start-create").forEach((btn) => {
  btn.addEventListener("click", () => {
    console.log("🟢 中央ボタン押下 → choicePopup表示");
    document.getElementById("choicePopup")?.classList.add("show");
  });
});

// 🔹右上ヘッダーのログインボタン（id=createBtn）→ loginPopupを出す
document.getElementById("createBtn")?.addEventListener("click", () => {
  console.log("🟢 ヘッダーボタン押下 → loginPopup表示");
  const popup = document.getElementById("loginPopup");
  popup?.classList.remove("hidden");
  popup?.classList.add("show");
});

// ✅ ポップアップの選択肢
withAccount?.addEventListener("click", () => {
  choicePopup?.classList.remove("show");
  window.location.href = "register.html";
});
withoutAccount?.addEventListener("click", () => {
  choicePopup?.classList.remove("show");
  confirmPopup?.classList.add("show");
});
proceedGuest?.addEventListener("click", () => {
  confirmPopup?.classList.remove("show");
  window.location.href = "../guide/index.html";
});
closeChoicePopup?.addEventListener("click", () => {
  choicePopup?.classList.remove("show");
});

// =============================
// 右上ログインボタン → ポップアップ → ログイン完了UI表示
// =============================

// HTML内で以下の要素を必ず用意しておくこと
// <div id="userNav"><button id="createBtn" class="header-btn">作品制作をする</button></div>
// <div id="loginPopup" class="popup hidden"> ... </div>
// <div id="welcomeMsg" class="hidden"></div>

// DOM参照
const loginPopup = document.getElementById("loginPopup");
const loginBtn = document.getElementById("loginBtn");
const closeLoginPopup = document.getElementById("closeLoginPopup");
const welcomeMsg = document.getElementById("welcomeMsg");
const userNav = document.getElementById("userNav");
const createBtnTop = document.getElementById("createBtn");

// ✅ ログインポップアップの閉じるボタン処理
document.addEventListener("DOMContentLoaded", () => {
  const loginPopup = document.getElementById("loginPopup");
  const closeLoginPopup = document.getElementById("closeLoginPopup");

  if (closeLoginPopup) {
    closeLoginPopup.addEventListener("click", () => {
      console.log("🟢 閉じるボタン押下");
      loginPopup?.classList.add("hidden");
      loginPopup?.classList.remove("show");
    });
  }
});

document.getElementById("goRegister")?.addEventListener("click", () => {
  window.location.href = "register.html";
});

// 「作品制作をする」クリックでログインフォーム表示
if (createBtnTop) {
  createBtnTop.addEventListener("click", () => {
    loginPopup?.classList.remove("hidden");
  });
}

// 閉じるボタン
closeLoginPopup?.addEventListener("click", () => {
  loginPopup?.classList.add("hidden");
});

// // Firebaseの状態監視（自動ログイン時も反映）
// onAuthStateChanged(auth, (user) => {
//   if (user) {
//     updateUserUI(user);
//   }
// });

// 既存のDOM参照群の下に追加
// const logoutBtn = document.getElementById("logoutBtn");

// ✅ ログアウト処理
// ✅ ログアウト処理（存在する時だけバインド）
const logoutBtnEl = document.getElementById("logoutBtn");
if (logoutBtnEl) {
  logoutBtnEl.addEventListener("click", async () => {
    try {
      await signOut(auth);
      alert("ログアウトしました。");
      location.reload(); // ページを再読み込みしてUIをリセット
    } catch (err) {
      console.error("ログアウトエラー:", err);
      alert("ログアウトに失敗しました: " + err.message);
    }
  });
}

async function updateUserUI(user) {
  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

  // ✅ Firestoreドキュメントが存在しない場合、自動作成
  if (!snap.exists()) {
    await setDoc(userRef, {
      nickname: user.email.split("@")[0],
      school: "未登録",
      createdAt: new Date(),
    });
    console.log("🆕 Firestoreにユーザーデータを作成しました");
  }

  // 再取得
  const dataSnap = await getDoc(userRef);
  const data = dataSnap.data();

  const nickname = data.nickname || "ゲスト";
  const school = data.school || "地域";

  // 🔹挨拶メッセージ
  const msg = document.getElementById("welcomeMsg");
  msg.textContent = `おかえりなさい、${nickname}さん！`;
  msg.classList.remove("hidden");
  msg.style.background = "#fef8e5";
  msg.style.padding = "12px 20px";
  msg.style.borderRadius = "8px";
  msg.style.margin = "10px auto";
  msg.style.width = "fit-content";
  msg.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
  setTimeout(() => msg.classList.add("hidden"), 4000);

  // 🔹ヘッダー更新
  userNav.innerHTML = `
    <div class="header-user" id="userIcon">👤${nickname}さん</div>
    <button id="logoutBtn" class="header-btn logout">ログアウト</button>
    <a href="../gp/gp.html?school=${encodeURIComponent(
      school
    )}" class="header-btn">${school}ご近所さんアートチャット</a>
    <a href="../map/index.html" class="header-btn">防災行動マップ</a>
    <a href="../guide/index.html" class="header-btn highlight-btn">作品制作</a>
  `;

  // 🔹ログアウトボタンのバインド
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await signOut(auth);
    alert("ログアウトしました。");
    location.reload();
  });

  // 🔹ユーザーアイコン
  document.getElementById("userIcon")?.addEventListener("click", () => {
    window.location.href = "registered.html";
  });

  // 🔹ポップアップを閉じる
  const loginPopup = document.getElementById("loginPopup");
  loginPopup?.classList.add("hidden");
  loginPopup?.classList.remove("show");
}

// ✅ Firebaseの状態監視
onAuthStateChanged(auth, async (user) => {
  if (user) {
    console.log("✅ ログイン済:", user.email);
    await updateUserUI(user);
  } else {
    console.log("🚫 未ログイン状態");

    // --- 未ログイン時ヘッダーUIを再生成 ---
    userNav.innerHTML = `
      <button id="createBtn" class="header-btn create">作品制作<br>ログイン</button>
      <button id="mapBtn" class="header-btn map">防災行動<br>マップ</button>
    `;

    // --- イベントを再バインド ---
    const createBtn = document.getElementById("createBtn");
    const mapBtn = document.getElementById("mapBtn");

    if (createBtn) {
      createBtn.addEventListener("click", () => {
        console.log("🟢 右上『作品制作ログイン』クリック");
        const popup = document.getElementById("loginPopup");
        popup?.classList.remove("hidden");
        popup?.classList.add("show");
      });
    }

    if (mapBtn) {
      mapBtn.addEventListener("click", () => {
        console.log("🟢 右上『防災行動マップ』クリック");
        window.location.href = "../map/index.html";
      });
    }
  }
});

// ログインボタン押下時
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    console.log("🟢 ログインボタンが押されました");
    const email = document.getElementById("email")?.value.trim();
    const password = document.getElementById("password")?.value.trim();

    const errorBoxId = "loginErrorMsg";
    let errorBox = document.getElementById(errorBoxId);
    if (!errorBox) {
      errorBox = document.createElement("div");
      errorBox.id = errorBoxId;
      errorBox.style.color = "#e53935";
      errorBox.style.marginTop = "8px";
      errorBox.style.fontSize = "0.9rem";
      errorBox.style.textAlign = "center";
      loginBtn.parentNode.insertBefore(errorBox, loginBtn.nextSibling);
    }

    if (!email || !password) {
      errorBox.textContent = "メールアドレスとパスワードを入力してください。";
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("✅ ログイン成功:", userCredential.user.email);

      // 🔹 Firestoreからnicknameを取得して挨拶表示
      const userRef = doc(db, "users", userCredential.user.uid);
      const snap = await getDoc(userRef);
      const nickname = snap.exists()
        ? snap.data().nickname || "ユーザー"
        : "ユーザー";

      // 🔹 成功メッセージを上部に表示
      const msg = document.getElementById("welcomeMsg");
      msg.textContent = `おかえりなさい、${nickname}さん！`;
      msg.classList.remove("hidden");
      msg.style.background = "#fef8e5";
      msg.style.padding = "12px 20px";
      msg.style.borderRadius = "8px";
      msg.style.margin = "10px auto";
      msg.style.width = "fit-content";
      msg.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
      setTimeout(() => msg.classList.add("hidden"), 4000);

      // 🔹 UI更新
      await updateUserUI(userCredential.user);
      errorBox.textContent = ""; // エラーを消す
    } catch (err) {
      console.error("ログインエラー:", err);
      let message = "ログインに失敗しました。";

      // Firebaseエラーコード別に詳細を出す
      if (err.code === "auth/invalid-credential")
        message = "メールアドレスまたはパスワードが間違っています。";
      else if (err.code === "auth/user-not-found")
        message = "このメールアドレスは登録されていません。";
      else if (err.code === "auth/wrong-password")
        message = "パスワードが違います。";
      else if (err.code === "auth/too-many-requests")
        message = "試行回数が多すぎます。しばらくしてからお試しください。";

      errorBox.textContent = message;
    }
  });
}

const guestBtn = document.getElementById("guestBtn");
if (guestBtn) {
  guestBtn.addEventListener("click", () => {
    window.location.href = "taiken.html";
  });
}

// 下部ログインボタン（openLoginPopup）をクリックしたらポップアップ表示
document.getElementById("openLoginPopup")?.addEventListener("click", () => {
  const loginPopup = document.getElementById("loginPopup");
  loginPopup?.classList.remove("hidden");
});

// =============================
// スクロールに応じたヘッダー表示
// =============================
const mainHeader = document.getElementById("mainHeader");
const projectTextEl = document.getElementById("projectText");

if (projectTextEl) {
  const headerObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          mainHeader.classList.add("header-visible");
        } else {
          mainHeader.classList.remove("header-visible");
        }
      });
    },
    { rootMargin: "-20% 0px 0px 0px" }
  );
  headerObserver.observe(projectTextEl);
}

// // =============================
// // ヘッダーボタンの動作
// // =============================
// document.querySelector(".header-btn.map")?.addEventListener("click", () => {
//   window.location.href = "../map/index.html";
// });

// =============================
// 中央タイトル → 左上移動時に同期してヘッダー表示
// =============================
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) {
        mainHeader.classList.add("header-visible");
      } else {
        mainHeader.classList.remove("header-visible");
      }
    });
  },
  { threshold: 0.1 }
);
if (heroCenter) observer.observe(heroCenter);
