// db と auth をインポート
import { db } from './firebase-init.js';
import { auth } from './firebase-init.js'; // ★ auth をインポート

let currentVehicleId = null;
let unsubscribeVehicles = null; // リアルタイム監視を解除するための変数

// ★ DOMElements とユーティリティ関数を引数で受け取る ★
export function setupVehicleHandlers(DOMElements, showModule, showDetailTab, onVehicleClick) {
    
    // --- 車両管理 (リスト) ---
    DOMElements.showAddVehicleButton.addEventListener('click', () => {
        DOMElements.vehicleForm.reset();
        DOMElements.vehicleForm.querySelector('#vehicle-id').value = '';
        DOMElements.vehicleModal.querySelector('h3').textContent = '車両を新規登録';
        DOMElements.vehicleModal.classList.remove('hidden');
    });

    DOMElements.vehicleForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = DOMElements.vehicleForm.querySelector('#vehicle-id').value;
        const yearValue = DOMElements.vehicleForm.querySelector('#vehicle-year').value;
        const data = {
            manufacturer: DOMElements.vehicleForm.querySelector('#vehicle-manufacturer').value,
            name: DOMElements.vehicleForm.querySelector('#vehicle-name').value,
            grade: DOMElements.vehicleForm.querySelector('#vehicle-grade').value,
            year: yearValue ? parseInt(yearValue, 10) : null,
            modelCode: DOMElements.vehicleForm.querySelector('#vehicle-model-code').value,
            vin: DOMElements.vehicleForm.querySelector('#vehicle-vin').value,
        };
        const promise = id ? db.collection('vehicles').doc(id).update(data) : db.collection('vehicles').add(data);
        await promise.catch(err => console.error(err));
        DOMElements.vehicleModal.classList.add('hidden');
        if (id) await showVehicleDetail(DOMElements, showModule, showDetailTab, id); // ★編集後は詳細を再描画
    });

    // 車両リストのクリック
    DOMElements.vehicleListContainer.addEventListener('click', e => {
        const card = e.target.closest('.vehicle-card');
        if (card) {
            currentVehicleId = card.dataset.id;
            onVehicleClick(currentVehicleId);
        }
    });

    // --- 車両詳細 ---
    DOMElements.detailNavButtons.forEach(b => b.addEventListener('click', () => showDetailTab(b.dataset.detailtab)));

    DOMElements.backToListButton.addEventListener('click', () => {
        DOMElements.vehicleDetailView.classList.add('hidden');
        showModule('maintenance-module');
        currentVehicleId = null;
    });

    // --- 整備履歴 (Maintenance Logs) ---
    DOMElements.showAddLogButton.addEventListener('click', () => {
        DOMElements.maintenanceLogForm.reset();
        DOMElements.maintenanceLogModal.classList.remove('hidden');
    });

    DOMElements.maintenanceLogForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const data = {
            date: DOMElements.maintenanceLogForm.querySelector('#log-date').value,
            task: DOMElements.maintenanceLogForm.querySelector('#log-task').value,
            notes: DOMElements.maintenanceLogForm.querySelector('#log-notes').value,
        };
        await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').add(data);
        DOMElements.maintenanceLogModal.classList.add('hidden');
        await renderMaintenanceLogs(currentVehicleId, DOMElements);
    });

    DOMElements.maintenanceLogsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この整備履歴を削除しますか？') && currentVehicleId) {
                await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(e.target.dataset.id).delete();
                await renderMaintenanceLogs(currentVehicleId, DOMElements);
            }
        }
    });

    // --- カスタマイズ (Customizations) ---
    DOMElements.showAddCustomButton.addEventListener('click', () => {
        DOMElements.customizationForm.reset();
        DOMElements.customizationModal.classList.remove('hidden');
    });

    DOMElements.customizationForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const data = {
            part: DOMElements.customizationForm.querySelector('#custom-part').value,
            category: DOMElements.customizationForm.querySelector('#custom-category').value,
            details: DOMElements.customizationForm.querySelector('#custom-details').value,
        };
        await db.collection('vehicles').doc(currentVehicleId).collection('customizations').add(data);
        DOMElements.customizationModal.classList.add('hidden');
        await renderCustomizations(currentVehicleId, DOMElements);
    });

    DOMElements.customizationsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この情報を削除しますか？') && currentVehicleId) {
                await db.collection('vehicles').doc(currentVehicleId).collection('customizations').doc(e.target.dataset.id).delete();
                await renderCustomizations(currentVehicleId, DOMElements);
            }
        }
    });

    // --- ★ カンバン (タスク管理) ---
    
    // 「＋ タスクを追加」ボタン
    DOMElements.showAddTaskButton.addEventListener('click', () => {
        DOMElements.taskForm.reset();
        DOMElements.taskModal.querySelector('h3').textContent = 'タスクを追加';
        delete DOMElements.taskModal.dataset.editingId;
        
        // ★ 変更点: ログインユーザー名を担当者に自動入力
        const user = auth.currentUser;
        if (user && user.displayName) {
            DOMElements.taskForm.querySelector('#task-assignee').value = user.displayName;
        }
        
        // ★ 変更点: 削除ボタンを隠す
        if (DOMElements.deleteTaskButton) {
            DOMElements.deleteTaskButton.classList.add('hidden');
        }
        
        DOMElements.taskModal.classList.remove('hidden');
    });

    // タスクフォームの送信（保存）
    DOMElements.taskForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        
        const taskId = DOMElements.taskModal.dataset.editingId;
        const data = {
            title: DOMElements.taskForm.querySelector('#task-title').value,
            assignee: DOMElements.taskForm.querySelector('#task-assignee').value,
            status: DOMElements.taskForm.querySelector('#task-status').value,
            dueDate: DOMElements.taskForm.querySelector('#task-due-date').value,
            updatedAt: new Date() // ソート用
        };

        if (taskId) {
            await db.collection('vehicles').doc(currentVehicleId).collection('tasks').doc(taskId).update(data);
        } else {
            await db.collection('vehicles').doc(currentVehicleId).collection('tasks').add(data);
        }
        DOMElements.taskModal.classList.add('hidden');
        renderKanban(currentVehicleId, DOMElements);
    });

    // ★ 変更点: 削除ボタンのクリックイベント
    if (DOMElements.deleteTaskButton) {
        DOMElements.deleteTaskButton.addEventListener('click', async () => {
            const taskId = DOMElements.taskModal.dataset.editingId;
            if (!taskId || !currentVehicleId) return;

            if (confirm('このタスクを本当に削除しますか？')) {
                try {
                    await db.collection('vehicles').doc(currentVehicleId).collection('tasks').doc(taskId).delete();
                    DOMElements.taskModal.classList.add('hidden');
                    renderKanban(currentVehicleId, DOMElements); // カンバンを再描画
                } catch (err) {
                    console.error("削除エラー:", err);
                    alert("削除に失敗しました。");
                }
            }
        });
    }
    
    // タスクカードのクリック（編集モーダルを開く）
    DOMElements.kanbanContainer.addEventListener('click', async e => {
        const card = e.target.closest('.task-card');
        if (!card) return;
        
        const taskId = card.dataset.id;
        const doc = await db.collection('vehicles').doc(currentVehicleId).collection('tasks').doc(taskId).get();
        const task = doc.data();

        // 編集モーダルに値をセット
        DOMElements.taskForm.querySelector('#task-title').value = task.title;
        DOMElements.taskForm.querySelector('#task-assignee').value = task.assignee;
        DOMElements.taskForm.querySelector('#task-status').value = task.status;
        DOMElements.taskForm.querySelector('#task-due-date').value = task.dueDate || '';
        
        DOMElements.taskModal.dataset.editingId = taskId;
        DOMElements.taskModal.querySelector('h3').textContent = 'タスクを編集';
        
        // ★ 変更点: 編集時は削除ボタンを表示
        if (DOMElements.deleteTaskButton) {
            DOMElements.deleteTaskButton.classList.remove('hidden');
        }

        DOMElements.taskModal.classList.remove('hidden');
    });

    // --- ★ セッティングログ ---
    DOMElements.showAddSetupButton.addEventListener('click', () => {
        DOMElements.setupForm.reset();
        DOMElements.setupModal.classList.remove('hidden');
    });

    DOMElements.setupForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        
        const data = {
            date: DOMElements.setupForm.querySelector('#setup-date').value,
            course: DOMElements.setupForm.querySelector('#setup-course').value,
            suspension: {
                damperF: DOMElements.setupForm.querySelector('#setup-damper-f').value,
                damperR: DOMElements.setupForm.querySelector('#setup-damper-r').value,
                spring: DOMElements.setupForm.querySelector('#setup-spring').value,
                camber: DOMElements.setupForm.querySelector('#setup-camber').value,
            },
            tire: {
                name: DOMElements.setupForm.querySelector('#setup-tire').value,
                airF: DOMElements.setupForm.querySelector('#setup-air-f').value,
                airR: DOMElements.setupForm.querySelector('#setup-air-r').value,
            },
            comment: DOMElements.setupForm.querySelector('#setup-comment').value,
        };

        await db.collection('vehicles').doc(currentVehicleId).collection('setups').add(data);
        DOMElements.setupModal.classList.add('hidden');
        renderSetups(currentVehicleId, DOMElements);
    });
}

// --- データ取得・描画関数 ---

// 車両リストをDBから取得・描画
export function fetchVehicles(DOMElements, onVehicleClick) {
    if (unsubscribeVehicles) unsubscribeVehicles();
    
    unsubscribeVehicles = db.collection('vehicles').orderBy('name').onSnapshot(snapshot => {
        DOMElements.vehicleListContainer.innerHTML = '';
        if (snapshot.empty) {
            DOMElements.vehicleListContainer.innerHTML = '<p>車両が登録されていません。</p>';
        }
        snapshot.forEach(doc => {
            const vehicle = doc.data();
            const card = document.createElement('div');
            card.className = 'vehicle-card';
            card.dataset.id = doc.id;
            card.innerHTML = `<h3>${vehicle.manufacturer || ''} ${vehicle.name}</h3><p>${vehicle.modelCode || ''}</p>`;
            DOMElements.vehicleListContainer.appendChild(card);
        });
    }, err => console.error(err));
}

// ログアウト時に監視を停止
export function stopVehicleUpdates() {
    if (unsubscribeVehicles) {
        unsubscribeVehicles();
        unsubscribeVehicles = null;
    }
}

// 車両詳細を表示
export async function showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId) {
    showModule('vehicle-detail-view');
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists) { DOMElements.backToListButton.click(); return; }
    const vehicleData = vehicleDoc.data();
    DOMElements.detailVehicleName.textContent = `${vehicleData.manufacturer || ''} ${vehicleData.name}`;
    currentVehicleId = vehicleId; // グローバル変数にセット

    // 基本情報タブ
    DOMElements.basicInfoContent.innerHTML = `
        <p><strong>メーカー:</strong> ${vehicleData.manufacturer || '未設定'}</p>
        <p><strong>車名:</strong> ${vehicleData.name || '未設定'}</p>
        <p><strong>グレード:</strong> ${vehicleData.grade || '未設定'}</p>
        <p><strong>年式:</strong> ${vehicleData.year || '未設定'}</p>
        <p><strong>型式:</strong> ${vehicleData.modelCode || '未設定'}</p>
        <p><strong>車台番号:</strong> ${vehicleData.vin || '未設定'}</p>
        <button id="edit-basic-info-button" class="edit-button">基本情報を編集</button>`;
    
    document.getElementById('edit-basic-info-button').addEventListener('click', () => {
        const form = DOMElements.vehicleForm;
        form.querySelector('#vehicle-id').value = vehicleId;
        form.querySelector('#vehicle-manufacturer').value = vehicleData.manufacturer || '';
        form.querySelector('#vehicle-name').value = vehicleData.name || '';
        form.querySelector('#vehicle-grade').value = vehicleData.grade || '';
        form.querySelector('#vehicle-year').value = vehicleData.year || '';
        form.querySelector('#vehicle-model-code').value = vehicleData.modelCode || '';
        form.querySelector('#vehicle-vin').value = vehicleData.vin || '';
        DOMElements.vehicleModal.querySelector('h3').textContent = '基本情報を編集';
        DOMElements.vehicleModal.classList.remove('hidden');
    });

    // 各タブ描画
    await renderMaintenanceLogs(vehicleId, DOMElements);
    await renderCustomizations(vehicleId, DOMElements);
    await renderKanban(vehicleId, DOMElements);
    await renderSetups(vehicleId, DOMElements);
    
    showDetailTab('basic-info');
}

// --- 内部用描画関数 ---

async function renderMaintenanceLogs(vehicleId, DOMElements) {
    const container = DOMElements.maintenanceLogsContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('maintenance_logs').orderBy('date', 'desc').get();
    if(snapshot.empty) container.innerHTML = '<p>整備履歴はありません。</p>';
    snapshot.forEach(doc => {
        const log = doc.data();
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `
            <p><strong>${new Date(log.date.replace(/-/g, '/')).toLocaleDateString()}</strong> - ${log.task}</p>
            <p>メモ: ${log.notes || 'なし'}</p>
            <div class="card-actions">
                <button class="delete-button" data-id="${doc.id}">削除</button>
            </div>`;
        container.appendChild(item);
    });
}

async function renderCustomizations(vehicleId, DOMElements) {
    const container = DOMElements.customizationsContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('customizations').orderBy('part').get();
    if(snapshot.empty) container.innerHTML = '<p>カスタマイズ情報はありません。</p>';
    snapshot.forEach(doc => {
        const custom = doc.data();
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<p><strong>${custom.part}</strong> (${custom.category || 'その他'})</p><p>${custom.details || '詳細なし'}</p><div class="card-actions"><button class="delete-button" data-id="${doc.id}">削除</button></div>`;
        container.appendChild(item);
    });
}

async function renderKanban(vehicleId, DOMElements) {
    ['todo', 'inprogress', 'waiting', 'done'].forEach(status => {
        const col = document.getElementById(`kanban-${status}`);
        if(col) col.innerHTML = '';
    });

    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('tasks').orderBy('updatedAt', 'desc').get();
    
    snapshot.forEach(doc => {
        const task = doc.data();
        const card = document.createElement('div');
        card.className = 'task-card';
        card.dataset.id = doc.id;
        const assigneeInitial = task.assignee ? task.assignee.charAt(0) : '?';
        
        // 日付の表示 (MM/DD形式)
        let dateHtml = '';
        if (task.dueDate) {
            const dateStr = task.dueDate.replace(/-/g, '/').slice(5); // "2023-11-15" -> "11/15"
            dateHtml = `<span class="task-date" title="期限: ${task.dueDate}">📅 ${dateStr}</span>`;
        }

        card.innerHTML = `
            <div class="task-title">${task.title}</div>
            <div class="task-meta">
                <span><span class="task-assignee-icon">${assigneeInitial}</span>${task.assignee || '未割当'}</span>
                ${dateHtml}
            </div>
        `;
        const column = document.getElementById(`kanban-${task.status}`);
        if (column) column.appendChild(card);
    });
}

async function renderSetups(vehicleId, DOMElements) {
    const container = DOMElements.setupLogContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('setups').orderBy('date', 'desc').get();
    
    if (snapshot.empty) {
        container.innerHTML = '<p>セッティング記録はまだありません。</p>';
        return;
    }

    snapshot.forEach(doc => {
        const s = doc.data();
        const el = document.createElement('div');
        el.className = 'setup-item';
        el.innerHTML = `
            <div class="setup-header">
                <span>${s.date} @ ${s.course}</span>
            </div>
            <div class="setup-grid">
                <div>
                    <strong>足回り</strong><br>
                    減衰: F ${s.suspension.damperF || '-'} / R ${s.suspension.damperR || '-'}<br>
                    バネ: ${s.suspension.spring || '-'}, キャンバー: ${s.suspension.camber || '-'}
                </div>
                <div>
                    <strong>タイヤ</strong><br>
                    銘柄: ${s.tire.name || '-'}<br>
                    内圧: F ${s.tire.airF || '-'} / R ${s.tire.airR || '-'}
                </div>
            </div>
            <div class="setup-comment-box">
                ドライバー: ${s.comment || 'なし'}
            </div>
        `;
        container.appendChild(el);
    });
}