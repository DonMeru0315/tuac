// db をインポート
import { db } from './firebase-init.js';
// ★ main.js からの import をすべて削除 ★
// import { DOMElements, showModule, showDetailTab } from './main.js';

let currentVehicleId = null;
let unsubscribeVehicles = null; // リアルタイム監視を解除するための変数

// ★ DOMElements とユーティリティ関数を引数で受け取る ★
export function setupVehicleHandlers(DOMElements, showModule, showDetailTab, onVehicleClick) {
    
    // --- 車両管理 (リスト) ---
    DOMElements.showAddVehicleButton.addEventListener('click', () => {
        DOMElements.vehicleForm.reset(); // ★これでエラーが解消されます★
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
        if (id) await onVehicleClick(id); // ★編集だった場合は詳細を再描画
    });

    // 車両リストのクリック (main.js から渡された onVehicleClick を呼び出す)
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
        showModule('maintenance-module'); // ★引数で受け取った関数を呼び出す★
        currentVehicleId = null;
    });

    // --- 整備履歴 ---
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
            mileage: parseInt(DOMElements.maintenanceLogForm.querySelector('#log-mileage').value) || null,
            notes: DOMElements.maintenanceLogForm.querySelector('#log-notes').value,
        };
        await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').add(data);
        DOMElements.maintenanceLogModal.classList.add('hidden');
        await renderMaintenanceLogs(currentVehicleId, DOMElements); // ★ DOMElements を渡す ★
    });

    DOMElements.maintenanceLogsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この整備履歴を削除しますか？') && currentVehicleId) {
                await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(e.target.dataset.id).delete();
                await renderMaintenanceLogs(currentVehicleId, DOMElements); // ★ DOMElements を渡す ★
            }
        }
    });

    // --- カスタマイズ ---
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
        await renderCustomizations(currentVehicleId, DOMElements); // ★ DOMElements を渡す ★
    });

    DOMElements.customizationsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この情報を削除しますか？') && currentVehicleId) {
                await db.collection('vehicles').doc(currentVehicleId).collection('customizations').doc(e.target.dataset.id).delete();
                await renderCustomizations(currentVehicleId, DOMElements); // ★ DOMElements を渡す ★
            }
        }
    });
}

// --- データ取得・描画関数 (main.js から呼び出される) ---

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
        // ★ クリックリスナーは setupVehicleHandlers に移動しました ★
    }, err => console.error(err));
}

// ログアウト時に監視を停止するための関数
export function stopVehicleUpdates() {
    if (unsubscribeVehicles) {
        unsubscribeVehicles();
        unsubscribeVehicles = null;
    }
}

// 車両詳細を表示 (main.js から呼び出される)
export async function showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId) {
    showModule('vehicle-detail-view');
    const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
    if (!vehicleDoc.exists) { DOMElements.backToListButton.click(); return; }
    const vehicleData = vehicleDoc.data();
    DOMElements.detailVehicleName.textContent = `${vehicleData.manufacturer || ''} ${vehicleData.name}`;

    // 基本情報タブ
    DOMElements.basicInfoContent.innerHTML = `
        <p><strong>メーカー:</strong> ${vehicleData.manufacturer || '未設定'}</p>
        <p><strong>車名:</strong> ${vehicleData.name || '未設定'}</p>
        <p><strong>グレード:</strong> ${vehicleData.grade || '未設定'}</p>
        <p><strong>年式:</strong> ${vehicleData.year || '未設定'}</p>
        <p><strong>型式:</strong> ${vehicleData.modelCode || '未設定'}</p>
        <p><strong>車台番号:</strong> ${vehicleData.vin || '未設定'}</p>
        <button id="edit-basic-info-button" class="edit-button">基本情報を編集</button>`;
    
    // 基本情報編集ボタンのリスナー
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

    // 他のタブのコンテンツも描画
    await renderMaintenanceLogs(vehicleId, DOMElements);
    await renderCustomizations(vehicleId, DOMElements);
    showDetailTab('basic-info');
}

// 整備履歴を描画
async function renderMaintenanceLogs(vehicleId, DOMElements) {
    const container = DOMElements.maintenanceLogsContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('maintenance_logs').orderBy('date', 'desc').get();
    if(snapshot.empty) container.innerHTML = '<p>整備履歴はありません。</p>';
    snapshot.forEach(doc => {
        const log = doc.data();
        const item = document.createElement('div');
        item.className = 'history-item';
        item.innerHTML = `<p><strong>${new Date(log.date.replace(/-/g, '/')).toLocaleDateString()}</strong> - ${log.task}</p><p>走行距離: ${log.mileage || 'N/A'} km</p><p>メモ: ${log.notes || 'なし'}</p><div class="card-actions"><button class="delete-button" data-id="${doc.id}">削除</button></div>`;
        container.appendChild(item);
    });
}

// カスタマイズを描画
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
