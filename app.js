document.addEventListener('DOMContentLoaded', () => {

    // --- Firebase設定 ---
    const firebaseConfig = {
      apiKey: "AIzaSyBMo_ZNtdyUF719Ob6sIcDw6K3tFiGbr7c",
      authDomain: "tuac-club-auto-log.firebaseapp.com",
      projectId: "tuac-club-auto-log",
      storageBucket: "tuac-club-auto-log.appspot.com",
      messagingSenderId: "374595743937",
      appId: "1:374595743937:web:95365478a5e5c0b0802440"
    };

    // Firebaseの初期化
    firebase.initializeApp(firebaseConfig);
    const auth = firebase.auth();
    const db = firebase.firestore();

    // --- グローバル変数 ---
    let isLoginMode = true;
    let currentMonth = new Date();
    let unsubscribeVehicles = null;
    let currentVehicleId = null;

    // --- DOM要素の取得 ---
    const DOMElements = {
        // 認証
        loginRegisterArea: document.getElementById('login-register-area'),
        userInfo: document.getElementById('user-info'),
        userEmail: document.getElementById('user-email'),
        authForm: document.getElementById('auth-form'),
        logoutButton: document.getElementById('logout-button'),
        toggleModeButton: document.getElementById('toggle-mode-button'),
        formTitle: document.getElementById('form-title'),
        authButton: document.getElementById('auth-button'),
        loginPrompt: document.getElementById('login-prompt'),
        // ナビゲーション
        mainContent: document.getElementById('main-content'),
        navButtons: document.querySelectorAll('.nav-button'),
        moduleContents: document.querySelectorAll('.module-content'),
        // 車両管理
        vehicleListContainer: document.getElementById('vehicle-list-container'),
        showAddVehicleButton: document.getElementById('show-add-vehicle-button'),
        vehicleModal: document.getElementById('vehicle-modal'),
        vehicleForm: document.getElementById('vehicle-form'),
        // 車両詳細
        vehicleDetailView: document.getElementById('vehicle-detail-view'),
        backToListButton: document.getElementById('back-to-list-button'),
        detailVehicleName: document.getElementById('detail-vehicle-name'),
        detailNavButtons: document.querySelectorAll('.detail-nav-button'),
        detailTabContents: document.querySelectorAll('.detail-tab-content'),
        basicInfoContent: document.getElementById('basic-info-content'),
        maintenanceLogsContainer: document.getElementById('maintenance-logs-container'),
        customizationsContainer: document.getElementById('customizations-container'),
        showAddLogButton: document.getElementById('show-add-log-button'),
        showAddCustomButton: document.getElementById('show-add-custom-button'),
        maintenanceLogModal: document.getElementById('maintenance-log-modal'),
        maintenanceLogForm: document.getElementById('maintenance-log-form'),
        customizationModal: document.getElementById('customization-modal'),
        customizationForm: document.getElementById('customization-form'),
        // 情報共有
        infoNavButtons: document.querySelectorAll('.info-nav-button'),
        infoTabContents: document.querySelectorAll('.info-tab-content'),
        showAddWikiButton: document.getElementById('show-add-wiki-button'),
        wikiModal: document.getElementById('wiki-modal'),
        wikiForm: document.getElementById('wiki-form'),
        wikiListContainer: document.getElementById('wiki-list-container'),
        wikiArticleView: document.getElementById('wiki-article-view'),
        calendarGrid: document.getElementById('calendar-grid'),
        calendarMonthYear: document.getElementById('calendar-month-year'),
        prevMonthButton: document.getElementById('prev-month-button'),
        nextMonthButton: document.getElementById('next-month-button'),
        showAddEventButton: document.getElementById('show-add-event-button'),
        eventModal: document.getElementById('event-modal'),
        eventForm: document.getElementById('event-form'),
        cancelButtons: document.querySelectorAll('.cancel-button'),
    };

    // --- 認証機能 ---
    auth.onAuthStateChanged(user => {
        if (user) {
            DOMElements.loginRegisterArea.classList.add('hidden');
            DOMElements.userInfo.classList.remove('hidden');
            DOMElements.userEmail.textContent = user.email;
            DOMElements.mainContent.classList.remove('hidden');
            DOMElements.loginPrompt.classList.add('hidden');
            initializeMainContent();
        } else {
            DOMElements.loginRegisterArea.classList.remove('hidden');
            DOMElements.userInfo.classList.add('hidden');
            DOMElements.mainContent.classList.add('hidden');
            DOMElements.loginPrompt.remove('hidden');
            if (unsubscribeVehicles) unsubscribeVehicles();
        }
    });

    DOMElements.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        const authPromise = isLoginMode ? auth.signInWithEmailAndPassword(email, password) : auth.createUserWithEmailAndPassword(email, password);
        authPromise.catch(error => alert((isLoginMode ? "ログイン" : "新規登録") + "失敗: " + error.message));
    });

    DOMElements.logoutButton.addEventListener('click', () => auth.signOut());

    DOMElements.toggleModeButton.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        DOMElements.formTitle.textContent = isLoginMode ? 'ログイン' : '新規登録';
        DOMElements.authButton.textContent = isLoginMode ? 'ログイン' : '登録する';
        DOMElements.toggleModeButton.textContent = isLoginMode ? '新規登録はこちら' : 'ログインはこちら';
    });

    // --- メインコンテンツ初期化 ---
    function initializeMainContent() {
        showModule('maintenance-module');
        fetchVehicles();
    }

    // --- ナビゲーション機能 ---
    function showModule(moduleId) {
        DOMElements.moduleContents.forEach(m => m.classList.add('hidden'));
        DOMElements.navButtons.forEach(b => b.classList.remove('active'));
        const moduleToShow = document.getElementById(moduleId);
        if (moduleToShow) moduleToShow.classList.remove('hidden');
        const activeButton = document.querySelector(`.nav-button[data-module="${moduleId}"]`);
        if (activeButton) activeButton.classList.add('active');
    }

    DOMElements.navButtons.forEach(b => {
        b.addEventListener('click', () => {
            showModule(b.dataset.module);
            if (b.dataset.module === 'info-module') {
                showInfoTab('wiki');
                showWikiList();
                renderCalendar();
            }
        });
    });

    function showInfoTab(tabId) {
        DOMElements.infoNavButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.info-nav-button[data-infotab="${tabId}"]`)?.classList.add('active');
        DOMElements.infoTabContents.forEach(c => c.id === `${tabId}-tab` ? c.classList.remove('hidden') : c.classList.add('hidden'));
    }
    DOMElements.infoNavButtons.forEach(b => b.addEventListener('click', () => showInfoTab(b.dataset.infotab)));

    DOMElements.backToListButton.addEventListener('click', () => {
        DOMElements.vehicleDetailView.classList.add('hidden');
        showModule('maintenance-module');
        currentVehicleId = null;
    });

    // --- モーダル汎用機能 ---
    DOMElements.cancelButtons.forEach(b => b.addEventListener('click', () => {
        b.closest('.modal-background').classList.add('hidden');
    }));

    // --- 車両管理 ---
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
        // ★修正★ 年式を数値に変換。空の場合はnullを保存。
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
        if (id) await showVehicleDetail(id);
    });

    function fetchVehicles() {
        if (unsubscribeVehicles) unsubscribeVehicles();
        unsubscribeVehicles = db.collection('vehicles').orderBy('name').onSnapshot(snapshot => {
            DOMElements.vehicleListContainer.innerHTML = '';
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

    DOMElements.vehicleListContainer.addEventListener('click', e => {
        const card = e.target.closest('.vehicle-card');
        if (card) {
            currentVehicleId = card.dataset.id;
            showVehicleDetail(currentVehicleId);
        }
    });

    // --- 車両詳細 ---
    async function showVehicleDetail(vehicleId) {
        showModule('vehicle-detail-view');
        const vehicleDoc = await db.collection('vehicles').doc(vehicleId).get();
        if (!vehicleDoc.exists) { DOMElements.backToListButton.click(); return; }
        const vehicleData = vehicleDoc.data();
        DOMElements.detailVehicleName.textContent = `${vehicleData.manufacturer || ''} ${vehicleData.name}`;

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

        await renderMaintenanceLogs(vehicleId);
        await renderCustomizations(vehicleId);
        showDetailTab('basic-info');
    }

    function showDetailTab(tabId) {
        DOMElements.detailTabContents.forEach(c => c.classList.add('hidden'));
        DOMElements.detailNavButtons.forEach(b => b.classList.remove('active'));
        document.getElementById(`${tabId}-tab`)?.classList.remove('hidden');
        document.querySelector(`.detail-nav-button[data-detailtab="${tabId}"]`)?.classList.add('active');
    }
    DOMElements.detailNavButtons.forEach(b => b.addEventListener('click', () => showDetailTab(b.dataset.detailtab)));

    // --- 整備履歴 ---
    async function renderMaintenanceLogs(vehicleId) {
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
    DOMElements.showAddLogButton.addEventListener('click', () => {
        DOMElements.maintenanceLogForm.reset();
        DOMElements.maintenanceLogModal.classList.remove('hidden');
    });
    DOMElements.maintenanceLogForm.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            date: DOMElements.maintenanceLogForm.querySelector('#log-date').value,
            task: DOMElements.maintenanceLogForm.querySelector('#log-task').value,
            mileage: parseInt(DOMElements.maintenanceLogForm.querySelector('#log-mileage').value) || null,
            notes: DOMElements.maintenanceLogForm.querySelector('#log-notes').value,
        };
        await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').add(data);
        DOMElements.maintenanceLogModal.classList.add('hidden');
        await renderMaintenanceLogs(currentVehicleId);
    });
    DOMElements.maintenanceLogsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この整備履歴を削除しますか？')) {
                await db.collection('vehicles').doc(currentVehicleId).collection('maintenance_logs').doc(e.target.dataset.id).delete();
                await renderMaintenanceLogs(currentVehicleId);
            }
        }
    });

    // --- カスタマイズ ---
    async function renderCustomizations(vehicleId) {
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
    DOMElements.showAddCustomButton.addEventListener('click', () => {
        DOMElements.customizationForm.reset();
        DOMElements.customizationModal.classList.remove('hidden');
    });
    DOMElements.customizationForm.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            part: DOMElements.customizationForm.querySelector('#custom-part').value,
            category: DOMElements.customizationForm.querySelector('#custom-category').value,
            details: DOMElements.customizationForm.querySelector('#custom-details').value,
        };
        await db.collection('vehicles').doc(currentVehicleId).collection('customizations').add(data);
        DOMElements.customizationModal.classList.add('hidden');
        await renderCustomizations(currentVehicleId);
    });
    DOMElements.customizationsContainer.addEventListener('click', async e => {
        if (e.target.matches('.delete-button')) {
            if (confirm('この情報を削除しますか？')) {
                await db.collection('vehicles').doc(currentVehicleId).collection('customizations').doc(e.target.dataset.id).delete();
                await renderCustomizations(currentVehicleId);
            }
        }
    });

    // --- Wiki ---
    async function showWikiList() {
        DOMElements.wikiArticleView.classList.add('hidden');
        DOMElements.wikiListContainer.classList.remove('hidden');
        DOMElements.wikiListContainer.innerHTML = '';
        const snapshot = await db.collection('wiki').orderBy('updatedAt', 'desc').get();
        snapshot.forEach(doc => {
            const item = document.createElement('div');
            item.className = 'wiki-list-item';
            item.textContent = doc.data().title;
            item.dataset.id = doc.id;
            DOMElements.wikiListContainer.appendChild(item);
        });
    }
    async function showWikiArticle(id) {
        const doc = await db.collection('wiki').doc(id).get();
        if (!doc.exists) { showWikiList(); return; }
        const article = doc.data();
        DOMElements.wikiListContainer.classList.add('hidden');
        DOMElements.wikiArticleView.classList.remove('hidden');
        DOMElements.wikiArticleView.innerHTML = `<button id="back-to-wiki-list">＜ 記事一覧に戻る</button><h2>${article.title}</h2><div class="article-content">${marked.parse(article.content)}</div><div class="article-actions"><button class="edit-button" data-id="${doc.id}">編集</button><button class="delete-button" data-id="${doc.id}">削除</button></div>`;
    }
    DOMElements.wikiListContainer.addEventListener('click', e => {
        if (e.target.matches('.wiki-list-item')) showWikiArticle(e.target.dataset.id);
    });
    DOMElements.wikiArticleView.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (e.target.matches('#back-to-wiki-list')) showWikiList();
        if (e.target.matches('.edit-button')) {
            const doc = await db.collection('wiki').doc(id).get();
            const article = doc.data();
            const form = DOMElements.wikiForm;
            form.querySelector('#wiki-id').value = doc.id;
            form.querySelector('#wiki-title').value = article.title;
            form.querySelector('#wiki-content').value = article.content;
            DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを編集';
            DOMElements.wikiModal.classList.remove('hidden');
        }
        if (e.target.matches('.delete-button')) {
            if (confirm('この記事を削除しますか？')) {
                await db.collection('wiki').doc(id).delete();
                showWikiList();
            }
        }
    });
    DOMElements.showAddWikiButton.addEventListener('click', () => {
        DOMElements.wikiForm.reset();
        DOMElements.wikiForm.querySelector('#wiki-id').value = '';
        DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを新規作成';
        DOMElements.wikiModal.classList.remove('hidden');
    });
    DOMElements.wikiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = DOMElements.wikiForm.querySelector('#wiki-id').value;
        const data = {
            title: DOMElements.wikiForm.querySelector('#wiki-title').value,
            content: DOMElements.wikiForm.querySelector('#wiki-content').value,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        };
        if (id) {
            await db.collection('wiki').doc(id).update(data);
            showWikiArticle(id);
        } else {
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            await db.collection('wiki').add(data);
            showWikiList();
        }
        DOMElements.wikiModal.classList.add('hidden');
    });

    // --- カレンダー ---
    async function renderCalendar() {
        const year = currentMonth.getFullYear();
        const month = currentMonth.getMonth();
        DOMElements.calendarMonthYear.textContent = `${year}年 ${month + 1}月`;
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const snapshot = await db.collection('events').where('date', '>=', firstDay).where('date', '<=', lastDay).get();
        const events = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
        DOMElements.calendarGrid.innerHTML = '';
        for (let i = 0; i < firstDay.getDay(); i++) DOMElements.calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day not-current-month"></div>');
        for (let day = 1; day <= lastDay.getDate(); day++) {
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.innerHTML = `<div class="calendar-day-header">${day}</div>`;
            const dayEvents = events.filter(e => e.date.toDate().getDate() === day);
            dayEvents.forEach(event => {
                const eventDiv = document.createElement('div');
                eventDiv.className = 'calendar-event';
                eventDiv.textContent = event.title;
                eventDiv.dataset.id = event.id;
                dayDiv.appendChild(eventDiv);
            });
            DOMElements.calendarGrid.appendChild(dayDiv);
        }
    }
    DOMElements.prevMonthButton.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() - 1); renderCalendar(); });
    DOMElements.nextMonthButton.addEventListener('click', () => { currentMonth.setMonth(currentMonth.getMonth() + 1); renderCalendar(); });
    DOMElements.showAddEventButton.addEventListener('click', () => {
        DOMElements.eventForm.reset();
        DOMElements.eventModal.classList.remove('hidden');
    });
    DOMElements.eventForm.addEventListener('submit', async e => {
        e.preventDefault();
        const data = {
            title: DOMElements.eventForm.querySelector('#event-title').value,
            date: firebase.firestore.Timestamp.fromDate(new Date(DOMElements.eventForm.querySelector('#event-date').value + 'T00:00:00')),
        };
        await db.collection('events').add(data);
        DOMElements.eventModal.classList.add('hidden');
        renderCalendar();
    });
    DOMElements.calendarGrid.addEventListener('click', async e => {
        if (e.target.matches('.calendar-event')) {
            if (confirm(`予定「${e.target.textContent}」を削除しますか？`)) {
                await db.collection('events').doc(e.target.dataset.id).delete();
                renderCalendar();
            }
        }
    });

});