'use strict';

// ── Supabase 초기화 ────────────────────────────────────────────
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
const TABLE = 'orders';
const LOGS_TABLE = 'order_logs';

// ── 상태 ──────────────────────────────────────────────────────
let items = [];
let editId = null;
let statusFilter = 'all';
let selectedIds = new Set();
let currentUser = null; // 매 세션마다 이름 입력 (localStorage 캐시 제거)

// 카테고리 → 색상 맵
const CAT_PALETTES = [
  { bg: '#eff4ff', color: '#1d4ed8' },
  { bg: '#ecfdf3', color: '#067647' },
  { bg: '#fff7ed', color: '#c2410c' },
  { bg: '#fdf4ff', color: '#7e22ce' },
  { bg: '#fffbeb', color: '#92400e' },
  { bg: '#f0fdfa', color: '#0f766e' },
  { bg: '#fef2f2', color: '#b91c1c' },
  { bg: '#f0f9ff', color: '#0369a1' },
];
const catColorMap = {};
let catColorIdx = 0;
function getCatStyle(cat) {
  if (!catColorMap[cat]) {
    catColorMap[cat] = CAT_PALETTES[catColorIdx % CAT_PALETTES.length];
    catColorIdx++;
  }
  return catColorMap[cat];
}

// ── 사용자 변경 ───────────────────────────────────────────────
function changeUser() {
  currentUser = null;
  ensureUserName();
}

// ── 초기화 ────────────────────────────────────────────────────
async function init() {
  await ensureUserName();  //이름
  await fetchAll();
  subscribeRealtime();
  document.getElementById('filterAll')?.classList.add('stat-card-active');
}

function ensureUserName() {
  return new Promise((resolve) => {
    if (currentUser) { resolve(); return; }

    const bg = document.createElement('div');
    bg.style.cssText = `
      position:fixed;inset:0;background:rgba(0,0,0,.5);
      z-index:9999;display:flex;align-items:center;justify-content:center;
    `;
    bg.innerHTML = `
      <div style="background:#fff;border-radius:12px;padding:32px;width:340px;
                  box-shadow:0 8px 40px rgba(0,0,0,.2);text-align:center">
        <div style="font-size:28px;margin-bottom:12px">👤</div>
        <h2 style="margin:0 0 8px;font-size:18px">이름을 입력하세요</h2>
        <p style="color:#6b7280;font-size:13px;margin:0 0 20px">
          변경 이력에 수정자 이름이 기록됩니다.
        </p>
        <input id="userNameInput" type="text" placeholder="이름 입력"
          style="width:100%;box-sizing:border-box;padding:10px 14px;
                 border:1px solid #d1d5db;border-radius:8px;font-size:15px;margin-bottom:16px" />
        <button id="userNameConfirm"
          style="width:100%;padding:10px;background:var(--accent,#2563eb);color:#fff;
                 border:none;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">
          확인
        </button>
      </div>
    `;
    document.body.appendChild(bg);

    const input = bg.querySelector('#userNameInput');
    const btn   = bg.querySelector('#userNameConfirm');
    input.focus();

    function confirm() {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      currentUser = name;
      // localStorage 저장 제거 → 새 탭/새로고침마다 이름 다시 입력
      bg.remove();
      resolve();
    }

    btn.addEventListener('click', confirm);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  });
}

async function fetchAll() {
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .order('created_at', { ascending: false });
  if (error) { showToast('데이터 로드 실패: ' + error.message, 'error'); return; }
  items = data || [];
  renderTable();
}

// ── Realtime ──────────────────────────────────────────────────
function subscribeRealtime() {
  sb.channel('orders-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, handleRealtimeEvent)
    .subscribe((status) => {
      const dot = document.getElementById('realtimeDot');
      dot.style.background = status === 'SUBSCRIBED' ? 'var(--green)' : 'var(--amber)';
    });
}

function handleRealtimeEvent(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;
  if (eventType === 'INSERT') {
    items.unshift(newRow);
  } else if (eventType === 'UPDATE') {
    const idx = items.findIndex(i => i.id === newRow.id);
    if (idx >= 0) items[idx] = newRow; else items.unshift(newRow);
  } else if (eventType === 'DELETE') {
    items = items.filter(i => i.id !== oldRow.id);
    selectedIds.delete(oldRow.id);
  }
  renderTable();
}

// ── 렌더링 ────────────────────────────────────────────────────
function isCompleted(item) {
  return item.shipping_to_korea && item.factory_arrived && item.photo_taken && item.coupang_wing_registered;
}

function sortItems(list) {
  return list.sort((a, b) => {
    const ac = isCompleted(a) ? 1 : 0;
    const bc = isCompleted(b) ? 1 : 0;
    if (ac !== bc) return ac - bc;
    const aShip = a.shipping_to_korea ? 1 : 0;
    const bShip = b.shipping_to_korea ? 1 : 0;
    if (aShip !== bShip) return aShip - bShip;
    const aDate = a.ordered_at || a.created_at;
    const bDate = b.ordered_at || b.created_at;
    return new Date(bDate) - new Date(aDate);
  });
}

function getDupNames() {
  const count = {};
  items.forEach(i => { count[i.name] = (count[i.name] || 0) + 1; });
  return new Set(Object.keys(count).filter(k => count[k] > 1));
}

function setStatusFilter(filter) {
  statusFilter = filter;
  ['filterAll', 'filterKorea', 'filterFactory', 'filterRocket', 'filterPhoto'].forEach(id => {
    document.getElementById(id)?.classList.remove('stat-card-active');
  });
  const idMap = { all: 'filterAll', korea: 'filterKorea', factory: 'filterFactory', photo: 'filterPhoto', rocket: 'filterRocket' };
  document.getElementById(idMap[filter])?.classList.add('stat-card-active');
  renderTable();
}

function renderTable() {
  const catFilter = document.getElementById('catFilter').value;
  const search    = document.getElementById('searchInput').value.toLowerCase();
  const dups      = getDupNames();
  const dateFrom  = document.getElementById('dateFrom').value;
  const dateTo    = document.getElementById('dateTo').value;

  let list = items.filter(i => {
    const matchCat    = !catFilter || i.category === catFilter;
    const matchSearch = !search || i.sku.toLowerCase().includes(search) || i.name.toLowerCase().includes(search);
    let matchDate = true;
    if (dateFrom && dateTo) {
      const orderedDate = i.ordered_at ?? '';
      matchDate = orderedDate >= dateFrom && orderedDate <= dateTo;
    }
    let matchStatus = true;
    if (statusFilter === 'korea')   matchStatus = i.shipping_to_korea === false;
    else if (statusFilter === 'factory') matchStatus = i.factory_arrived === false;
    else if (statusFilter === 'photo')   matchStatus = i.photo_taken === false;
    else if (statusFilter === 'rocket')  matchStatus = i.coupang_wing_registered === false;
    return matchCat && matchSearch && matchDate && matchStatus;
  });
  list = sortItems(list);

  const tbody = document.getElementById('tableBody');
  if (list.length === 0) {
    tbody.innerHTML = '';
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('mainTable').style.display  = 'none';
  } else {
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('mainTable').style.display  = 'table';
    tbody.innerHTML = list.map(item => rowHTML(item, dups)).join('');
  }

  updateCatFilter();
  updateStats(dups);
  updateBulkBar();
}

function yesNo(val) {
  return val
    ? '<span class="badge badge-y">Y</span>'
    : '<span class="badge badge-n">N</span>';
}

function rowHTML(item, dups) {
  const usable   = Math.max(0, (item.qty || 0) - (item.broken || 0));
  const catStyle = getCatStyle(item.category);
  const dupBadge = dups.has(item.name) ? '<span class="badge-dup">중복</span>' : '';
  const checked  = selectedIds.has(item.id) ? 'checked' : '';
  const completed = isCompleted(item);
  const rowClass = completed ? 'row-completed' : (!item.shipping_to_korea ? 'row-shipping-n' : '');
  return `
    <tr class="${rowClass}">
      <td><input type="checkbox" ${checked} onchange="toggleSelect('${item.id}', this.checked)" /></td>
      <td style="font-family:monospace;font-size:12px">${esc(item.sku)}</td>
      <td class="col-name">${esc(item.name)}${dupBadge}</td>
      <td>
        <span class="badge-cat" style="background:${catStyle.bg};color:${catStyle.color}">
          ${esc(item.category)}
        </span>
      </td>
      <td style="cursor:pointer" onclick="toggleField('${item.id}','shipping_to_korea',${!!item.shipping_to_korea})">${yesNo(item.shipping_to_korea)}</td>
      <td style="font-size:12px;color:var(--text-secondary)">${item.ordered_at || '—'}</td>
      <td>${item.qty ?? 0}</td>
      <td>
        <div style="display:flex;align-items:center;gap:3px">
          <input type="number" min="0" value="${item.broken ?? 0}"
            style="width:48px;text-align:center;padding:2px 4px;border:1px solid var(--border-strong);border-radius:4px;font-size:13px"
            oninput="onBrokenInput(this,'${item.id}')"
            onchange="onBrokenChange(this,'${item.id}')" />
        </div>
      </td>
      <td style="font-weight:600" id="usable-${item.id}">${usable}</td>
      <td style="cursor:pointer" onclick="toggleField('${item.id}','factory_arrived',${!!item.factory_arrived})">${yesNo(item.factory_arrived)}</td>
      <td style="cursor:pointer" onclick="toggleField('${item.id}','photo_taken',${!!item.photo_taken})">${yesNo(item.photo_taken)}</td>
      <td style="cursor:pointer" onclick="toggleField('${item.id}','coupang_wing_registered',${!!item.coupang_wing_registered})">${yesNo(item.coupang_wing_registered)}</td>
      <td style="color:var(--text-muted);font-size:12px;max-width:100px;overflow:hidden;text-overflow:ellipsis;position:relative"
        ${item.note ? `class="note-cell" data-note="${esc(item.note)}"` : ''}
      >${esc(item.note || '')}</td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="openModal('${item.id}')">수정</button>
      </td>
    </tr>`;
}

function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;');
}

function updateCatFilter() {
  const sel = document.getElementById('catFilter');
  const cur = sel.value;
  const cats = [...new Set(items.map(i => i.category))].sort();
  sel.innerHTML = '<option value="">전체 카테고리</option>'
    + cats.map(c => `<option value="${c}"${c===cur?' selected':''}>${c}</option>`).join('');

  const modalSel = document.getElementById('fCat');
  const modalCur = modalSel.value;
  modalSel.innerHTML = '<option value="">카테고리 선택</option>'
    + cats.map(c => `<option value="${c}"${c===modalCur?' selected':''}>${c}</option>`).join('')
    + '<option value="__custom__">직접 입력...</option>';
}

function onCatSelectChange() {
  const sel = document.getElementById('fCat');
  const custom = document.getElementById('fCatCustom');
  if (sel.value === '__custom__') {
    custom.style.display = '';
    custom.focus();
  } else {
    custom.style.display = 'none';
    custom.value = '';
  }
}

function updateStats(dups) {
  document.getElementById('statTotal').textContent   = items.length;
  document.getElementById('statActive').textContent  = items.filter(i => i.shipping_to_korea === false).length;
  document.getElementById('statArrived').textContent = items.filter(i => i.factory_arrived === false).length;
  document.getElementById('statPhoto').textContent   = items.filter(i => i.photo_taken === false).length;
  document.getElementById('statCats').textContent    = items.filter(i => i.coupang_wing_registered === false).length;
}

// ── 모달 ──────────────────────────────────────────────────────
function openModal(id = null) {
  editId = id;
  const item = id ? items.find(i => i.id === id) : null;
  document.getElementById('modalTitle').textContent = id ? '상품 수정' : '상품 추가';
  document.getElementById('fSku').value  = item?.sku ?? '';
  const modalSel = document.getElementById('fCat');
  const modalCustom = document.getElementById('fCatCustom');
  const existingCat = item?.category ?? '';
  const optionExists = [...modalSel.options].some(o => o.value === existingCat && o.value !== '__custom__' && o.value !== '');
  if (existingCat && !optionExists) {
    modalSel.value = '__custom__';
    modalCustom.style.display = '';
    modalCustom.value = existingCat;
  } else {
    modalSel.value = existingCat;
    modalCustom.style.display = 'none';
    modalCustom.value = '';
  }
  document.getElementById('fName').value      = item?.name ?? '';
  document.getElementById('fQty').value       = item?.qty ?? '';
  document.getElementById('fBrk').value       = item?.broken ?? '';
  document.getElementById('fFac').value       = String(item?.factory_arrived ?? false);
  document.getElementById('fShipping').value  = String(item?.shipping_to_korea ?? false);
  document.getElementById('fCouReg').value    = String(item?.coupang_wing_registered ?? false);
  document.getElementById('fOrderedAt').value = item?.ordered_at ?? '';
  document.getElementById('fNote').value      = item?.note ?? '';
  document.getElementById('modalBg').classList.add('open');
  document.getElementById('fSku').focus();
}

function closeModal() {
  document.getElementById('modalBg').classList.remove('open');
  editId = null;
}

function onBgClick(e) {
  if (e.target === e.currentTarget) closeModal();
}

async function saveItem() {
  const sku = document.getElementById('fSku').value.trim();
  const fCatSel = document.getElementById('fCat');
  const cat = fCatSel.value === '__custom__'
    ? document.getElementById('fCatCustom').value.trim()
    : fCatSel.value.trim();
  const name = document.getElementById('fName').value.trim();
  if (!sku || !cat || !name) { showToast('SKU 코드, 카테고리, 상품명은 필수입니다.', 'error'); return; }

  const payload = {
    sku, category: cat, name,
    qty:                    parseInt(document.getElementById('fQty').value) || 0,
    broken:                 parseInt(document.getElementById('fBrk').value) || 0,
    factory_arrived:        document.getElementById('fFac').value === 'true',
    coupang_wing_registered: document.getElementById('fCouReg').value === 'true',
    shipping_to_korea:      document.getElementById('fShipping').value === 'true',
    ordered_at:             document.getElementById('fOrderedAt').value || null,
    note:                   document.getElementById('fNote').value.trim() || null,
    // modified_by 제거 — orders 테이블에 해당 컬럼 없음
  };

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.textContent = '저장 중...';

  let error, insertedId;
  // 세션 변수로 이름 먼저 전달
  await sb.rpc('set_modified_by', { username: currentUser });

  if (editId) {
      ({ error } = await sb.from(TABLE).update(payload).eq('id', editId));
  } else {
      const { data: inserted, error: insertErr } = await sb.from(TABLE).insert(payload).select('id').single();
    error = insertErr;
    insertedId = inserted?.id;
  }

  btn.disabled = false;
  btn.textContent = '저장';
  if (error) { showToast('저장 실패: ' + error.message, 'error'); return; }

  showToast(editId ? '수정되었습니다.' : '상품이 추가되었습니다.', 'success');
  closeModal();
}

async function toggleField(id, field, current) {
  const newVal = !current;
  const idx = items.findIndex(i => String(i.id) === String(id));
  if (idx >= 0) items[idx] = { ...items[idx], [field]: newVal };
  renderTable();
  await sb.rpc('set_modified_by', { username: currentUser });
  const { error } = await sb.from(TABLE).update({ [field]: newVal }).eq('id', id);
  if (error) {
    if (idx >= 0) items[idx] = { ...items[idx], [field]: current };
    renderTable();
    showToast('업데이트 실패: ' + error.message, 'error');
  }
}

// ── 체크박스 / 일괄 작업 ─────────────────────────────────────
function toggleSelect(id, checked) {
  checked ? selectedIds.add(id) : selectedIds.delete(id);
  updateBulkBar();
}

function toggleSelectAll(chk) {
  const catFilter = document.getElementById('catFilter').value;
  const search    = document.getElementById('searchInput').value.toLowerCase();
  const visible   = items.filter(i => {
    const matchCat    = !catFilter || i.category === catFilter;
    const matchSearch = !search || i.sku.toLowerCase().includes(search) || i.name.toLowerCase().includes(search);
    return matchCat && matchSearch;
  });
  visible.forEach(i => chk.checked ? selectedIds.add(i.id) : selectedIds.delete(i.id));
  renderTable();
}

function updateBulkBar() {
  const bar = document.getElementById('bulkBar');
  const cnt = document.getElementById('bulkCount');
  if (selectedIds.size > 0) {
    bar.style.display = 'flex';
    cnt.textContent   = `${selectedIds.size}개 선택됨`;
  } else {
    bar.style.display = 'none';
  }
  const chkAll = document.getElementById('chkAll');
  if (chkAll) {
    const allChecked = [...document.querySelectorAll('#tableBody input[type=checkbox]')].every(c => c.checked);
    chkAll.checked = allChecked && document.querySelectorAll('#tableBody input[type=checkbox]').length > 0;
  }
}

async function bulkSetStatus(toTrue) {
  if (selectedIds.size === 0) return;
  const fields = ['factory_arrived', 'factory_inspected', 'rocket_growth_registered', 'coupang_wing_registered', 'shipping_to_korea'];
  const patch  = Object.fromEntries(fields.map(f => [f, toTrue]));
  const ids    = [...selectedIds];
  ids.forEach(id => {
    const idx = items.findIndex(i => i.id === id);
    if (idx >= 0) items[idx] = { ...items[idx], ...patch };
  });
  renderTable();
  let failed = 0;
  for (const id of ids) {
    const { error } = await sb.from(TABLE).update(patch).eq('id', id);
    if (error) failed++;
  }
  if (failed) showToast(`${failed}개 업데이트 실패`, 'error');
  else showToast(`${ids.length}개 상태를 ${toTrue ? 'Y' : 'N'}으로 변경했습니다.`, 'success');
}

async function bulkDelete() {
  if (selectedIds.size === 0) return;
  if (!confirm(`선택한 ${selectedIds.size}개 상품을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return;
  const ids = [...selectedIds];
  // 삭제 전에 items에서 정보 미리 캡처
  const itemSnapshots = Object.fromEntries(
    ids.map(id => [id, items.find(i => i.id === id) || { id }])
  );
  items = items.filter(i => !ids.includes(i.id));
  selectedIds.clear();
  renderTable();
  let failed = 0;
  for (const id of ids) {
    const item = itemSnapshots[id];
    await sb.from('order_logs').insert({
      order_id: id,
      action: 'DELETE',
      sku: item.sku || null,
      name: item.name || null,
      modified_by: currentUser || null,
      snapshot: item,
    });
    const { error } = await sb.from(TABLE).delete().eq('id', id);
    if (error) failed++;
  }
  if (failed) showToast(`${failed}개 삭제 실패`, 'error');
  else showToast(`${ids.length}개 상품이 삭제되었습니다.`, 'success');
}

// ── 파손 물량 인라인 편집 ────────────────────────────────────
function onBrokenInput(input, id) {
  const val = Math.max(0, parseInt(input.value) || 0);
  input.value = val;
  const item = items.find(i => i.id === id);
  if (!item) return;
  const usable = Math.max(0, (item.qty || 0) - val);
  const cell = document.getElementById('usable-' + id);
  if (cell) cell.textContent = usable;
}

function onBrokenChange(input, id) {
  const val = Math.max(0, parseInt(input.value) || 0);
  input.value = val;
  const idx = items.findIndex(i => i.id === id);
  if (idx < 0) return;
  const prev = items[idx].broken ?? 0;
  if (val === prev) return;
  items[idx] = { ...items[idx], broken: val };
  sb.from(TABLE).update({ broken: val }).eq('id', id).then(({ error }) => {
    if (error) {
      items[idx] = { ...items[idx], broken: prev };
      renderTable();
      showToast('업데이트 실패: ' + error.message, 'error');
    }
  });
}

// ── 엑셀 내보내기 ─────────────────────────────────────────────
function exportXLSX() {
  const headers = ['SKU 코드','상품명','카테고리','주문 수량','파손 물량','사용 가능 물량',
                   '한국으로 오는 중','주문 날짜','공장 도착','공장 검수','로켓그로스 등록','쿠팡윙 등록','비고','등록일'];
  const rows = sortItems([...items]).map(i => [
    i.sku, i.name, i.category,
    i.qty ?? 0, i.broken ?? 0,
    Math.max(0, (i.qty||0)-(i.broken||0)),
    i.shipping_to_korea         ? 'Y' : 'N',
    i.ordered_at ?? '',
    i.factory_arrived           ? 'Y' : 'N',
    i.factory_inspected         ? 'Y' : 'N',
    i.rocket_growth_registered  ? 'Y' : 'N',
    i.coupang_wing_registered   ? 'Y' : 'N',
    i.note ?? '',
    new Date(i.created_at).toLocaleDateString('ko-KR'),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '발주현황');
  XLSX.writeFile(wb, `발주관리_${new Date().toISOString().slice(0,10)}.xlsx`);
}

// ── 변경 이력 모달 ────────────────────────────────────────────
const FIELD_LABELS = {
  sku: 'SKU 코드', name: '상품명', category: '카테고리',
  qty: '주문 수량', broken: '파손 물량', extra_qty: '추가 주문',
  shipping_to_korea: '한국으로 오는 중',
  ordered_at: '주문 날짜',
  factory_arrived: '공장 도착', factory_inspected: '공장 검수',
  rocket_arrived: '로켓그로스 도착', rocket_growth_registered: '로켓그로스 등록',
  coupang_wing_registered: '쿠팡윙 등록',
  note: '비고',
};

function fmtVal(key, val) {
  if (val === null || val === undefined || val === 'null') return '(없음)';
  if (typeof val === 'boolean' || val === true || val === false) return val ? 'Y' : 'N';
  if (val === 'true') return 'Y';
  if (val === 'false') return 'N';
  return String(val);
}

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('ko-KR', { month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

function renderLogItem(log) {
  const time = fmtTime(log.created_at);
  const label = log.action === 'INSERT' ? '추가' : log.action === 'DELETE' ? '삭제' : '수정';
  const badgeColor = log.action === 'INSERT' ? 'var(--green)' :
                     log.action === 'DELETE' ? 'var(--red)' : 'var(--accent)';

  let detail = '';
  if (log.action === 'UPDATE' && log.changed_fields) {
    const cf = typeof log.changed_fields === 'string'
      ? JSON.parse(log.changed_fields) : log.changed_fields;
    detail = Object.entries(cf).map(([k, v]) => {
      const label = FIELD_LABELS[k] || k;
      const from  = fmtVal(k, v.from);
      const to    = fmtVal(k, v.to);
      return `<span style="color:var(--text-secondary)">${label}</span>: `
           + `<span style="color:var(--text-muted);text-decoration:line-through">${esc(from)}</span>`
           + ` → <strong>${esc(to)}</strong>`;
    }).join('<br>');
  } else if (log.action === 'INSERT') {
    detail = '<span style="color:var(--text-muted)">새 상품이 등록되었습니다.</span>';
  } else if (log.action === 'DELETE') {
    detail = '<span style="color:var(--text-muted)">상품이 삭제되었습니다.</span>';
  }

  return `
    <div style="padding:12px 0;border-bottom:1px solid var(--border);">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
        <span style="background:${badgeColor};color:#fff;font-size:11px;font-weight:600;
          padding:2px 7px;border-radius:20px">${label}</span>
        <span style="font-weight:600;font-size:13px">${esc(log.name || log.snapshot?.name || '')}
          <span style="font-family:monospace;font-size:11px;color:var(--text-muted)">(${esc(log.sku || log.snapshot?.sku || '')})</span>
        </span>
        <span style="margin-left:auto;font-size:11px;color:var(--text-muted);text-align:right">
          <strong>${esc(log.modified_by || currentUser || '')}</strong> · ${time}
        </span>
      </div>
      <div style="font-size:12px;line-height:1.7;padding-left:4px">${detail}</div>
    </div>`;
}

async function openLogsModal() {
  document.getElementById('logsBg').classList.add('open');
  const body = document.getElementById('logsBody');
  body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">불러오는 중...</div>';

  const { data, error } = await sb
    .from(LOGS_TABLE)
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    body.innerHTML = `<div style="padding:24px;color:var(--red)">오류: ${error.message}</div>`;
    return;
  }
  if (!data || data.length === 0) {
    body.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">변경 이력이 없습니다.</div>';
    return;
  }
  body.innerHTML = data.map(renderLogItem).join('');
}

function closeLogsModal() {
  document.getElementById('logsBg').classList.remove('open');
}

function onLogsBgClick(e) {
  if (e.target === e.currentTarget) closeLogsModal();
}

// ── 토스트 ────────────────────────────────────────────────────
function showToast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  const el   = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function clearDateFilter() {
  document.getElementById('dateFrom').value = '';
  document.getElementById('dateTo').value   = '';
  renderTable();
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeLogsModal(); }
});

init();