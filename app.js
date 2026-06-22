/* ============================================================
   Hillview Reservoir — Kawneer Takeoff Tool — Logic
   ============================================================ */

const STORAGE_KEY = 'hillview-kawneer-takeoff-v2';
const PARTS_DB_VERSION = 20260618;
// SYSTEMS & POSITIONS derived dynamically from parts data (with fallback defaults)
const DEFAULT_SYSTEMS = ['IR501T', '450'];
const DEFAULT_POSITIONS = ['Head', 'Jamb', 'Sill', 'Horizontal', 'Vertical', 'Transom Bar', 'Door Jamb', 'Door Jamb At Transom'];
function SYSTEMS_LIST() {
  const fromParts = Array.from(new Set((state.parts||[]).map(p => p.system).filter(Boolean)));
  return fromParts.length ? fromParts : DEFAULT_SYSTEMS.slice();
}
function POSITIONS_LIST() {
  const fromParts = Array.from(new Set((state.parts||[]).flatMap(p => p.roles||[])));
  return fromParts.length ? fromParts : DEFAULT_POSITIONS.slice();
}
// Back-compat aliases (Proxy so existing SYSTEMS.map / SYSTEMS.indexOf still work)
const SYSTEMS = new Proxy([], { get(_,k){ const a=SYSTEMS_LIST(); return typeof a[k]==='function'?a[k].bind(a):a[k]; } });
const POSITIONS = new Proxy([], { get(_,k){ const a=POSITIONS_LIST(); return typeof a[k]==='function'?a[k].bind(a):a[k]; } });
const WASTE_FACTOR = 1.20;
const STOCK_INCHES = 288; // 24 ft

// DXF layer-name config (can be overridden via setLayerConfig({alum:'...',...}))
let LAYER_CONFIG = {
  alum: 'AF_ALUM PROFILE',
  doorSubframe: 'AF-DOOR SUBFRAME',
  outline: 'AF_OUTLINE',
  scope: 'AF SCOPE',
  door: 'A-DOOR-1',
  fallbacks: ['0','AF_X'],
};
function setLayerConfig(cfg){ LAYER_CONFIG = Object.assign({}, LAYER_CONFIG, cfg||{}); save(); }
window.setLayerConfig = setLayerConfig;


// ---------- Default seed data ----------
// Seeded from user's parts CSV. Duplicate part numbers across positions are
// consolidated to a single row with multiple roles — required for
// part-centric aggregation (e.g. 575T217 carries Head + Jamb).
// 系统数据(parts/accessories)已抽到 systems.js 的 window.SYSTEM_DEFS。
// 这里只把它摊平成 SEED_PARTS / SEED_ACCESSORIES(自动补 system; id 在 clone 时生成)。
const SEED_PARTS = [];
const SEED_ACCESSORIES = [];
(function buildSeedFromDefs() {
  const defs = (typeof window !== 'undefined' && window.SYSTEM_DEFS) || {};
  const pref = (typeof window !== 'undefined' && window.SYSTEM_ORDER) || [];
  // 按 SYSTEM_ORDER 排, 其余(未列出的)按对象顺序补在后面
  const order = pref.filter(s => defs[s]).concat(Object.keys(defs).filter(s => !pref.includes(s)));
  for (const sys of order) {
    for (const p of (defs[sys].parts || [])) SEED_PARTS.push(Object.assign({ system: sys }, p));
    for (const a of (defs[sys].accessories || [])) SEED_ACCESSORIES.push(Object.assign({ system: sys }, a));
  }
})();

const SEED_OPENINGS = [];

// ---------- State ----------
function cloneSeedAccessories() {
  return SEED_ACCESSORIES.map(a => ({ ...a, id: uid(), positions: [...a.positions] }));
}

let state = load() || {
  partsDbVersion: PARTS_DB_VERSION,
  parts: cloneSeedParts(),
  openings: SEED_OPENINGS,
  accessories: cloneSeedAccessories(),
};
if (!Array.isArray(state.accessories)) state.accessories = cloneSeedAccessories();

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function save() {
  try {
    state.partsDbVersion = PARTS_DB_VERSION;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch(e){}
}
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.parts) || !Array.isArray(parsed.openings)) return null;
    parsed.openings = parsed.openings.map(o => ({
      ...o,
      system: o.system === '451T' ? '450' : o.system,
    }));
    if (parsed.partsDbVersion !== PARTS_DB_VERSION) {
      parsed.parts = cloneSeedParts();
      parsed.accessories = cloneSeedAccessories();   // 配件也随版本重灌(已改为按系统分)
      parsed.partsDbVersion = PARTS_DB_VERSION;
    }
    // 旧数据兼容: 配件缺 system 字段的, 视为通用(沿用旧全局行为, 不限系统)
    if (Array.isArray(parsed.accessories)) {
      for (const a of parsed.accessories) if (a.system === undefined) a.system = '';
    }
    return parsed;
  } catch(e) { return null; }
}

function cloneSeedParts() {
  return SEED_PARTS.map(p => ({ ...p, id: uid(), roles: [...p.roles] }));
}

// ---------- ICON helper ----------
function ico(name, cls = 'ico') {
  const paths = {
    plus:    '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    trash:   '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/>',
    download:'<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    copy:    '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>',
    reset:   '<path d="M3 12a9 9 0 1015.7-6.1L21 3M21 3v6h-6"/>',
    upload:  '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    fileText:'<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>',
    inbox:   '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z"/>',
    table:   '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18M15 3v18"/>',
    eye:     '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  };
  const d = paths[name] || '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;
}

// ============================================================
//  RENDER
// ============================================================
function renderAll() {
  renderParts();
  renderOpenings();
  renderReport();
  renderMeta();
  save();
}

// ---------- Parts Database ----------
function partRowHtml(p) {
  return `
    <tr data-id="${p.id}">
      <td class="col-sys">
        <select class="tk-cell-select" data-field="system">
          ${SYSTEMS.map(s => `<option value="${s}" ${s===p.system?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td class="col-pn">
        <input class="tk-cell-input mono" data-field="partNumber" value="${escAttr(p.partNumber)}" placeholder="Part #" />
      </td>
      <td>
        <input class="tk-cell-input" data-field="description" value="${escAttr(p.description)}" placeholder="Description" />
      </td>
      <td class="col-roles">
        <div class="tk-roles" data-field="roles">
          ${POSITIONS.map(pos => `<span class="tk-role ${p.roles.includes(pos)?'is-on':''}" data-role="${pos}">${pos}</span>`).join('')}
        </div>
      </td>
      <td class="tk-rowdel">
        <button class="tk-rowdel-btn" data-action="del-part" title="Delete row">${ico('trash')}</button>
      </td>
    </tr>`;
}

// 零件表按系统折叠; 默认只展开"当前在用系统"(有 opening 的); 用户点标题可切换。
let _partsExpandInit = false;
const partsExpanded = new Set();
function renderParts() {
  const tbody = document.getElementById('parts-tbody');
  if (!state.parts.length) {
    tbody.innerHTML = `<tr class="is-empty"><td colspan="6">No parts defined — add a row to begin.</td></tr>`;
    return;
  }
  const systems = SYSTEMS_LIST();
  if (!_partsExpandInit) {
    _partsExpandInit = true;
    const inUse = new Set((state.openings || []).map(o => o.system).filter(Boolean));
    for (const s of systems) if (!inUse.size || inUse.has(s)) partsExpanded.add(s);
  }
  const bySys = {};
  for (const p of state.parts) (bySys[p.system] = bySys[p.system] || []).push(p);
  const order = systems.concat(Object.keys(bySys).filter(s => !systems.includes(s)));
  let html = '';
  for (const sys of order) {
    const parts = bySys[sys];
    if (!parts || !parts.length) continue;
    const open = partsExpanded.has(sys);
    html += `<tr class="sys-group" data-sysgroup="${escAttr(sys)}"><td colspan="6" style="cursor:pointer; font-weight:600; background:var(--af-bg-2,#f1f1f1); user-select:none;">${open ? '▾' : '▸'} ${escHtml(sys || '(no system)')} <span style="color:var(--af-fg-3); font-weight:400;">· ${parts.length} parts</span></td></tr>`;
    if (open) for (const p of parts) html += partRowHtml(p);
  }
  tbody.innerHTML = html;
}

// ---------- Openings (Cut Schedule by opening) ----------
function renderOpenings() {
  const tbody = document.getElementById('openings-tbody');
  if (!state.openings.length) {
    tbody.innerHTML = `<tr class="is-empty"><td colspan="10">No openings yet — add one below, or paste a schedule into the DXF box.</td></tr>`;
    return;
  }
  tbody.innerHTML = state.openings.map(o => `
    <tr data-id="${o.id}">
      <td class="col-mark"><input class="tk-cell-input mono" data-field="mark" value="${escAttr(o.mark)}" placeholder="SF-01" /></td>
      <td class="col-sys">
        <select class="tk-cell-select" data-field="system">
          ${SYSTEMS.map(s => `<option value="${s}" ${s===o.system?'selected':''}>${s}</option>`).join('')}
        </select>
      </td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-field="qty" type="number" min="1" step="1" value="${o.qty}" /></td>
      <td class="col-num"><input class="tk-cell-input num" data-field="width"  type="number" min="0" step="0.125" value="${o.width}"  /></td>
      <td class="col-num"><input class="tk-cell-input num" data-field="height" type="number" min="0" step="0.125" value="${o.height}" /></td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-field="horiz" type="number" min="0" step="1" value="${o.horiz||0}" title="Intermediate horizontals (full-width cuts)" /></td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-field="vert"  type="number" min="0" step="1" value="${o.vert||0}"  title="Intermediate verticals (full-height cuts)" /></td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-field="lites" type="number" min="0" step="1" value="${o.lites||0}" title="Glass lites (auto from VISION GLASS MARK; editable)" /></td>
      <td class="col-num"><span class="tk-cell-input num" style="color:var(--af-fg-3); font-size:11.5px;">${formatNumber(openingTotalInches(o))}"</span></td>
      <td class="tk-rowdel">
        <button class="tk-rowdel-btn" data-action="view-opening" title="View elevation (traceback)">${ico('eye')}</button>
        <button class="tk-rowdel-btn" data-action="del-opening" title="Delete row">${ico('trash')}</button>
      </td>
    </tr>
  `).join('');
}

// ---------- Elevation Viewer (traceback: cut → source polyline) ----------
// 配色与手算图例一致
const POSITION_COLORS = {
  'Head': '#e6c700', 'Jamb': '#00b400', 'Sill': '#e00000', 'Horizontal': '#00b4b4',
  'Door Jamb At Transom': '#0000e0', 'Transom Bar': '#000000', 'Vertical': '#9898cc',
  'Door Jamb': '#e000e0', 'Outside 90° Corner': '#808080', 'Subsill': '#f26722',
};

// 1600 系统(两种尺寸):只分 4 类。Head/Sill/Transom Bar 用同一种颜色(周边横料)。
function is1600(system) { return /^1600/.test(String(system || '')); }
const COLOR_1600 = {
  'Head': '#e6c700', 'Sill': '#e6c700', 'Transom Bar': '#e6c700', // 周边横料(黄)
  'Horizontal': '#00b4b4',                                        // 中间横料(青)
  'Jamb': '#00b400',                                              // 周边竖料(绿)
  'Vertical': '#9898cc',                                          // 中间竖料(紫)
};
function cutColor(position, system) {
  if (is1600(system)) return COLOR_1600[position] || POSITION_COLORS[position] || '#bbb';
  return POSITION_COLORS[position] || '#bbb';
}

// 系统相关改名(450 与 IR501T 唯一区别都在这): 门框 transom 以上那段 ——
//   · 既是 elevation 最边 jamb → Jamb
//   · 其余(中间门框)→ 与 Vertical 同一构成, 归 Vertical(同色)
// 即 450 里没有独立的 "Door Jamb At Transom" 类。IR501T 保持 Door Jamb At Transom。
// 几何分类时已对边门框那段打了 edgeDoorJamb 标记。
function cutDisplayPosition(c, system) {
  if (system === '450' && c.position === 'Door Jamb At Transom') {
    return c.edgeDoorJamb ? 'Jamb' : 'Vertical';
  }
  return c.position;
}

// 手动修改识别: 点立面图色块/底部 chip 选中某根料 → 内联编辑器(位置/长度/数量/删除); "+ Add cut" 新增。
let viewerOpeningId = null;
let viewerEditIdx = null;
function renderViewer(openingId) {
  const o = state.openings.find(x => x.id === openingId);
  const sec = document.getElementById('viewer-section');
  if (!o || !sec) return;
  if (openingId !== viewerOpeningId) viewerEditIdx = null;
  viewerOpeningId = openingId;
  const box = document.getElementById('viewer-box');
  const legend = document.getElementById('viewer-legend');
  const editBox = document.getElementById('viewer-edit');
  document.getElementById('viewer-sub').textContent =
    `${o.mark} — ${o.system} · ${formatNumber(o.width)}" × ${formatNumber(o.height)}"`;
  sec.style.display = '';
  const cuts = o.cuts || (o.cuts = []);
  if (viewerEditIdx != null && (viewerEditIdx < 0 || viewerEditIdx >= cuts.length)) viewerEditIdx = null;

  const srcs = cuts.filter(c => c.src);
  if (srcs.length) {
    const minX = Math.min(...srcs.map(c => c.src.x));
    const maxX = Math.max(...srcs.map(c => c.src.x + c.src.w));
    const minY = Math.min(...srcs.map(c => c.src.y));
    const maxY = Math.max(...srcs.map(c => c.src.y + c.src.h));
    const W = maxX - minX, H = maxY - minY, pad = Math.max(W, H) * 0.04 + 2;
    const minVis = Math.max(W, H) * 0.005;
    const ordered = [...srcs].sort((a, b) => (b.src.w * b.src.h) - (a.src.w * a.src.h));
    const rects = ordered.map(c => {
      const idx = cuts.indexOf(c);
      const s = c.src;
      let y0 = s.y, hh = s.h;
      if (s.h > c.length + 0.6 && (c.position === 'Door Jamb' || c.position === 'Door Jamb At Transom')) {
        hh = c.length;
        if (c.position === 'Door Jamb At Transom') y0 = s.y + s.h - c.length;
      }
      const x = s.x - minX, y = maxY - (y0 + hh); // DXF y朝上 → SVG y朝下
      const dp = cutDisplayPosition(c, o.system);
      const col = cutColor(dp, o.system);
      const sel = idx === viewerEditIdx;
      return `<rect data-cut="${idx}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${Math.max(s.w, minVis).toFixed(2)}" height="${Math.max(hh, minVis).toFixed(2)}" fill="${col}" fill-opacity="0.85" stroke="${sel ? '#ff2d2d' : '#222'}" stroke-width="${(Math.max(W, H) * (sel ? 0.006 : 0.0015)).toFixed(3)}" style="cursor:pointer;"><title>${escHtml(dp)} — ${formatNumber(c.length)}"${s.layer ? ' · ' + escHtml(s.layer) : ''}  (点击编辑)</title></rect>`;
    }).join('');
    box.innerHTML = `<svg viewBox="${(-pad).toFixed(2)} ${(-pad).toFixed(2)} ${(W + 2 * pad).toFixed(2)} ${(H + 2 * pad).toFixed(2)}" style="width:100%;max-height:520px;display:block;">${rects}</svg>`;
  } else {
    box.innerHTML = `<div style="padding:18px;color:#888;font-size:13px;">无溯源图形。下面用 chip 编辑,或点 "+ Add cut" 加料。</div>`;
  }

  // 无溯源料(手动加的/手填) → 可点 chip
  const manual = cuts.map((c, i) => ({ c, i })).filter(x => !x.c.src);
  let html = '';
  if (manual.length) {
    html += `<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;font-size:12px;">`
      + manual.map(({ c, i }) => {
          const dp = cutDisplayPosition(c, o.system);
          return `<span data-cut="${i}" style="cursor:pointer;padding:2px 8px;border:1px solid ${i === viewerEditIdx ? '#ff2d2d' : '#bbb'};border-radius:10px;">${escHtml(dp)} · ${formatNumber(c.length)}″ ×${c.count || 1}</span>`;
        }).join('')
      + `</div>`;
  }
  // 选中料的编辑器
  if (viewerEditIdx != null && cuts[viewerEditIdx]) {
    const c = cuts[viewerEditIdx];
    html += `
      <div style="margin-top:10px;padding:10px 12px;border:1px solid var(--af-line,#ddd);border-radius:8px;background:var(--af-bg-2,#f6f6f6);display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:13px;">
        <b>编辑料 #${viewerEditIdx + 1}</b>
        <label>位置 <select id="vc-pos" class="tk-cell-select">${POSITIONS.map(p => `<option value="${escAttr(p)}" ${p === c.position ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>长度 <input id="vc-len" class="tk-cell-input num" type="number" step="0.125" value="${c.length}" style="width:84px;" />″</label>
        <label>数量 <input id="vc-cnt" class="tk-cell-input num" type="number" min="1" step="1" value="${c.count || 1}" style="width:60px;" /></label>
        <button class="tk-btn tk-btn--ghost tk-btn--sm" id="vc-del">删除此料</button>
        <button class="tk-btn tk-btn--ghost tk-btn--sm" id="vc-done">完成</button>
      </div>`;
  }
  if (editBox) editBox.innerHTML = html;

  const agg = {};
  for (const c of cuts) {
    const dp = cutDisplayPosition(c, o.system);
    if (!agg[dp]) agg[dp] = { len: 0, n: 0 };
    agg[dp].len += c.length * (c.count || 1);
    agg[dp].n += (c.count || 1);
  }
  legend.innerHTML = Object.entries(agg).map(([p, a]) =>
    `<span style="display:inline-flex;align-items:center;gap:5px;"><span style="width:12px;height:12px;border-radius:3px;border:1px solid #555;background:${cutColor(p, o.system)};"></span>${escHtml(p)} · ${a.n} pcs · ${formatNumber(a.len)}"</span>`
  ).join('');
  sec.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function refreshAfterCutEdit() {
  save();
  if (viewerOpeningId != null) renderViewer(viewerOpeningId);
  renderReport(); renderMeta(); renderOpenings();
}

document.addEventListener('click', e => {
  if (!e.target || !e.target.closest) return;
  if (e.target.closest('#viewer-close')) {
    document.getElementById('viewer-section').style.display = 'none';
    viewerEditIdx = null;
    return;
  }
  // 选中某根料(立面图色块 或 底部 chip)
  const cutEl = e.target.closest('[data-cut]');
  if (cutEl && (cutEl.closest('#viewer-box') || cutEl.closest('#viewer-edit')) && viewerOpeningId != null) {
    viewerEditIdx = parseInt(cutEl.getAttribute('data-cut'), 10);
    renderViewer(viewerOpeningId);
    return;
  }
  if (e.target.closest('#viewer-addcut') && viewerOpeningId != null) {
    const o = state.openings.find(x => x.id === viewerOpeningId);
    if (o) {
      o.cuts = o.cuts || [];
      o.cuts.push({ position: 'Head', length: dxfRound(o.width || 24), count: 1 });
      viewerEditIdx = o.cuts.length - 1;
      refreshAfterCutEdit();
    }
    return;
  }
  if (e.target.closest('#vc-del') && viewerOpeningId != null && viewerEditIdx != null) {
    const o = state.openings.find(x => x.id === viewerOpeningId);
    if (o && o.cuts && o.cuts[viewerEditIdx]) { o.cuts.splice(viewerEditIdx, 1); viewerEditIdx = null; refreshAfterCutEdit(); }
    return;
  }
  if (e.target.closest('#vc-done')) { viewerEditIdx = null; if (viewerOpeningId != null) renderViewer(viewerOpeningId); return; }
});

// 编辑器字段改动(位置/长度/数量)
document.addEventListener('change', e => {
  if (viewerOpeningId == null || viewerEditIdx == null) return;
  if (!e.target.closest || !e.target.closest('#viewer-edit')) return;
  const o = state.openings.find(x => x.id === viewerOpeningId);
  if (!o || !o.cuts || !o.cuts[viewerEditIdx]) return;
  const c = o.cuts[viewerEditIdx];
  if (e.target.id === 'vc-pos') c.position = e.target.value;
  else if (e.target.id === 'vc-len') c.length = parseFloat(e.target.value) || 0;
  else if (e.target.id === 'vc-cnt') c.count = Math.max(1, parseInt(e.target.value) || 1);
  else return;
  refreshAfterCutEdit();
});

// ---------- Accessories takeoff (rules engine) ----------
const ACC_RULES = {
  per_piece:   { label: '/ piece',   paramLabel: 'qty per piece' },
  per_spacing: { label: 'spacing',   paramLabel: 'o.c. inches'   },
  per_lf:      { label: '× LF',      paramLabel: 'factor'        },
  per_lite:    { label: '/ lite',    paramLabel: 'qty per lite'  },
  per_opening: { label: '/ opening', paramLabel: 'qty per opening' },
};

function computeAccessories() {
  // 按系统聚合: 每个 system 一份 {pos, lites, openingsQty}; system '' 视为全部洞口(旧通用行为)
  const bySys = {};
  const agg = (sys) => bySys[sys] || (bySys[sys] = { pos: {}, lites: 0, openingsQty: 0 });
  const allOpen = { pos: {}, lites: 0, openingsQty: 0 };
  const tally = (g, o, q) => {
    g.openingsQty += q;
    g.lites += (parseFloat(o.lites) || 0) * q;
    for (const c of expandOpeningCuts(o)) {
      const p = g.pos[c.position] || (g.pos[c.position] = { inches: 0, pieces: 0, lens: [] });
      p.inches += c.length * c.count * q;
      p.pieces += c.count * q;
      for (let i = 0; i < c.count * q; i++) p.lens.push(c.length);
    }
  };
  for (const o of state.openings) {
    const q = o.qty || 1;
    tally(agg(o.system || ''), o, q);
    tally(allOpen, o, q);
  }
  return (state.accessories || []).map(a => {
    const g = (a.system === '' || a.system === undefined) ? allOpen : (bySys[a.system] || { pos: {}, lites: 0, openingsQty: 0 });
    const pos = g.pos, lites = g.lites, openingsQty = g.openingsQty;
    const sel = (a.positions && a.positions.length) ? a.positions : Object.keys(pos);
    let inches = 0, pieces = 0, lens = [];
    for (const p of sel) if (pos[p]) {
      inches += pos[p].inches; pieces += pos[p].pieces; lens = lens.concat(pos[p].lens);
    }
    const param = parseFloat(a.param) || 0;
    const mn = parseFloat(a.min) || 0;
    let qty = 0, basis = '';
    if (a.rule === 'per_piece') {
      qty = Math.ceil(param * pieces);
      basis = `${pieces} pcs × ${param}`;
    } else if (a.rule === 'per_lite') {
      qty = Math.ceil(param * lites);
      basis = `${formatNumber(lites)} lites × ${param}`;
    } else if (a.rule === 'per_opening') {
      qty = Math.ceil(param * openingsQty);
      basis = `${openingsQty} openings × ${param}`;
    } else if (a.rule === 'per_spacing') {
      qty = param > 0 ? lens.reduce((acc, L) => acc + Math.max(mn, Math.floor(L / param) + 1), 0) : 0;
      basis = `${lens.length} pcs @ ${param}" o.c., min ${mn}/pc`;
    } else if (a.rule === 'per_lf') {
      qty = Math.ceil(param * inches / 12 * 10) / 10;
      basis = `${formatNumber(inches)}" × ${param} ÷ 12`;
    }
    return { acc: a, qty, basis };
  });
}

function renderAccessories() {
  const tbody = document.getElementById('acc-tbody');
  if (!tbody) return;
  let rows = computeAccessories();
  const sysInUse = new Set(state.openings.map(o => o.system).filter(Boolean));
  if (sysInUse.size) rows = rows.filter(r => !r.acc.system || sysInUse.has(r.acc.system));
  if (!rows.length) {
    tbody.innerHTML = `<tr class="is-empty"><td colspan="9">No accessory rules — add one below.</td></tr>`;
    return;
  }
  const sysOpts = ['', ...SYSTEMS_LIST()];
  tbody.innerHTML = rows.map(({ acc: a, qty, basis }) => `
    <tr data-id="${a.id}">
      <td class="col-sys"><select class="tk-cell-select" data-afield="system">${sysOpts.map(s => `<option value="${escAttr(s)}" ${s === (a.system || '') ? 'selected' : ''}>${s || '(all)'}</option>`).join('')}</select></td>
      <td class="col-mark"><input class="tk-cell-input mono" data-afield="partNumber" value="${escAttr(a.partNumber || '')}" placeholder="P/N" /></td>
      <td><input class="tk-cell-input" data-afield="description" value="${escAttr(a.description || '')}" /></td>
      <td class="col-sys">
        <select class="tk-cell-select" data-afield="rule">
          ${Object.entries(ACC_RULES).map(([k, r]) => `<option value="${k}" ${k === a.rule ? 'selected' : ''}>${r.label}</option>`).join('')}
        </select>
      </td>
      <td><input class="tk-cell-input" data-afield="positions" value="${escAttr((a.positions || []).join(', '))}" placeholder="(all positions)" title="逗号分隔位置;留空=全部" /></td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-afield="param" type="number" step="0.05" value="${a.param}" title="${(ACC_RULES[a.rule] || {}).paramLabel || 'param'}" /></td>
      <td class="col-num-sm"><input class="tk-cell-input num" data-afield="min" type="number" step="1" value="${a.min || 0}" title="min per piece (spacing 规则用)" /></td>
      <td class="col-num"><span class="acc-qty mono" title="${escAttr(basis)}">${formatNumber(qty)} ${escHtml(a.unit || 'ea')}</span></td>
      <td class="tk-rowdel"><button class="tk-rowdel-btn" data-action="del-accessory" title="Delete rule">${ico('trash')}</button></td>
    </tr>
  `).join('');
}

document.addEventListener('input', e => {
  const tr = e.target.closest && e.target.closest('#acc-tbody tr[data-id]');
  if (!tr) return;
  const a = (state.accessories || []).find(x => x.id === tr.dataset.id);
  const f = e.target.dataset.afield;
  if (!a || !f) return;
  if (f === 'positions') a.positions = e.target.value.split(/[,;、]/).map(s => s.trim()).filter(Boolean);
  else if (f === 'param' || f === 'min') a[f] = parseFloat(e.target.value) || 0;
  else a[f] = e.target.value;
  save();
  // 只刷该行的 qty,不打断输入
  const row = computeAccessories().find(r => r.acc.id === a.id);
  const cell = tr.querySelector('.acc-qty');
  if (row && cell) { cell.textContent = `${formatNumber(row.qty)} ${a.unit || 'ea'}`; cell.title = row.basis; }
});

document.addEventListener('change', e => {
  const tr = e.target.closest && e.target.closest('#acc-tbody tr[data-id]');
  if (!tr) return;
  const f = e.target.dataset.afield;
  if (f !== 'rule' && f !== 'system') return;
  const a = (state.accessories || []).find(x => x.id === tr.dataset.id);
  if (a) { a[f] = e.target.value; save(); }
  renderAccessories();   // rule/system 变了要重算并(system)重新过滤
});

document.addEventListener('click', e => {
  if (!e.target.closest) return;
  if (e.target.closest('#acc-add')) {
    const defSys = (state.openings.find(o => o.system) || {}).system || SYSTEMS_LIST()[0] || '';
    state.accessories.push({ id: uid(), system: defSys, partNumber: '', description: '', rule: 'per_piece', positions: [], param: 1, min: 0, unit: 'ea' });
    save(); renderAccessories();
    return;
  }
  const del = e.target.closest('[data-action="del-accessory"]');
  if (del) {
    const tr = del.closest('tr[data-id]');
    state.accessories = (state.accessories || []).filter(x => x.id !== tr.dataset.id);
    save(); renderAccessories();
  }
});

// 报表刷新时联动辅料表
const _renderReportBase = renderReport;
renderReport = function () {
  const r = _renderReportBase.apply(this, arguments);
  try { renderAccessories(); } catch (e) {}
  return r;
};

function openingTotalInches(o) {
  // Per single opening (NOT multiplied by qty here) — just to show row-level info
  const cuts = expandOpeningCuts(o);
  const single = cuts.reduce((acc, c) => acc + c.length, 0);
  return single * (o.qty || 1);
}

// Returns array of {position, length, count} for ONE instance of opening (multiply by qty in aggregation)
function expandOpeningCuts(o) {
  if (Array.isArray(o.cuts) && o.cuts.length) {
    return o.cuts.map(c => ({
      position: cutDisplayPosition(c, o.system),   // 450 边门框 transom 以上段 → Jamb
      length: parseFloat(c.length) || 0,
      count: parseInt(c.count) || 1,
    })).filter(c => c.position && c.length > 0 && c.count > 0);
  }
  const cuts = [];
  if (o.width  > 0) cuts.push({ position: 'Head', length: o.width, count: 1 });
  if (o.width  > 0) cuts.push({ position: 'Sill', length: o.width, count: 1 });
  if (o.height > 0) cuts.push({ position: 'Jamb', length: o.height, count: 2 });
  if (o.horiz  > 0 && o.width > 0) cuts.push({ position: 'Horizontal', length: o.width, count: o.horiz });
  if (o.vert   > 0 && o.height > 0) cuts.push({ position: 'Vertical', length: o.height, count: o.vert });
  return cuts;
}

// ============================================================
//  AGGREGATION → REPORT
// ============================================================
// 一维下料装箱 — First-Fit-Decreasing (FFD):
//   长段优先,每段塞进第一根还放得下的料(回头利用任意已开料的剩余),全塞不下才开新料.
//   返回 { sticks: 根数, over: [被拼接的超长段...] }。
//   超长段(单件 > 整料)按拼接计入: floor(L/stock) 根整料 + 余段并入 FFD 池(余=0 不入)。
function packFFD(pieces, stock, eps = 1e-6) {
  const over = [];
  const fit = [];
  let fullSticks = 0;            // 超长段整除出的整根, 直接计入
  for (const p of pieces) {
    if (p > stock + eps) {
      over.push(p);
      const nFull = Math.floor((p + eps) / stock);
      fullSticks += nFull;
      const rem = p - nFull * stock;
      if (rem > eps) fit.push(rem);   // 余段入池; 余=0 不入
    } else if (p > 0) {
      fit.push(p);
    }
  }
  fit.sort((a, b) => b - a); // 长 → 短
  const rema = []; // 每根料剩余长度
  for (const p of fit) {
    let placed = false;
    for (let i = 0; i < rema.length; i++) {
      if (rema[i] + eps >= p) { rema[i] -= p; placed = true; break; }
    }
    if (!placed) rema.push(stock - p);
  }
  return { sticks: fullSticks + rema.length, over: over.sort((a, b) => b - a) };
}

function buildReport() {
  // Bucket: key = system + '|' + partNumber → { system, partNumber, description, roles:Set, totalInches }
  const buckets = new Map();
  const unresolved = []; // {opening, position, length}
  const posTotals = {};  // { system: { position: 总下料长(in) } } —— 角色层用

  for (const o of state.openings) {
    const cuts = expandOpeningCuts(o);
    for (const c of cuts) {
      // Every part assigned to this position needs the same cut length.
      const matches = state.parts.filter(p =>
        p.system === o.system &&
        Array.isArray(p.roles) &&
        p.roles.includes(c.position)
      );
      const nPieces = c.count * (o.qty || 1);
      const totalLen = c.length * nPieces;
      if (!matches.length) {
        unresolved.push({ mark: o.mark, system: o.system, position: c.position, totalInches: totalLen });
        continue;
      }
      const pt = posTotals[o.system] || (posTotals[o.system] = {});
      pt[c.position] = (pt[c.position] || 0) + totalLen;
      for (const match of matches) {
        const key = match.system + '|' + match.partNumber;
        if (!buckets.has(key)) {
          buckets.set(key, {
            system: match.system,
            partNumber: match.partNumber,
            description: match.description,
            rolesUsed: new Set(),
            totalInches: 0,
            pieces: [],   // 单件长度清单,给摆料用
            stockInches: match.stockInches || STOCK_INCHES,
          });
        }
        const b = buckets.get(key);
        b.totalInches += totalLen;
        for (let i = 0; i < nPieces; i++) b.pieces.push(c.length);
        b.rolesUsed.add(c.position);
      }
    }
  }

  const rows = [...buckets.values()].map(b => {
    const stock = b.stockInches || STOCK_INCHES;
    const { sticks, over } = packFFD(b.pieces, stock);     // 余量前: 真实摆料
    const stocksWaste = sticks > 0 ? Math.ceil(sticks * WASTE_FACTOR) : 0; // 余量后: ceil(A×1.2)
    return {
      ...b,
      rolesUsed: [...b.rolesUsed],
      stocks: sticks,
      stocksWaste,
      oversize: over,
    };
  });

  // Sort: IR501T first, then 450, then by partNumber
  rows.sort((a, b) => {
    const sa = SYSTEMS.indexOf(a.system);
    const sb = SYSTEMS.indexOf(b.system);
    if (sa !== sb) return sa - sb;
    return a.partNumber.localeCompare(b.partNumber, undefined, { numeric: true });
  });

  // Unresolved aggregation by sys+pos
  const unMap = new Map();
  for (const u of unresolved) {
    const k = u.system + '|' + u.position;
    if (!unMap.has(k)) unMap.set(k, { system: u.system, position: u.position, totalInches: 0, count: 0 });
    const r = unMap.get(k);
    r.totalInches += u.totalInches;
    r.count += 1;
  }

  return { rows, unresolved: [...unMap.values()], posTotals };
}

// 报表角色行展开状态(key = system|position)。默认折叠(先看角色总长)。
const reportExpanded = new Set();
document.addEventListener('click', e => {
  // 角色下"移出 part"(改该 part 的 roles)
  const rm = e.target.closest && e.target.closest('[data-rmrole]');
  if (rm) {
    const sp = rm.getAttribute('data-rmrole').split('|');
    const pos = sp.pop(), pid = sp.join('|');
    const p = state.parts.find(x => x.id === pid);
    if (p) { p.roles = (p.roles || []).filter(r => r !== pos); save(); renderReport(); renderMeta(); renderParts(); }
    return;
  }
  // 角色行折叠/展开
  const g = e.target.closest && e.target.closest('#report-body .role-group');
  if (!g) return;
  const k = g.dataset.rolegroup;
  if (reportExpanded.has(k)) reportExpanded.delete(k); else reportExpanded.add(k);
  renderReport();
});
// 角色下"加入 part"(下拉)
document.addEventListener('change', e => {
  const sel = e.target.closest && e.target.closest('[data-addrole]');
  if (!sel || !sel.value) return;
  const sp = sel.getAttribute('data-addrole').split('|');
  const pos = sp.pop();
  const p = state.parts.find(x => x.id === sel.value);
  if (p && !(p.roles || []).includes(pos)) { p.roles = [...(p.roles || []), pos]; save(); renderReport(); renderMeta(); renderParts(); }
});
function renderReport() {
  const wrap = document.getElementById('report-body');
  const { rows, unresolved, posTotals } = buildReport();

  if (!rows.length && !unresolved.length) {
    wrap.innerHTML = `
      <div class="tk-report-empty">
        ${ico('inbox')}
        <div>Add openings and parts to generate the consolidated takeoff.</div>
      </div>`;
    return;
  }

  let html = `
    <div style="padding:6px 16px; font:600 11px var(--af-font-sans,system-ui); letter-spacing:.12em; text-transform:uppercase; color:var(--af-fg-3,#888);">By Role — 各角色总下料长(点开看由哪些 part 组成)</div>
    <div class="tk-table-wrap">
      <table class="tk-report-table">
        <thead>
          <tr>
            <th>Role</th>
            <th class="num">Cut Length</th>
            <th class="num"></th>
            <th class="num"></th>
          </tr>
        </thead>
        <tbody>`;

  // 系统顺序(SYSTEMS_LIST), 角色顺序(POSITIONS)
  const sysOrder = SYSTEMS_LIST().filter(s => rows.some(r => r.system === s))
    .concat([...new Set(rows.map(r => r.system))].filter(s => !SYSTEMS_LIST().includes(s)));
  for (const sys of sysOrder) {
    html += `<tr class="sys-break"><td colspan="4">${escHtml(sys)}</td></tr>`;
    const posOfSys = posTotals[sys] || {};
    const positions = POSITIONS.filter(p => (posOfSys[p] || 0) > 0 || rows.some(r => r.system === sys && r.rolesUsed.includes(p)));
    for (const pos of positions) {
      const assigned = state.parts.filter(p => p.system === sys && (p.roles || []).includes(pos));
      const key = sys + '|' + pos;
      const open = reportExpanded.has(key);
      html += `
        <tr class="role-group" data-rolegroup="${escAttr(key)}" style="cursor:pointer;">
          <td><span style="font-weight:600;">${open ? '▾' : '▸'} ${escHtml(pos)}</span> <span class="roles">· ${assigned.length} parts</span></td>
          <td class="num" style="font-weight:600;">${formatNumber(posOfSys[pos] || 0)}″</td>
          <td class="num"></td><td class="num"></td>
        </tr>`;
      // 组成可改: 列出该角色下的 part(垃圾桶=移出该角色), 末行下拉=把现有 part 加入该角色
      if (open) {
        for (const p of assigned) {
          html += `
            <tr class="role-part">
              <td style="padding-left:26px;">
                <span class="pn">${escHtml(p.partNumber)}</span>
                <span class="desc">${escHtml(p.description || '—')}</span>
                <button class="tk-rowdel-btn" data-rmrole="${escAttr(p.id + '|' + pos)}" title="把该 part 移出「${escAttr(pos)}」" style="margin-left:6px;">${ico('trash')}</button>
              </td>
              <td class="num"></td><td class="num"></td><td class="num"></td>
            </tr>`;
        }
        const cands = state.parts.filter(p => p.system === sys && !(p.roles || []).includes(pos));
        if (cands.length) {
          html += `
            <tr class="role-part">
              <td style="padding-left:26px;">
                <select class="tk-cell-select" data-addrole="${escAttr(sys + '|' + pos)}" style="max-width:300px;">
                  <option value="">+ 加入 part…</option>
                  ${cands.map(p => `<option value="${escAttr(p.id)}">${escHtml(p.partNumber)} — ${escHtml(p.description || '')}</option>`).join('')}
                </select>
              </td>
              <td class="num"></td><td class="num"></td><td class="num"></td>
            </tr>`;
        }
      }
    }
  }

  html += `</tbody></table></div>`;

  // 按-part 订料清单: 每个 part 一行, 根数 = 该 part 所有角色叠加(只出现一次)
  html += `
    <div style="padding:14px 16px 6px; font:600 11px var(--af-font-sans,system-ui); letter-spacing:.12em; text-transform:uppercase; color:var(--af-fg-3,#888);">By Part — 订料清单(根数 = 全角色叠加)</div>
    <div class="tk-table-wrap">
      <table class="tk-report-table">
        <thead>
          <tr>
            <th>Part #</th>
            <th class="num">Cut Length</th>
            <th class="num">24′ Stocks / 根</th>
            <th class="num">+ 20%</th>
          </tr>
        </thead>
        <tbody>`;
  let curSys = null;
  for (const r of rows) {
    if (r.system !== curSys) { curSys = r.system; html += `<tr class="sys-break"><td colspan="4">${escHtml(r.system)}</td></tr>`; }
    html += `
      <tr>
        <td>
          <span class="pn">${escHtml(r.partNumber)}</span>
          <span class="desc">${escHtml(r.description || '—')}</span>
          <span class="roles">${r.rolesUsed.join(' · ')}</span>
        </td>
        <td class="num">${formatNumber(r.totalInches)}″</td>
        <td class="num"><span class="stocks">${r.stocks}</span></td>
        <td class="num">${r.stocksWaste}</td>
      </tr>`;
  }
  html += `</tbody></table></div>`;

  if (unresolved.length) {
    html += `
      <div style="padding: 16px 20px; background:#fff7f3; border-top:1px solid var(--af-line);">
        <div style="font-family:var(--af-font-sans); font-size:11px; font-weight:600; letter-spacing:0.14em; text-transform:uppercase; color:var(--af-danger); margin-bottom:8px;">Unresolved cuts — no part assigned for these roles</div>
        <table class="tk-report-table" style="background:transparent;">
          <thead>
            <tr><th>System</th><th>Position</th><th class="num">Total Inches</th></tr>
          </thead>
          <tbody>
            ${unresolved.map(u => `
              <tr>
                <td><span class="pn">${u.system}</span></td>
                <td>${u.position}</td>
                <td class="num">${formatNumber(u.totalInches)}″</td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  }

  wrap.innerHTML = html;
}

function renderMeta() {
  const { rows } = buildReport();
  const totalIn = rows.reduce((a, r) => a + r.totalInches, 0);
  const totalStocks = rows.reduce((a, r) => a + r.stocks, 0);
  const totalStocksWaste = rows.reduce((a, r) => a + r.stocksWaste, 0);
  document.getElementById('meta-inches').innerHTML = `${formatNumber(totalIn)}<span class="unit">in</span>`;
  document.getElementById('meta-waste').innerHTML  = `${totalStocks}<span class="unit">pcs</span>`;
  document.getElementById('meta-stocks').innerHTML = `${totalStocksWaste}<span class="unit">pcs</span>`;
  document.getElementById('meta-openings').textContent = state.openings.length;
  document.getElementById('meta-parts').textContent = state.parts.length;
  const totalQty = state.openings.reduce((a, o) => a + (parseInt(o.qty)||0), 0);
  document.getElementById('meta-totalqty').textContent = totalQty;
}

// ============================================================
//  FORMATTING / ESCAPING
// ============================================================
function formatNumber(n) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function escAttr(s) { return escHtml(s); }

// ============================================================
//  EVENT HANDLERS
// ============================================================
function onPartsChange(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const p = state.parts.find(x => x.id === tr.dataset.id);
  if (!p) return;
  const field = e.target.dataset.field;
  if (!field) return;
  if (field === 'system') p.system = e.target.value;
  else if (field === 'partNumber') p.partNumber = e.target.value.trim();
  else if (field === 'description') p.description = e.target.value;
  renderReport(); renderMeta(); save();
}

function onPartsClick(e) {
  // 系统分组标题: 折叠/展开
  const grp = e.target.closest('.sys-group');
  if (grp) {
    const sys = grp.dataset.sysgroup;
    if (partsExpanded.has(sys)) partsExpanded.delete(sys); else partsExpanded.add(sys);
    renderParts();
    return;
  }
  // role chip toggle
  const role = e.target.closest('.tk-role');
  if (role) {
    const tr = role.closest('tr[data-id]');
    const p = state.parts.find(x => x.id === tr.dataset.id);
    const r = role.dataset.role;
    if (p.roles.includes(r)) p.roles = p.roles.filter(x => x !== r);
    else p.roles = [...p.roles, r];
    role.classList.toggle('is-on');
    renderReport(); renderMeta(); save();
    return;
  }
  const del = e.target.closest('[data-action="del-part"]');
  if (del) {
    const tr = del.closest('tr[data-id]');
    state.parts = state.parts.filter(x => x.id !== tr.dataset.id);
    renderParts(); renderReport(); renderMeta(); save();
  }
}

function onOpeningsInput(e) {
  const tr = e.target.closest('tr[data-id]');
  if (!tr) return;
  const o = state.openings.find(x => x.id === tr.dataset.id);
  if (!o) return;
  const f = e.target.dataset.field;
  if (!f) return;
  if (f === 'mark') o.mark = e.target.value;
  else if (f === 'system') {
    o.system = e.target.value;
    // 改成 1600 → 按 4 类重新归类(基于已解析几何);改完重画整表
    if (is1600(o.system) && Array.isArray(o.cuts) && o.cuts.length) { reclassify1600(o); renderOpenings(); }
  }
  else if (['qty','width','height','horiz','vert','lites'].includes(f)) o[f] = parseFloat(e.target.value) || 0;

  // Light update — only re-render report + meta + the row's total cell
  renderReport(); renderMeta();
  const totalCell = tr.querySelectorAll('td')[8];
  if (totalCell) totalCell.querySelector('span').textContent = `${formatNumber(openingTotalInches(o))}"`;
  save();
}

function onOpeningsClick(e) {
  const view = e.target.closest('[data-action="view-opening"]');
  if (view) {
    const tr = view.closest('tr[data-id]');
    renderViewer(tr.dataset.id);
    return;
  }
  const del = e.target.closest('[data-action="del-opening"]');
  if (del) {
    const tr = del.closest('tr[data-id]');
    state.openings = state.openings.filter(x => x.id !== tr.dataset.id);
    renderOpenings(); renderReport(); renderMeta(); save();
  }
}

// ---------- Add part ----------
function addPart() {
  const sys = (state.openings.find(o => o.system) || {}).system || SYSTEMS_LIST()[0] || 'IR501T';
  const p = { id: uid(), system: sys, partNumber: '', description: '', roles: [] };
  state.parts.push(p);
  partsExpanded.add(sys);   // 确保新 part 所在系统组展开, 否则被折叠藏起来看不见
  renderParts(); save();
  // focus 新行的 partNumber(按 id 精确取, 防空)
  const inp = document.querySelector(`#parts-tbody tr[data-id="${p.id}"] input[data-field="partNumber"]`);
  if (inp) inp.focus();
}

// ---------- Quick-add opening ----------
function addOpeningFromQuick() {
  const mark = document.getElementById('qa-mark').value.trim() || `SF-${String(state.openings.length+1).padStart(2,'0')}`;
  const system = document.getElementById('qa-system').value;
  const width  = parseFloat(document.getElementById('qa-width').value) || 0;
  const height = parseFloat(document.getElementById('qa-height').value) || 0;
  const qty    = parseInt(document.getElementById('qa-qty').value) || 1;
  if (width <= 0 || height <= 0) { flash('qa-status', 'Width & height required', true); return; }
  state.openings.push({ id: uid(), mark, system, qty, width, height, horiz: 0, vert: 0 });
  // clear form
  document.getElementById('qa-mark').value = '';
  document.getElementById('qa-width').value = '';
  document.getElementById('qa-height').value = '';
  document.getElementById('qa-qty').value = '1';
  renderOpenings(); renderReport(); renderMeta(); save();
  flash('qa-status', `Added ${mark}`, false);
}

function flash(id, msg, isErr) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = msg;
  el.className = 'tk-dxf__status ' + (isErr ? 'is-err' : 'is-ok');
  setTimeout(() => { el.textContent = ''; el.className = 'tk-dxf__status'; }, 2400);
}

// ============================================================
//  DXF / TEXT PASTE PARSER
//  Heuristic parser — accepts rows in flexible formats:
//    SF-01  IR501T   72   96   2
//    SF-02, 450, 60x84, qty 3
//    Mark: SF-03   System: IR501T   72" x 96"   Q: 4
//  Extracts: mark, system, width, height, qty
// ============================================================
function parseDxfText(text) {
  const dxfOpenings = parseRawDxfOpenings(text);
  if (dxfOpenings) return dxfOpenings;

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const out = [];
  const errors = [];

  for (const raw of lines) {
    // Skip header-ish lines
    if (/^(mark|tag|opening|system|qty|width|height)\b/i.test(raw) && /\b(mark|tag|opening)\b/i.test(raw) && /\b(width|height|qty|system)\b/i.test(raw)) continue;

    // Detect system
    let system = null;
    if (/\bIR\s*501\s*T\b/i.test(raw)) system = 'IR501T';
    else if (/\b450\b/i.test(raw) || /\b451\s*T\b/i.test(raw)) system = '450';

    // Width × height pattern: "72x96" "72 x 96" "72\" x 96\"" "72.5 × 96"
    let width = null, height = null;
    const wh = raw.match(/(\d+(?:\.\d+)?)\s*["”]?\s*[x×X*]\s*(\d+(?:\.\d+)?)\s*["”]?/);
    if (wh) {
      width = parseFloat(wh[1]);
      height = parseFloat(wh[2]);
    }

    // Mark: "SF-01" "F-3" "ENT-2" or first token
    let mark = null;
    const markMatch = raw.match(/\b([A-Z]{1,4}[-\s]?\d{1,3}[A-Z]?)\b/i);
    if (markMatch) mark = markMatch[1].toUpperCase().replace(/\s+/, '-');

    // Qty: "qty 3" "q: 4" "x4" "(3)" or trailing integer
    let qty = 1;
    const qtyM = raw.match(/\b(?:qty|q|count|#)\s*[:=]?\s*(\d+)\b/i)
              || raw.match(/\((\d+)\)\s*$/)
              || raw.match(/\bx\s*(\d+)\b/i);
    if (qtyM) qty = parseInt(qtyM[1]);

    // If width/height not found via WxH, try the alternate pattern:
    // tokens separated by comma/tab/pipe: mark, sys, w, h, qty
    if (!wh) {
      const tokens = raw.split(/[,\t|]/).map(t => t.trim()).filter(Boolean);
      if (tokens.length >= 4) {
        // Try to find two consecutive numeric tokens as w, h
        for (let i = 0; i < tokens.length - 1; i++) {
          const a = parseFloat(tokens[i]); const b = parseFloat(tokens[i+1]);
          if (!isNaN(a) && !isNaN(b) && a > 0 && b > 0 && tokens[i].match(/^\d+(\.\d+)?["”]?$/) && tokens[i+1].match(/^\d+(\.\d+)?["”]?$/)) {
            width = a; height = b;
            break;
          }
        }
        // First non-numeric token is mark if not found
        if (!mark) {
          const first = tokens.find(t => /[A-Za-z]/.test(t) && !/^(ir501t|450|451t)$/i.test(t));
          if (first) mark = first.toUpperCase();
        }
      }
    }

    if (!system || !width || !height) {
      errors.push(raw);
      continue;
    }
    if (!mark) mark = `SF-${String(out.length+1).padStart(2,'0')}`;
    out.push({ id: uid(), mark, system, qty, width, height, horiz: 0, vert: 0 });
  }

  return { openings: out, errors };
}

function parseRawDxfOpenings(text) {
  if (!/\bSECTION\b/i.test(text) || !/\bENTITIES\b/i.test(text)) return null;
  const pairs = dxfPairs(text);
  const entities = dxfCollectEntities(pairs, 'ENTITIES');
  const blocks = dxfCollectBlocks(pairs);
  const allEntities = [...entities];
  for (const insert of entities.filter(e => e.type === 'INSERT').map(dxfInsertSummary)) {
    const block = blocks.get(insert.block);
    if (!block) continue;
    for (const child of block) allEntities.push(dxfTransformEntity(child, insert));
  }
  // Collect ALL alum + door subframe polylines (no outline dependency)
  const profiles = allEntities
    .filter(e => /POLYLINE|LWPOLYLINE/i.test(e.type) || e.type === 'LINE')
    .map(dxfPolylineSummary)
    .filter(p => p && p.width >= 0 && p.height >= 0);
  // Sill-flashing lines (thin wide horizontals, h<1) are commonly drawn on the
  // outline/scope layers — admit only that shape from those layers.
  const flashingLike = p => p.height < 1 && p.width > 10;
  const alumDoorPolys = profiles.filter(p =>
    p.layer === LAYER_CONFIG.alum ||
    p.layer === LAYER_CONFIG.doorSubframe ||
    LAYER_CONFIG.fallbacks.includes(p.layer) ||
    ((p.layer === LAYER_CONFIG.outline || p.layer === LAYER_CONFIG.scope) && flashingLike(p))
  );
  // Marks
  const labels = allEntities
    .filter(e => /^M?TEXT$/i.test(e.type))
    .map(dxfMtextSummary)
    .filter(t => t && /^(WS|WN)\d+$/i.test(t.text));
  // Cluster polys spatially → each cluster = 1 elevation
  const clusters = clusterPolys(alumDoorPolys, 20);
  const openings = [];
  const used = new Set();
  for (const c of clusters) {
    // Match nearest mark above the cluster
    let best = null, bestScore = 1e9;
    for (const lbl of labels) {
      if (used.has(lbl.handle)) continue;
      const inX = c.bbox.minX - 3 <= lbl.x && lbl.x <= c.bbox.maxX + 3;
      const above = lbl.y > c.bbox.maxY;
      const d = Math.hypot(lbl.x - c.centerX, lbl.y - c.centerY);
      const score = d + (inX ? 0 : 500) + (above ? 0 : 300);
      if (score < bestScore) { bestScore = score; best = lbl; }
    }
    if (best) used.add(best.handle);
    const mark = best ? best.text.toUpperCase() : `EL-${String(openings.length+1).padStart(2,'0')}`;
    const system = dxfSystemForMark(mark);
    // 几何识别(不分图层): 凡"真实框料"(细长矩形, min(w,h)>=1 且 max(w,h)>=10)都进分类池;
    // 薄 flashing(h<1 且宽)走 Subsill。门按几何判("底部无 sill 且跨内有 transom bar = 门")。
    const alumPool = c.polys.filter(p =>
      (Math.min(p.width, p.height) >= 1 && Math.max(p.width, p.height) >= 10) ||
      (p.height < 1 && p.width > 10)  // flashing → Subsill
    );
    const cuts = dxfDetectCuts(c.bbox, alumPool, []);
    const lites = dxfCountLites(alumPool);
    openings.push({
      id: uid(), mark, system, qty: 1, lites,
      width: dxfRound(c.bbox.width),
      height: dxfRound(c.bbox.height),
      horiz: cuts.filter(c => c.position === 'Horizontal').reduce((a,c) => a + c.count, 0),
      vert: cuts.filter(c => c.position === 'Vertical').reduce((a,c) => a + c.count, 0),
      cuts,
    });
  }
  return { openings, errors: [] };
}

// Spatial union-find clustering of polylines by bbox proximity
function clusterPolys(polys, eps) {
  if (!polys.length) return [];
  const n = polys.length;
  const parent = Array.from({length: n}, (_, i) => i);
  function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
  function union(a, b) { const ra = find(a), rb = find(b); if (ra !== rb) parent[ra] = rb; }
  const GRID = 50;
  const buckets = new Map();
  for (let i = 0; i < n; i++) {
    const p = polys[i];
    for (let bx = Math.floor(p.minX / GRID); bx <= Math.floor(p.maxX / GRID) + 1; bx++) {
      for (let by = Math.floor(p.minY / GRID); by <= Math.floor(p.maxY / GRID) + 1; by++) {
        const key = bx + ',' + by;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(i);
      }
    }
  }
  function near(a, b) {
    return !(a.maxX + eps < b.minX || b.maxX + eps < a.minX || a.maxY + eps < b.minY || b.maxY + eps < a.minY);
  }
  const checked = new Set();
  for (const [key, list] of buckets) {
    const [bx, by] = key.split(',').map(Number);
    for (const i of list) {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const nbrs = buckets.get((bx+dx) + ',' + (by+dy));
        if (!nbrs) continue;
        for (const j of nbrs) {
          if (i >= j) continue;
          const k = i + ',' + j;
          if (checked.has(k)) continue;
          checked.add(k);
          if (near(polys[i], polys[j])) union(i, j);
        }
      }
    }
  }
  const groups = new Map();
  for (let i = 0; i < n; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r).push(polys[i]);
  }
  const clusters = [];
  for (const members of groups.values()) {
    if (members.length < 3) continue;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const m of members) {
      minX = Math.min(minX, m.minX); minY = Math.min(minY, m.minY);
      maxX = Math.max(maxX, m.maxX); maxY = Math.max(maxY, m.maxY);
    }
    const w = maxX - minX, h = maxY - minY;
    if (w < 5 || h < 5) continue;
    clusters.push({
      bbox: { minX, minY, maxX, maxY, width: w, height: h, centerX: (minX+maxX)/2, centerY: (minY+maxY)/2 },
      polys: members,
      centerX: (minX+maxX)/2,
      centerY: (minY+maxY)/2,
    });
  }
  return clusters;
}


// 数中梃网格的格子数 ≈ 玻璃片数(含 spandrel;门洞会多计 1 格/樘,表里可手改)。
// 竖件 xmid 定 bay 边界,跨过 bay 中心的横件定层数,每 bay 格数 = 层数 − 1。
function dxfCountLites(alumProfiles) {
  const H = alumProfiles.filter(p => p.width > p.height && p.height >= 1);
  const V = alumProfiles.filter(p => p.height > p.width && p.width >= 1);
  if (!V.length || !H.length) return 0;
  const xs = [...new Set(V.map(v => Math.round((v.minX + v.maxX) / 2)))].sort((a, b) => a - b);
  let lites = 0;
  for (let i = 0; i + 1 < xs.length; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2;
    const levels = new Set(H.filter(h => h.minX <= cx && h.maxX >= cx).map(h => Math.round((h.minY + h.maxY) / 2 / 3)));
    lites += Math.max(0, levels.size - 1);
  }
  return lites;
}

function dxfDetectCuts(outline, alumProfiles, doorSubframe, opts) {
  const noDoors = !!(opts && opts.noDoors); // true: 关门检测,subframe 料按普通框料分
  // outline is a synthesized cluster bbox; we DON'T pre-add Head/Sill/Jamb
  // Classify each polyline by its position within the cluster
  const cuts = [];
  const addCut = (position, length, count = 1, src = null, extra = null) => {
    if (length > 0 && count > 0) {
      const cut = { position, length: dxfRound(length), count };
      if (src) cut.src = { x: dxfRound(src.minX), y: dxfRound(src.minY), w: dxfRound(src.width), h: dxfRound(src.height), layer: src.layer };
      if (extra) Object.assign(cut, extra);
      cuts.push(cut);
    }
  };

  // Classify alum profiles (geometric: 横件 w>h, 竖件 h>w, 薄料 h<1)
  const horizontals = alumProfiles.filter(p => p.width > p.height && p.height >= 1);
  const verticals = alumProfiles.filter(p => p.height > p.width && p.width >= 1);
  const thin = alumProfiles.filter(p => p.height < 1 && p.width > 10);

  // ---- 几何门检测: 立面按"竖件列"切成 bay; bay 底部(floorY 附近)无横料(sill) = 门(空挡即门) ----
  // 门头 = 跨该 bay、底部之上最低的那根横料(transom bar); 没有横料则全高门(头取该 bay 竖件顶)。
  const doorHeads = [];
  if (verticals.length >= 2) {
    const floorY = Math.min(...verticals.map(v => v.minY));
    const sillTol = Math.max(6, (outline.height || 0) * 0.06);
    const colMap = new Map();
    for (const v of verticals) {
      const k = Math.round((v.minX + v.maxX) / 2);
      if (!colMap.has(k)) colMap.set(k, []);
      colMap.get(k).push(v);
    }
    const colXs = [...colMap.keys()].sort((a, b) => a - b);
    for (let i = 0; i + 1 < colXs.length; i++) {
      const xL = colXs[i], xR = colXs[i + 1];
      const spans = h => h.minX <= xL + 2 && h.maxX >= xR - 2;
      // bay 底部有横料 → 窗
      if (horizontals.some(h => spans(h) && (h.minY + h.maxY) / 2 <= floorY + sillTol)) continue;
      // 空挡即门: 门头取跨该 bay、底部之上最低的横料; 没有则全高门(头取该 bay 竖件顶)
      const caps = horizontals.filter(h => spans(h) && (h.minY + h.maxY) / 2 > floorY + sillTol);
      const inBayVerts = verticals.filter(v => { const x = (v.minX + v.maxX) / 2; return x >= xL - 2 && x <= xR + 2; });
      if (!inBayVerts.length) continue;
      const headY = caps.length
        ? Math.min(...caps.map(h => (h.minY + h.maxY) / 2))
        : Math.max(...inBayVerts.map(v => v.maxY));
      doorHeads.push({ minX: xL, maxX: xR, minY: headY, maxY: headY, width: xR - xL });
    }
  }
  // Helper: 竖件属于哪个门(门 bay 的左右边竖件 = door jamb)
  function findDoorFor(v) {
    const x = (v.minX + v.maxX) / 2;
    for (const d of doorHeads) if (Math.abs(x - d.minX) < 3 || Math.abs(x - d.maxX) < 3) return d;
    return null;
  }

  // HEAD/SILL/HORIZONTAL by Y
  const vTopYs = [...new Set(verticals.map(v => Math.round(v.maxY * 10) / 10))].sort((a,b) => b - a);
  const vBotYs = [...new Set(verticals.map(v => Math.round(v.minY * 10) / 10))].sort((a,b) => a - b);
  const headYs = new Set(vTopYs.slice(0, 2));
  const sillYs = new Set(vBotYs.slice(0, 2));
  // 跨某个门 bay、且在该门头高度的横料 → Transom Bar(门头)
  const isDoorHeadBar = (h) => doorHeads.some(d =>
    Math.abs((h.minY + h.maxY) / 2 - d.minY) < 5 && h.minX >= d.minX - 2 && h.maxX <= d.maxX + 2);
  for (const h of horizontals) {
    if (isDoorHeadBar(h)) { addCut('Transom Bar', h.width, 1, h); continue; }
    if ([...headYs].some(y => Math.abs(h.maxY - y) < 1)) { addCut('Head', h.width, 1, h); continue; }
    if ([...sillYs].some(y => Math.abs(h.minY - y) < 1)) { addCut('Sill', h.width, 1, h); continue; }
    addCut('Horizontal', h.width, 1, h);
  }

  // Vertical classification
  const vXs = [...new Set(verticals.map(v => Math.round((v.minX + v.maxX) / 2 * 10) / 10))].sort((a,b) => a - b);
  const jambXs = vXs.length ? new Set([vXs[0], vXs[vXs.length - 1]]) : new Set();
  // Typical vertical width for corner detection
  const vWidthsSorted = verticals.map(v => v.width).sort((a,b) => a - b);
  const typicalVW = vWidthsSorted.length ? vWidthsSorted[Math.floor(vWidthsSorted.length / 2)] : 2.75;
  for (const v of verticals) {
    const xmid = (v.minX + v.maxX) / 2;
    const xkey = Math.round(xmid * 10) / 10;
    const isJamb = jambXs.has(xkey);
    const myDoor = findDoorFor(v);
    // 转角料: 宽度≈普通竖通的两倍(看宽度, 不看位置), 且优先于门判定, 不被门吃掉。
    const isCorner = v.width >= 1.7 * typicalVW;
    if (isCorner) {
      addCut('Outside 90° Corner', v.height, 1, v);
    } else if (myDoor) {
      const upper = Math.max(0, v.maxY - myDoor.minY);
      const lower = Math.max(0, myDoor.minY - v.minY);
      // 边门框(同时是 elevation 最边 jamb)的 transom 以上段打标记: 450 出料时按 Jamb 计
      if (upper > 0.5) addCut('Door Jamb At Transom', upper, 1, v, isJamb ? { edgeDoorJamb: true } : null);
      if (lower > 0.5) addCut('Door Jamb', lower, 1, v);
    } else if (isJamb) {
      addCut('Jamb', v.height, 1, v);
    } else {
      addCut('Vertical', v.height, 1, v);
    }
  }
  // Each drawn door head → one Transom Bar piece (synthesized heads have no drawn bar)
  // (Transom Bar 已在上面横料分类里按门头发出, 此处不再重复)
  // Subsills
  for (const s of thin) addCut('Subsill', s.width, 1, s);
  // HEAD synthesis: if no head detected, use outline width
  if (!cuts.some(c => c.position === 'Head') && verticals.length) {
    const jambW = verticals[0].width || 2.75;
    addCut('Head', Math.max(0, outline.width - 2 * jambW));
  }
  return cuts;
}

// 1600 专用归类:基于已解析的 cut.src 几何,只分 4 类,不做门检测。
// 判定原则(用户定义):"某一侧没有相邻横料 = 周边"
//   竖料: 只有一边有横料 → Jamb;两边都有 → Vertical
//   横料: 上方没有横料(本跨最顶) → Head;下方没有 → Sill;上下都有 → Horizontal
// 这样能扛阶梯底/门洞:角部抬高的底料、门头横料都按"本跨上下邻居"正确归类,
// 而不是用全局最高/最低一条线。门洞处被拆成两段的竖料(共用 src)去重合回整根。
function reclassify1600(o) {
  if (!o || !Array.isArray(o.cuts) || !o.cuts.length) return;
  const seen = new Set(), boxes = [];
  for (const c of o.cuts) {
    if (!c.src) continue;
    const s = c.src, key = [s.x, s.y, s.w, s.h].join(',');
    if (seen.has(key)) continue;
    seen.add(key); boxes.push(s);
  }
  if (!boxes.length) return;   // 无溯源几何(手填)→ 不动
  const H = o.height || 1, W = o.width || 1;
  const tx = Math.max(2, W * 0.01), ty = Math.max(2, H * 0.01);
  const mk = (s) => ({ s, x0: s.x, x1: s.x + s.w, y0: s.y, y1: s.y + s.h, xc: s.x + s.w / 2, yc: s.y + s.h / 2 });
  const horiz = boxes.filter(s => s.w >= s.h).map(mk);
  const vert  = boxes.filter(s => s.h > s.w).map(mk);
  const coversX = (h, x) => h.x0 <= x + 0.001 && h.x1 >= x - 0.001;            // 横料是否盖住某 x 点
  const ovX = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);          // x 区间重叠量
  const near = (a, b) => ovX(a, b) > Math.min(a.x1 - a.x0, b.x1 - b.x0) * 0.4; // 视为上下相邻
  const cuts = [];
  // 竖料:看左右两侧紧邻处有没有横料
  for (const v of vert) {
    const rel = horiz.filter(h => h.y1 >= v.y0 - ty && h.y0 <= v.y1 + ty);     // y 区间相交的横料
    const left  = rel.some(h => coversX(h, v.xc - tx));
    const right = rel.some(h => coversX(h, v.xc + tx));
    cuts.push({ position: (left && right) ? 'Vertical' : 'Jamb', length: dxfRound(v.s.h), count: 1, src: { ...v.s } });
  }
  // 横料:看上方/下方(x 区间重叠)有没有横料;门头(抬高且下方无料)单列 Transom Bar
  const botRef = horiz.length ? Math.min(...horiz.map(g => g.yc)) : 0;
  for (const h of horiz) {
    const above = horiz.some(g => g !== h && g.yc > h.yc + ty && near(g, h));
    const below = horiz.some(g => g !== h && g.yc < h.yc - ty && near(g, h));
    let pos;
    if (above && below) pos = 'Horizontal';
    else if (!above && !below) pos = (h.yc > H / 2) ? 'Head' : 'Sill';         // 孤立件按上/下半场
    else if (!above) pos = 'Head';                                             // 上无下有 → 本跨最顶 = Head
    else pos = (h.yc <= botRef + H * 0.2) ? 'Sill' : 'Transom Bar';            // 上有下无 → 近底=Sill,抬高=门头(单独算)
    cuts.push({ position: pos, length: dxfRound(h.s.w), count: 1, src: { ...h.s } });
  }
  o.cuts = cuts;
  o.horiz = cuts.filter(c => c.position === 'Horizontal').length;
  o.vert  = cuts.filter(c => c.position === 'Vertical').length;
}

function dxfSystemForMark(mark) {
  const clean = String(mark || '').toUpperCase().replace(/\s+/g, '');
  const exterior = new Set([
    'WN1', 'WN2', 'WN3', 'WN4',
    'WS12', 'WS13', 'WS14', 'WS15', 'WS16', 'WS17', 'WS18', 'WS19',
    'WS20', 'WS21', 'WS22', 'WS23', 'WS24', 'WS25', 'WS26', 'WS27',
    'WS28', 'WS29', 'WS30', 'WS31', 'WS32', 'WS33', 'WS34',
    'WS46', 'WS47',
  ]);
  const interior = new Set([
    'WN5',
    'WS1', 'WS2', 'WS3', 'WS4', 'WS5', 'WS6', 'WS7', 'WS8', 'WS9',
    'WS10', 'WS11',
    'WS35', 'WS36', 'WS37', 'WS38', 'WS39', 'WS40', 'WS41', 'WS42',
    'WS43', 'WS44', 'WS45',
  ]);
  if (exterior.has(clean)) return 'IR501T';
  if (interior.has(clean)) return '450';
  const sys = SYSTEMS_LIST();
  return sys[0] || 'IR501T';
}

function dxfPairs(text) {
  const lines = text.split(/\r?\n/);
  const pairs = [];
  for (let i = 0; i < lines.length - 1; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (!Number.isNaN(code)) pairs.push([code, lines[i + 1].trim()]);
  }
  return pairs;
}

function dxfCollectEntities(pairs, sectionName) {
  let section = null;
  let pendingSection = false;
  let current = null;
  const entities = [];

  for (const [code, value] of pairs) {
    if (code === 0 && value === 'SECTION') { pendingSection = true; continue; }
    if (pendingSection && code === 2) { section = value; pendingSection = false; continue; }
    if (code === 0 && value === 'ENDSEC') { section = null; continue; }
    if (section !== sectionName) continue;

    if (code === 0) {
      if (current) entities.push(current);
      current = { type: value, pairs: [] };
    } else if (current) {
      current.pairs.push([code, value]);
    }
  }
  if (current) entities.push(current);
  return entities;
}

function dxfCollectBlocks(pairs) {
  let section = null;
  let pendingSection = false;
  let blockName = null;
  let current = null;
  const blockEntities = [];
  const blocks = new Map();

  for (const [code, value] of pairs) {
    if (code === 0 && value === 'SECTION') { pendingSection = true; continue; }
    if (pendingSection && code === 2) { section = value; pendingSection = false; continue; }
    if (code === 0 && value === 'ENDSEC') { section = null; continue; }
    if (section !== 'BLOCKS') continue;

    if (code === 0 && value === 'BLOCK') {
      blockName = null;
      blockEntities.length = 0;
      current = null;
      continue;
    }
    if (code === 0 && value === 'ENDBLK') {
      if (current) blockEntities.push(current);
      if (blockName) blocks.set(blockName, blockEntities.map(e => ({ type: e.type, pairs: [...e.pairs] })));
      current = null;
      blockName = null;
      continue;
    }
    if (blockName === null && code === 2) {
      blockName = value;
      continue;
    }
    if (blockName === null) continue;

    if (code === 0) {
      if (current) blockEntities.push(current);
      current = { type: value, pairs: [] };
    } else if (current) {
      current.pairs.push([code, value]);
    }
  }
  return blocks;
}

function dxfValues(entity, code) {
  return entity.pairs.filter(([c]) => c === code).map(([, value]) => value);
}

function dxfValue(entity, code) {
  const values = dxfValues(entity, code);
  return values.length ? values[0] : '';
}

function dxfMtextSummary(entity) {
  return {
    text: dxfValue(entity, 1).trim(),
    x: parseFloat(dxfValue(entity, 10)),
    y: parseFloat(dxfValue(entity, 20)),
  };
}

function dxfInsertSummary(entity) {
  return {
    block: dxfValue(entity, 2),
    x: parseFloat(dxfValue(entity, 10)) || 0,
    y: parseFloat(dxfValue(entity, 20)) || 0,
    scaleX: parseFloat(dxfValue(entity, 41)) || 1,
    scaleY: parseFloat(dxfValue(entity, 42)) || 1,
  };
}

function dxfTransformEntity(entity, insert) {
  return {
    type: entity.type,
    pairs: entity.pairs.map(([code, value]) => {
      if (code === 10) return [code, String(insert.x + (parseFloat(value) || 0) * insert.scaleX)];
      if (code === 20) return [code, String(insert.y + (parseFloat(value) || 0) * insert.scaleY)];
      return [code, value];
    }),
  };
}

function dxfPolylineSummary(entity) {
  const xs = dxfValues(entity, 10).map(Number);
  const ys = dxfValues(entity, 20).map(Number);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    handle: dxfValue(entity, 5),
    layer: dxfValue(entity, 8),
    minX,
    maxX,
    minY,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function dxfTransformBox(box, insert) {
  const minX = insert.x + box.minX * insert.scaleX;
  const maxX = insert.x + box.maxX * insert.scaleX;
  const minY = insert.y + box.minY * insert.scaleY;
  const maxY = insert.y + box.maxY * insert.scaleY;
  return {
    ...box,
    handle: `${insert.block}:${box.handle}`,
    minX,
    maxX,
    minY,
    maxY,
    width: Math.abs(maxX - minX),
    height: Math.abs(maxY - minY),
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
  };
}

function dxfRound(value) {
  return Math.round(value * 1000) / 1000;
}

// ---------- System picker modal (import 追问 + 批量统一) ----------
// resolve 值: 系统名=套用该系统; null=保持自动识别(仅 import); undefined=取消(不改动)
function pickSystem({ title, msg, includeAuto } = {}) {
  return new Promise(resolve => {
    const modal = document.getElementById('system-modal');
    const choices = document.getElementById('system-modal-choices');
    if (!modal || !choices) { resolve(undefined); return; }
    document.getElementById('system-modal-title').textContent = title || '选择 System';
    document.getElementById('system-modal-msg').textContent = msg || '';
    const done = (val) => { modal.style.display = 'none'; choices.innerHTML = ''; modal.onclick = null; resolve(val); };
    choices.innerHTML = '';
    for (const s of SYSTEMS_LIST()) {
      const b = document.createElement('button');
      b.className = 'tk-btn tk-btn--dark'; b.textContent = s;
      b.onclick = () => done(s); choices.appendChild(b);
    }
    if (includeAuto) {
      const b = document.createElement('button');
      b.className = 'tk-btn tk-btn--ghost'; b.textContent = '保持自动识别 (per-mark)';
      b.onclick = () => done(null); choices.appendChild(b);
    }
    const c = document.createElement('button');
    c.className = 'tk-btn tk-btn--ghost'; c.textContent = '取消';
    c.onclick = () => done(undefined); choices.appendChild(c);
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) done(undefined); };
  });
}

async function setAllOpeningsSystem() {
  if (!state.openings.length) return;
  const sys = await pickSystem({
    title: '统一 System',
    msg: `把全部 ${state.openings.length} 个 opening 的 system 一键改成:`,
    includeAuto: false,
  });
  if (!sys) return; // 取消
  state.openings.forEach(o => { o.system = sys; if (is1600(sys)) reclassify1600(o); });
  save(); renderOpenings(); renderReport(); renderMeta();
}

function runDxfParse() {
  const ta = document.getElementById('dxf-text');
  appendParsedOpenings(parseDxfText(ta.value), ta);
}

async function appendParsedOpenings(result, sourceEl = null) {
  const { openings, errors } = result;
  const statusEl = document.getElementById('dxf-status');
  if (!openings.length) {
    statusEl.textContent = `0 openings parsed — check format`;
    statusEl.className = 'tk-dxf__status is-err';
    return;
  }
  if (state.openings.length &&
      !confirm(`Openings 表中已有 ${state.openings.length} 行,导入会追加(不会替换)。\n继续追加请按"确定";想重新开始请按"取消",先清掉旧行再导入。`)) {
    statusEl.textContent = 'Import cancelled — table unchanged';
    statusEl.className = 'tk-dxf__status is-err';
    return;
  }
  // 导入时追问这批属于哪个 system(一般一次只做一种)。选系统=整批套用;保持自动=用 per-mark 识别;取消=不导入。
  const sys = await pickSystem({
    title: 'Import — 选择 System',
    msg: `解析到 ${openings.length} 个 opening。这批属于哪个 system?(一般一次只做一种,选定后整批套用)`,
    includeAuto: true,
  });
  if (sys === undefined) {
    statusEl.textContent = 'Import cancelled — table unchanged';
    statusEl.className = 'tk-dxf__status is-err';
    return;
  }
  if (sys) openings.forEach(o => { o.system = sys; });
  if (is1600(sys)) openings.forEach(reclassify1600);
  state.openings.push(...openings);
  renderOpenings(); renderReport(); renderMeta(); save();
  const msg = `+${openings.length} openings added` + (errors.length ? ` · ${errors.length} skipped` : '');
  statusEl.textContent = msg;
  statusEl.className = 'tk-dxf__status ' + (errors.length ? 'is-err' : 'is-ok');
  if (sourceEl) sourceEl.value = '';
}

function importDxfFile() {
  document.getElementById('dxf-file').click();
}

async function onDxfFileChange(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const statusEl = document.getElementById('dxf-status');
  try {
    const text = await file.text();
    // Try real DXF geometry parse first; fall back to text/schedule parser
    let result = null;
    if (text.includes('SECTION') && text.includes('ENTITIES')) {
      try { result = parseRawDxfOpenings(text); } catch (e) { console.warn('DXF parse failed, falling back to text:', e); }
    }
    if (!result || !result.openings || !result.openings.length) {
      result = parseDxfText(text);
    }
    await appendParsedOpenings(result);
    statusEl.textContent = `${file.name}: ${statusEl.textContent}`;
  } catch (err) {
    statusEl.textContent = `Could not read ${file.name}`;
    statusEl.className = 'tk-dxf__status is-err';
  } finally {
    e.target.value = '';
  }
}

function loadDxfSample() {
  const sample = `SF-01  IR501T  72  96   2
SF-02, IR501T, 60x84, qty 3
ENT-1   IR501T   84" x 108"   x1
F-3   450   48 x 96    (4)
F-4   450   36 x 84    qty: 6`;
  document.getElementById('dxf-text').value = sample;
}

// ============================================================
//  EXPORT
// ============================================================
function exportCsv() {
  const { rows, unresolved } = buildReport();
  const lines = [];
  lines.push(['System','Part Number','Description','Roles','Total Cut Length (in)','Stocks (FFD, pcs)','Stocks +20% (pcs)','Oversize (pcs)','Oversize Lengths (in)']
    .map(csvEsc).join(','));
  for (const r of rows) {
    lines.push([
      r.system, r.partNumber, r.description, r.rolesUsed.join(' / '),
      r.totalInches.toFixed(2), r.stocks, r.stocksWaste,
      r.oversize.length, r.oversize.map(o => o.toFixed(2)).join(' / ')
    ].map(csvEsc).join(','));
  }
  if (unresolved.length) {
    lines.push('');
    lines.push('UNRESOLVED — no part assigned for these positions');
    lines.push(['System','Position','Total Cut Length (in)'].map(csvEsc).join(','));
    for (const u of unresolved) {
      lines.push([u.system, u.position, u.totalInches.toFixed(2)].map(csvEsc).join(','));
    }
  }
  const accRows = computeAccessories();
  if (accRows.length) {
    lines.push('');
    lines.push('ACCESSORIES');
    lines.push(['Part Number','Description','Rule','Positions','Param','Min','Qty','Unit','Basis'].map(csvEsc).join(','));
    for (const { acc: a, qty, basis } of accRows) {
      lines.push([
        a.partNumber || '', a.description || '', (ACC_RULES[a.rule] || {}).label || a.rule,
        (a.positions || []).join(' / ') || '(all)', a.param, a.min || 0, qty, a.unit || 'ea', basis
      ].map(csvEsc).join(','));
    }
  }
  download('hillview-takeoff.csv', lines.join('\n'), 'text/csv');
}
function csvEsc(v) {
  const s = String(v ?? '');
  return /[,"\n]/.test(s) ? `"${s.replace(/"/g,'""')}"` : s;
}
function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}

function copyReport() {
  const { rows, unresolved } = buildReport();
  const COL = [22, 14, 38, 22, 14, 8, 8, 6];
  const pad = (s, n, right) => {
    s = String(s);
    if (s.length > n) s = s.slice(0, n-1)+'…';
    return right ? s.padStart(n) : s.padEnd(n);
  };
  const header = ['System','Part #','Description','Roles','Cut In.','Stocks','+20%','超长']
    .map((h,i) => pad(h, COL[i], i>=4)).join('  ');
  const rule = COL.map(n => '─'.repeat(n)).join('  ');
  const out = [header, rule];
  for (const r of rows) {
    out.push([
      pad(r.system, COL[0]),
      pad(r.partNumber, COL[1]),
      pad(r.description, COL[2]),
      pad(r.rolesUsed.join('/'), COL[3]),
      pad(formatNumber(r.totalInches), COL[4], true),
      pad(r.stocks, COL[5], true),
      pad(r.stocksWaste, COL[6], true),
      pad(r.oversize.length || '—', COL[7], true),
    ].join('  '));
  }
  if (unresolved.length) {
    out.push('');
    out.push('UNRESOLVED:');
    for (const u of unresolved) {
      out.push(`  ${u.system}  ${u.position.padEnd(12)}  ${formatNumber(u.totalInches).padStart(10)}"`);
    }
  }
  const text = out.join('\n');
  navigator.clipboard.writeText(text).then(() => {
    flash('export-status', 'Report copied to clipboard', false);
  }, () => {
    flash('export-status', 'Copy failed', true);
  });
}

// ============================================================
//  RESET
// ============================================================
function importPartList(text, format) {
  // format: 'json' (array of {system, partNumber, description, roles:[]}) or 'csv'
  // CSV columns: system, partNumber, description, role1, role2, ...
  let parts = [];
  text = (text||'').trim();
  if (!text) return { ok:false, error:'empty input' };
  if (format === 'json' || text.startsWith('[') || text.startsWith('{')) {
    try {
      const data = JSON.parse(text);
      parts = (Array.isArray(data) ? data : data.parts || []).map(p => ({
        id: uid(),
        system: String(p.system || p.System || '').trim(),
        partNumber: String(p.partNumber || p.part || p['Part #'] || p['Part'] || '').trim(),
        description: String(p.description || p.desc || p['Description'] || '').trim(),
        roles: Array.isArray(p.roles) ? p.roles : (p.role ? [p.role] : []),
      })).filter(p => p.partNumber);
    } catch (e) { return { ok:false, error:'JSON parse: '+e.message }; }
  } else {
    // CSV/TSV
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    const sep = lines[0].includes('\t') ? '\t' : ',';
    const header = lines[0].split(sep).map(s => s.trim().toLowerCase());
    const iSys = header.findIndex(h => /system/i.test(h));
    const iPn  = header.findIndex(h => /part/i.test(h) && /num|#/i.test(h));
    const iDesc= header.findIndex(h => /desc/i.test(h));
    const iRoleStart = header.findIndex(h => /role|position/i.test(h));
    if (iPn < 0) return { ok:false, error:'no Part Number column' };
    for (const ln of lines.slice(1)) {
      const cols = ln.split(sep).map(s => s.trim());
      const roles = iRoleStart >= 0 ? cols.slice(iRoleStart).filter(Boolean) : [];
      parts.push({
        id: uid(),
        system: iSys >= 0 ? cols[iSys] : '',
        partNumber: cols[iPn],
        description: iDesc >= 0 ? cols[iDesc] : '',
        roles,
      });
    }
  }
  if (!parts.length) return { ok:false, error:'no rows parsed' };
  state.parts = parts;
  state.partsDbVersion = (state.partsDbVersion||0) + 1;
  save();
  renderAll();
  return { ok:true, count:parts.length };
}
window.importPartList = importPartList;

function resetAll() {
  if (!confirm('Clear all parts and openings? This cannot be undone.')) return;
  state = { partsDbVersion: PARTS_DB_VERSION, parts: cloneSeedParts(), openings: [], accessories: cloneSeedAccessories() };
  renderAll();
}
function clearOpenings() {
  if (!state.openings.length) return;
  if (!confirm('Remove all openings? Parts database stays.')) return;
  state.openings = [];
  renderOpenings(); renderReport(); renderMeta(); save();
}

// ============================================================
//  WIRE UP
// ============================================================
function init() {
  // Parts
  const partsBody = document.getElementById('parts-tbody');
  partsBody.addEventListener('input', onPartsChange);
  partsBody.addEventListener('change', onPartsChange);
  partsBody.addEventListener('click', onPartsClick);
  document.getElementById('add-part').addEventListener('click', addPart);

  // Import Parts button → file picker
  const importPartsBtn = document.getElementById('import-parts');
  const partsFileInput = document.getElementById('parts-file');
  if (importPartsBtn && partsFileInput) {
    importPartsBtn.addEventListener('click', () => partsFileInput.click());
    partsFileInput.addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const text = await file.text();
      const fmt = file.name.toLowerCase().endsWith('.json') ? 'json' : 'csv';
      const result = importPartList(text, fmt);
      flash('qa-status', result.ok ? `Imported ${result.count} parts` : ('Error: '+result.error), !result.ok);
      e.target.value = '';
    });
  }

  // Layer Config button → open modal
  const lcBtn = document.getElementById('layer-config');
  const lcModal = document.getElementById('layer-config-modal');
  const lcOpen = () => {
    document.getElementById('lc-alum').value = LAYER_CONFIG.alum || '';
    document.getElementById('lc-doorSubframe').value = LAYER_CONFIG.doorSubframe || '';
    document.getElementById('lc-outline').value = LAYER_CONFIG.outline || '';
    document.getElementById('lc-door').value = LAYER_CONFIG.door || '';
    document.getElementById('lc-fallbacks').value = (LAYER_CONFIG.fallbacks || []).join(',');
    lcModal.style.display = 'flex';
  };
  const lcClose = () => { lcModal.style.display = 'none'; };
  if (lcBtn && lcModal) {
    lcBtn.addEventListener('click', lcOpen);
    document.getElementById('lc-cancel').addEventListener('click', lcClose);
    document.getElementById('lc-save').addEventListener('click', () => {
      setLayerConfig({
        alum: document.getElementById('lc-alum').value.trim(),
        doorSubframe: document.getElementById('lc-doorSubframe').value.trim(),
        outline: document.getElementById('lc-outline').value.trim(),
        door: document.getElementById('lc-door').value.trim(),
        fallbacks: document.getElementById('lc-fallbacks').value.split(',').map(s => s.trim()).filter(Boolean),
      });
      lcClose();
    });
    lcModal.addEventListener('click', (e) => { if (e.target === lcModal) lcClose(); });
  }


  // Openings
  const opsBody = document.getElementById('openings-tbody');
  opsBody.addEventListener('input', onOpeningsInput);
  opsBody.addEventListener('change', onOpeningsInput);
  opsBody.addEventListener('click', onOpeningsClick);
  document.getElementById('add-opening').addEventListener('click', addOpeningFromQuick);
  document.getElementById('clear-openings').addEventListener('click', clearOpenings);
  const setAllSysBtn = document.getElementById('set-all-system');
  if (setAllSysBtn) setAllSysBtn.addEventListener('click', setAllOpeningsSystem);

  // DXF
  document.getElementById('dxf-import').addEventListener('click', importDxfFile);
  document.getElementById('dxf-file').addEventListener('change', onDxfFileChange);
  document.getElementById('dxf-parse').addEventListener('click', runDxfParse);
  document.getElementById('dxf-sample').addEventListener('click', loadDxfSample);

  // Export
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('copy-report').addEventListener('click', copyReport);
  document.getElementById('reset-all').addEventListener('click', resetAll);

  renderAll();
}

document.addEventListener('DOMContentLoaded', init);
