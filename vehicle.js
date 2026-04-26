import { db, auth, firestore } from './firebase-init.js';
let currentVehicleId = null;
let unsubscribeVehicles = null; // リアルタイム監視を解除するための変数

// DOMElements とユーティリティ関数を引数で受け取る
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
        const user = auth.currentUser; // ユーザー情報取得
        const data = {
            manufacturer: DOMElements.vehicleForm.querySelector('#vehicle-manufacturer').value,
            name: DOMElements.vehicleForm.querySelector('#vehicle-name').value,
            grade: DOMElements.vehicleForm.querySelector('#vehicle-grade').value,
            year: yearValue ? parseInt(yearValue, 10) : null,
            modelCode: DOMElements.vehicleForm.querySelector('#vehicle-model-code').value,
            vin: DOMElements.vehicleForm.querySelector('#vehicle-vin').value,
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };
        let promise;
        if (id) {
            promise = db.collection('vehicles').doc(id).update(data);
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            promise = db.collection('vehicles').add(data);
        }
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
        DOMElements.maintenanceLogForm.querySelector('#log-id').value = ''; // IDをクリア
        DOMElements.maintenanceLogModal.querySelector('h3').textContent = '整備履歴を追加';
        DOMElements.deleteLogButton.classList.add('hidden'); // 削除ボタンを隠す
        DOMElements.maintenanceLogModal.classList.remove('hidden');
    });

    DOMElements.syncDoneTasksButton.addEventListener('click', async () => {
        if (!currentVehicleId) return;

        // 削除を伴うため、確認ダイアログを追加（安全第一）
        if (!confirm('「完了」列のタスクを整備記録に移し、タスク一覧から完全に削除します。\nよろしいですか？')) {
            return;
        }

        const btn = DOMElements.syncDoneTasksButton;
        btn.disabled = true;
        btn.textContent = '処理中...';

        try {
            const tasksRef = db.collection('vehicles').doc(currentVehicleId).collection('tasks');
            const logsRef = db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs');
            
            // 'copiedToLogs' の判定は不要なので、シンプルに 'done' だけを取得
            const snapshot = await tasksRef
                .where('status', '==', 'done')
                .get();

            if (snapshot.empty) {
                alert('移動する完了タスクはありません。');
                return; // finallyへ
            }

            const batch = db.batch();
            let count = 0;

            snapshot.forEach(doc => {
                const task = doc.data();
                
                // 3. 整備履歴データを作成
                // 日付の優先度: 完了日(doneAt) > 期限(dueDate) > 今日
                let logDateStr = new Date().toISOString().split('T')[0];
                if (task.doneAt && task.doneAt.toDate) {
                    logDateStr = task.doneAt.toDate().toISOString().split('T')[0];
                } else if (task.dueDate) {
                    logDateStr = task.dueDate;
                }

                const logData = {
                    date: logDateStr,
                    task: task.title || '（タイトルなし）',
                    // メモに担当者などの情報を付記しておくと親切です
                    notes: `${task.notes || ''} (担当: ${task.assignee || '未定'})`.trim(),
                    
                    // 監査ログ（誰がいつ移したか）
                    createdAt: firestore.FieldValue.serverTimestamp(),
                    createdBy: auth.currentUser ? auth.currentUser.displayName : '不明',
                    createdById: auth.currentUser ? auth.currentUser.uid : '不明'
                };
                
                // バッチに追加：記録の作成
                const newLogRef = logsRef.doc();
                batch.set(newLogRef, logData);
                batch.delete(doc.ref);
                count++;
            });

            // 5. バッチ処理を実行（ここで一括 作成＆削除）
            await batch.commit();

            alert(`${count}件のタスクを整備記録に移動しました。`);

            // 6. 画面の再描画
            await renderMaintenanceLogs(currentVehicleId, DOMElements);
            await renderKanban(currentVehicleId, DOMElements);

        } catch (err) {
            console.error("タスク移動エラー:", err);
            alert("処理に失敗しました。");
        } finally {
            btn.disabled = false;
            btn.textContent = '🔄 完了タスクを履歴に反映';
        }
    });

    // 整備履歴フォームの送信 (新規・編集 兼用)
    DOMElements.maintenanceLogForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const user = auth.currentUser;
        const logId = DOMElements.maintenanceLogForm.querySelector('#log-id').value;
        const data = {
            date: DOMElements.maintenanceLogForm.querySelector('#log-date').value,
            task: DOMElements.maintenanceLogForm.querySelector('#log-task').value,
            notes: DOMElements.maintenanceLogForm.querySelector('#log-notes').value,
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };
        
        if (logId) {
            // logId があれば「更新」
            await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(logId).update(data);
        } else {
            // logId がなければ「新規追加」
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').add(data);
        }
        
        DOMElements.maintenanceLogModal.classList.add('hidden');
        await renderMaintenanceLogs(currentVehicleId, DOMElements);
    });

    // 整備履歴リストの「項目」クリック (編集モーダルを開く)
    DOMElements.maintenanceLogsContainer.addEventListener('click', async e => {
        // .delete-button ではなく、.log-item (リスト項目自体) を探す
        const item = e.target.closest('.log-item');
        if (item && currentVehicleId) {
            const logId = item.dataset.id;
            await openLogModalForEdit(logId, DOMElements); // 上で追加したヘルパー関数を呼ぶ
        }
    });

    // 整備履歴モーダルの「削除」ボタン
    DOMElements.deleteLogButton.addEventListener('click', async () => {
        const logId = DOMElements.maintenanceLogForm.querySelector('#log-id').value;
        if (!logId || !currentVehicleId) return;
        
        if (confirm('この整備履歴を本当に削除しますか？')) {
            try {
                await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(logId).delete();
                DOMElements.maintenanceLogModal.classList.add('hidden');
                await renderMaintenanceLogs(currentVehicleId, DOMElements); // リストを再描画
            } catch (err) {
                console.error("削除エラー:", err);
                alert("削除に失敗しました。");
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
        const user = auth.currentUser;
        const data = {
            part: DOMElements.customizationForm.querySelector('#custom-part').value,
            category: DOMElements.customizationForm.querySelector('#custom-category').value,
            details: DOMElements.customizationForm.querySelector('#custom-details').value,
            createdAt: firestore.FieldValue.serverTimestamp(),
            createdBy: user ? user.displayName : '不明',
            createdById: user ? user.uid : '不明',
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
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

    // 「＋ タスクを追加」ボタン
    DOMElements.showAddTaskButton.addEventListener('click', () => {
        DOMElements.taskForm.reset();
        DOMElements.taskModal.querySelector('h3').textContent = 'タスクを追加';
        delete DOMElements.taskModal.dataset.editingId;
        // ログインユーザー名を担当者に自動入力
        const user = auth.currentUser;
        if (user && user.displayName) {
            DOMElements.taskForm.querySelector('#task-assignee').value = user.displayName;
        }
        // 削除ボタンを隠す
        if (DOMElements.deleteTaskButton) {
            DOMElements.deleteTaskButton.classList.add('hidden');
        }
        DOMElements.taskModal.classList.remove('hidden');
    });

    // タスクフォームの送信（保存）
    DOMElements.taskForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const user = auth.currentUser;
        const taskId = DOMElements.taskModal.dataset.editingId;
        const newStatus = DOMElements.taskForm.querySelector('#task-status').value;

        // data オブジェクトから doneAt と、重複した updatedAt を削除
        const data = {
            title: DOMElements.taskForm.querySelector('#task-title').value,
            assignee: DOMElements.taskForm.querySelector('#task-assignee').value,
            status: newStatus,
            dueDate: DOMElements.taskForm.querySelector('#task-due-date').value,
            notes: DOMElements.taskForm.querySelector('#task-notes').value,
            updatedAt: firestore.FieldValue.serverTimestamp(), // 正しい updatedAt のみ残す
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };

        if (taskId) {
            // --- 更新 (Update) ---
            if (newStatus === 'done') {
                data.doneAt = new Date();
            } else {
                data.doneAt = firestore.FieldValue.delete(); 
            }
            await db.collection('vehicles').doc(currentVehicleId).collection('tasks').doc(taskId).update(data);
        
        } else {
            // --- 新規作成 (Add) ---
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';

            if (newStatus === 'done') {
                data.doneAt = new Date(); // 新規作成時は 'done' の時だけフィールドを追加
            }

            await db.collection('vehicles').doc(currentVehicleId).collection('tasks').add(data);
        }
        
        DOMElements.taskModal.classList.add('hidden');
        renderKanban(currentVehicleId, DOMElements);
    });

    // 削除ボタンのクリックイベント
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
        DOMElements.taskForm.querySelector('#task-notes').value = task.notes || '';
        DOMElements.taskModal.dataset.editingId = taskId;
        DOMElements.taskModal.querySelector('h3').textContent = 'タスクを編集';  
        // 編集時は削除ボタンを表示
        if (DOMElements.deleteTaskButton) {
            DOMElements.deleteTaskButton.classList.remove('hidden');
        }
        DOMElements.taskModal.classList.remove('hidden');
    });

    // --- セッティングログ ---

    // 「＋ セッティングを記録」ボタン
    DOMElements.showAddSetupButton.addEventListener('click', () => {
        DOMElements.setupForm.reset();
        DOMElements.setupForm.querySelector('#setup-id').value = ''; // IDをクリア
        DOMElements.setupModal.querySelector('h3').textContent = 'セッティングを記録';
        DOMElements.deleteSetupButton.classList.add('hidden'); // 削除ボタンを隠す
        DOMElements.setupModal.classList.remove('hidden');
    });

    // セッティングフォームの送信 (新規・編集 兼用)
    DOMElements.setupForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const user = auth.currentUser;
        const setupId = DOMElements.setupForm.querySelector('#setup-id').value;

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
            
            // タイムスタンプとユーザー情報を追加
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };

        if (setupId) {
            // setupId があれば「更新」
            await db.collection('vehicles').doc(currentVehicleId).collection('setups').doc(setupId).update(data);
        } else {
            // setupId がなければ「新規追加」
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('vehicles').doc(currentVehicleId).collection('setups').add(data);
        }

        DOMElements.setupModal.classList.add('hidden');
        renderSetups(currentVehicleId, DOMElements);
    });

    // ★ 新設: セッティングリストの「項目」クリック (編集モーダルを開く)
    DOMElements.setupLogContainer.addEventListener('click', async e => {
        const item = e.target.closest('.setup-item');
        if (item && currentVehicleId) {
            const setupId = item.dataset.id;
            await openSetupModalForEdit(setupId, DOMElements);
        }
    });

    // ★ 新設: セッティングモーダルの「削除」ボタン
    DOMElements.deleteSetupButton.addEventListener('click', async () => {
        const setupId = DOMElements.setupForm.querySelector('#setup-id').value;
        if (!setupId || !currentVehicleId) return;
        
        if (confirm('このセッティング記録を本当に削除しますか？')) {
            try {
                await db.collection('vehicles').doc(currentVehicleId).collection('setups').doc(setupId).delete();
                DOMElements.setupModal.classList.add('hidden');
                await renderSetups(currentVehicleId, DOMElements); // リストを再描画
            } catch (err) {
                console.error("削除エラー:", err);
                alert("削除に失敗しました。");
            }
        }
    });

    // 予備部品を登録ボタン
    DOMElements.showAddPartButton.addEventListener('click', () => {
        DOMElements.sparePartForm.reset();
        DOMElements.sparePartModal.querySelector('h3').textContent = '予備部品を登録';
        delete DOMElements.sparePartModal.dataset.editingId;
        DOMElements.deletePartButton.classList.add('hidden');
        DOMElements.sparePartModal.classList.remove('hidden');
    });

    // 予備部品リストのアイテムをクリック（編集）
    DOMElements.sparePartsContainer.addEventListener('click', async e => {
        const item = e.target.closest('.spare-part-item');
        if (item && currentVehicleId) {
            await openPartModalForEdit(item.dataset.id, DOMElements);
        }
    });

    // 予備部品フォームの送信（保存/更新）
    DOMElements.sparePartForm.addEventListener('submit', async e => {
        e.preventDefault();
        if (!currentVehicleId) return;
        const user = auth.currentUser;
        const partId = DOMElements.sparePartModal.dataset.editingId;
        const data = {
            name: DOMElements.sparePartForm.querySelector('#part-name').value,
            partNumber: DOMElements.sparePartForm.querySelector('#part-number').value,
            quantity: DOMElements.sparePartForm.querySelector('#part-quantity').value,
            location: DOMElements.sparePartForm.querySelector('#part-location').value,
            notes: DOMElements.sparePartForm.querySelector('#part-notes').value,
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };
        if (partId) {
            await db.collection('vehicles').doc(currentVehicleId).collection('spare_parts').doc(partId).update(data);
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('vehicles').doc(currentVehicleId).collection('spare_parts').add(data);
        }
        DOMElements.sparePartModal.classList.add('hidden');
        renderSpareParts(currentVehicleId, DOMElements); // リストを再描画
    });

    // 予備部品モーダルの「削除」ボタン
    DOMElements.deletePartButton.addEventListener('click', async () => {
        const partId = DOMElements.sparePartModal.dataset.editingId;
        if (!partId || !currentVehicleId) return;
        if (confirm('この予備部品情報を本当に削除しますか？')) {
            try {
                await db.collection('vehicles').doc(currentVehicleId).collection('spare_parts').doc(partId).delete();
                DOMElements.sparePartModal.classList.add('hidden');
                renderSpareParts(currentVehicleId, DOMElements); // リストを再描画
            } catch (err) {
                console.error("削除エラー:", err);
                alert("削除に失敗しました。");
            }
        }
    });
}

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
            card.innerHTML = `
                <div class="vehicle-info">
                    <h3>${vehicle.name}</h3>
                    <div class="vehicle-meta">
                        <span class="maker-badge">${vehicle.manufacturer || '未設定'}</span>
                        <span class="model-code">${vehicle.modelCode || ''}</span>
                    </div>
                </div>

                <div class="vehicle-arrow">›</div>
            `;
            
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
    showDetailTab('basic-info');
    DOMElements.detailVehicleName.textContent = '読み込み中...';
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
    await renderSpareParts(vehicleId, DOMElements);
}

// --- 内部用描画関数 ---

async function renderMaintenanceLogs(vehicleId, DOMElements) {
    const container = DOMElements.maintenanceLogsContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('maintenance_logs').orderBy('date', 'desc').get();
    
    if(snapshot.empty) {
        container.innerHTML = '<p>整備履歴はありません。</p>';
        return; // 空の場合はここで処理終了
    }
    
    snapshot.forEach(doc => {
        const log = doc.data();
        const item = document.createElement('div');
        item.className = 'history-item log-item'; 
        item.dataset.id = doc.id; 
        
        item.innerHTML = `
            <p><strong>${new Date(log.date.replace(/-/g, '/')).toLocaleDateString()}</strong> - ${log.task}</p>
            <p>[メモ] ${log.notes || 'なし'}</p>
            `;
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
                <span>${task.assignee || '未割当'}</span>
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
        el.className = 'setup-item'; // このクラスがクリック対象
        el.dataset.id = doc.id;      // ★ data-id を追加
        el.style.cursor = 'pointer'; // ★ クリック可能であることを示す
        
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

// 予備部品編集モーダルを開く
async function openPartModalForEdit(partId, DOMElements) {
    if (!currentVehicleId) return;
    try {
        const doc = await db.collection('vehicles').doc(currentVehicleId).collection('spare_parts').doc(partId).get();
        if (!doc.exists) {
            alert("部品が見つかりません。");
            return;
        }
        const part = doc.data();
        DOMElements.sparePartForm.reset();
        DOMElements.sparePartModal.dataset.editingId = partId;
        DOMElements.sparePartModal.querySelector('h3').textContent = '予備部品を編集';
        
        DOMElements.sparePartForm.querySelector('#part-name').value = part.name || '';
        DOMElements.sparePartForm.querySelector('#part-number').value = part.partNumber || '';
        DOMElements.sparePartForm.querySelector('#part-quantity').value = part.quantity || '';
        DOMElements.sparePartForm.querySelector('#part-location').value = part.location || '';
        DOMElements.sparePartForm.querySelector('#part-notes').value = part.notes || '';

        DOMElements.deletePartButton.classList.remove('hidden');
        DOMElements.sparePartModal.classList.remove('hidden');
    } catch (err) {
        console.error("予備部品の読み込みエラー:", err);
        alert("部品の読み込みに失敗しました。");
    }
}

// 予備部品リストを描画
async function renderSpareParts(vehicleId, DOMElements) {
    const container = DOMElements.sparePartsContainer;
    container.innerHTML = '';
    const snapshot = await db.collection('vehicles').doc(vehicleId).collection('spare_parts').orderBy('name', 'asc').get();
    
    if (snapshot.empty) {
        container.innerHTML = '<p>予備部品はまだ登録されていません。</p>';
        return;
    }

    snapshot.forEach(doc => {
        const part = doc.data();
        const item = document.createElement('div');
        // 既存の .history-item スタイルを流用しつつ、クリック用に .spare-part-item を追加
        item.className = 'history-item spare-part-item'; 
        item.dataset.id = doc.id;
        
        // .spare-part-layout (CSSで定義) を使ってレイアウトする
        item.innerHTML = `
            <div class="spare-part-layout">
                <div class="part-main-info">
                    <span class="part-name">${part.name}</span>
                    <span class="part-number">${part.partNumber || '品番なし'}</span>
                </div>
                <div class="part-stock-info">
                    <span class="part-quantity">数量: ${part.quantity || 'N/A'}</span>
                    <span class="part-location">📍 ${part.location || '場所不明'}</span>
                </div>
            </div>
            ${part.notes ? `<p class="part-notes">メモ: ${part.notes}</p>` : ''}
        `;
        container.appendChild(item);
    });
}

async function openLogModalForEdit(logId, DOMElements) {
    if (!currentVehicleId) return;
    try {
        const doc = await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(logId).get();
        if (!doc.exists) {
            alert("履歴が見つかりません。");
            return;
        }
        const log = doc.data();
        DOMElements.maintenanceLogForm.reset();
        DOMElements.maintenanceLogModal.querySelector('h3').textContent = '整備履歴を編集';
        
        // フォームにデータを設定
        DOMElements.maintenanceLogForm.querySelector('#log-id').value = logId;
        DOMElements.maintenanceLogForm.querySelector('#log-date').value = log.date;
        DOMElements.maintenanceLogForm.querySelector('#log-task').value = log.task;
        DOMElements.maintenanceLogForm.querySelector('#log-notes').value = log.notes || '';

        // 削除ボタンを表示
        DOMElements.deleteLogButton.classList.remove('hidden');
        DOMElements.maintenanceLogModal.classList.remove('hidden');
    } catch (err) {
        console.error("整備履歴の読み込みエラー:", err);
        alert("履歴の読み込みに失敗しました。");
    }
}

async function openSetupModalForEdit(setupId, DOMElements) {
    if (!currentVehicleId) return;
    try {
        const doc = await db.collection('vehicles').doc(currentVehicleId).collection('setups').doc(setupId).get();
        if (!doc.exists) {
            alert("セッティング記録が見つかりません。");
            return;
        }
        const s = doc.data();
        const form = DOMElements.setupForm;
        form.reset();
        DOMElements.setupModal.querySelector('h3').textContent = 'セッティングを編集';
        
        // フォームにデータを設定
        form.querySelector('#setup-id').value = setupId;
        form.querySelector('#setup-date').value = s.date;
        form.querySelector('#setup-course').value = s.course;
        
        if (s.suspension) {
            form.querySelector('#setup-damper-f').value = s.suspension.damperF || '';
            form.querySelector('#setup-damper-r').value = s.suspension.damperR || '';
            form.querySelector('#setup-spring').value = s.suspension.spring || '';
            form.querySelector('#setup-camber').value = s.suspension.camber || '';
        }
        if (s.tire) {
            form.querySelector('#setup-tire').value = s.tire.name || '';
            form.querySelector('#setup-air-f').value = s.tire.airF || '';
            form.querySelector('#setup-air-r').value = s.tire.airR || '';
        }
        form.querySelector('#setup-comment').value = s.comment || '';

        // 削除ボタンを表示
        DOMElements.deleteSetupButton.classList.remove('hidden');
        DOMElements.setupModal.classList.remove('hidden');
    } catch (err) {
        console.error("セッティングの読み込みエラー:", err);
        alert("記録の読み込みに失敗しました。");
    }
}
