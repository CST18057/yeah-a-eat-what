(() => {
  "use strict";

  const citySelect = document.querySelector("#city-select");
  const cityCount = document.querySelector("#city-count");
  const spinButton = document.querySelector("#spin-button");
  const resultName = document.querySelector("#result-name");
  const resultMeta = document.querySelector("#result-meta");
  const globalStatus = document.querySelector("#global-status");
  const mapCaption = document.querySelector("#map-caption");
  const mapFallback = document.querySelector("#map-fallback");
  const mapFallbackDetail = document.querySelector("#map-fallback-detail");
  const placeCount = document.querySelector("#place-count");
  const placeStatus = document.querySelector("#place-status");
  const placesList = document.querySelector("#places-list");
  const appVersion = document.querySelector("#app-version");

  const state = {
    regions: [],
    currentRegion: null,
    places: [],
    markers: new Map(),
    map: null,
    tileLayer: null,
    cityRequestId: 0,
    spinRequestId: 0,
    placesError: "",
    mapUnavailable: "",
    tileUnavailable: false,
    tileErrors: 0,
  };

  function setStatus(element, message, tone = "") {
    element.textContent = message;
    if (tone) {
      element.dataset.tone = tone;
    } else {
      delete element.dataset.tone;
    }
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
        center: [34.5, 108.9],
        zoom: 4,
        minZoom: 3,
        maxZoom: 18,
        zoomControl: true,
        attributionControl: true,
      });

      state.tileLayer = window.L.tileLayer(
        "https://webrd0{s}.is.autonavi.com/appmaptile?style=7&x={x}&y={y}&z={z}",
        {
          subdomains: ["1", "2", "3", "4"],
          maxZoom: 18,
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
      window.addEventListener("resize", () => {
        state.map.invalidateSize({ pan: false });
      });
    } catch (error) {
      state.mapUnavailable = "地图暂时无法初始化，地区切换和随机抽签仍然可用。";
      mapCaption.textContent = "地图初始化失败";
      updateMapFallback();
    }
  }

  function clearMarkers() {
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

  function createPopupContent(place) {
    const wrapper = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");

    name.className = "popup-name";
    name.textContent = place.name;
    detail.className = "popup-detail";
    detail.textContent = place.detail;
    wrapper.append(name, detail);
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
        className: "",
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
      });
    } else {
      state.map.setView(regionCenter(region, places), points.length ? 12 : 8);
    }

    state.map.invalidateSize({ pan: false });
  }

  function renderResult(name, meta) {
    resultName.textContent = name;
    resultMeta.textContent = meta;
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
      state.map.setView(marker.getLatLng(), Math.max(state.map.getZoom(), 13));
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
    state.places = [];
    state.placesError = "";
    citySelect.value = region.id;
    clearMarkers();
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
      focusMap(region, state.places);

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

      mapCaption.textContent = `${region.name} · ${state.places.length} 个地点`;
    } catch (error) {
      if (requestId !== state.cityRequestId) {
        return;
      }

      state.places = [];
      state.placesError = "地点暂时不可用";
      clearMarkers();
      clearPlacesList("地点加载失败。地区切换和随机抽签仍然可用。");
      placeCount.textContent = "0 处";
      renderResult("地点暂时不可用", `仍可抽签，当前城市：${region.name}`);
      setStatus(
        placeStatus,
        "地点加载失败。地区切换和随机抽签仍然可用。",
        "error",
      );
      setStatus(globalStatus, "地点清单暂时不可用，抽签入口保持开放。", "error");
      mapCaption.textContent = `${region.name} · 地点不可用`;
      focusMap(region);
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

      renderResult(place.name, `${spinningRegion.name} · ${place.detail}`);
      setStatus(globalStatus, `这顿就吃 ${place.name}。`);
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
    spinButton.disabled = false;
  }

  async function init() {
    initializeMap();
    citySelect.addEventListener("change", () => selectCity(citySelect.value));
    spinButton.addEventListener("click", spin);
    document.addEventListener("keydown", (event) => {
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
