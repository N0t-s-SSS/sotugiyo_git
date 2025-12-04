// /public/assets/js/pages/map.js
document.addEventListener("DOMContentLoaded", () => {

  const socket = io();

  // ==========================
  //  基本設定
  // ==========================
  const STYLE_URL = "https://tile.openstreetmap.jp/styles/osm-bright-ja/style.json";
  const JP_BOUNDS = [[121.5, 19.5], [153.5, 47.5]];

  let map;
  try {
    map = new maplibregl.Map({
      container: "map",
      style: STYLE_URL,
      center: [138.25, 36.2],
      zoom: 5,
      maxZoom: 22,
      maxBounds: JP_BOUNDS,
      dragRotate: false,
      pitchWithRotate: false,
    });

    console.log("C. map 객체 생성자(new) 실행 완료.");
  } catch (err) {
    console.error("💥 맵 객체 생성(new) 중 즉시 에러 발생:", err);
    return;
  }

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-left");

  // ==========================
  //  状態（State）
  // ==========================
  // マーカーとポップアップは1つだけ
  let activeMarker = null;
  let activePopup = null;
  // プログラムから閉じるときに true にしておくフラグ
  let isProgrammaticClose = false;

  // ==========================
  //  DOM 取得
  // ==========================
  const sidePanel = document.getElementById("sidePanel");
  const menuBtn = document.getElementById("menuBtn");
  const sideCloseBtn = document.getElementById("sideCloseBtn");

  const viewSearch = document.getElementById("view-search");
  const viewList = document.getElementById("view-list");
  const viewList2 = document.getElementById("view-list2");
  const viewChat = document.getElementById("view-chat");

  const searchInput = document.getElementById("searchInput");
  const searchBtn = document.getElementById("searchBtn");
  const searchResultList = document.getElementById("searchResultList");

  const roomListEl = document.getElementById("roomList");
  const roomListE2 = document.getElementById("roomList2");
  const chatRoomName = document.getElementById("chatRoomName");
  const chatBody = document.getElementById("chatBody");
  const chatForm = document.getElementById("chatForm");
  const chatInput = document.getElementById("chatInput");
  const chatBackBtn = document.getElementById("chatBackBtn");

  let currentRoomId = null;

  const modal = document.getElementById("roomModal");
  const backdrop = document.getElementById("modalBackdrop");
  const closeModalBtn = document.getElementById("closeModal");
  const cancelBtn = document.getElementById("cancelBtn");
  const roomForm = document.getElementById("roomForm");
  const roomPublic = document.getElementById("roomPublic");
  const pwRow = document.getElementById("pwRow");
  const roomPassword = document.getElementById("roomPassword");
  const roomLng = document.getElementById("roomLng");
  const roomLat = document.getElementById("roomLat");

  // ▼ ヘッダー関連
  const locationSearchInput = document.getElementById("locationSearchInput");
  const locationSearchBtn = document.getElementById("locationSearchBtn");
  const goMyPageBtn = document.getElementById("goMyPage");

  // ==========================
  //  ユーティリティ（地図マスク）
  // ==========================
  function ringArea(ring) {
    let s = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      s += (x2 - x1) * (y2 + y1);
    }
    return s;
  }
  const asCCW = (ring) => (ringArea(ring) < 0 ? ring : ring.slice().reverse());
  const asCW = (ring) => (ringArea(ring) > 0 ? ring : ring.slice().reverse());

  function extractJapanRings(geoCollection) {
    const rings = [];
    (geoCollection.geometries || []).forEach((g) => {
      if (g.type === "Polygon" && g.coordinates?.[0]) rings.push(g.coordinates[0]);
      if (g.type === "MultiPolygon") (g.coordinates || []).forEach((p) => p[0] && rings.push(p[0]));
    });
    return rings;
  }

  function buildInverseJapanMask(rings) {
    // 世界全体を外枠にして、日本を穴にするポリゴンを返す
    const world = asCCW([
      [-180, -90],
      [180, -90],
      [180, 90],
      [-180, 90],
      [-180, -90],
    ]);
    const holes = rings.map(asCW);
    return {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [world, ...holes],
          },
        },
      ],
    };
  }

  // ==========================
  //  モーダル（部屋作成）
  // ==========================
  function openRoomModal(lng, lat) {
    roomLng.value = lng.toFixed(6);
    roomLat.value = lat.toFixed(6);
    modal.classList.add("active");
    backdrop.classList.add("active");
    document.getElementById("roomName").focus();
  }

  function closeRoomModal() {
    modal.classList.remove("active");
    backdrop.classList.remove("active");
    roomForm.reset();
    pwRow.style.display = "none";
    roomPassword.value = "";
  }

  roomPublic.addEventListener("change", () => {
    const isPublic = roomPublic.checked;
    pwRow.style.display = isPublic ? "none" : "grid";
    if (isPublic) roomPassword.value = "";
  });

  roomForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const payload = {
      name: document.getElementById("roomName").value.trim(),
      description: document.getElementById("roomDesc").value.trim(),
      isPublic: roomPublic.checked,
      password: roomPublic.checked ? "" : roomPassword.value,
      lng: parseFloat(roomLng.value),
      lat: parseFloat(roomLat.value),
    };

    if (!payload.name) {
      alert("ルーム名を入力してください。");
      return;
    }
    if (!payload.isPublic && !payload.password) {
      alert("非公開の場合、パスワードを入力してください。");
      return;
    }

    try {
      const response = await fetch('/api/create-room', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        alert("ルームが作成されました！");
        const newRoom = await response.json();
        const newRoomId = newRoom.roomid;
        closeRoomModal();
        if (!newRoomId) {
          alert("ルーム作成は成功しましたが、IDを受け取れませんでした。");
          return;
        }
        alert("ルームが作成されました！チャットルームに移動します。");
        window.location.href = `/chat/${newRoomId}`;
      } else {
        const errorText = await response.text();
        alert(`ルーム作成失敗: ${errorText}`);
      }
    } catch (error) {
      console.error("ルーム作成APIエラー:", error);
      alert("ルーム作成中にネットワークエラーが発生しました。");
    }
  });

  [closeModalBtn, cancelBtn, backdrop].forEach((el) => el.addEventListener("click", closeRoomModal));

  // ==========================
  //  サイドパネル
  // ==========================
  function openSidePanel() {
    sidePanel.classList.add("open");
  }
  function closeSidePanel() {
    sidePanel.classList.remove("open");
    sidePanel.classList.remove("chat-mode");
  }

  function showPanelView(name) {
    // 全部消す
    viewSearch.style.display = "none";
    viewList.style.display = "none";
    viewList2.style.display = "none";
    viewChat.style.display = "none";

    if (name === "search") viewSearch.style.display = "block";
    if (name === "list") viewList.style.display = "block";
    if (name === "list2") viewList2.style.display = "block";
    if (name === "chat") viewChat.style.display = "flex";
  }

  if (menuBtn) {
    menuBtn.addEventListener("click", () => {
      if (sidePanel.classList.contains("open")) {
        closeSidePanel();
      } else {
        openSidePanel();
        showPanelView("list");
      }
    });
  }

  sideCloseBtn.addEventListener("click", closeSidePanel);

  document.querySelectorAll(".side-item").forEach((btn) => {
    btn.addEventListener("click", () => {
      const view = btn.dataset.view;
      showPanelView(view);
      if (view !== "chat") sidePanel.classList.remove("chat-mode");
    });
  });

  // ==========================
  //  ルーム一覧・チャット
  // ==========================
  function renderRoomList(rooms) {
    roomListEl.innerHTML = "";
    if (!rooms || rooms.length === 0) {
      roomListEl.innerHTML = '<li class="muted">まだルームがありません。</li>';
      return;
    }
    rooms.forEach((room) => {
      const li = document.createElement("li");
      li.className = "room-item";
      li.innerHTML = `
        <div class="room-item-title">${room.name}</div>
        <div class="room-item-desc">${room.desc || ""}</div>
      `;
      li.addEventListener("click", () => {
        currentRoomId = room.roomid;
        chatRoomName.textContent = room.name;
        chatBody.innerHTML = `<div class="chat-msg chat-msg-other">${room.name} へようこそ！</div>`;

        showPanelView("chat");
        sidePanel.classList.add("chat-mode");

        window.location.href = `/chat/${currentRoomId}`;
      });
      roomListEl.appendChild(li);
    });
  }

  async function fetchAndRenderRooms() {
    try {
      const response = await fetch('/api/get-rooms');
      if (!response.ok) {
        if(response.status === 401) {
          alert("セッションが切れました。ログインしてください。");
          window.location.href = '/pages/login.html';
        }
        throw new Error("ルームリストの取得に失敗");
      }
      const rooms = await response.json();
      renderRoomList(rooms);

      // URLが /chat/:id の場合、自動で該当ルームを開く
      const path = window.location.pathname;
      const chatUrlMatch = path.match(/^\/chat\/([^/]+)/);

      if (chatUrlMatch) {
        const roomIdFromUrl = chatUrlMatch[1];
        const roomToOpen = rooms.find(r => r.roomid === roomIdFromUrl);

        if (roomToOpen) {
          currentRoomId = roomToOpen.roomid;
          chatRoomName.textContent = roomToOpen.name;
          chatBody.innerHTML = `<div class="chat-msg chat-msg-other">${roomToOpen.name} へようこそ！</div>`;

          openSidePanel();
          showPanelView("chat");
          sidePanel.classList.add("chat-mode");

          socket.emit('join room', currentRoomId);
          socket.emit('request history', currentRoomId);
        } else {
          console.warn("URLのルームIDが見つかりません:", roomIdFromUrl);
        }
      }

    } catch (error) {
      console.error("ルームリストの取得エラー:", error);
      roomListEl.innerHTML = '<li class="muted">ルームの読み込みに失敗しました。</li>';
    }
  }

  chatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text || !currentRoomId) return;
    chatInput.value = "";
  });

  chatBackBtn.addEventListener("click", () => {
    showPanelView("list");
    sidePanel.classList.remove("chat-mode");
    currentRoomId = null;
  });

  socket.on('chat message', (msg) => {
    const div = document.createElement("div");
    div.className = "chat-msg chat-msg-other";
    div.textContent = `${msg.sender}: ${msg.message}`;
    chatBody.appendChild(div);
    chatBody.scrollTop = chatBody.scrollHeight;
  });

  socket.on('chat history', (messages) => {
    chatBody.innerHTML = '';
    messages.forEach(msg => {
      const div = document.createElement("div");
      div.className = "chat-msg chat-msg-other";
      div.textContent = `${msg.sender}: ${msg.message}`;
      chatBody.appendChild(div);
    });
    chatBody.scrollTop = chatBody.scrollHeight;
  });

  // サーバーからルーム更新通知を受信
  socket.on('rooms updated', () => {
    console.log("ルームリストが更新されました。再読み込みします...");
    fetchAndRenderRooms();
  });

  // ==========================
  //  룸 검색 기능
  // ==========================
  if (searchBtn) {
    searchBtn.addEventListener("click", async () => {
      const keyword = searchInput.value.trim();
      if (!keyword) {
        alert("検索キーワードを入力してください。");
        return;
      }

      searchResultList.innerHTML = '<li class="muted">検索中...</li>';

      try {
        const response = await fetch(`/api/search-rooms?q=${encodeURIComponent(keyword)}`);
        if (!response.ok) {
          throw new Error("検索失敗");
        }
        const rooms = await response.json();
        renderSearchResults(rooms);
      } catch (err) {
        console.error(err);
        searchResultList.innerHTML = '<li class="muted">検索エラーが発生しました。</li>';
      }
    });
  }

  function renderSearchResults(rooms) {
    searchResultList.innerHTML = "";
    if (!rooms || rooms.length === 0) {
      searchResultList.innerHTML = '<li class="muted">該当するルームが見つかりません。</li>';
      return;
    }

    rooms.forEach(room => {
      const li = document.createElement("li");
      li.className = "room-item";
      li.innerHTML = `
        <div class="room-item-title">${room.name}</div>
        <div class="room-item-desc">${room.description || ""}</div>
      `;
      li.addEventListener("click", () => {
        window.location.href = `/chat/${room.roomid}`;
      });
      searchResultList.appendChild(li);
    });
  }

  // ルーム履歴
  async function renderHistoryResults() {
    try {
      const response = await fetch(`/api/get-historyrooms`);
      if (!response.ok) {
        throw new Error("fail to fetch");
      }
      const rooms = await response.json();
      rooms.forEach(room => {
        const li = document.createElement("li");
        li.className = "room-item";
        li.innerHTML = `
          <div class="room-item-title">${room.roomName}</div>
          <div class="room-item-desc">${room.desc || ""}</div>
        `;
        li.addEventListener("click", () => {
          window.location.href = `/chat/${room.roomId}`;
        });
        roomListE2.appendChild(li);
      });
    } catch (err) {
      console.error(err);
      roomListE2.innerHTML = '<li class="muted">検索エラーが発生しました。</li>';
    }
  }

  renderHistoryResults();
  fetchAndRenderRooms();

  // ==========================
  //  地図ロード後の処理
  // ==========================
  map.on("load", async () => {
    console.log("1. 'load' 이벤트 시작됨.");

    const res = await fetch("/japan3.geojson");
    if (!res.ok) {
      alert("japan3.geojson が見つかりません（map.html と同じフォルダに置いてください）");
      return;
    }
    const geo = await res.json();

    console.log("2. 'load' 성공.");

    const jpRings = extractJapanRings(geo);
    if (!jpRings.length) {
      alert("japan3.geojson にポリゴンが見つかりません");
      return;
    }

    console.log("3. 폴리건로드.");

    // マスク表示
    const maskFC = buildInverseJapanMask(jpRings);
    map.addSource("jp-mask", { type: "geojson", data: maskFC });
    map.addLayer({
      id: "jp-mask",
      type: "fill",
      source: "jp-mask",
      paint: { "fill-color": "#BFD9F2", "fill-opacity": 1 },
    });

    // ラベルを日本の中だけに
    const japanGeom = { type: "MultiPolygon", coordinates: jpRings.map((r) => [asCW(r)]) };
    (map.getStyle().layers || [])
      .filter((l) => l.type === "symbol")
      .forEach((l) => {
        const base = l.filter || true;
        map.setFilter(l.id, ["all", base, ["within", japanGeom]]);
      });

    console.log("4 로드중.");

    // クリックでピンを「移動」させる（常に1個）
    map.on("click", (e) => {
      console.log("성공!!!!!!!!!!!!!!");
      const { lng, lat } = e.lngLat;
      const roundedLng = lng.toFixed(5);
      const roundedLat = lat.toFixed(5);
      const btnId = "createRoomBtn-" + Date.now();

      // マーカーがあれば動かす、なければ作る
      if (activeMarker) {
        activeMarker.setLngLat([lng, lat]);
        // 前のポップアップは安全に消す
        safeCloseActivePopup();
      } else {
        const el = document.createElement("div");
        el.className = "marker";
        activeMarker = new maplibregl.Marker(el).setLngLat([lng, lat]).addTo(map);
      }

      // 新しいポップアップを付ける
      activePopup = new maplibregl.Popup({
        offset: 18,
        closeButton: true,
        closeOnClick: false,
      })
        .setLngLat([lng, lat])
        .setHTML(`
          <div style="min-width:200px">
            <div style="font-weight:700; margin-bottom:6px;">この地点で</div>
            <a href="#" class="popup-create-btn" id="${btnId}">チャットルームを作成</a>
            <div class="muted" style="margin-top:6px">${roundedLng}, ${roundedLat}</div>
          </div>
        `)
        .addTo(map);

      // ユーザーが✕を押したらマーカーも消す
      bindPopupCloseToMarker(activePopup);

      // ポップアップ内ボタンでモーダルを出す
      setTimeout(() => {
        const btn = document.getElementById(btnId);
        if (btn) {
          btn.addEventListener("click", (ev) => {
            ev.preventDefault();
            openRoomModal(lng, lat);
          });
        }
      }, 0);
    });

    // 視野を日本にフィット
    let minX = 180,
        minY = 90,
        maxX = -180,
        maxY = -90;
    jpRings.forEach((r) =>
      r.forEach(([x, y]) => {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      })
    );
    map.fitBounds(
      [
        [minX, minY],
        [maxX, maxY],
      ],
      { padding: 20 }
    );
  });

  // ==========================
  //  ポップアップ＆マーカー関連
  // ==========================
  // 前のポップアップを安全に閉じる
  function safeCloseActivePopup() {
    if (!activePopup) return;
    isProgrammaticClose = true;
    activePopup.remove();
    isProgrammaticClose = false;
    activePopup = null;
  }

  // ユーザーが✕した時だけマーカーも消す
  function bindPopupCloseToMarker(popup) {
    popup.on("close", () => {
      if (isProgrammaticClose) return;
      if (activeMarker) {
        activeMarker.remove();
        activeMarker = null;
      }
      activePopup = null;
    });
  }

  // ==========================
  //  ヘッダー：マイページ移動 & 場所検索
  // ==========================
  if (goMyPageBtn) {
    goMyPageBtn.addEventListener("click", () => {
      window.location.href = "/pages/mypage.html"; // パスはプロジェクトに合わせて変更可
    });
  }

  async function handleLocationSearch() {
    const keyword = locationSearchInput?.value.trim();
    if (!keyword) {
      alert("検索ワードを入力してください");
      return;
    }

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(keyword)}&country=Japan`
      );
      const data = await res.json();

      if (!data || data.length === 0) {
        alert("該当する場所が見つかりませんでした。");
        return;
      }

      const { lon, lat } = data[0];
      map.flyTo({
        center: [parseFloat(lon), parseFloat(lat)],
        zoom: 12
      });

    } catch (err) {
      console.error(err);
      alert("検索エラーが発生しました。");
    }
  }

  if (locationSearchBtn) {
    locationSearchBtn.addEventListener("click", handleLocationSearch);
  }

  if (locationSearchInput) {
    locationSearchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLocationSearch();
      }
    });
  }
});
