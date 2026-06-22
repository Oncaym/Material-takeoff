// ============================================================
//  cloud-sync.js  (classic script, 必须在 app.js 之后加载)
//  作用:把"各系统的主数据"(parts + accessories)与 Firestore 同步。
//   · 集合 systems,一个系统一个文档(doc.name = 系统名,如 IR501T / 1600 (10-1/2″))
//   · 全公司共享同一套零件库 + 配件规则,改了实时同步给所有人
//   · openings / 下料结果 不进云,只留本地 localStorage(app.js 原逻辑不变)
//   · 首次云端为空 → 用 systems.js 里的 SYSTEM_DEFS 初始化
//  依赖 app.js 全局: state, save, renderAll, STORAGE_KEY, uid
//  依赖 systems.js 全局: window.SYSTEM_DEFS, window.SYSTEM_ORDER
// ============================================================
(function () {
  var fb = null;
  var unsub = null;
  var pushTimer = null;
  var lastSyncedSystemsJSON = null;  // 最近一次与云端一致的"系统主数据"快照
  var applyingRemote = false;        // 正在应用远程数据时不要回推
  var firstSnapshotDone = false;     // 收到首个云端快照前不推送

  function $(id) { return document.getElementById(id); }
  function setStatus(text, color) {
    var el = $("cloud-status");
    if (el) { el.textContent = text; el.style.color = color || "var(--af-fg-3,#888)"; }
  }

  // 系统名 → Firestore 文档 id(去掉 / \ # ? 等非法字符;真正系统名存在 doc.name 字段)
  function sysDocId(name) {
    return String(name || "").trim().replace(/[\/\\#?]+/g, "-").slice(0, 140) || "system";
  }
  function manufacturerFor(/* name */) { return "Kawneer"; }

  // 规整 parts / accessories(只保留主数据字段,去掉本地 id)
  function cleanParts(arr) {
    return (arr || []).map(function (p) {
      var o = {
        partNumber: p.partNumber || "",
        description: p.description || "",
        roles: Array.isArray(p.roles) ? p.roles.slice() : []
      };
      if (p.stockInches != null) o.stockInches = p.stockInches;
      return o;
    });
  }
  function cleanAccessories(arr) {
    return (arr || []).map(function (a) {
      return {
        partNumber: a.partNumber || "",
        description: a.description || "",
        rule: a.rule || "per_piece",
        positions: Array.isArray(a.positions) ? a.positions.slice() : [],
        param: (a.param != null ? a.param : 1),
        min: a.min || 0,
        unit: a.unit || "ea"
      };
    });
  }

  // 本地 state(扁平 parts/accessories,带 system 字段)→ 按系统分组的主数据 map
  function systemsFromState() {
    var bySys = {};
    function bucket(s) { return bySys[s] || (bySys[s] = { parts: [], accessories: [] }); }
    (state.parts || []).forEach(function (p) {
      var s = p.system || "";
      if (!s) return;                 // 无系统的零件不进云
      bucket(s).parts.push(cleanParts([p])[0]);
    });
    (state.accessories || []).forEach(function (a) {
      var s = a.system || "";
      if (!s) return;
      bucket(s).accessories.push(cleanAccessories([a])[0]);
    });
    return bySys;
  }

  // Firestore 文档数组 → 按系统分组的主数据 map(用 doc.name 作系统名)
  function systemsFromDocs(docs) {
    var m = {};
    docs.forEach(function (d) {
      var name = d.data && d.data.name;
      if (!name) return;
      m[name] = { parts: cleanParts(d.data.parts), accessories: cleanAccessories(d.data.accessories) };
    });
    return m;
  }

  // 把云端文档套到本地 state.parts / state.accessories(openings 不动),并重画
  function applySystemsDocs(docs) {
    applyingRemote = true;
    try {
      docs.sort(function (a, b) {
        var oa = (a.data && a.data.order != null) ? a.data.order : 999;
        var ob = (b.data && b.data.order != null) ? b.data.order : 999;
        if (oa !== ob) return oa - ob;
        return String(a.id).localeCompare(String(b.id));
      });
      var parts = [], accessories = [];
      docs.forEach(function (d) {
        var name = (d.data && d.data.name) || d.id;
        cleanParts(d.data && d.data.parts).forEach(function (p) {
          var np = { id: uid(), system: name, partNumber: p.partNumber, description: p.description, roles: p.roles.slice() };
          if (p.stockInches != null) np.stockInches = p.stockInches;
          parts.push(np);
        });
        cleanAccessories(d.data && d.data.accessories).forEach(function (a) {
          accessories.push({ id: uid(), system: name, partNumber: a.partNumber, description: a.description, rule: a.rule, positions: a.positions.slice(), param: a.param, min: a.min, unit: a.unit });
        });
      });
      state.parts = parts;
      state.accessories = accessories;
      lastSyncedSystemsJSON = JSON.stringify(systemsFromState());
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {}
      renderAll();
    } finally {
      applyingRemote = false;
    }
  }

  // 首次:云端为空 → 用 systems.js 的 SYSTEM_DEFS 初始化每个系统一个文档
  function seedFromDefs() {
    var defs = window.SYSTEM_DEFS || {};
    var order = window.SYSTEM_ORDER || [];
    var names = Object.keys(defs);
    if (!names.length) { setStatus("● 云端为空,且无本地种子", "#c62828"); return; }
    setStatus("● 初始化零件库…", "#d59300");
    var writes = names.map(function (name) {
      var d = defs[name] || {};
      var oi = order.indexOf(name);
      return fb.setDoc(fb.doc(fb.db, "systems", sysDocId(name)), {
        name: name,
        manufacturer: manufacturerFor(name),
        order: oi >= 0 ? oi : 999,
        parts: cleanParts(d.parts),
        accessories: cleanAccessories(d.accessories),
        updatedAt: fb.serverTimestamp()
      }, { merge: true });
    });
    Promise.all(writes).then(function () {
      setStatus("● 已初始化并同步", "#1a9e4b");
      // 写完后 onSnapshot 会再次触发(这次有 docs)→ applySystemsDocs
    }).catch(function (e) {
      console.error("[cloud] seed failed:", e);
      setStatus("● 初始化失败(用本地零件库)", "#c62828");
    });
  }

  // ---------- 写入云端(防抖,只写有变化的系统) ----------
  function schedulePush() {
    if (!firstSnapshotDone) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(pushNow, 700);
  }

  function pushNow() {
    if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
    if (!fb) return Promise.resolve();
    var cur = systemsFromState();
    var curJSON = JSON.stringify(cur);
    if (curJSON === lastSyncedSystemsJSON) { setStatus("● 已同步", "#1a9e4b"); return Promise.resolve(); }
    var prev = lastSyncedSystemsJSON ? JSON.parse(lastSyncedSystemsJSON) : {};
    var writes = [];
    Object.keys(cur).forEach(function (sys) {
      if (JSON.stringify(cur[sys]) === JSON.stringify(prev[sys])) return; // 该系统没变
      var oi = (window.SYSTEM_ORDER || []).indexOf(sys);
      writes.push(fb.setDoc(fb.doc(fb.db, "systems", sysDocId(sys)), {
        name: sys,
        manufacturer: manufacturerFor(sys),
        order: oi >= 0 ? oi : 999,
        parts: cur[sys].parts,
        accessories: cur[sys].accessories,
        updatedAt: fb.serverTimestamp()
      }, { merge: true }));
    });
    if (!writes.length) { lastSyncedSystemsJSON = curJSON; setStatus("● 已同步", "#1a9e4b"); return Promise.resolve(); }
    setStatus("● 保存中…", "#d59300");
    return Promise.all(writes).then(function () {
      lastSyncedSystemsJSON = curJSON;
      setStatus("● 已同步", "#1a9e4b");
    }).catch(function (e) {
      console.error("[cloud] push failed:", e);
      setStatus("● 保存失败(已存本地)", "#c62828");
    });
  }

  // ---------- 订阅 systems 集合 ----------
  function subscribe() {
    if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
    if (!fb) return;
    firstSnapshotDone = false;
    setStatus("● 连接中…", "#888");
    unsub = fb.onSnapshot(fb.collection(fb.db, "systems"), function (snap) {
      if (snap.metadata && snap.metadata.hasPendingWrites) return;
      firstSnapshotDone = true;
      var docs = [];
      snap.forEach(function (d) { docs.push({ id: d.id, data: d.data() || {} }); });
      if (!docs.length) { seedFromDefs(); return; }     // 空 → 种子初始化
      var incomingJSON = JSON.stringify(systemsFromDocs(docs));
      if (incomingJSON === JSON.stringify(systemsFromState())) {
        lastSyncedSystemsJSON = incomingJSON;
        setStatus("● 已同步", "#1a9e4b");
        return;
      }
      applySystemsDocs(docs);
      setStatus("● 已同步", "#1a9e4b");
    }, function (err) {
      console.error("[cloud] snapshot error:", err);
      setStatus("● 离线(用本地零件库)", "#c62828");
    });
  }

  // ---------- 启动 ----------
  function patchSave() {
    if (typeof save !== "function" || save.__cloudPatched) return;
    var _localSave = save;
    save = function () {
      _localSave.apply(this, arguments);                       // 原逻辑:写 localStorage(含 openings)
      if (fb && !applyingRemote && firstSnapshotDone) schedulePush(); // 只把系统主数据同步到云端
    };
    save.__cloudPatched = true;
  }

  function start() {
    fb = window.__fb;
    patchSave();
    subscribe();
  }

  if (window.__fb) {
    start();
  } else {
    window.addEventListener("fb-ready", start, { once: true });
    window.addEventListener("fb-error", function () {
      setStatus("● 云端连接失败(用本地零件库)", "#c62828");
    }, { once: true });
  }
})();
