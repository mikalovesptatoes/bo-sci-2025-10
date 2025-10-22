require([
  "esri/WebMap",
  "esri/views/MapView",
  "esri/Graphic",
  "esri/widgets/Legend"
], function(WebMap, MapView, Graphic, Legend) {

  const webmap = new WebMap({
    portalItem: {
      id: "36d0117d7ff24d5c8d46c10a986da0d2"
    }
  });

  const view = new MapView({
    container: "viewDiv",
    map: webmap,
    highlightOptions: {
      color: [255, 0, 0],
      haloOpacity: 1,
      fillOpacity: 0.3
    }
  });

  view.when(() => {

    // 凡例
    const customLegendTitles = {"naisui_clip": "下水があふれる洪水（内水氾濫）","gaisui_clip": "川の水があふれる洪水（外水氾濫）","kyukeisha_clip" : "土砂災害","takashio_clip": "高潮（浸水深）","tsunami_clip": "津波（浸水深、慶長型地震）","jishindo_clip": "震度情報（元禄型関東地震）","shoshitsu_clip": "地震火災（元禄型関東地震）","ekijyouka_clip": "地盤の液状化（元禄型関東地震）"};
    const legendLayers = webmap.allLayers.filter(layer => layer.title.includes("_clip")).map(layer => ({ layer: layer, title: customLegendTitles[layer.title] || layer.title }));
    
    const legend = new Legend({
      view: view,
      layerInfos: legendLayers.toArray()
    });
    view.ui.add(legend, "bottom-right");

    // ベースマップ切り替え
    const whiteMapBtn = document.getElementById("white-map-btn");
    const satelliteBtn = document.getElementById("satellite-btn");
    const satelliteLayer = webmap.allLayers.find(layer => layer.title === "衛星画像（World Imagery）");

    // 「白地図」ボタンが押されたときの処理
    whiteMapBtn.addEventListener("click", () => {
      satelliteLayer.visible = false; // 衛星画像を非表示にする
      whiteMapBtn.classList.add("active");
      satelliteBtn.classList.remove("active");
    });

    // 「衛星画像」ボタンが押されたときの処理
    satelliteBtn.addEventListener("click", () => {
      satelliteLayer.visible = true; // 衛星画像を表示する
      whiteMapBtn.classList.remove("active");
      satelliteBtn.classList.add("active");
    });

    // ハザードマップ表示切り替え
    function setupLayerToggle(layerTitle, checkboxId) {
      const layer = webmap.allLayers.find(l => l.title === layerTitle);
      const checkbox = document.getElementById(checkboxId);
      if (layer && checkbox) {
        checkbox.checked = layer.visible;
        checkbox.addEventListener('change', () => { layer.visible = checkbox.checked; });
      }
    }
    setupLayerToggle("naisui_clip", "naisui-filter");
    setupLayerToggle("gaisui_clip", "gaisui-filter");
    setupLayerToggle("kyukeisha_clip", "kyukeisha-filter");
    setupLayerToggle("takashio_clip", "takashio-filter");
    setupLayerToggle("tsunami_clip", "tsunami-filter");
    setupLayerToggle("jishindo_clip", "jishindo-filter");
    setupLayerToggle("shoshitsu_clip", "shoshitsu-filter");
    setupLayerToggle("ekijyouka_clip", "ekijyouka-filter");

    // ハザードマップ並べ替え
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
        if (targetOption && targetOption.classList.contains("filter-option")) {
          const targetLayerTitle = targetOption.dataset.layerTitle;
          const targetLayer = webmap.allLayers.find(l => l.title === targetLayerTitle);
          if (targetLayer) {
            hazardFilters.insertBefore(currentOption, targetOption);
            // 地図のレイヤーを「相手がいた場所」に移動
            view.map.reorder(currentLayer, view.map.layers.indexOf(targetLayer));
          }
        }
      } else if (direction === "down") {
        const targetOption = currentOption.nextElementSibling;
        if (targetOption && targetOption.classList.contains("filter-option")) {
          const targetLayerTitle = targetOption.dataset.layerTitle;
          const targetLayer = webmap.allLayers.find(l => l.title === targetLayerTitle);
          if (targetLayer) {
            hazardFilters.insertBefore(targetOption, currentOption);
            view.map.reorder(currentLayer, view.map.layers.indexOf(targetLayer));
          }
        }
      }
    });

    const artPinsLayer = webmap.allLayers.find(layer => layer.title === "survey");
    if (!artPinsLayer) return;

    // 閲覧済みピンの処置
    let highlightHandle = null;
    view.whenLayerView(artPinsLayer).then(layerView => {
      const viewedIds = JSON.parse(localStorage.getItem("viewedArtIds")) || [];
      if (viewedIds.length > 0) {
        const query = artPinsLayer.createQuery();
        query.objectIds = viewedIds;
        artPinsLayer.queryFeatures(query).then(result => {
          if (highlightHandle) {
            highlightHandle.remove();
          }
          highlightHandle = layerView.highlight(result.features);
        });
      }
    });

    // ホバーでポップアップ
    artPinsLayer.popupEnabled = false;
    view.popup.dockOptions = { buttonEnabled: false };
    view.popup.visibleElements = { closeButton: false };
    let currentObjectId = null;
    view.on("pointer-move", function(event) {
      view.hitTest(event).then(function(response) {
        const result = response.results.find(result => result.graphic.layer === artPinsLayer);
        if (result) {
          const objectId = result.graphic.attributes.objectid;
          if (currentObjectId !== objectId) {
            currentObjectId = objectId;
            const query = { objectIds: [objectId], outFields: ["*"] };
            artPinsLayer.queryFeatures(query).then(function(featureSet) {
              if (!featureSet.features.length) return;
              const attributes = featureSet.features[0].attributes;
              artPinsLayer.queryAttachments({ objectIds: [objectId] }).then(function(attachments) {
                const imageUrl = (attachments[objectId] && attachments[objectId].length > 0) ? attachments[objectId][0].url : "";
                const contentHtml = `
                <div class="popup-content-vertical">
                <p class="popup-author">作者：${attributes.field_25}</p>
                <img src="${imageUrl}" class="popup-image-vertical">
                </div>`;
                view.popup.open({ title: "", content: contentHtml, location: result.graphic.geometry });
              });
            });
          }
        } else {
          view.popup.close();
          currentObjectId = null;
        }
      });
    });
  });
});