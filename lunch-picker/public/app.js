(() => {
  "use strict";

  const citySelect = document.querySelector("#city-select");
  const cityCount = document.querySelector("#city-count");
  const citySearch = document.querySelector("#city-search");
  const searchStatus = document.querySelector("#search-status");
  const searchResults = document.querySelector("#city-search-results");
  const spinButton = document.querySelector("#spin-button");
  const resultCard = document.querySelector("#result-card");
  const resultMedia = document.querySelector("#result-media");
  const resultImage = document.querySelector("#result-image");
  const resultImageFallback = document.querySelector("#result-image-fallback");
  const resultImageCredit = document.querySelector("#result-image-credit");
  const resultName = document.querySelector("#result-name");
  const resultMeta = document.querySelector("#result-meta");
  const globalStatus = document.querySelector("#global-status");
  const mapCaption = document.querySelector("#map-caption");
  const mapFallback = document.querySelector("#map-fallback");
  const mapFallbackDetail = document.querySelector("#map-fallback-detail");
  const mapElement = document.querySelector("#map");
  const worldViewButton = document.querySelector("#world-view-button");
  const returnCityButton = document.querySelector("#return-city-button");
  const candidatePreview = document.querySelector("#candidate-preview");
  const currentCityLabel = document.querySelector("#current-city-label");
  const candidateCityLabel = document.querySelector("#candidate-city-label");
  const confirmCityButton = document.querySelector("#confirm-city-button");
  const cancelCityButton = document.querySelector("#cancel-city-button");
  const closeCandidateButton = document.querySelector("#close-candidate-button");
  const placeCount = document.querySelector("#place-count");
  const placeStatus = document.querySelector("#place-status");
  const placesList = document.querySelector("#places-list");
  const appVersion = document.querySelector("#app-version");

  const state = {
    regions: [],
    currentRegion: null,
    candidateRegion: null,
    places: [],
    markers: new Map(),
    cityMarkers: [],
    map: null,
    tileLayer: null,
    cityRequestId: 0,
    spinRequestId: 0,
    placesError: "",
    mapUnavailable: "",
    tileUnavailable: false,
    tileErrors: 0,
    worldViewActive: false,
  };

  function setStatus(element, message, tone = "") {
    element.textContent = message;
    if (tone) {
      element.dataset.tone = tone;
    } else {
      delete element.dataset.tone;
    }
  }

  function normalizeSearchText(value) {
    return String(value ?? "")
      .normalize("NFKC")
      .trim()
      .toLocaleLowerCase("en-US");
  }

  function matchingRegions(query) {
    const normalizedQuery = normalizeSearchText(query);
    return state.regions.filter((region) => {
      if (!normalizedQuery) {
        return true;
      }
      const name = normalizeSearchText(region.name);
      const nameEn = normalizeSearchText(region.nameEn);
      return name.includes(normalizedQuery) || nameEn.includes(normalizedQuery);
    });
  }

  function unwrap(payload) {
    return payload && payload.data ? payload.data : payload;
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      throw new Error(`Request failed with status ${response.status}`);
    }

    return response.json();
  }

  function normalizeCoordinate(value) {
    if (Array.isArray(value)) {
      return {
        lat: Number(value[0]),
        lng: Number(value[1]),
      };
    }

    if (value && typeof value === "object") {
      const lat = value.lat ?? value.latitude ?? value.y;
      const lng = value.lng ?? value.lon ?? value.longitude ?? value.x;
      return {
        lat: Number(lat),
        lng: Number(lng),
      };
    }

    return null;
  }

  function normalizeRegion(region, index) {
    const id = String(region.id ?? region.slug ?? region.key ?? index);
    return {
      ...region,
      id,
      name: String(region.name ?? region.label ?? region.city ?? id),
      center: normalizeCoordinate(region.center ?? region.coordinates),
    };
  }

  function normalizePlace(place, index) {
    const id = String(
      place.id ?? place.osmId ?? place.osm_id ?? place.slug ?? index,
    );
    const context = [place.cuisine, place.address].filter(Boolean).join(" · ");
    const food = place.food && typeof place.food === "object" ? place.food : {};
    return {
      ...place,
      id,
      name: String(place.name ?? place.label ?? "未命名地点"),
      detail: String(
        context ||
          (place.description ??
            place.category ??
            place.kind ??
            place.address ??
            "公开地点示例"),
      ),
      coordinate:
        normalizeCoordinate(place.coordinate ?? place.coordinates) ||
        normalizeCoordinate({
          lat: place.lat ?? place.latitude,
          lng: place.lng ?? place.lon ?? place.longitude,
        }),
      food: food.image
        ? {
            dish: String(food.dish ?? "地方美食"),
            image: String(food.image),
            alt: String(food.alt ?? `${food.dish ?? "地方美食"}示例图片`),
            credit: String(food.credit ?? "来源信息待补充"),
          }
        : null,
    };
  }

  function regionListFrom(payload) {
    const data = unwrap(payload);
    const candidates = Array.isArray(data)
      ? data
      : data && Array.isArray(data.regions)
        ? data.regions
        : data && Array.isArray(data.cities)
          ? data.cities
          : [];

    return candidates.map(normalizeRegion);
  }

  function placeListFrom(payload) {
    const data = unwrap(payload);
    const candidates = Array.isArray(data)
      ? data
      : data && Array.isArray(data.places)
        ? data.places
        : [];

    return candidates.map(normalizePlace);
  }

  function markerPosition(place, region) {
    if (
      place.coordinate &&
      Number.isFinite(place.coordinate.lat) &&
      Number.isFinite(place.coordinate.lng)
    ) {
      return [place.coordinate.lat, place.coordinate.lng];
    }

    return null;
  }

  function regionCenter(region, places = []) {
    if (
      region.center &&
      Number.isFinite(region.center.lat) &&
      Number.isFinite(region.center.lng)
    ) {
      return [region.center.lat, region.center.lng];
    }

    const points = places
      .map((place) => markerPosition(place, region))
      .filter(Boolean);

    if (points.length) {
      return [
        points.reduce((sum, point) => sum + point[0], 0) / points.length,
        points.reduce((sum, point) => sum + point[1], 0) / points.length,
      ];
    }

    return [34.5, 108.9];
  }

  function updateMapFallback() {
    const wasHidden = mapFallback.hidden;
    const messages = [];

    if (state.mapUnavailable) {
      messages.push(state.mapUnavailable);
    }

    if (state.placesError) {
      messages.push("地点暂时不可用，地区切换和随机抽签仍然可用。");
    } else if (state.tileUnavailable) {
      messages.push("底图暂时不可用，地点和抽签仍然可用。");
    }

    mapFallback.hidden = messages.length === 0;
    mapFallbackDetail.textContent = messages.join(" ");
    if (wasHidden !== mapFallback.hidden && state.map) {
      requestAnimationFrame(() => {
        state.map.invalidateSize({ pan: false });
      });
    }
  }

  function initializeMap() {
    if (!window.L) {
      state.mapUnavailable = "地图组件没有加载，地区切换和随机抽签仍然可用。";
      mapCaption.textContent = "地图组件不可用";
      updateMapFallback();
      return;
    }

    try {
      state.map = window.L.map("map", {
        center: [30, 15],
        zoom: 2,
        minZoom: 1,
        maxZoom: 18,
        maxBounds: [
          [-85, -180],
          [85, 180],
        ],
        maxBoundsViscosity: 0.7,
        scrollWheelZoom: true,
        touchZoom: true,
        worldCopyJump: false,
        zoomControl: true,
        attributionControl: true,
      });
      const cityMarkerPane = state.map.createPane("cityMarkers");
      cityMarkerPane.style.zIndex = "650";
      cityMarkerPane.style.pointerEvents = "auto";

      state.tileLayer = window.L.tileLayer(
        "https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
        {
          subdomains: ["1", "2", "3", "4"],
          maxZoom: 18,
          noWrap: true,
          attribution: "底图 © 高德地图",
        },
      );

      state.tileLayer.on("tileerror", () => {
        state.tileErrors += 1;
        if (state.tileErrors >= 3 && !state.tileUnavailable) {
          state.tileUnavailable = true;
          mapCaption.textContent = "底图不可用，点位仍可查看";
          updateMapFallback();
        }
      });

      state.tileLayer.addTo(state.map);
      const syncMapState = () => {
        const center = state.map.getCenter();
        mapElement.dataset.zoom = String(state.map.getZoom());
        mapElement.dataset.centerLat = center.lat.toFixed(5);
        mapElement.dataset.centerLng = center.lng.toFixed(5);
      };
      state.map.on("moveend zoomend", syncMapState);
      syncMapState();
      window.addEventListener("resize", () => {
        state.map.invalidateSize({ pan: false });
      });
    } catch (error) {
      state.mapUnavailable = "地图暂时无法初始化，地区切换和随机抽签仍然可用。";
      mapCaption.textContent = "地图初始化失败";
      updateMapFallback();
    }
  }

  function clearPlaceMarkers() {
    if (!state.map) {
      state.markers.clear();
      return;
    }

    for (const marker of state.markers.values()) {
      marker.remove();
    }
    state.markers.clear();
    state.map.closePopup();
    document
      .querySelectorAll(".leaflet-popup")
      .forEach((popup) => popup.remove());
  }

  function createCityPopupContent(region) {
    const wrapper = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");

    name.className = "popup-name";
    name.textContent = region.name;
    detail.className = "popup-detail";
    if (region.id === state.currentRegion?.id) {
      detail.textContent = `${region.nameEn || "Current city"} · 当前抽签城市`;
    } else if (region.id === state.candidateRegion?.id) {
      detail.textContent = `${region.nameEn || "Candidate city"} · 候选城市`;
    } else {
      detail.textContent = region.nameEn || "公开地图城市";
    }
    wrapper.append(name, detail);
    return wrapper;
  }

  function clearCityMarkers() {
    if (!state.map) {
      state.cityMarkers = [];
      return;
    }

    state.cityMarkers.forEach((marker) => marker.remove());
    state.cityMarkers = [];
  }

  function renderCityMarkers() {
    if (!state.map) {
      return;
    }

    clearCityMarkers();
    state.regions.forEach((region) => {
      if (
        !region.center ||
        !Number.isFinite(region.center.lat) ||
        !Number.isFinite(region.center.lng)
      ) {
        return;
      }

      const isCurrent = region.id === state.currentRegion?.id;
      const isCandidate = region.id === state.candidateRegion?.id;
      const isSameCandidate = isCurrent && isCandidate;
      const marker = window.L.circleMarker(
        [region.center.lat, region.center.lng],
        {
          radius: isCurrent || isCandidate ? 9 : 6,
          color: "#fffdf5",
          weight: isCandidate ? 3 : 2,
          fillColor: isSameCandidate
            ? "#d95432"
            : isCurrent
              ? "#d95432"
              : isCandidate
                ? "#f2b544"
                : "#245c46",
          fillOpacity: 0.96,
          pane: "cityMarkers",
          className: [
            "city-marker",
            isCurrent ? "city-marker-current" : "",
            isCandidate ? "city-marker-candidate" : "",
          ]
            .filter(Boolean)
            .join(" "),
        },
      );
      marker.bindTooltip(region.name, {
        direction: "top",
        offset: [0, -5],
      });
      marker.bindPopup(createCityPopupContent(region));
      marker.on("click", () => openCandidate(region.id));
      marker.addTo(state.map);
      state.cityMarkers.push(marker);
    });
  }

  function createPopupContent(place) {
    const wrapper = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");

    wrapper.dataset.placeId = place.id;
    name.className = "popup-name";
    name.textContent = place.name;
    detail.className = "popup-detail";
    detail.textContent = place.detail;
    wrapper.append(name, detail);

    if (place.food?.image) {
      const media = document.createElement("figure");
      const frame = document.createElement("div");
      const image = document.createElement("img");
      const fallback = document.createElement("span");
      const caption = document.createElement("figcaption");

      media.className = "popup-food";
      frame.className = "popup-food-frame";
      image.className = "popup-food-image";
      image.src = place.food.image;
      image.alt = place.food.alt;
      image.decoding = "async";
      fallback.className = "popup-food-fallback";
      fallback.textContent = "美食图片暂不可用";
      fallback.hidden = true;
      caption.className = "popup-food-caption";
      caption.textContent = `${place.food.dish} · 示例图片 · ${place.food.credit}`;
      image.addEventListener("error", () => {
        image.hidden = true;
        fallback.hidden = false;
      });
      frame.append(image, fallback);
      media.append(frame, caption);
      wrapper.append(media);
    }

    return wrapper;
  }

  function renderMarkers() {
    if (!state.map) {
      return;
    }

    const validPlaces = state.places
      .map((place) => ({
        place,
        position: markerPosition(place, state.currentRegion),
      }))
      .filter((entry) => entry.position);

    validPlaces.forEach(({ place, position }, index) => {
      const icon = window.L.divIcon({
        className: "place-marker-icon",
        html: `<div class="lunch-marker"><span>${index + 1}</span></div>`,
        iconSize: [26, 26],
        iconAnchor: [13, 26],
        popupAnchor: [0, -24],
      });
      const marker = window.L.marker(position, {
        icon,
        title: place.name,
        alt: place.name,
        keyboard: true,
      });
      marker.bindPopup(createPopupContent(place));
      marker.addTo(state.map);
      state.markers.set(place.id, marker);
    });
  }

  function focusMap(region, places = []) {
    if (!state.map) {
      return;
    }

    const points = places
      .map((place) => markerPosition(place, region))
      .filter(Boolean);

    if (points.length > 1) {
      state.map.fitBounds(points, {
        padding: [42, 42],
        maxZoom: 12,
        animate: false,
      });
    } else {
      state.map.setView(
        regionCenter(region, places),
        points.length ? 12 : 8,
        { animate: false },
      );
    }

    state.map.invalidateSize({ pan: false });
  }

  function renderSearchResults() {
    if (!state.regions.length) {
      return;
    }

    let matches;
    try {
      matches = matchingRegions(citySearch.value);
    } catch (error) {
      searchResults.replaceChildren();
      searchResults.hidden = true;
      searchStatus.hidden = false;
      setStatus(
        searchStatus,
        "城市搜索暂不可用，当前城市、地点和抽签不受影响。",
        "error",
      );
      return;
    }

    searchResults.replaceChildren();
    if (!matches.length) {
      searchResults.hidden = true;
      searchStatus.hidden = false;
      setStatus(searchStatus, "没有匹配的城市。");
      return;
    }

    searchStatus.hidden = false;
    setStatus(searchStatus, `${matches.length} 座城市`);
    matches.forEach((region) => {
      const isCurrent = region.id === state.currentRegion?.id;
      const isCandidate = region.id === state.candidateRegion?.id;
      const item = document.createElement("li");
      const button = document.createElement("button");
      const copy = document.createElement("span");
      const name = document.createElement("span");
      const nameEn = document.createElement("span");
      const role = document.createElement("span");

      item.className = "search-result-item";
      button.className = "search-result-button";
      if (isCandidate) {
        button.classList.add("is-candidate");
      }
      button.type = "button";
      button.dataset.cityId = region.id;
      button.dataset.current = String(isCurrent);
      copy.className = "search-result-copy";
      name.className = "search-city-name";
      name.textContent = region.name;
      nameEn.className = "search-city-en";
      nameEn.textContent = region.nameEn || "";
      role.className = "search-city-role";
      role.textContent = isCandidate
        ? "候选城市"
        : isCurrent
          ? "当前城市"
          : "预览";
      copy.append(name, nameEn);
      button.append(copy, role);
      button.addEventListener("click", () => openCandidate(region.id));
      item.append(button);
      searchResults.append(item);
    });
    searchResults.hidden = false;
  }

  function updateCandidatePreview() {
    const candidate = state.candidateRegion;
    candidatePreview.hidden = !candidate;
    if (!candidate) {
      delete candidatePreview.dataset.candidateId;
      return;
    }

    candidatePreview.dataset.candidateId = candidate.id;
    currentCityLabel.textContent = state.currentRegion?.name || "--";
    candidateCityLabel.textContent = candidate.name;
  }

  function openCandidate(regionId) {
    const region = state.regions.find((candidate) => candidate.id === regionId);
    if (!region) {
      return;
    }

    state.candidateRegion = region;
    state.worldViewActive = false;
    updateCandidatePreview();
    renderCityMarkers();
    updateMapModeControls();
    if (searchResults.hidden === false || citySearch.value) {
      renderSearchResults();
    }

    if (state.map) {
      if (state.currentRegion && state.currentRegion.id !== region.id) {
        state.map.fitBounds(
          [
            regionCenter(state.currentRegion),
            regionCenter(region),
          ],
          {
            padding: [48, 48],
            maxZoom: 6,
            animate: false,
          },
        );
      } else {
        state.map.setView(regionCenter(region), 8, { animate: false });
      }
      requestAnimationFrame(() => {
        state.map.invalidateSize({ pan: false });
      });
    }
    mapCaption.textContent = `候选预览：${region.name} · 当前抽签城市：${
      state.currentRegion?.name || "--"
    }`;
  }

  function closeCandidate(restoreCurrentView = true) {
    if (!state.candidateRegion) {
      return;
    }

    state.candidateRegion = null;
    updateCandidatePreview();
    renderCityMarkers();
    if (searchResults.hidden === false || citySearch.value) {
      renderSearchResults();
    }

    if (restoreCurrentView && state.currentRegion) {
      state.worldViewActive = false;
      focusMap(state.currentRegion, state.places);
      setMapCaptionForCurrentCity();
    }
    updateMapModeControls();
  }

  function confirmCandidate() {
    const candidate = state.candidateRegion;
    if (!candidate) {
      return;
    }

    if (candidate.id === state.currentRegion?.id) {
      closeCandidate();
      return;
    }

    state.candidateRegion = null;
    updateCandidatePreview();
    selectCity(candidate.id);
  }

  function updateMapModeControls() {
    worldViewButton.setAttribute(
      "aria-pressed",
      String(state.worldViewActive),
    );
    worldViewButton.disabled = !state.regions.length;
    returnCityButton.disabled = !state.currentRegion;
    returnCityButton.classList.toggle(
      "map-view-button-active",
      !state.worldViewActive,
    );
  }

  function setMapCaptionForCurrentCity() {
    if (!state.currentRegion) {
      mapCaption.textContent = "等待城市数据";
      return;
    }

    if (state.placesError) {
      mapCaption.textContent = `${state.currentRegion.name} · 地点不可用`;
    } else if (state.places.length) {
      mapCaption.textContent = `${state.currentRegion.name} · ${state.places.length} 个地点`;
    } else {
      mapCaption.textContent = `${state.currentRegion.name} · 地点加载中`;
    }
  }

  function showWorldView() {
    if (!state.map || !state.regions.length) {
      return;
    }

    if (state.candidateRegion) {
      closeCandidate(false);
    }

    const points = state.regions
      .filter(
        (region) =>
          region.center &&
          Number.isFinite(region.center.lat) &&
          Number.isFinite(region.center.lng),
      )
      .map((region) => [region.center.lat, region.center.lng]);

    state.worldViewActive = true;
    if (points.length > 1) {
      state.map.fitBounds(points, {
        padding: [32, 32],
        maxZoom: 3,
        animate: false,
      });
    } else {
      state.map.setView([30, 15], 2, { animate: false });
    }
    updateMapModeControls();
    mapCaption.textContent = `世界视图 · 抽签城市：${
      state.currentRegion?.name || "未选择"
    }`;
  }

  function returnToCurrentCity() {
    if (!state.map || !state.currentRegion) {
      return;
    }

    if (state.candidateRegion) {
      closeCandidate();
      return;
    }

    state.worldViewActive = false;
    focusMap(state.currentRegion, state.places);
    updateMapModeControls();
    setMapCaptionForCurrentCity();
  }

  function renderResult(name, meta, place = null) {
    resultName.textContent = name;
    resultMeta.textContent = meta;

    if (place) {
      resultCard.dataset.placeId = place.id;
    } else {
      delete resultCard.dataset.placeId;
    }

    if (!place?.food?.image) {
      resultMedia.hidden = true;
      resultImage.hidden = false;
      resultImageFallback.hidden = true;
      resultImage.removeAttribute("src");
      resultImage.alt = "";
      resultImageCredit.textContent = "";
      delete resultCard.dataset.foodImage;
      return;
    }

    resultCard.dataset.foodImage = place.food.image;
    resultMedia.hidden = false;
    resultImage.hidden = false;
    resultImageFallback.hidden = true;
    resultImage.src = place.food.image;
    resultImage.alt = place.food.alt;
    resultImageCredit.textContent = place.food.credit;
  }

  function clearPlacesList(message) {
    placesList.replaceChildren();
    if (message) {
      const item = document.createElement("li");
      item.className = "empty-state";
      item.textContent = message;
      placesList.append(item);
    }
  }

  function openPlace(place) {
    const marker = state.markers.get(place.id);
    if (marker && state.map) {
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 13), {
        animate: false,
      });
      marker.openPopup();
    }
  }

  function renderPlaces() {
    placesList.replaceChildren();
    placeCount.textContent = `${state.places.length} 处`;

    if (!state.places.length) {
      clearPlacesList("这座城市暂时没有可展示的公开地点。");
      return;
    }

    state.places.forEach((place, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const number = document.createElement("span");
      const copy = document.createElement("span");
      const name = document.createElement("span");
      const detail = document.createElement("span");

      item.className = "place-item";
      button.className = "place-button";
      button.type = "button";
      button.dataset.placeId = place.id;
      number.className = "place-index";
      number.textContent = String(index + 1).padStart(2, "0");
      name.className = "place-name";
      name.textContent = place.name;
      detail.className = "place-detail";
      detail.textContent = place.detail;
      copy.append(name, detail);
      button.append(number, copy);
      button.addEventListener("click", () => openPlace(place));
      item.append(button);
      placesList.append(item);
    });
  }

  async function selectCity(regionId) {
    const region = state.regions.find((candidate) => candidate.id === regionId);
    if (!region) {
      return;
    }

    const requestId = ++state.cityRequestId;
    state.spinRequestId += 1;
    spinButton.disabled = false;
    spinButton.removeAttribute("aria-busy");
    state.currentRegion = region;
    if (state.candidateRegion) {
      state.candidateRegion = null;
      updateCandidatePreview();
    }
    state.places = [];
    state.placesError = "";
    state.worldViewActive = false;
    citySelect.value = region.id;
    clearPlaceMarkers();
    renderCityMarkers();
    if (searchResults.hidden === false || citySearch.value) {
      renderSearchResults();
    }
    updateMapModeControls();
    renderPlaces();
    clearPlacesList("正在加载公开地点...");
    placeCount.textContent = "-- 处";
    setStatus(placeStatus, "正在加载公开地点。");
    setStatus(globalStatus, `正在查看 ${region.name}。`);
    renderResult("先抽一个地点", `当前城市：${region.name}`);
    mapCaption.textContent = `${region.name} · 地点加载中`;
    focusMap(region);
    updateMapFallback();

    try {
      const payload = await fetchJson(
        `/api/regions/${encodeURIComponent(region.id)}/places`,
      );

      if (requestId !== state.cityRequestId) {
        return;
      }

      state.places = placeListFrom(payload);
      state.placesError = "";
      renderPlaces();
      renderMarkers();
      if (!state.worldViewActive && !state.candidateRegion) {
        focusMap(region, state.places);
      }

      if (state.places.length) {
        setStatus(
          placeStatus,
          `已加载 ${state.places.length} 个公开地点，点击可在图上查看。`,
        );
        setStatus(globalStatus, `可以开始抽 ${region.name} 的午饭了。`);
      } else {
        setStatus(placeStatus, "这座城市暂时没有可展示的地点。");
        setStatus(globalStatus, "地点清单为空，仍可尝试随机抽签。");
      }

      if (!state.worldViewActive && !state.candidateRegion) {
        setMapCaptionForCurrentCity();
      }
    } catch (error) {
      if (requestId !== state.cityRequestId) {
        return;
      }

      state.places = [];
      state.placesError = "地点暂时不可用";
      clearPlaceMarkers();
      clearPlacesList("暂无地点，可换城市或直接抽签。");
      placeCount.textContent = "0 处";
      renderResult("地点暂时不可用", `仍可抽签，当前城市：${region.name}`);
      setStatus(
        placeStatus,
        "地点加载失败。地区切换和随机抽签仍然可用。",
        "error",
      );
      setStatus(globalStatus, "地点清单暂时不可用，抽签入口保持开放。", "error");
      if (!state.worldViewActive && !state.candidateRegion) {
        setMapCaptionForCurrentCity();
        focusMap(region);
      }
      updateMapFallback();
    }
  }

  async function spin() {
    if (!state.currentRegion || spinButton.disabled) {
      return;
    }

    const spinningRegion = state.currentRegion;
    const regionId = spinningRegion.id;
    const requestId = ++state.spinRequestId;
    spinButton.disabled = true;
    spinButton.setAttribute("aria-busy", "true");
    setStatus(globalStatus, `正在从 ${spinningRegion.name} 里抽一个地点。`);

    try {
      const payload = await fetchJson("/api/spin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ regionId }),
      });

      if (
        requestId !== state.spinRequestId ||
        state.currentRegion?.id !== regionId
      ) {
        return;
      }

      const data = unwrap(payload);
      const rawPlace = data && data.place ? data.place : data;
      const place = normalizePlace(rawPlace, 0);

      if (!place.name || place.name === "未命名地点") {
        throw new Error("Spin response did not include a place");
      }

      const foodMeta = place.food
        ? `试试${place.food.dish} · ${place.detail}`
        : place.detail;
      renderResult(place.name, `${spinningRegion.name} · ${foodMeta}`, place);
      setStatus(
        globalStatus,
        place.food
          ? `这顿去 ${place.name}，试试${place.food.dish}。图片为示例，不代表实际门店。`
          : `这顿去 ${place.name}。`,
      );
      openPlace(place);
    } catch (error) {
      if (
        requestId !== state.spinRequestId ||
        state.currentRegion?.id !== regionId
      ) {
        return;
      }

      renderResult("这次没抽出来", "稍后再试，地点清单仍然可以浏览。");
      setStatus(globalStatus, "抽签服务暂时不可用，请稍后重试。", "error");
    } finally {
      if (requestId === state.spinRequestId) {
        spinButton.disabled = false;
        spinButton.removeAttribute("aria-busy");
      }
    }
  }

  function populateCities(regions) {
    citySelect.replaceChildren();
    regions.forEach((region) => {
      const option = document.createElement("option");
      option.value = region.id;
      option.textContent = region.name;
      citySelect.append(option);
    });
    cityCount.textContent = `${regions.length} 城`;
    citySelect.disabled = false;
    citySearch.disabled = false;
    spinButton.disabled = false;
    updateMapModeControls();
  }

  async function init() {
    initializeMap();
    citySelect.addEventListener("change", () => selectCity(citySelect.value));
    citySearch.addEventListener("focus", renderSearchResults);
    citySearch.addEventListener("input", renderSearchResults);
    spinButton.addEventListener("click", spin);
    worldViewButton.addEventListener("click", showWorldView);
    returnCityButton.addEventListener("click", returnToCurrentCity);
    confirmCityButton.addEventListener("click", confirmCandidate);
    cancelCityButton.addEventListener("click", () => closeCandidate());
    closeCandidateButton.addEventListener("click", () => closeCandidate());
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && state.candidateRegion) {
        event.preventDefault();
        closeCandidate();
        return;
      }
      if (
        event.code !== "Space" ||
        event.repeat ||
        ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A"].includes(
          document.activeElement?.tagName,
        )
      ) {
        return;
      }
      event.preventDefault();
      spin();
    });
    resultImage.addEventListener("error", () => {
      resultImage.hidden = true;
      resultImageFallback.hidden = false;
    });

    try {
      const payload = await fetchJson("/api/regions");
      const data = unwrap(payload);
      state.regions = regionListFrom(payload);

      if (!state.regions.length) {
        throw new Error("No regions returned");
      }

      if (data && data.version) {
        appVersion.textContent = `v${data.version} · 公开地点示例`;
      }

      populateCities(state.regions);
      setStatus(globalStatus, `已加载 ${state.regions.length} 座城市。`);
      await selectCity(state.regions[0].id);
    } catch (error) {
      citySelect.disabled = true;
      spinButton.disabled = true;
      cityCount.textContent = "0 城";
      setStatus(globalStatus, "城市数据暂时不可用，请稍后刷新。", "error");
      setStatus(placeStatus, "无法读取城市，地点清单暂不可用。", "error");
      clearPlacesList("城市数据加载失败，请稍后刷新。");
      mapCaption.textContent = "城市数据不可用";
      state.placesError = "城市数据暂时不可用";
      updateMapFallback();
    }
  }

  init();
})();
