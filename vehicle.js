import { db, auth, firestore } from './firebase-init.js';
let currentVehicleId = null;
let unsubscribeVehicles = null;
let navShowModule = null;
let navShowDetailTab = null;

// 監査フィールド(作成・更新情報)の生成
const getAudit = (isNew) => {
    const u = auth.currentUser;
    const d = { updatedAt: firestore.FieldValue.serverTimestamp(), updatedBy: u ? u.displayName : '不明', updatedById: u ? u.uid : '不明' };
    if (isNew) { d.createdAt = d.updatedAt; d.createdBy = d.updatedBy; d.createdById = d.updatedById; }
    return d;
};
// ヘルパー: 現在の車両ドキュメントの参照
const getVRef = () => db.collection('vehicles').doc(currentVehicleId);
// ヘルパー: サブコレクションの保存と再描画
const saveSub = async (col, id, data, modal, renderFn, DE) => {
    const ref = getVRef().collection(col);
    if (id) await ref.doc(id).update({ ...data, ...getAudit(false) });
    else await ref.add({ ...data, ...getAudit(true) });
    modal.classList.add('hidden');
    if (renderFn) await renderFn(currentVehicleId, DE);
};
// ヘルパー: サブコレクションの削除と再描画
const delSub = async (col, id, modal, renderFn, DE) => {
    if (!id || !currentVehicleId || !confirm('本当に削除しますか？')) return;
    await getVRef().collection(col).doc(id).delete();
    if(modal) modal.classList.add('hidden');
    if(renderFn) renderFn(currentVehicleId, DE);
};
// ヘルパー: 汎用リスト描画
const renderList = async (col, container, emptyMsg, htmlFn, orderBy = ['updatedAt', 'desc']) => {
    container.innerHTML = '';
    const snap = await getVRef().collection(col).orderBy(...orderBy).get();
    if(snap.empty) return container.innerHTML = `<p>${emptyMsg}</p>`;
    snap.forEach(doc => container.insertAdjacentHTML('beforeend', htmlFn(doc.data(), doc.id)));
};
// ヘルパー: モーダルを開く（新規追加用）
const initModal = (btn, form, modal, title, resetFn) => {
    btn.addEventListener('click', () => {
        form.reset(); resetFn(); modal.querySelector('h3').textContent = title;
        const del = modal.querySelector('.delete-button'); if(del) del.classList.add('hidden');
        modal.classList.remove('hidden');
    });
};
// ヘルパー: モーダルを開く（リストからの編集用）
const handleEditClick = (container, selector, col, modal, form, title, populateFn) => {
    container.addEventListener('click', async e => {
        const item = e.target.closest(selector);
        if (!item || !currentVehicleId) return;
        const doc = await getVRef().collection(col).doc(item.dataset.id).get();
        if (!doc.exists) return alert("データが見つかりません。");
        form.reset(); modal.querySelector('h3').textContent = title;
        populateFn(doc.data(), doc.id, form, modal);
        const del = modal.querySelector('.delete-button'); if(del) del.classList.remove('hidden');
        modal.classList.remove('hidden');
    });
};

export function setupVehicleHandlers(DE, showModule, showDetailTab, onVehicleClick) {
    navShowModule = showModule; navShowDetailTab = showDetailTab;
    const val = (sel, root = document) => root.querySelector(sel)?.value || '';

    // 車両管理(親)の処理
    initModal(DE.showAddVehicleButton, DE.vehicleForm, DE.vehicleModal, '車両を新規登録', () => DE.vehicleForm.querySelector('#vehicle-id').value = '');
    DE.vehicleForm.addEventListener('submit', async e => {
        e.preventDefault(); const id = val('#vehicle-id', DE.vehicleForm), y = val('#vehicle-year', DE.vehicleForm);
        const data = { manufacturer: val('#vehicle-manufacturer', DE.vehicleForm), name: val('#vehicle-name', DE.vehicleForm), grade: val('#vehicle-grade', DE.vehicleForm), year: y ? parseInt(y, 10) : null, modelCode: val('#vehicle-model-code', DE.vehicleForm), vin: val('#vehicle-vin', DE.vehicleForm) };
        if (id) await db.collection('vehicles').doc(id).update({ ...data, ...getAudit(false) });
        else { const res = await db.collection('vehicles').add({ ...data, ...getAudit(true) }); if(!id) await showVehicleDetail(DE, showModule, showDetailTab, res.id); }
        DE.vehicleModal.classList.add('hidden'); if(id) await showVehicleDetail(DE, showModule, showDetailTab, id);
    });
    DE.vehicleListContainer.addEventListener('click', e => { const c = e.target.closest('.vehicle-card'); if(c) onVehicleClick(c.dataset.id); });
    DE.detailNavButtons.forEach(b => b.addEventListener('click', () => showDetailTab(b.dataset.detailtab)));
    DE.backToListButton.addEventListener('click', () => { DE.vehicleDetailView.classList.add('hidden'); showModule('maintenance-module'); currentVehicleId = null; });

    // 各種新規追加ボタンの初期化
    initModal(DE.showAddLogButton, DE.maintenanceLogForm, DE.maintenanceLogModal, '整備履歴を追加', () => DE.maintenanceLogForm.querySelector('#log-id').value = '');
    initModal(DE.showAddCustomButton, DE.customizationForm, DE.customizationModal, 'カスタマイズを追加', () => {});
    initModal(DE.showAddSetupButton, DE.setupForm, DE.setupModal, 'セッティングを記録', () => DE.setupForm.querySelector('#setup-id').value = '');
    initModal(DE.showAddPartButton, DE.sparePartForm, DE.sparePartModal, '予備部品を登録', () => delete DE.sparePartModal.dataset.editingId);

    // 各種リストクリック（編集モーダル呼び出し）
    handleEditClick(DE.maintenanceLogsContainer, '.log-item', 'maintenance_logs', DE.maintenanceLogModal, DE.maintenanceLogForm, '整備履歴を編集', (d, id, f) => { f.querySelector('#log-id').value = id; f.querySelector('#log-date').value = d.date; f.querySelector('#log-task').value = d.task; f.querySelector('#log-notes').value = d.notes || ''; });
    handleEditClick(DE.setupLogContainer, '.setup-item', 'setups', DE.setupModal, DE.setupForm, 'セッティングを編集', (d, id, f) => {
        f.querySelector('#setup-id').value = id; f.querySelector('#setup-date').value = d.date; f.querySelector('#setup-course').value = d.course;
        if(d.suspension) ['damperF','damperR','spring','camber'].forEach(k => f.querySelector(`#setup-${k.toLowerCase()}`).value = d.suspension[k] || '');
        if(d.tire) { f.querySelector('#setup-tire').value = d.tire.name || ''; f.querySelector('#setup-air-f').value = d.tire.airF || ''; f.querySelector('#setup-air-r').value = d.tire.airR || ''; }
        f.querySelector('#setup-comment').value = d.comment || '';
    });
    handleEditClick(DE.sparePartsContainer, '.spare-part-item', 'spare_parts', DE.sparePartModal, DE.sparePartForm, '予備部品を編集', (d, id, f, m) => {
        m.dataset.editingId = id; ['name','partNumber','quantity','location','notes'].forEach(k => f.querySelector(`#part-${k.replace(/[A-Z]/g, l => '-' + l.toLowerCase())}`).value = d[k] || '');
    });

    // 各種サブミット処理
    DE.maintenanceLogForm.addEventListener('submit', async e => { e.preventDefault(); await saveSub('maintenance_logs', val('#log-id', DE.maintenanceLogForm), { date: val('#log-date', DE.maintenanceLogForm), task: val('#log-task', DE.maintenanceLogForm), notes: val('#log-notes', DE.maintenanceLogForm) }, DE.maintenanceLogModal, renderMaintenanceLogs, DE); });
    DE.customizationForm.addEventListener('submit', async e => { e.preventDefault(); await saveSub('customizations', null, { part: val('#custom-part', DE.customizationForm), category: val('#custom-category', DE.customizationForm), details: val('#custom-details', DE.customizationForm) }, DE.customizationModal, renderCustomizations, DE); });
    DE.setupForm.addEventListener('submit', async e => {
        e.preventDefault(); const f = DE.setupForm;
        await saveSub('setups', val('#setup-id', f), { date: val('#setup-date', f), course: val('#setup-course', f), suspension: { damperF: val('#setup-damper-f', f), damperR: val('#setup-damper-r', f), spring: val('#setup-spring', f), camber: val('#setup-camber', f) }, tire: { name: val('#setup-tire', f), airF: val('#setup-air-f', f), airR: val('#setup-air-r', f) }, comment: val('#setup-comment', f) }, DE.setupModal, renderSetups, DE);
    });
    DE.sparePartForm.addEventListener('submit', async e => { e.preventDefault(); const f = DE.sparePartForm; await saveSub('spare_parts', DE.sparePartModal.dataset.editingId, { name: val('#part-name', f), partNumber: val('#part-number', f), quantity: val('#part-quantity', f), location: val('#part-location', f), notes: val('#part-notes', f) }, DE.sparePartModal, renderSpareParts, DE); });

    // 各種削除ボタン処理
    DE.deleteLogButton.onclick = () => delSub('maintenance_logs', val('#log-id', DE.maintenanceLogForm), DE.maintenanceLogModal, renderMaintenanceLogs, DE);
    DE.deleteSetupButton.onclick = () => delSub('setups', val('#setup-id', DE.setupForm), DE.setupModal, renderSetups, DE);
    DE.deletePartButton.onclick = () => delSub('spare_parts', DE.sparePartModal.dataset.editingId, DE.sparePartModal, renderSpareParts, DE);
    DE.customizationsContainer.onclick = e => { if (e.target.matches('.delete-button')) delSub('customizations', e.target.dataset.id, null, renderCustomizations, DE); };
    if (DE.deleteTaskButton) DE.deleteTaskButton.onclick = () => delSub('tasks', DE.taskModal.dataset.editingId, DE.taskModal, renderKanban, DE);

    // タスク/カンバン専用処理
    DE.showAddTaskButton.addEventListener('click', () => {
        DE.taskForm.reset(); DE.taskModal.querySelector('h3').textContent = 'タスクを追加';
        delete DE.taskModal.dataset.editingId; delete DE.taskModal.dataset.source;
        setTaskModalMode(DE, 'new');
        if (auth.currentUser?.displayName) DE.taskForm.querySelector('#task-assignee').value = auth.currentUser.displayName;
        DE.taskModal.classList.remove('hidden');
    });
    DE.taskForm.addEventListener('submit', async e => {
        e.preventDefault(); if (!currentVehicleId) return;
        const stat = val('#task-status', DE.taskForm);
        const data = { title: val('#task-title', DE.taskForm), assignee: val('#task-assignee', DE.taskForm), status: stat, dueDate: val('#task-due-date', DE.taskForm), notes: val('#task-notes', DE.taskForm) };
        if (stat === 'done') data.doneAt = new Date(); else data.doneAt = firestore.FieldValue.delete();
        await saveSub('tasks', DE.taskModal.dataset.editingId, data, DE.taskModal, renderKanban, DE);
    });
    DE.kanbanContainer.addEventListener('change', async e => {
        if (!e.target.matches('.quick-status-change') || !currentVehicleId) return;
        e.target.disabled = true; const stat = e.target.value;
        const data = { status: stat, updatedAt: firestore.FieldValue.serverTimestamp(), doneAt: stat === 'done' ? new Date() : firestore.FieldValue.delete() };
        await getVRef().collection('tasks').doc(e.target.dataset.id).update(data);
        renderKanban(currentVehicleId, DE);
    });
    DE.kanbanContainer.addEventListener('click', async e => {
        const h = e.target.closest('h4'); if (h) return h.parentElement.classList.toggle('open');
        if (['select', 'option'].includes(e.target.tagName.toLowerCase())) return;
        const c = e.target.closest('.task-card'); if (!c) return;
        await showTaskDetailFromExternal(c.dataset.id, currentVehicleId, DE);
        delete DE.taskModal.dataset.source; 
    });
    DE.syncDoneTasksButton.addEventListener('click', async () => {
        if (!currentVehicleId || !confirm('「完了」列のタスクを整備記録に移し、完全に削除します。よろしいですか？')) return;
        const btn = DE.syncDoneTasksButton; btn.disabled = true; btn.textContent = '処理中...';
        try {
            const snap = await getVRef().collection('tasks').where('status', '==', 'done').get();
            if (snap.empty) return alert('移動するタスクはありません。');
            const batch = db.batch(), lRef = getVRef().collection('maintenance_logs');
            snap.forEach(doc => {
                const t = doc.data(), d = t.doneAt?.toDate ? t.doneAt.toDate().toISOString().split('T')[0] : (t.dueDate || new Date().toISOString().split('T')[0]);
                batch.set(lRef.doc(), { date: d, task: t.title || '（タイトルなし）', notes: `${t.notes || ''} (担当: ${t.assignee || '未定'})`.trim(), ...getAudit(true) });
                batch.delete(doc.ref);
            });
            await batch.commit(); alert(`${snap.size}件移動しました。`);
            await Promise.all([renderMaintenanceLogs(currentVehicleId, DE), renderKanban(currentVehicleId, DE)]);
        } catch (e) { alert("処理に失敗しました。"); } finally { btn.disabled = false; btn.textContent = '🔄 完了タスクを履歴に反映'; }
    });
}

function setTaskModalMode(DE, mode) {
    if (!DE.editTaskToggle) {
        DE.editTaskToggle = DE.taskModal.querySelector('#edit-task-toggle'); DE.saveTaskButton = DE.taskModal.querySelector('button[type="submit"]');
        DE.cancelTaskButton = DE.taskModal.querySelector('.cancel-button'); DE.taskModalTitle = DE.taskModal.querySelector('.modal-header-title');
        DE.taskInputs = DE.taskForm.querySelectorAll('input, select, textarea');
        DE.editTaskToggle.addEventListener('click', () => {
            const isExt = DE.taskModal.dataset.source === 'external'; delete DE.taskModal.dataset.source; setTaskModalMode(DE, 'edit');
            if (isExt && navShowModule && navShowDetailTab && currentVehicleId) showVehicleDetail(DE, navShowModule, navShowDetailTab, currentVehicleId, 'kanban-board');
        });
    }
    const isView = mode === 'view';
    DE.taskModalTitle.textContent = isView ? 'タスクの詳細' : (mode === 'edit' ? 'タスクを編集' : 'タスクを追加');
    DE.editTaskToggle.classList.toggle('hidden', !isView); DE.saveTaskButton.classList.toggle('hidden', isView);
    if(DE.deleteTaskButton) DE.deleteTaskButton.classList.toggle('hidden', isView || mode === 'new');
    DE.cancelTaskButton.textContent = isView ? '閉じる' : 'キャンセル';
    DE.taskInputs.forEach(i => { i.disabled = isView; i.classList.toggle('view-mode-input', isView); });
}

export function fetchVehicles(DE, onVehicleClick) {
    if (unsubscribeVehicles) unsubscribeVehicles(); DE.vehicleListContainer.replaceChildren();
    unsubscribeVehicles = db.collection('vehicles').orderBy('name').onSnapshot(snap => {
        if (snap.empty) return DE.vehicleListContainer.innerHTML = '<p class="empty-msg">車両が登録されていません。</p>';
        DE.vehicleListContainer.querySelector('.empty-msg')?.remove();
        snap.docChanges().forEach(change => {
            const v = change.doc.data(), id = change.doc.id;
            const html = `<div class="vehicle-info"><h3>${v.name}</h3><div class="vehicle-meta"><span class="maker-badge">${v.manufacturer || '未設定'}</span><span class="model-code">${v.modelCode || ''}</span></div></div><div class="vehicle-arrow">›</div>`;
            if (change.type === 'added') { const c = document.createElement('div'); c.className = 'vehicle-card'; c.dataset.id = id; c.innerHTML = html; DE.vehicleListContainer.appendChild(c); }
            else { const c = DE.vehicleListContainer.querySelector(`.vehicle-card[data-id="${id}"]`); if (c) { if (change.type === 'modified') c.innerHTML = html; else c.remove(); } }
        });
    });
}

export function stopVehicleUpdates() { if (unsubscribeVehicles) { unsubscribeVehicles(); unsubscribeVehicles = null; } }

export async function showVehicleDetail(DE, showModule, showDetailTab, vId, initTab = 'basic-info') {
    showDetailTab(initTab); DE.detailVehicleName.textContent = '読み込み中...'; showModule('vehicle-detail-view'); 
    const doc = await db.collection('vehicles').doc(vId).get();
    if (!doc.exists) return DE.backToListButton.click();
    const v = doc.data(); currentVehicleId = vId; DE.detailVehicleName.textContent = `${v.manufacturer || ''} ${v.name}`;
    DE.basicInfoContent.innerHTML = ['メーカー','車名','グレード','年式','型式','車台番号'].map((l, i) => `<p><strong>${l}:</strong> ${[v.manufacturer, v.name, v.grade, v.year, v.modelCode, v.vin][i] || '未設定'}</p>`).join('') + `<button id="edit-basic-info-button" class="edit-button">基本情報を編集</button>`;
    document.getElementById('edit-basic-info-button').onclick = () => {
        const f = DE.vehicleForm; f.querySelector('#vehicle-id').value = vId;
        ['manufacturer','name','grade','year','model-code','vin'].forEach(k => f.querySelector(`#vehicle-${k}`).value = v[k.replace(/-([a-z])/g, g => g[1].toUpperCase())] || '');
        DE.vehicleModal.querySelector('h3').textContent = '基本情報を編集'; DE.vehicleModal.classList.remove('hidden');
    };
    await Promise.all([renderMaintenanceLogs(vId, DE), renderCustomizations(vId, DE), renderKanban(vId, DE), renderSetups(vId, DE), renderSpareParts(vId, DE)]);
}

export async function showTaskDetailFromExternal(taskId, vId, DE) {
    try {
        const doc = await db.collection('vehicles').doc(vId).collection('tasks').doc(taskId).get();
        if (!doc.exists) return alert("タスクが見つかりません。");
        const t = doc.data(), f = DE.taskForm;
        ['title','assignee','status'].forEach(k => f.querySelector(`#task-${k}`).value = t[k] || '');
        f.querySelector('#task-due-date').value = t.dueDate || ''; f.querySelector('#task-notes').value = t.notes || '';
        DE.taskModal.dataset.editingId = taskId; DE.taskModal.dataset.source = 'external'; currentVehicleId = vId; 
        setTaskModalMode(DE, 'view'); DE.taskModal.classList.remove('hidden');
    } catch (err) { alert("読み込みに失敗しました。"); }
}

const renderMaintenanceLogs = (vId, DE) => renderList('maintenance_logs', DE.maintenanceLogsContainer, '整備履歴はありません。', (l, id) => `<div class="history-item log-item" data-id="${id}"><p><strong>${new Date(l.date.replace(/-/g, '/')).toLocaleDateString()}</strong> - ${l.task}</p><p>[メモ] ${l.notes || 'なし'}</p></div>`, ['date', 'desc']);
const renderCustomizations = (vId, DE) => renderList('customizations', DE.customizationsContainer, 'カスタマイズ情報はありません。', (c, id) => `<div class="history-item"><p><strong>${c.part}</strong> (${c.category || 'その他'})</p><p>${c.details || '詳細なし'}</p><div class="card-actions"><button class="delete-button" data-id="${id}">削除</button></div></div>`, ['part', 'asc']);
const renderSetups = (vId, DE) => renderList('setups', DE.setupLogContainer, 'セッティング記録はまだありません。', (s, id) => `<div class="setup-item" data-id="${id}" style="cursor:pointer;"><div class="setup-header"><span>${s.date} @ ${s.course}</span></div><div class="setup-grid"><div><strong>足回り</strong><br>減衰: F ${s.suspension.damperF||'-'} / R ${s.suspension.damperR||'-'}<br>バネ: ${s.suspension.spring||'-'}, キャンバー: ${s.suspension.camber||'-'}</div><div><strong>タイヤ</strong><br>銘柄: ${s.tire.name||'-'}<br>内圧: F ${s.tire.airF||'-'} / R ${s.tire.airR||'-'}</div></div><div class="setup-comment-box">ドライバー: ${s.comment||'なし'}</div></div>`, ['date', 'desc']);
const renderSpareParts = (vId, DE) => renderList('spare_parts', DE.sparePartsContainer, '予備部品はまだ登録されていません。', (p, id) => `<div class="history-item spare-part-item" data-id="${id}"><div class="spare-part-layout"><div class="part-main-info"><span class="part-name">${p.name}</span><span class="part-number">${p.partNumber||'品番なし'}</span></div><div class="part-stock-info"><span class="part-quantity">数量: ${p.quantity||'N/A'}</span><span class="part-location">📍 ${p.location||'場所不明'}</span></div></div>${p.notes ? `<p class="part-notes">メモ: ${p.notes}</p>` : ''}</div>`, ['name', 'asc']);

async function renderKanban(vId, DE) {
    const stats = ['todo', 'inprogress', 'waiting', 'done'], counts = { todo: 0, inprogress: 0, waiting: 0, done: 0 };
    stats.forEach(s => { const c = document.getElementById(`kanban-${s}`); if(c) c.innerHTML = ''; });
    const snap = await db.collection('vehicles').doc(vId).collection('tasks').orderBy('updatedAt', 'desc').get();
    const opts = [{v:'todo',l:'未着手'},{v:'inprogress',l:'作業中'},{v:'waiting',l:'部品待ち'},{v:'done',l:'完了'}];
    snap.forEach(doc => {
        const t = doc.data(); counts[t.status]++;
        const sel = `<select class="quick-status-change" data-id="${doc.id}">${opts.map(o => `<option value="${o.v}" ${t.status === o.v ? 'selected' : ''}>${o.l}</option>`).join('')}</select>`;
        const d = t.dueDate ? `<span class="task-date">📅 ${t.dueDate.slice(5).replace(/-/g, '/')}</span>` : '';
        const c = document.getElementById(`kanban-${t.status}`);
        if(c) c.insertAdjacentHTML('beforeend', `<div class="task-card" data-id="${doc.id}"><div class="task-title">${t.title}</div><div class="task-meta"><span>${t.assignee || '未割当'}</span>${d}</div><div class="task-actions" style="margin-top:8px;text-align:right;">${sel}</div></div>`);
    });
    stats.forEach(s => { const h = document.querySelector(`.kanban-column[data-status="${s}"] h4`); if(h) { h.querySelector('.task-count-badge')?.remove(); h.insertAdjacentHTML('beforeend', `<span class="task-count-badge">${counts[s]}</span>`); } });
}