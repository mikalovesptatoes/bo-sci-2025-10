require([
  "esri/WebMap",
  "esri/views/MapView",
  "esri/Graphic",
  "esri/widgets/Legend",
  "esri/symbols/support/symbolUtils"
], function(WebMap, MapView, Graphic, Legend, symbolUtils) {

  const webmap = new WebMap({
    portalItem: {
      id: "fae46914acba46b98226dd452fee9e8f"
    }
  });

  const view = new MapView({
    container: "viewDiv",
    map: webmap,
    zoom: 15,
    highlightOptions: {
      color: [255, 0, 0],
      haloOpacity: 1,
      fillOpacity: 0.3
    }
  });

  view.when(() => {

    // --- 1. 凡例ウィジェット ---
    const customLegendTitles = {
      "naisui_R7_clip": "下水があふれる洪水（内水氾濫）",
      "gaisui_clip": "川の水があふれる洪水（外水氾濫）",
      "kyukeisha_R7_clip": "土砂災害",
      "takashio_clip": "高潮（浸水深）",
      "tsunami_clip": "津波（浸水深、慶長型地震）",
      "jishindo_clip": "震度情報（元禄型関東地震）",
      "shoshitsu_clip": "地震火災（元禄型関東地震）",
      "ekijyouka_clip": "地盤の液状化（元禄型関東地震）"
    };
    const legendLayers = webmap.allLayers
      .filter(layer => layer.title.includes("_clip"))
      .map(layer => ({ layer: layer, title: customLegendTitles[layer.title] || layer.title }));

    const legend = new Legend({
      view: view,
      layerInfos: legendLayers.toArray()
    });
    view.ui.add(legend, "bottom-right");

    // --- 2. ベースマップ切り替え ---
    const whiteMapBtn = document.getElementById("white-map-btn");
    const satelliteBtn = document.getElementById("satellite-btn");
    const satelliteLayer = webmap.allLayers.find(layer => layer.title === "衛星画像（World Imagery）");

    if (satelliteLayer) {
      satelliteLayer.visible = false;
      whiteMapBtn.addEventListener("click", () => {
        satelliteLayer.visible = false;
        whiteMapBtn.classList.add("active");
        satelliteBtn.classList.remove("active");
      });
      satelliteBtn.addEventListener("click", () => {
        satelliteLayer.visible = true;
        whiteMapBtn.classList.remove("active");
        satelliteBtn.classList.add("active");
      });
    }

    // --- 3. タブ切り替え ---
    const hazardTab = document.getElementById("hazard-tab");
    const resourceTab = document.getElementById("resource-tab");
    const themeTab = document.getElementById("theme-tab");
    const hazardContent = document.getElementById("hazard-content");
    const resourceContent = document.getElementById("resource-content");
    const themeContent = document.getElementById("theme-content");

    hazardTab.addEventListener("click", () => {
      hazardTab.classList.add("active");
      resourceTab.classList.remove("active");
      themeTab.classList.remove("active");
      hazardContent.style.display = "block";
      resourceContent.style.display = "none";
      themeContent.style.display = "none";
    });

    resourceTab.addEventListener("click", () => {
      hazardTab.classList.remove("active");
      resourceTab.classList.add("active");
      themeTab.classList.remove("active");
      hazardContent.style.display = "none";
      resourceContent.style.display = "block";
      themeContent.style.display = "none";
    });

    themeTab.addEventListener("click", () => {
      hazardTab.classList.remove("active");
      resourceTab.classList.remove("active");
      themeTab.classList.add("active");
      hazardContent.style.display = "none";
      resourceContent.style.display = "none";
      themeContent.style.display = "block";
    });

    // --- 4. レイヤーの表示切り替え関数 ---
    function setupLayerToggle(layerTitle, checkboxId) {
      const layer = webmap.allLayers.find(l => l.title === layerTitle);
      const checkbox = document.getElementById(checkboxId);
      if (layer && checkbox) {
        checkbox.checked = layer.visible;
        checkbox.addEventListener("change", () => {
          layer.visible = checkbox.checked;
        });
      }
    }

    // （ここは省略せずに全部のlayerを登録）
    setupLayerToggle("naisui_R7_clip", "naisui_R7-filter");
    setupLayerToggle("gaisui_clip", "gaisui-filter");
    setupLayerToggle("kyukeisha_R7_clip", "kyukeisha_R7-filter");
    setupLayerToggle("takashio_clip", "takashio-filter");
    setupLayerToggle("tsunami_clip", "tsunami-filter");
    setupLayerToggle("jishindo_clip", "jishindo-filter");
    setupLayerToggle("shoshitsu_clip", "shoshitsu-filter");
    setupLayerToggle("ekijyouka_clip", "ekijyouka-filter");

    setupLayerToggle("TIIKIBOSAIKYOTEN", "TIIKIBOSAIKYOTEN-filter");
    setupLayerToggle("koen-point", "koen-point-filter");
    setupLayerToggle("toilet", "toilet-filter");
    setupLayerToggle("hamakkotoilet", "hamakkotoilet-filter");
    setupLayerToggle("syouboukigu", "syouboukigu-filter");
    setupLayerToggle("douro12", "douro12-filter");
    setupLayerToggle("douro4", "douro4-filter");
    setupLayerToggle("yusouro", "yusouro-filter");
    setupLayerToggle("suibu", "suibu-filter");
    setupLayerToggle("kinkyu_kyusuisen", "kinkyu_kyusuisen-filter");
    setupLayerToggle("taishin_kyusuisen", "taishin_kyusuisen-filter");
    setupLayerToggle("kyusuitank", "kyusuitank-filter");
    setupLayerToggle("haisuisou", "haisuisou-filter");

    // --- 5. シンボル画像の追加 ---
    async function addSymbolToResourceList() {
      const resourceOptions = document.querySelectorAll('#resource-filters .filter-option');
      for (const option of resourceOptions) {
        const checkbox = option.querySelector('input[type="checkbox"]');
        if (!checkbox) continue;

        const layerTitle = checkbox.id.replace('-filter', '');
        const layer = webmap.allLayers.find(l => l.title === layerTitle);

        if (layer) {
          try {
            await layer.load();
          } catch {
            continue;
          }

          if (layer.renderer) {
            let symbol;
            const renderer = layer.renderer;
            if (renderer.symbol) {
              symbol = renderer.symbol;
            } else if (renderer.uniqueValueInfos?.length > 0) {
              symbol = renderer.uniqueValueInfos[0].symbol;
            } else if (renderer.classBreakInfos?.length > 0) {
              symbol = renderer.classBreakInfos[0].symbol;
            }

            if (symbol) {
              symbolUtils.renderPreviewHTML(symbol, { size: 16 }).then(symbolElement => {
                symbolElement.classList.add('symbol-preview');
                const container = option.querySelector('.symbol-and-label');
                if (container) {
                  container.prepend(symbolElement);
                }
              });
            }
          }
        }
      }
    }
    addSymbolToResourceList();

    // --- 6. ハザード並べ替え機能 ---
    const hazardFilters = document.getElementById("hazard-filters");
    hazardFilters.addEventListener("click", function(event) {
      const button = event.target.closest(".reorder-button");
      if (!button) return;

      const currentOption = button.closest(".filter-option");
      const direction = button.dataset.direction;
      const currentLayerTitle = currentOption.dataset.layerTitle;
      const currentLayer = webmap.allLayers.find(l => l.title === currentLayerTitle);
      if (!currentLayer) return;

      if (direction === "up") {
        const targetOption = currentOption.previousElementSibling;
        if (targetOption) {
          const targetLayerTitle = targetOption.dataset.layerTitle;
          const targetLayer = webmap.allLayers.find(l => l.title === targetLayerTitle);
          if (targetLayer) {
            hazardFilters.insertBefore(currentOption, targetOption);
            view.map.reorder(currentLayer, view.map.layers.indexOf(targetLayer));
          }
        }
      } else if (direction === "down") {
        const targetOption = currentOption.nextElementSibling;
        if (targetOption) {
          const targetLayerTitle = targetOption.dataset.layerTitle;
          const targetLayer = webmap.allLayers.find(l => l.title === targetLayerTitle);
          if (targetLayer) {
            hazardFilters.insertBefore(targetOption, currentOption);
            view.map.reorder(currentLayer, view.map.layers.indexOf(targetLayer));
          }
        }
      }
    });

    // --- 7. survey（アートピン）レイヤー処理 ---
    const artPinsLayer = webmap.allLayers.find(layer => layer.title === "survey");
    if (!artPinsLayer) return;

    let highlightHandle = null;
    view.whenLayerView(artPinsLayer).then(layerView => {
      const viewedIds = JSON.parse(localStorage.getItem("viewedArtIds")) || [];
      if (viewedIds.length > 0) {
        const query = artPinsLayer.createQuery();
        query.objectIds = viewedIds;
        artPinsLayer.queryFeatures(query).then(result => {
          if (highlightHandle) highlightHandle.remove();
          highlightHandle = layerView.highlight(result.features);
        });
      }
    });

    // --- 4. ポップアップとクリックイベント（タップ対応）---
    let currentlyOpenPinId = null;
    artPinsLayer.popupEnabled = false; 
    view.popup.dockOptions = { buttonEnabled: false };
    view.popup.visibleElements = { closeButton: false };

    view.on("click", function(event) {
      
      view.hitTest(event).then(function(response) {
        const result = response.results.find(result => result.graphic.layer === artPinsLayer);

        if (result) {
          // --- 1. ピンがクリックされた場合 ---
          const clickedObjectId = result.graphic.attributes.objectid;

          if (currentlyOpenPinId === clickedObjectId) {
            // --- 2.【2回目クリック】開いているピンが再度クリックされた ---
            console.log(`2回目クリック: ID ${clickedObjectId} 鑑賞ページへ遷移します。`);
            
            window.location.href = `detail.html?id=${clickedObjectId}`;
            currentlyOpenPinId = null;
            view.popup.close(); 
            
          } else {
            // --- 3.【1回目クリック】新しいピンがクリックされた ---
            console.log(`1回目クリック: ID ${clickedObjectId} ポップアップを表示します。`);
            
            currentlyOpenPinId = clickedObjectId;
            
            const query = { objectIds: [clickedObjectId], outFields: ["*"] };
            artPinsLayer.queryFeatures(query).then(function(featureSet) {
              if (!featureSet.features.length) return;
              const attributes = featureSet.features[0].attributes;
              
              artPinsLayer.queryAttachments({ objectIds: [clickedObjectId] }).then(function(attachments) {
                const imageUrl = (attachments[clickedObjectId] && attachments[clickedObjectId].length > 0) ? attachments[clickedObjectId][0].url : "";
                
                // ★★★ 修正点① ★★★
                // 「詳細を見る」ボタンを削除し、案内のテキストに変更
                const contentHtml = `
                <div class="popup-content-vertical">
                  <p class="popup-author">作者：${attributes.field_25}</p>
                  <img src="${imageUrl}" class="popup-image-vertical">
                  <p class="popup-prompt">
                    詳細を見るにはもう一度ピンをタップ！
                  </p>
                </div>`;

                // ★★★ 修正点② ★★★
                // ポップアップの位置をピンから少しずらす（オフセット）
                const mapPoint = result.graphic.geometry;
                const screenPoint = view.toScreen(mapPoint);
                
                // 画面上で 15 ピクセル「上」にずらす（Y座標をマイナスする）
                screenPoint.y = screenPoint.y - 15; 
                
                // ずらした画面座標を、地図の座標に戻す
                const offsetMapPoint = view.toMap(screenPoint);

                // ずらした位置情報（offsetMapPoint）を使ってポップアップを開く
                view.popup.open({ 
                  title: "", 
                  content: contentHtml, 
                  location: offsetMapPoint // ← 修正！ result.graphic.geometry から変更
                });
              });
            });
          }

        } else {
          // --- 4. ピン以外の場所（地図）がクリックされた場合 ---
          console.log("地図をクリック。ポップアップを閉じます。");
          view.popup.close();
          currentlyOpenPinId = null; 
        }
      });
    });
  });
});
