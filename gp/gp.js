import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  query,
  where,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

(() => {
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
  const db = getFirestore(app);
  const WEBMAP_ID = "675854f3a23041a687aade82428ff8bf";

  let SURVEY_LAYER_URL = null; // ← WebMapロード後に上書きする

  const DISTRICT_ID = "gaku-01";
  const DISTRICT_NAME = "箕輪小学校";
  document.getElementById("districtName").textContent = DISTRICT_NAME;

  // 疑似的な「自分の作品」ID
  let myArtId = null;

  // UI要素
  const carouselTrack = document.getElementById("carouselTrack");
  const selectionTitle = document.getElementById("selectedTitle");
  const bubbleLayer = document.getElementById("bubbleLayer");
  const commentInput = document.getElementById("commentInput");
  const commentAnon = document.getElementById("commentAnon");
  const sendCommentBtn = document.getElementById("sendCommentBtn");
  const makeTogetherBtn = document.getElementById("makeTogetherBtn");

  const artDialog = document.getElementById("artDialog");
  const artDialogClose = document.getElementById("artDialogClose");
  const artDialogTitle = document.getElementById("artDialogTitle");
  const artDialogImage = document.getElementById("artDialogImage");
  const artDialogDesc = document.getElementById("artDialogDesc");
  const requestCollabBtn = document.getElementById("requestCollabBtn");

  const confirmDialog = document.getElementById("confirmDialog");
  const confirmText = document.getElementById("confirmText");
  const confirmOk = document.getElementById("confirmOk");
  const confirmCancel = document.getElementById("confirmCancel");

  initAccountChip();

  // 選択中
  let selected = null; // { art_id, title, desc, imgUrl, geometry, objectId }
  let artworks = [];
  let dialogTarget = null;

  // --------------------------------------
  // ArcGIS 初期化（WebMap 方式）
  // --------------------------------------
  let view = null;

  require([
    "esri/WebMap",
    "esri/views/MapView",
    "esri/widgets/Search",
    "esri/widgets/ScaleBar",
    "esri/widgets/Locate",
  ], function (WebMap, MapView, Search, ScaleBar, Locate) {
    // 1) WebMapをロード
    const webmap = new WebMap({
      portalItem: { id: WEBMAP_ID },
    });

    // --------------------------------------
    // 選択された作品を地図に反映する関数（復活）
    // --------------------------------------
    function selectArtwork(artId, opts = { flyMap: true }) {
      const a = artworks.find((x) => x.art_id === artId);
      if (!a || !view) return;
      selected = a;
      selectionTitle.textContent = a.title;

      // コメント欄の見出しを更新
      const commentBoxTitle = document.querySelector(".comment-box h3");
      if (commentBoxTitle && a.author) {
        commentBoxTitle.textContent = `💬${a.author} さんにコメントを送る`;
      } else {
        commentBoxTitle.textContent = "コメントを送る";
      }

      // カードの見た目を更新
      Array.from(carouselTrack.children).forEach((c) => {
        c.classList.toggle("active", c.dataset.artId === artId);
      });

      // 地図をズームして中央へ
      if (opts.flyMap !== false) {
        view.goTo(
          { target: a.geometry, zoom: 16 },
          { animate: true, duration: 800 }
        );
      }
    }
    window.selectArtwork = selectArtwork;

    // 2) MapView
    view = new MapView({
      container: "viewDiv",
      map: webmap,
      // 必要なら固定初期表示
      // center: [139.7671, 35.6812],
      // zoom: 11,
      highlightOptions: {
        color: [255, 200, 0],
        haloOpacity: 0.9,
        fillOpacity: 0.2,
      },
    });

    view.ui.add(new Search({ view }), "top-right");
    view.ui.add(new ScaleBar({ view, unit: "metric" }), "bottom-left");
    view.ui.add(new Locate({ view }), "top-left");

    // 3) WebMap・配下レイヤーがすべて準備できたら
    webmap.loadAll().then(async () => {
      // WebMap内から Survey123 レイヤーを見つける（title または URLで判定）
      // Survey123 レイヤーを WebMap 内から検出
      const surveyLayer =
        webmap.layers.find(
          (l) => l.title && l.title.includes("Layar 作品集")
        ) ||
        webmap.layers.find(
          (l) =>
            l.url &&
            l.url.includes(
              "survey123_cff62fc5070c4f468b2c9269d5b2535f/FeatureServer"
            )
        );

      if (!surveyLayer) {
        console.error("Survey123 レイヤーが WebMap 内に見つかりません。");
        return;
      }

      // 取得したレイヤーURLを添付取得で使う
      SURVEY_LAYER_URL = surveyLayer.url;

      // 4) データ取得 → カルーセル構築
      const result = await surveyLayer.queryFeatures({
        where: "1=1",
        outFields: ["*"],
        returnGeometry: true,
      });

      artworks = await Promise.all(
        result.features.map(async (f) => {
          const attrs = f.attributes;
          // Survey123 の3つのフィールドを安全に取得
          const mabling = attrs["Mabling"] || "";
          const collage = attrs["collage"] || "";
          const message = attrs["Message"] || "無題";
          const author =
            attrs["field_25"] ||
            attrs["nickname"] ||
            attrs["name"] ||
            "匿名の作者";
          const objectId =
            attrs["OBJECTID"] ?? attrs["ObjectID"] ?? attrs["objectid"];
          const imgUrl = await getAttachment(objectId);

          return {
            art_id: "art_" + objectId,
            title: message, // ← Messageをタイトルに
            desc: mabling, // ← 従来通り
            collage, // ← 追加
            message, // ← 追加（titleとは別に保持も可）
            mabling, // ← 明示的に保持
            author,
            imgUrl,
            geometry: f.geometry,
            objectId,
          };
        })
      );

      if (artworks.length > 0) myArtId = artworks[0].art_id;
      buildCarousel(artworks);
      if (artworks[0]) selectArtwork(artworks[0].art_id);
      listenCommentsRealtime(); // Firestore の購読開始

      // 5) ピンをクリック → 対応カードのダイアログ
      view.on("click", async (evt) => {
        const hit = await view.hitTest(evt);
        const feat = hit.results.find(
          (r) => r.graphic && r.graphic.layer === surveyLayer
        )?.graphic;
        if (feat) {
          const a = artworks.find(
            (x) =>
              x.objectId === feat.attributes.OBJECTID ||
              x.objectId === feat.attributes.ObjectID ||
              x.objectId === feat.attributes.objectid
          );
          if (a) openArtDialog(a);
        }
      });
    });

    // みんなでつくる → 自作品を発光
    makeTogetherBtn.addEventListener("click", () => {
      if (!myArtId) return;
      const mine = artworks.find((a) => a.art_id === myArtId);
      if (!mine) return;
      placeGlowPulse(mine.geometry);
    });
  });

  // 添付ファイルのURL取得（REST 直叩き）
  async function getAttachment(objectId) {
    if (!SURVEY_LAYER_URL) return "";
    const url = `${SURVEY_LAYER_URL}/${objectId}/attachments?f=json`;
    try {
      const res = await fetch(url);
      const data = await res.json();
      if (!data.attachmentInfos || data.attachmentInfos.length === 0) return "";

      const sorted = data.attachmentInfos.sort((a, b) => b.size - a.size);
      const attId = sorted[0].id;

      // ✅ tokenクエリを条件付きで付与（空なら付けない）
      const tokenParam =
        window.ARC_TOKEN && window.ARC_TOKEN !== ""
          ? `?token=${window.ARC_TOKEN}`
          : "";
      return `${SURVEY_LAYER_URL}/${objectId}/attachments/${attId}${tokenParam}`;
    } catch (e) {
      console.warn("添付取得エラー:", e);
      return "";
    }
  }

  // --------------------------------------
  // Carousel & Selection（修正版）
  // --------------------------------------
  function buildCarousel(items) {
    carouselTrack.innerHTML = "";

    const loopedItems = [...items.slice(-2), ...items, ...items.slice(0, 2)];

    for (const a of loopedItems) {
      const el = document.createElement("article");
      el.className = "card";
      el.dataset.artId = a.art_id;
      el.dataset.title = a.title;
      el.dataset.author = a.author;
      el.innerHTML = `
      ${
        a.imgUrl
          ? `<img src="${a.imgUrl}" alt="image">`
          : `<div style="height:145px;background:#eee;border-radius:10px;display:flex;align-items:center;justify-content:center;color:#777;">No Image</div>`
      }
      <h3>${escapeHtml(a.title)}</h3>
      <p>${escapeHtml(a.desc)}</p>
    `;
      el.addEventListener("click", () => {
        selectArtwork(a.art_id);
        setTimeout(() => openArtDialog(a), 100); // 少し遅延させて確実にselected更新
      });

      carouselTrack.appendChild(el);
    }

    // === 初期位置を中央に ===
    if (!carouselTrack.dataset.initialized) {
      const third = carouselTrack.scrollHeight / 3;
      carouselTrack.scrollTop = third;
      carouselTrack.dataset.initialized = "true"; // ✅ 再実行防止
    }

    // === 無限ループ挙動 ===
    carouselTrack.addEventListener(
      "scroll",
      throttle(() => {
        const max = carouselTrack.scrollHeight - carouselTrack.clientHeight;
        if (carouselTrack.scrollTop > max - 50) {
          carouselTrack.scrollTop -= third;
        } else if (carouselTrack.scrollTop < 50) {
          carouselTrack.scrollTop += third;
        }
        updateActiveCard(); // ← 中央カードを常時検出
      }, 100)
    );

    // === スクロール停止後も確実に更新 ===
    let scrollTimer;
    carouselTrack.addEventListener("scroll", () => {
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(() => updateActiveCard(), 200);
    });

    // 初期選択
    setTimeout(updateActiveCard, 200);
  }

  // --- 既に window.selectArtwork が存在しない場合でも fallback ---
  function callSelectArtwork(artId) {
    if (typeof window.selectArtwork === "function") {
      window.selectArtwork(artId, { flyMap: false });
    } else {
      console.warn("selectArtwork 未定義です");
    }
  }

  // --------------------------------------
  // 中央カードを検出して選択更新（スクロールで自動変化）
  // --------------------------------------
  function updateActiveCard() {
    const cards = Array.from(carouselTrack.children);
    if (cards.length === 0) return;

    const containerRect = carouselTrack.getBoundingClientRect();
    const centerY = containerRect.top + containerRect.height / 2;

    let closest = null;
    let minDist = Infinity;

    cards.forEach((card) => {
      const rect = card.getBoundingClientRect();
      const cardCenter = rect.top + rect.height / 2;
      const dist = Math.abs(cardCenter - centerY);
      if (dist < minDist) {
        minDist = dist;
        closest = card;
      }
    });

    if (!closest) return;
    const artId = closest.dataset.artId;
    if (selected && selected.art_id === artId) return;

    // ✅ selectArtworkを安全に呼び出す
    callSelectArtwork(artId);
  }

  // --------------------------------------
  // Firestore コメント購読
  // --------------------------------------
  let unsubComments = null;
  function listenCommentsRealtime() {
    // 🔁 既存購読があれば解除（二重購読防止）
    if (unsubComments) {
      unsubComments();
      unsubComments = null;
    }

    const q = query(
      collection(db, "comments"),
      where("district_id", "==", DISTRICT_ID)
    );

    unsubComments = onSnapshot(q, (snapshot) => {
      // 既存の泡を全部クリア
      bubbleLayer.querySelectorAll(".bubble").forEach((n) => n.remove());

      // Firestore上の全コメントを再描画
      snapshot.forEach((doc) => {
        const c = doc.data();
        if (c.geometry) launchBubbleToMap(c);
      });
    });
  }

  // --------------------------------------
  // コメント → 泡アニメーション
  // --------------------------------------
  sendCommentBtn.addEventListener("click", async () => {
    if (!selected) return alert("作品が選択されていません。");
    const text = commentInput.value.trim();
    if (!text) return alert("コメントを入力してください。");

    // --- ArcGIS Point → Firestore対応オブジェクトへ変換 ---
    const geom = selected.geometry;
    const geometryData = geom
      ? {
          x: geom.x,
          y: geom.y,
          spatialReference: geom.spatialReference?.wkid || 4326,
        }
      : null;

    const comment = {
      id: "c-" + crypto.randomUUID(),
      art_id: selected.art_id,
      text,
      anon: commentAnon.checked,
      author: selected.author || "匿名の作者",
      ts: Date.now(),
      geometry: geometryData, // ←ここを変換後で保存！
      district_id: DISTRICT_ID,
    };

    try {
      await addDoc(collection(db, "comments"), comment);
      showToast("💬 コメントを送信しました！");
      commentInput.value = "";
    } catch (e) {
      console.error("Firestore保存エラー:", e);
    }
  });

  // // ✅ ページ再読み込み時に全コメントを再描画
  // function redrawAllComments() {
  //   bubbleLayer.querySelectorAll(".bubble").forEach((n) => n.remove());
  //   const items = loadComments();
  //   for (const c of items) {
  //     if (!c.geometry) continue;
  //     launchBubbleToMap(c);
  //   }
  // }
  // ========================================
  // 💭 コメント → 作品位置へ飛んで漂う泡
  // ========================================
  function launchBubbleToMap(comment) {
    if (!view || !comment.geometry) return;

    // 🔹 ArcGISのprojectionモジュールで座標変換を行う
    require(["esri/geometry/Point", "esri/geometry/projection"], (
      Point,
      projection
    ) => {
      const geomData = comment.geometry;

      // Firestore保存形式からArcGIS Pointへ変換
      const point = new Point({
        x: geomData.x,
        y: geomData.y,
        spatialReference: { wkid: geomData.spatialReference || 4326 },
      });

      // projectionエンジンをロード
      projection.load().then(() => {
        // ✅ viewの座標系(WebMercator)へ変換
        const projected = projection.project(point, view.spatialReference);

        // ---- 泡ノード作成 ----
        const node = document.createElement("div");
        node.className = "bubble float";
        node.textContent = comment.text;
        bubbleLayer.appendChild(node);

        // 作品の座標をスクリーン座標に変換
        const pt = view.toScreen(projected);

        // 少しランダムなズレを加えて「近くで漂う」
        const offsetX = (Math.random() - 0.5) * 100;
        const offsetY = (Math.random() - 0.5) * 80;
        node.style.left = `${pt.x + offsetX}px`;
        node.style.top = `${pt.y + offsetY}px`;

        // 🌬 漂うアニメーション
        animateFloatingBubble(node, pt.x + offsetX, pt.y + offsetY);

        // ビュー移動時にも追従
        const updatePos = () => {
          const p = view.toScreen(projected);
          node.style.left = `${p.x + offsetX}px`;
          node.style.top = `${p.y + offsetY}px`;
        };
        view.watch("extent", throttle(updatePos, 80));
        view.on("pointer-move", throttle(updatePos, 150));
      });
    });
  }

  // 🎈 漂うモーション
  function animateFloatingBubble(el, baseX, baseY) {
    const range = 10 + Math.random() * 10;
    const speed = 4000 + Math.random() * 2000;

    el.animate(
      [
        { transform: "translate(0, 0)", opacity: 1 },
        {
          transform: `translate(${
            Math.sin(Date.now() / speed) * range
          }px, -${range}px)`,
          opacity: 0.95,
        },
        { transform: "translate(0, 0)", opacity: 1 },
      ],
      {
        duration: speed * 2,
        iterations: Infinity,
        easing: "ease-in-out",
      }
    );
  }
  // --------------------------------------
  // 作品ダイアログ（Survey123の内容表示）
  // --------------------------------------
  async function openArtDialog(a) {
    dialogTarget = a;

    const mabling = a.mabling || "（説明なし）";
    const collage = a.collage || "（説明なし）";
    const message = a.message || "（メッセージなし）";
    const imgUrl =
      a.imgUrl || (a.objectId ? await getAttachment(a.objectId) : "");

    // ✅ タイトル反映
    artDialogTitle.textContent = a.title || "（タイトルなし）";

    const contentHtml = `
    <div class="art-content">
      <div class="art-image-wrap">
        ${
          imgUrl
            ? `<img id="artDialogImage" class="art-image" src="${imgUrl}" alt="作品画像">`
            : `<div class="art-image noimg">No Image</div>`
        }
      </div>
      <div class="art-info-grid">
        <div class="art-box">
          <h4>🎨 マーブリングのポイント</h4>
          <p>${escapeHtml(mabling)}</p>
        </div>
        <div class="art-box">
          <h4>🧩 コラージュのポイント</h4>
          <p>${escapeHtml(collage)}</p>
        </div>
        <div class="art-box">
          <h4>💬 メッセージ</h4>
          <p>${escapeHtml(message)}</p>
        </div>
      </div>
    </div>
  `;

    artDialog.querySelector(".art-dialog-body").innerHTML = contentHtml;
    artDialog.showModal?.();

    // --- 地図ズーム ---
    if (view && a.geometry) {
      view.goTo(
        { target: a.geometry, zoom: 16 },
        { animation: { duration: 800, easing: "ease-in-out" } }
      );
    }
  }

  // ✅ ここから次の行に続ける（artDialogCloseなど）
  artDialogClose.addEventListener("click", () => artDialog.close());

  artDialogClose.addEventListener("click", () => artDialog.close());

  // === 協作リクエスト開始 ===
  requestCollabBtn.addEventListener("click", () => {
    if (!dialogTarget) return;

    // ✅ 作品名ではなく「制作者」に表示を変更
    const targetAuthor = dialogTarget.author || "制作者";
    confirmText.textContent = `${targetAuthor} さんに協作をリクエストします。<br>よろしいですか？`;

    confirmDialog.showModal();
  });

  // === キャンセル時 ===
  confirmCancel.addEventListener("click", () => confirmDialog.close());

  // === 送信時 ===
  confirmOk.addEventListener("click", () => {
    confirmDialog.close();
    artDialog.close();

    if (dialogTarget) {
      launchBubbleToMap({
        id: "req-" + crypto.randomUUID(),
        art_id: dialogTarget.art_id,
        text: "✉協作リクエスト送信",
        geometry: dialogTarget.geometry,
        ts: Date.now(),
      });

      setTimeout(() => {
        const targetAuthor = dialogTarget.author || "制作者";
        // ✅ alert → トースト通知に変更
        showToast(
          `✉${targetAuthor} さんに協作リクエストを送信しました！<br>一緒に作品をつくる準備をしましょう！`
        );
      }, 150);
    }
  });

  // --------------------------------------
  // 自作品発光
  // --------------------------------------
  function placeGlowPulse(geometry) {
    if (!view) return;
    const node = document.createElement("div");
    node.className = "glow-pulse";
    bubbleLayer.appendChild(node);
    setTimeout(() => node.remove(), 5000);

    const updatePos = () => {
      const pt = view.toScreen(geometry);
      node.style.left = `${pt.x}px`;
      node.style.top = `${pt.y}px`;
    };
    updatePos();
    view.watch("extent", throttle(updatePos, 50));
    view.on("pointer-move", throttle(updatePos, 100));
  }

  // --------------------------------------
  // Utils
  // --------------------------------------
  function initAccountChip() {
    const initials = ["P", "M", "D", "K"][Math.floor(Math.random() * 4)];
    document.getElementById("avatar").textContent = initials;
    document.getElementById("displayName").textContent = "Guestさん";
  }
  function escapeHtml(s) {
    return (s || "").replace(
      /[&<>"']/g,
      (m) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }
  function throttle(fn, wait) {
    let t = 0,
      saved = null;
    return function (...args) {
      const now = Date.now();
      if (!t || now - t >= wait) {
        t = now;
        fn.apply(this, args);
      } else {
        clearTimeout(saved);
        saved = setTimeout(() => {
          t = 0;
          fn.apply(this, args);
        }, wait - (now - t));
      }
    };
  }

  // ✅ トースト通知関数
  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = message;

    document.body.appendChild(toast);

    // 3秒後にフェードアウトして削除
    setTimeout(() => {
      toast.classList.add("hide");
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  }
})();
