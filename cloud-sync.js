// ============================================================
//  cloud-sync.js  (classic script, 必须在 app.js 之后加载)
//  作用:把 app.js 里的 state 与 Firestore 实时同步。
//   · 按"项目"分文档: 集合 takeoffs / 文档 = 项目名
//   · localStorage 仍作离线缓存(app.js 原逻辑不变)
//   · 顶部"Project"下拉切换项目;"+ New"新建项目
//   · 多设备/多人打开同一项目会实时同步(后写覆盖)
//  依赖 app.js 暴露的全局: state, save, renderAll, STORAGE_KEY,
//   PARTS_DB_VERSION, cloneSeedParts, cloneSeedAccessories, escHtml
// ============================================================
(function () {
  var PROJ_KEY = "takeoff-current-project";
  var DEFAULT_PROJECT = "Hillview";

  var fb = null;                 // window.__fb (Firestore 句柄)
  var currentProject = localStorage.getItem(PROJ_KEY) || DEFAULT_PROJECT;
  var unsub = null;              // onSnapshot 取消函数
  var pushTimer = null;          // 防抖写入计时器
  var lastSyncedJSON = null;     // 最近一次与云端一致的快照(避免回环)
  var applyingRemote = false;    // 正在应用远程数据时不要回推
  var seedIfMissing = false;     // 新建项目:云端不存在时用种子数据初始化
  var firstSnapshotDone = false; // 收到首个云端快照前,先不要把本地数据推上去(防止覆盖云端)

  // ---------- UI 状态指示 ----------
  function $(id) { return document.getElementById(id); }
  function setStatus(text, color) {
    var el = $("cloud-status");
    if (el) { el.textContent = text; el.style.color = color || "var(--af-fg-3,#888)"; }
  }

  function sanitizeId(name) {
    return String(name || "").trim().replace(/[\/\\#?]+/g, "-").slice(0, 120) || DEFAULT_PROJECT;
  }

  // 只取需要持久化的字段(与 app.js 的 save 一致)
  function stateForCloud() {
    return {
      partsDbVersion: state.partsDbVersion,
      parts: state.parts,
      openings: state.openings,
      accessories: state.accessories
    };
  }

  function freshSeed() {
    return {
      partsDbVersion: PARTS_DB_VERSION,
      parts: cloneSeedParts(),
      openings: [],
      accessories: cloneSeedAccessories()
    };
  }

  // 把云端 doc 的 state 套到本地(不触发回推)
  function applyRemoteState(s) {
    applyingRemote = true;
    try {
      state = {
        partsDbVersion: s.partsDbVersion || PARTS_DB_VERSION,
        parts: Array.isArray(s.parts) ? s.parts : cloneSeedParts(),
        openings: Array.isArray(s.openings) ? s.openings : [],
        accessories: Array.isArray(s.accessories) ? s.accessories : cloneSeedAccessories()
      };
      lastSyncedJSON = JSON.stringify(stateForCloud());
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      renderAll();
    } finally {
      applyingRemote = false;
    }
  }

  // ---------- 写入云端(防抖) ----------
  function schedulePush() {
    if (!firstSnapshotDone) return;   // 等首个云端快照确定基线后再允许推送
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 600);
  }

  function pushNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!fb) return Promise.resolve();
    var json = JSON.stringify(stateForCloud());
    if (json === lastSyncedJSON) { setStatus("● 已同步", "#1a9e4b"); return Promise.resolve(); }
    setStatus("● 保存中…", "#d59300");
    var ref = fb.doc(fb.db, "takeoffs", sanitizeId(currentProject));
    return fb.setDoc(ref, {
      state: JSON.parse(json),
      name: currentProject,
      updatedAt: fb.serverTimestamp()
    }, { merge: true }).then(function () {
      lastSyncedJSON = json;
      setStatus("● 已同步", "#1a9e4b");
    }).catch(function (e) {
      console.error("[cloud] push failed:", e);
      setStatus("● 保存失败(已存本地)", "#c62828");
    });
  }

  // ---------- 订阅当前项目 ----------
  function subscribe() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    if (!fb) return;
    firstSnapshotDone = false;        // 新订阅:重新等基线
    setStatus("● 连接中…", "#888");
    var ref = fb.doc(fb.db, "takeoffs", sanitizeId(currentProject));
    unsub = fb.onSnapshot(ref, function (snap) {
      // 本地刚写、服务器还没确认的快照 → 跳过(避免抖动)
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      firstSnapshotDone = true;        // 已拿到云端基线,之后本地编辑可推送

      if (!snap.exists()) {
        // 云端还没有这个项目
        if (seedIfMissing) {
          state = freshSeed();
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
          applyingRemote = true;
          try { renderAll(); } finally { applyingRemote = false; }
          setStatus("● 新项目 · 已建", "#1a9e4b");
        } else {
          setStatus("● 上传本地数据…", "#d59300");
        }
        seedIfMissing = false;
        lastSyncedJSON = null;
        pushNow();              // 把当前(本地或种子)写到云端
        return;
      }

      var data = snap.data() || {};
      var remote = data.state;
      if (!remote) { lastSyncedJSON = null; pushNow(); return; }

      var remoteJSON = JSON.stringify({
        partsDbVersion: remote.partsDbVersion,
        parts: remote.parts,
        openings: remote.openings,
        accessories: remote.accessories
      });
      if (remoteJSON === JSON.stringify(stateForCloud())) {
        lastSyncedJSON = remoteJSON;
        setStatus("● 已同步", "#1a9e4b");
        return;
      }
      applyRemoteState(remote);
      setStatus("● 已同步", "#1a9e4b");
    }, function (err) {
      console.error("[cloud] snapshot error:", err);
      setStatus("● 离线(仅本地)", "#c62828");
    });
  }

  // ---------- 项目列表(下拉) ----------
  function refreshProjectList() {
    var sel = $("project-select");
    if (!sel || !fb) return;
    fb.getDocs(fb.collection(fb.db, "takeoffs")).then(function (qs) {
      var ids = [];
      qs.forEach(function (d) { ids.push(d.id); });
      var cur = sanitizeId(currentProject);
      if (ids.indexOf(cur) < 0) ids.push(cur);
      ids.sort(function (a, b) { return a.localeCompare(b); });
      sel.innerHTML = ids.map(function (id) {
        return '<option value="' + escHtml(id) + '"' + (id === cur ? " selected" : "") + ">" + escHtml(id) + "</option>";
      }).join("");
    }).catch(function (e) {
      console.warn("[cloud] list projects failed:", e);
      // 列不出来也至少显示当前项目
      var cur = sanitizeId(currentProject);
      sel.innerHTML = '<option value="' + escHtml(cur) + '" selected>' + escHtml(cur) + "</option>";
    });
  }

  // ---------- 切换 / 新建项目 ----------
  function switchProject(name) {
    var id = sanitizeId(name);
    if (id === sanitizeId(currentProject)) return;
    var done = function () {
      currentProject = id;
      localStorage.setItem(PROJ_KEY, id);
      lastSyncedJSON = null;
      seedIfMissing = false;     // 切到已有项目:加载其数据
      subscribe();
      refreshProjectList();
    };
    if (pushTimer) { pushNow().then(done); } else { done(); }
  }

  function newProject() {
    var name = prompt("新项目名称(例如 Hillview-North):", "");
    if (!name) return;
    var id = sanitizeId(name);
    var done = function () {
      currentProject = id;
      localStorage.setItem(PROJ_KEY, id);
      lastSyncedJSON = null;
      seedIfMissing = true;      // 新项目:若云端不存在,用种子数据起步
      subscribe();
      refreshProjectList();
    };
    if (pushTimer) { pushNow().then(done); } else { done(); }
  }

  // ---------- 启动 ----------
  function patchSave() {
    if (typeof save !== "function" || save.__cloudPatched) return;
    var _localSave = save;
    save = function () {
      _localSave.apply(this, arguments);           // 原逻辑:写 localStorage
      if (fb && !applyingRemote) schedulePush();   // 再防抖同步到云端
    };
    save.__cloudPatched = true;
  }

  function wireUI() {
    var sel = $("project-select");
    if (sel && !sel.__wired) {
      sel.addEventListener("change", function (e) { switchProject(e.target.value); });
      sel.__wired = true;
    }
    var nb = $("project-new");
    if (nb && !nb.__wired) {
      nb.addEventListener("click", newProject);
      nb.__wired = true;
    }
  }

  function start() {
    fb = window.__fb;
    patchSave();
    wireUI();
    subscribe();
    refreshProjectList();
  }

  // DOM 先把 UI 接上(即使 Firebase 没起来,下拉也别是死的)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUI);
  } else {
    wireUI();
  }

  // 等 Firebase 就绪
  if (window.__fb) {
    start();
  } else {
    window.addEventListener("fb-ready", start, { once: true });
    window.addEventListener("fb-error", function () {
      setStatus("● 云端连接失败(仅本地可用)", "#c62828");
    }, { once: true });
  }
})();
