'use strict';

let SETTINGS = { fontScale: 100, bgType: 'solid', bgSolid: '#f3f5fa', bgGradA: '#e8f0fe', bgGradB: '#f3e8ff', remarkBg: '#eef2ff', summaryBg: '#fffbeb', sort: 'asc', dataPath: '' };
let META = { statuses: [], reasons: [] };
let state = { active: [], idle: [], eliminated: [] };
let idSeq = 0;
let searchQuery = '';
const collapsed = { active: false, idle: false, eliminated: false };

const DEFAULT_SETTINGS = { fontScale: 100, bgType: 'solid', bgSolid: '#f3f5fa', bgGradA: '#e8f0fe', bgGradB: '#f3e8ff', remarkBg: '#eef2ff', summaryBg: '#fffbeb', sort: 'asc', dataPath: '' };
const SOLID_PRESETS = ['#f3f5fa', '#eef4fb', '#eef7f1', '#fdf3f4', '#f7f5ef', '#ffffff'];
const GRAD_PRESETS = [['#e8f0fe', '#f3e8ff'], ['#e0f7fa', '#e8f5e9'], ['#fce4ec', '#fff3e0'], ['#e3f2fd', '#f3e5f5']];
const REMARK_PRESETS = ['#eef2ff', '#fef9c3', '#dcfce7', '#fce7f3', '#fde68a', '#e2e8f0', '#ffffff'];
const SUMMARY_PRESETS = ['#fffbeb', '#fef3c7', '#eef2ff', '#fce7f3', '#dcfce7', '#ffffff'];

const STATUS_COLORS = {
  '线下投递': { bg: '#eef2ff', fg: '#4f46e5', bd: '#c7d2fe' },
  '申请':     { bg: '#eff6ff', fg: '#2563eb', bd: '#bfdbfe' },
  '已投递':   { bg: '#e0f2fe', fg: '#0284c7', bd: '#bae6fd' },
  '待处理':   { bg: '#fef3c7', fg: '#b45309', bd: '#fde68a' },
  '初筛':     { bg: '#ccfbf1', fg: '#0f766e', bd: '#99f6e4' },
  '评估中':   { bg: '#f3e8ff', fg: '#7c3aed', bd: '#ddd6fe' },
  '部门筛选': { bg: '#ede9fe', fg: '#6d28d9', bd: '#ddd6fe' },
  '测评/笔试': { bg: '#fff7ed', fg: '#c2410c', bd: '#fed7aa' },
  '面试':     { bg: '#dcfce7', fg: '#15803d', bd: '#bbf7d0' },
  '等待offer': { bg: '#fce7f3', fg: '#be185d', bd: '#fbcfe8' },
  '意向':     { bg: '#fef9c3', fg: '#a16207', bd: '#fde047' },
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function chipColor(s) { return STATUS_COLORS[s] || { bg: '#f1f3f9', fg: '#4b5563', bd: '#e5e7eb' }; }
function fmtDate(it) {
  if (it.month && it.day) return it.month + '月' + it.day + '日';
  if (it.month) return it.month + '月';
  return '未填写';
}
function genId() { idSeq++; return 'n' + idSeq + '_' + Date.now().toString(36); }
function dateVal(it) { return (it.month && it.day) ? (it.month * 100 + it.day) : null; }
function sortItems(arr) {
  const asc = SETTINGS.sort !== 'desc';
  return arr.slice().sort(function (a, b) {
    const va = dateVal(a), vb = dateVal(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return asc ? (va - vb) : (vb - va);
  });
}

function urlLink(url) {
  if (!url) return '<span class="meta-item">🔗 <span class="label">网址</span>未填写</span>';
  const isHttp = /^https?:\/\//i.test(url);
  const txt = url.length > 36 ? url.slice(0, 36) + '…' : url;
  if (isHttp) {
    return '<span class="meta-item">🔗 <span class="label">网址</span><a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' + esc(txt) + '</a></span>';
  }
  return '<span class="meta-item">🔗 <span class="label">网址</span>' + esc(txt) + '</span>';
}
function remarkBlock(it) {
  return (it.remark && String(it.remark).trim()) ? '<div class="card-remark">📝 ' + esc(it.remark) + '</div>' : '';
}
function statusChips(statuses, id) {
  const chips = (statuses || []).map(function (s, i) {
    const c = chipColor(s);
    return '<span class="chip" style="background:' + c.bg + ';color:' + c.fg + ';border-color:' + c.bd + '">'
      + esc(s)
      + '<button data-action="status-left" data-id="' + id + '" data-idx="' + i + '" title="前移">‹</button>'
      + '<button data-action="status-right" data-id="' + id + '" data-idx="' + i + '" title="后移">›</button>'
      + '<button class="x" data-action="status-del" data-id="' + id + '" data-idx="' + i + '" title="删除">×</button>'
      + '</span>';
  }).join('');
  const opts = META.statuses.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
  return '<div class="chips">' + chips
    + '<select class="chip-add" data-action="status-add" data-id="' + id + '">'
    + '<option value="">＋ 状态</option>' + opts + '</select></div>';
}
function starBtn(it) {
  return '<button class="star-btn' + (it.focus ? ' on' : '') + '" data-action="focus" data-id="' + it.id + '" title="' + (it.focus ? '取消重点关注' : '设为重点关注') + '">' + (it.focus ? '★' : '☆') + '</button>';
}
function focusBadge(it) {
  if (!it.focus) return '';
  return '<div class="focus-badge" data-action="focus-edit" data-id="' + it.id + '" title="点击编辑重点标签">⏰ 重点：' + esc(it.focusNote || '未填写标签') + '</div>';
}

function metaBlock(it) {
  return '<div class="card-meta">'
    + '<span class="meta-item">📅 <span class="label">投递时间</span>' + esc(fmtDate(it)) + '</span>'
    + '<span class="meta-item">💼 <span class="label">岗位</span>' + esc(it.position || '未填写') + '</span>'
    + urlLink(it.url)
    + '</div>';
}

function activeCard(it) {
  return '<div class="card' + (it.focus ? ' is-focus' : '') + '" data-id="' + it.id + '">'
    + '<div class="card-top"><div class="card-name">' + esc(it.name) + '</div>' + starBtn(it) + '</div>'
    + focusBadge(it)
    + metaBlock(it)
    + remarkBlock(it)
    + statusChips(it.statuses, it.id)
    + '<div class="card-actions">'
    + '<button class="btn btn-plain" data-action="edit" data-id="' + it.id + '">编辑</button>'
    + '<button class="btn btn-ghost" data-action="idle" data-id="' + it.id + '">长期无更新</button>'
    + '<button class="btn btn-ghost" data-action="eliminate" data-id="' + it.id + '">标记淘汰</button>'
    + '<button class="btn btn-danger" data-action="delete" data-id="' + it.id + '">删除</button>'
    + '</div></div>';
}
function idleCard(it) {
  return '<div class="card is-idle' + (it.focus ? ' is-focus' : '') + '" data-id="' + it.id + '">'
    + '<div class="card-top"><div class="card-name">' + esc(it.name) + '</div>'
    + '<div class="card-top-right">' + starBtn(it) + '<span class="idle-tag">◔ 长期无状态更新</span></div></div>'
    + focusBadge(it)
    + metaBlock(it)
    + remarkBlock(it)
    + statusChips(it.statuses, it.id)
    + '<div class="card-actions">'
    + '<button class="btn btn-plain" data-action="edit" data-id="' + it.id + '">编辑</button>'
    + '<button class="btn btn-ghost" data-action="restore" data-id="' + it.id + '">恢复进行中</button>'
    + '<button class="btn btn-ghost" data-action="eliminate" data-id="' + it.id + '">标记淘汰</button>'
    + '<button class="btn btn-danger" data-action="delete" data-id="' + it.id + '">删除</button>'
    + '</div></div>';
}
function elimCard(it) {
  return '<div class="card is-elim' + (it.focus ? ' is-focus' : '') + '" data-id="' + it.id + '">'
    + '<div class="card-top"><div class="card-name">' + esc(it.name) + '</div>'
    + '<div class="card-top-right">' + starBtn(it) + '<span class="reason-tag">✕ ' + esc(it.reason || '') + '</span></div></div>'
    + focusBadge(it)
    + metaBlock(it)
    + remarkBlock(it)
    + statusChips(it.statuses, it.id)
    + '<div class="card-actions">'
    + '<button class="btn btn-plain" data-action="restore" data-id="' + it.id + '">恢复</button>'
    + '<button class="btn btn-danger" data-action="delete" data-id="' + it.id + '">删除</button>'
    + '</div></div>';
}

function emptyHtml(msg) { return '<div class="empty">' + esc(msg) + '</div>'; }

function matches(it) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  return (it.position && it.position.toLowerCase().indexOf(q) >= 0) || (it.name && it.name.toLowerCase().indexOf(q) >= 0);
}
function filtered(arr) { return sortItems(arr).filter(matches); }

function focusedItems() {
  return sortItems(state.active.concat(state.idle, state.eliminated).filter(function (it) { return it.focus; }));
}
function renderFocusSummary() {
  const container = document.getElementById('focus-summary');
  if (!container) return;
  const items = focusedItems();
  if (!items.length) { container.style.display = 'none'; return; }
  container.style.display = 'block';
  document.getElementById('focus-summary-count').textContent = items.length;
  document.getElementById('focus-summary-list').innerHTML = items.map(function (it) {
    const note = it.focusNote || '重点关注';
    return '<button class="focus-summary-item" data-action="focus-jump" data-id="' + it.id + '">'
      + '<span class="fs-name">' + esc(it.name) + '</span>'
      + '<span class="fs-sep">·</span>'
      + '<span class="fs-note">' + esc(note) + '</span>'
      + '</button>';
  }).join('');
}
function layoutSummary() {
  const tb = document.querySelector('.topbar');
  const fs = document.getElementById('focus-summary');
  if (tb && fs) fs.style.top = (tb.offsetHeight + 8) + 'px';
}

function render() {
  document.getElementById('active-count').textContent = state.active.length;
  document.getElementById('idle-count').textContent = state.idle.length;
  document.getElementById('elim-count').textContent = state.eliminated.length;
  document.getElementById('active-list').innerHTML = state.active.length ? filtered(state.active).map(activeCard).join('') : emptyHtml('暂无进行中的投递，点击右上角「新增企业」开始记录');
  document.getElementById('idle-list').innerHTML = state.idle.length ? filtered(state.idle).map(idleCard).join('') : emptyHtml('暂无长期无状态更新的企业');
  document.getElementById('elim-list').innerHTML = state.eliminated.length ? filtered(state.eliminated).map(elimCard).join('') : emptyHtml('还没有被淘汰的企业');
  renderFocusSummary();
}

function findItem(id) {
  const all = [state.active, state.idle, state.eliminated];
  for (let k = 0; k < all.length; k++) {
    const arr = all[k];
    for (let j = 0; j < arr.length; j++) {
      if (arr[j].id === id) return { arr: arr, it: arr[j] };
    }
  }
  return null;
}

let toastTimer = null;
function showToast(msg, isErr) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.className = 'toast'; }, 2200);
}

async function persist() {
  try {
    const res = await fetch('/api/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state) });
    const data = await res.json();
    if (!data.ok) { showToast(data.error || '保存失败', true); return false; }
    if (data.saved === false) { showToast(data.message || '未指定数据文件，修改仅保留在本次会话'); }
    else { showToast('已保存到数据文件'); }
    return true;
  } catch (e) { showToast('保存失败：无法连接服务', true); return false; }
}

async function mutate(fn) { fn(); render(); await persist(); }

async function saveSettingsToServer() {
  try {
    await fetch('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(SETTINGS) });
  } catch (e) {}
}

/* ---------- 设置 ---------- */
function applySettings() {
  document.documentElement.style.zoom = String(SETTINGS.fontScale / 100);
  if (SETTINGS.bgType === 'gradient') {
    document.body.style.backgroundColor = '#f3f5fa';
    document.body.style.backgroundImage = 'linear-gradient(135deg, ' + SETTINGS.bgGradA + ', ' + SETTINGS.bgGradB + ')';
    document.body.style.backgroundAttachment = 'fixed';
  } else {
    document.body.style.backgroundColor = SETTINGS.bgSolid;
    document.body.style.backgroundImage = 'none';
    document.body.style.backgroundAttachment = '';
  }
  document.documentElement.style.setProperty('--remark-bg', SETTINGS.remarkBg);
  document.documentElement.style.setProperty('--summary-bg', SETTINGS.summaryBg);
  const sel = document.getElementById('sort-select');
  if (sel) sel.value = SETTINGS.sort;
  layoutSummary();
}

function openSettings() {
  const cur = Object.assign({}, SETTINGS);
  const html =
    '<h3>设置</h3>'
    + '<p class="modal-sub">调整显示效果，设置会保存在本机，重启后仍然生效</p>'
    + '<div class="setting-row"><label>整体字号</label>'
    + '<div class="range-wrap"><input type="range" id="set-scale" min="90" max="150" step="5" value="' + cur.fontScale + '">'
    + '<span class="range-val" id="set-scale-val">' + cur.fontScale + '%</span></div></div>'
    + '<div class="setting-row"><label>背景颜色</label>'
    + '<div class="seg"><button data-bgtype="solid" class="' + (cur.bgType === 'solid' ? 'on' : '') + '">纯色</button>'
    + '<button data-bgtype="gradient" class="' + (cur.bgType === 'gradient' ? 'on' : '') + '">渐变</button></div>'
    + '<div id="set-bg-swatches" class="swatches" style="margin-top:10px"></div>'
    + '<div id="set-bg-pickers" class="color-pair"></div></div>'
    + '<div class="setting-row"><label>备注背景色（仅备注块底色）</label>'
    + '<div id="set-remark-swatches" class="swatches"></div>'
    + '<div class="color-pair"><input type="color" id="set-remark-color" value="' + cur.remarkBg + '" title="自定义备注底色"> <span class="hint">自定义备注底色</span></div></div>'
    + '<div class="setting-row"><label>摘要栏背景色（顶部重点关注栏）</label>'
    + '<div id="set-summary-swatches" class="swatches"></div>'
    + '<div class="color-pair"><input type="color" id="set-summary-color" value="' + cur.summaryBg + '" title="自定义摘要栏底色"> <span class="hint">自定义摘要栏底色</span></div></div>'
    + '<div class="setting-row"><label>数据文件（Excel 路径）</label>'
    + '<input type="text" id="set-datapath" placeholder="留空则自动创建默认文件" value="' + esc(cur.dataPath || '') + '">'
    + '<div class="hint" style="margin-top:6px">点击「浏览」选择已有 Excel 文件；留空则软件自动创建并使用默认文件（data/投递.xlsx）。</div>'
    + '<div class="setting-inline">'
    + '<button class="btn btn-primary btn-sm" id="set-datapath-browse">浏览选择文件…</button>'
    + '<button class="btn btn-plain btn-sm" id="set-datapath-reset">恢复默认</button>'
    + '</div></div>'
    + '<div class="modal-foot">'
    + '<span class="setting-reset" id="set-reset">恢复默认</span>'
    + '<button class="btn btn-plain" id="set-cancel">取消</button>'
    + '<button class="btn btn-primary" id="set-save">保存</button></div>';
  openModal(html);

  const scale = document.getElementById('set-scale');
  const scaleVal = document.getElementById('set-scale-val');
  const segBtns = document.querySelectorAll('#modal-root .seg button');
  const bgSwEl = document.getElementById('set-bg-swatches');
  const bgPickEl = document.getElementById('set-bg-pickers');
  const remarkSwEl = document.getElementById('set-remark-swatches');
  const remarkColor = document.getElementById('set-remark-color');
  const summarySwEl = document.getElementById('set-summary-swatches');
  const summaryColor = document.getElementById('set-summary-color');

  scale.addEventListener('input', function () { cur.fontScale = +scale.value; scaleVal.textContent = scale.value + '%'; });

  function renderBgSwatches() {
    if (cur.bgType === 'solid') {
      bgSwEl.innerHTML = SOLID_PRESETS.map(function (c) {
        return '<button class="swatch' + (cur.bgSolid === c ? ' on' : '') + '" style="background:' + c + '" data-solid="' + c + '"></button>';
      }).join('');
    } else {
      bgSwEl.innerHTML = GRAD_PRESETS.map(function (g) {
        const on = (cur.bgGradA === g[0] && cur.bgGradB === g[1]) ? ' on' : '';
        return '<button class="swatch grad' + on + '" style="background:linear-gradient(135deg,' + g[0] + ',' + g[1] + ')" data-ga="' + g[0] + '" data-gb="' + g[1] + '"></button>';
      }).join('');
    }
  }
  function renderBgPickers() {
    if (cur.bgType === 'solid') {
      bgPickEl.innerHTML = '<input type="color" id="set-solid-color" value="' + cur.bgSolid + '" title="自定义纯色"> <span class="hint">自定义纯色</span>';
      document.getElementById('set-solid-color').addEventListener('input', function () { cur.bgSolid = this.value; renderBgSwatches(); });
    } else {
      bgPickEl.innerHTML = '<input type="color" id="set-ga" value="' + cur.bgGradA + '" title="起始颜色"> <input type="color" id="set-gb" value="' + cur.bgGradB + '" title="结束颜色"> <span class="hint">起始 / 结束</span>';
      document.getElementById('set-ga').addEventListener('input', function () { cur.bgGradA = this.value; renderBgSwatches(); });
      document.getElementById('set-gb').addEventListener('input', function () { cur.bgGradB = this.value; renderBgSwatches(); });
    }
  }
  function renderBg() { renderBgSwatches(); renderBgPickers(); }

  function renderRemark() {
    remarkSwEl.innerHTML = REMARK_PRESETS.map(function (c) {
      return '<button class="swatch' + (cur.remarkBg === c ? ' on' : '') + '" style="background:' + c + '" data-remark="' + c + '"></button>';
    }).join('');
  }
  renderRemark();
  remarkColor.addEventListener('input', function () { cur.remarkBg = this.value; renderRemark(); });

  function renderSummary() {
    summarySwEl.innerHTML = SUMMARY_PRESETS.map(function (c) {
      return '<button class="swatch' + (cur.summaryBg === c ? ' on' : '') + '" style="background:' + c + '" data-summary="' + c + '"></button>';
    }).join('');
  }
  renderSummary();
  summaryColor.addEventListener('input', function () { cur.summaryBg = this.value; renderSummary(); });

  const dpInput = document.getElementById('set-datapath');
  document.getElementById('set-datapath-reset').addEventListener('click', function () { dpInput.value = ''; });
  document.getElementById('set-datapath-browse').addEventListener('click', async function () {
    try {
      const res = await fetch('/api/pickfile', { method: 'POST' });
      const r = await res.json();
      if (r.ok && r.path) { dpInput.value = r.path; }
      else if (r.error) { showToast(r.error, true); }
    } catch (e) { showToast('无法打开文件选择框', true); }
  });

  renderBg();

  segBtns.forEach(function (b) {
    b.addEventListener('click', function () {
      cur.bgType = b.getAttribute('data-bgtype');
      segBtns.forEach(function (x) { x.classList.toggle('on', x === b); });
      renderBg();
    });
  });
  bgSwEl.addEventListener('click', function (e) {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    if (sw.hasAttribute('data-solid')) { cur.bgSolid = sw.getAttribute('data-solid'); cur.bgType = 'solid'; }
    else if (sw.hasAttribute('data-ga')) { cur.bgGradA = sw.getAttribute('data-ga'); cur.bgGradB = sw.getAttribute('data-gb'); cur.bgType = 'gradient'; }
    renderBg();
  });
  remarkSwEl.addEventListener('click', function (e) {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    if (sw.hasAttribute('data-remark')) { cur.remarkBg = sw.getAttribute('data-remark'); renderRemark(); }
  });
  summarySwEl.addEventListener('click', function (e) {
    const sw = e.target.closest('.swatch');
    if (!sw) return;
    if (sw.hasAttribute('data-summary')) { cur.summaryBg = sw.getAttribute('data-summary'); renderSummary(); }
  });

  document.getElementById('set-reset').addEventListener('click', function () {
    Object.assign(cur, DEFAULT_SETTINGS);
    scale.value = cur.fontScale; scaleVal.textContent = cur.fontScale + '%';
    segBtns.forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-bgtype') === cur.bgType); });
    renderBg(); renderRemark(); remarkColor.value = cur.remarkBg; renderSummary(); summaryColor.value = cur.summaryBg;
  });
  document.getElementById('set-cancel').addEventListener('click', closeModal);
  document.getElementById('set-save').addEventListener('click', async function () {
    cur.dataPath = document.getElementById('set-datapath').value.trim();
    SETTINGS = Object.assign({}, cur);
    applySettings();
    await saveSettingsToServer();
    closeModal();
    showToast('设置已保存');
    await load();
  });
}

/* ---------- 弹窗 ---------- */
function openModal(html) {
  closeModal();
  document.getElementById('modal-root').innerHTML = '<div class="modal-mask"><div class="modal">' + html + '</div></div>';
  const mask = document.querySelector('.modal-mask');
  if (mask) mask.addEventListener('mousedown', function (e) { if (e.target === mask) closeModal(); });
}
function closeModal() { document.getElementById('modal-root').innerHTML = ''; }

function monthOptions(sel) {
  let s = '<option value="">—</option>';
  for (let m = 1; m <= 12; m++) s += '<option value="' + m + '"' + (m === sel ? ' selected' : '') + '>' + m + '月</option>';
  return s;
}
function dayOptions(sel) {
  let s = '<option value="">—</option>';
  for (let d = 1; d <= 31; d++) s += '<option value="' + d + '"' + (d === sel ? ' selected' : '') + '>' + d + '日</option>';
  return s;
}

function openForm(item) {
  const isEdit = !!item;
  const statuses = item ? (item.statuses || []).slice() : [];
  const name = item ? item.name : '';
  const position = item ? item.position : '';
  const url = item ? item.url : '';
  const remark = item ? item.remark : '';
  const month = item && item.month ? item.month : '';
  const day = item && item.day ? item.day : '';

  const html =
    '<h3>' + (isEdit ? '编辑企业' : '新增企业') + '</h3>'
    + '<p class="modal-sub">' + (isEdit ? '修改后会自动保存到投递.xlsx' : '填写企业信息，投递时间仅需选择月/日') + '</p>'
    + '<div class="field"><label>企业名称 <span style="color:#e5484d">*</span></label>'
    + '<input type="text" id="f-name" placeholder="例如：华为" value="' + esc(name) + '"></div>'
    + '<div class="field"><label>投递时间（月份 / 日期）</label><div class="field-row">'
    + '<select id="f-month">' + monthOptions(month) + '</select>'
    + '<select id="f-day">' + dayOptions(day) + '</select></div></div>'
    + '<div class="field"><label>投递岗位</label>'
    + '<input type="text" id="f-position" placeholder="例如：嵌入式软件工程师" value="' + esc(position) + '"></div>'
    + '<div class="field"><label>网址</label>'
    + '<input type="url" id="f-url" placeholder="https://..." value="' + esc(url) + '"></div>'
    + '<div class="field"><label>备注</label>'
    + '<textarea id="f-remark" placeholder="其他注意事项（选填）">' + esc(remark) + '</textarea></div>'
    + '<div class="field"><label>投递状态（可依次添加多个，形成状态链）</label><div id="f-chips"></div></div>'
    + '<div class="modal-foot">'
    + '<button class="btn btn-plain" id="f-cancel">取消</button>'
    + '<button class="btn btn-primary" id="f-save">保存</button></div>';

  openModal(html);

  const chipsEl = document.getElementById('f-chips');
  function renderFormChips() {
    const chips = statuses.map(function (s, i) {
      const c = chipColor(s);
      return '<span class="chip" style="background:' + c.bg + ';color:' + c.fg + ';border-color:' + c.bd + '">'
        + esc(s) + '<button class="x" data-fidx="' + i + '" title="删除">×</button></span>';
    }).join('');
    const opts = META.statuses.map(function (s) { return '<option>' + esc(s) + '</option>'; }).join('');
    chipsEl.innerHTML = '<div class="chips">' + chips
      + '<select class="chip-add" id="f-status-add"><option value="">＋ 状态</option>' + opts + '</select></div>';
  }
  renderFormChips();

  chipsEl.addEventListener('click', function (e) {
    const b = e.target.closest('[data-fidx]');
    if (b) { statuses.splice(+b.getAttribute('data-fidx'), 1); renderFormChips(); }
  });
  chipsEl.addEventListener('change', function (e) {
    if (e.target.id === 'f-status-add' && e.target.value) { statuses.push(e.target.value); renderFormChips(); }
  });

  document.getElementById('f-cancel').addEventListener('click', closeModal);
  document.getElementById('f-save').addEventListener('click', async function () {
    const nameVal = document.getElementById('f-name').value.trim();
    if (!nameVal) { showToast('请填写企业名称', true); return; }
    const m = document.getElementById('f-month').value;
    const d = document.getElementById('f-day').value;
    const data = {
      name: nameVal,
      month: m ? +m : null,
      day: d ? +d : null,
      statuses: statuses,
      position: document.getElementById('f-position').value.trim(),
      url: document.getElementById('f-url').value.trim(),
      remark: document.getElementById('f-remark').value.trim()
    };
    if (isEdit) {
      Object.assign(item, data);
    } else {
      state.active.push(Object.assign({ id: genId(), reason: null, focus: false, focusNote: '' }, data));
    }
    closeModal();
    render();
    await persist();
  });
}

function openEliminate(id) {
  const f = findItem(id);
  if (!f) return;
  const html =
    '<h3>标记为已淘汰</h3>'
    + '<p class="modal-sub">为「' + esc(f.it.name) + '」选择淘汰原因</p>'
    + '<div class="reason-list">' + META.reasons.map(function (r) {
        return '<div class="reason-item" data-reason="' + esc(r) + '">' + esc(r) + '</div>';
      }).join('') + '</div>'
    + '<div class="modal-foot">'
    + '<button class="btn btn-plain" id="e-cancel">取消</button>'
    + '<button class="btn btn-danger" id="e-confirm">确认淘汰</button></div>';
  openModal(html);
  let chosen = null;
  const items = document.querySelectorAll('.reason-item');
  function pick(el) {
    items.forEach(function (x) { x.classList.remove('on'); });
    el.classList.add('on');
    chosen = el.getAttribute('data-reason');
  }
  items.forEach(function (el) { el.addEventListener('click', function () { pick(el); }); });
  document.getElementById('e-cancel').addEventListener('click', closeModal);
  document.getElementById('e-confirm').addEventListener('click', async function () {
    if (!chosen) { showToast('请选择一个淘汰原因', true); return; }
    const f2 = findItem(id);
    if (!f2) { closeModal(); return; }
    const i = f2.arr.indexOf(f2.it);
    const moved = f2.arr.splice(i, 1)[0];
    moved.reason = chosen;
    state.eliminated.push(moved);
    closeModal();
    render();
    await persist();
  });
}

function openFocusNote(item) {
  const html =
    '<h3>设置重点关注</h3>'
    + '<p class="modal-sub">为「' + esc(item.name) + '」填写重点标签，例如节点或截止日期</p>'
    + '<div class="field"><label>重点标签（手动输入）</label>'
    + '<input type="text" id="fn-note" placeholder="例如：笔试截止 10月5日 10:00" value="' + esc(item.focusNote || '') + '"></div>'
    + '<div class="modal-foot"><button class="btn btn-plain" id="fn-cancel">取消</button>'
    + '<button class="btn btn-primary" id="fn-save">设为重点关注</button></div>';
  openModal(html);
  document.getElementById('fn-cancel').addEventListener('click', closeModal);
  document.getElementById('fn-save').addEventListener('click', async function () {
    const note = document.getElementById('fn-note').value.trim();
    if (!note) { showToast('请输入重点标签内容', true); return; }
    item.focus = true;
    item.focusNote = note;
    closeModal();
    render();
    await persist();
  });
}

function openConfirm(title, text, onOk) {
  const html =
    '<h3>' + esc(title) + '</h3>'
    + '<p class="modal-sub">' + esc(text) + '</p>'
    + '<div class="modal-foot">'
    + '<button class="btn btn-plain" id="c-cancel">取消</button>'
    + '<button class="btn btn-danger" id="c-ok">确认</button></div>';
  openModal(html);
  document.getElementById('c-cancel').addEventListener('click', closeModal);
  document.getElementById('c-ok').addEventListener('click', async function () {
    closeModal();
    if (onOk) await onOk();
  });
}

/* ---------- 事件绑定 ---------- */
document.addEventListener('click', function (e) {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.getAttribute('data-action');
  const id = btn.getAttribute('data-id');
  const f = id ? findItem(id) : null;

  if (action === 'collapse') {
    const p = btn.getAttribute('data-panel');
    collapsed[p] = !collapsed[p];
    const panel = btn.closest('.panel');
    if (panel) panel.classList.toggle('collapsed', collapsed[p]);
    btn.textContent = collapsed[p] ? '▸' : '▾';
    return;
  }
  if (action === 'add') { openForm(null); return; }
  if (action === 'edit') { if (f) openForm(f.it); return; }
  if (action === 'eliminate') { if (f) openEliminate(id); return; }
  if (action === 'idle') {
    if (f) mutate(function () {
      const i = f.arr.indexOf(f.it);
      const moved = f.arr.splice(i, 1)[0];
      state.idle.push(moved);
    });
    return;
  }
  if (action === 'restore') {
    if (f) mutate(function () {
      const i = f.arr.indexOf(f.it);
      const moved = f.arr.splice(i, 1)[0];
      moved.reason = null;
      state.active.push(moved);
    });
    return;
  }
  if (action === 'delete') {
    if (!f) return;
    openConfirm('删除企业', '确定删除「' + f.it.name + '」吗？该操作不可撤销。', function () {
      return mutate(function () { f.arr.splice(f.arr.indexOf(f.it), 1); });
    });
    return;
  }
  if (action === 'focus-jump') {
    const card = document.querySelector('.card[data-id="' + id + '"]');
    if (card) {
      const panel = card.closest('.panel');
      if (panel && panel.classList.contains('collapsed')) {
        panel.classList.remove('collapsed');
        const pname = panel.getAttribute('data-panel');
        if (pname) collapsed[pname] = false;
        const cb = panel.querySelector('.collapse-btn');
        if (cb) cb.textContent = '▾';
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.classList.add('flash');
      setTimeout(function () { card.classList.remove('flash'); }, 1400);
    }
    return;
  }
  if (action === 'focus') {
    if (!f) return;
    if (f.it.focus) { mutate(function () { f.it.focus = false; }); }
    else { openFocusNote(f.it); }
    return;
  }
  if (action === 'focus-edit') {
    if (f) openFocusNote(f.it);
    return;
  }
  if (action === 'status-del') {
    if (!f) return;
    const idx = +btn.getAttribute('data-idx');
    mutate(function () { f.it.statuses.splice(idx, 1); });
    return;
  }
  if (action === 'status-left') {
    if (!f) return;
    const idx = +btn.getAttribute('data-idx');
    if (idx > 0) mutate(function () {
      const arr = f.it.statuses;
      const t = arr[idx]; arr[idx] = arr[idx - 1]; arr[idx - 1] = t;
    });
    return;
  }
  if (action === 'status-right') {
    if (!f) return;
    const idx = +btn.getAttribute('data-idx');
    if (idx < f.it.statuses.length - 1) mutate(function () {
      const arr = f.it.statuses;
      const t = arr[idx]; arr[idx] = arr[idx + 1]; arr[idx + 1] = t;
    });
    return;
  }
});

document.addEventListener('change', function (e) {
  const sel = e.target.closest('select[data-action="status-add"]');
  if (sel) {
    const id = sel.getAttribute('data-id');
    const val = sel.value;
    if (val) {
      const f = findItem(id);
      if (f) mutate(function () { f.it.statuses.push(val); });
      sel.value = '';
    }
    return;
  }
});

document.getElementById('btn-add').addEventListener('click', function () { openForm(null); });
document.getElementById('btn-settings').addEventListener('click', openSettings);
document.getElementById('sort-select').addEventListener('change', async function () {
  SETTINGS.sort = this.value;
  render();
  await saveSettingsToServer();
});
document.getElementById('search-input').addEventListener('input', function () {
  searchQuery = this.value.trim();
  render();
});
window.addEventListener('resize', layoutSummary);
let lastScrollY = window.pageYOffset || 0;
window.addEventListener('scroll', function () {
  const y = window.pageYOffset || 0;
  const fs = document.getElementById('focus-summary');
  if (!fs || fs.style.display === 'none') return;
  const delta = y - lastScrollY;
  if (y <= 0) { fs.classList.remove('hidden'); }
  else if (delta > 4) { fs.classList.add('hidden'); }
  else if (delta < -4) { fs.classList.remove('hidden'); }
  lastScrollY = y;
}, { passive: true });

async function load() {
  try {
    const [data, settings] = await Promise.all([
      (await fetch('/api/data')).json(),
      (await fetch('/api/settings')).json()
    ]);
    META.statuses = data.statuses || [];
    META.reasons = data.reasons || [];
    state.active = data.active || [];
    state.idle = data.idle || [];
    state.eliminated = data.eliminated || [];
    const rawSettings = settings || {};
    delete rawSettings.suggestedPath;
    SETTINGS = Object.assign({}, DEFAULT_SETTINGS, rawSettings);
    applySettings();
    render();
  } catch (e) {
    showToast('加载失败，请刷新页面', true);
  }
}

applySettings();
load();