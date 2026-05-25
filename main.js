import { setupAuthListeners } from './auth.js';
import { auth } from './firebase-init.js';
document.addEventListener('DOMContentLoaded', () => {
    // DOM要素の取得
    const DOMElements = {
        loginRegisterArea: document.getElementById('login-register-area'),
        userInfo: document.getElementById('user-info'),
        userMenuButton: document.getElementById('user-menu-button'),
        userDropdown: document.getElementById('user-dropdown'),
        dropdownUserName: document.getElementById('dropdown-user-name'),
        dropdownUserEmail: document.getElementById('dropdown-user-email'),
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
        syncDoneTasksButton: document.getElementById('sync-done-tasks-button'),
        showAddCustomButton: document.getElementById('show-add-custom-button'),
        maintenanceLogModal: document.getElementById('maintenance-log-modal'),
        maintenanceLogForm: document.getElementById('maintenance-log-form'),
        deleteLogButton: document.getElementById('delete-log-button'),
        customizationModal: document.getElementById('customization-modal'),
        customizationForm: document.getElementById('customization-form'),
        // 情報共有 (Wiki)
        showAddWikiButton: document.getElementById('show-add-wiki-button'),
        wikiModal: document.getElementById('wiki-modal'),
        wikiForm: document.getElementById('wiki-form'),
        wikiListContainer: document.getElementById('wiki-list-container'),
        wikiArticleView: document.getElementById('wiki-article-view'),
        // 部活日程 (カレンダー)
        calendarGrid: document.getElementById('calendar-grid'),
        calendarMonthYear: document.getElementById('calendar-month-year'),
        prevMonthButton: document.getElementById('prev-month-button'),
        nextMonthButton: document.getElementById('next-month-button'),
        showAddEventButton: document.getElementById('show-add-event-button'),
        eventModal: document.getElementById('event-modal'),
        eventForm: document.getElementById('event-form'),
        eventGroupList: document.getElementById('event-group-list'),
        // 共通
        cancelButtons: document.querySelectorAll('.cancel-button'),
        // カンバン・セッティング関連
        kanbanContainer: document.getElementById('kanban-container'),
        showAddTaskButton: document.getElementById('show-add-task-button'),
        taskModal: document.getElementById('task-modal'),
        taskForm: document.getElementById('task-form'),
        deleteTaskButton: document.getElementById('delete-task-button'),
        setupLogContainer: document.getElementById('setup-log-container'),
        showAddSetupButton: document.getElementById('show-add-setup-button'),
        setupModal: document.getElementById('setup-modal'),
        setupForm: document.getElementById('setup-form'),
        deleteSetupButton: document.getElementById('delete-setup-button'),
        showAddPartButton: document.getElementById('show-add-part-button'),
        sparePartsContainer: document.getElementById('spare-parts-container'),
        sparePartModal: document.getElementById('spare-part-modal'),
        sparePartForm: document.getElementById('spare-part-form'),
        deletePartButton: document.getElementById('delete-part-button'),
    };

    // モジュールが初期化済みか管理するフラグ
    let practiceModule, vehicleModule, infoModule;
    let isVehicleSetupDone = false;
    let isInfoSetupDone = false;
    let isPracticeSetupDone = false;

    // メインモジュール切り替え
    function showModule(moduleId) {
        DOMElements.moduleContents.forEach(m => m.classList.add('hidden'));
        DOMElements.navButtons.forEach(b => b.classList.remove('active'));
        const moduleToShow = document.getElementById(moduleId);
        if (moduleToShow) moduleToShow.classList.remove('hidden');
        const activeButton = document.querySelector(`.nav-button[data-module="${moduleId}"]`);
        if (activeButton) activeButton.classList.add('active');
    }

    // 車両詳細タブ切り替え
    function showDetailTab(tabId) {
        DOMElements.detailTabContents.forEach(c => c.classList.add('hidden'));
        DOMElements.detailNavButtons.forEach(b => b.classList.remove('active'));
        const tabToShow = document.getElementById(`${tabId}-tab`);
        if (tabToShow) tabToShow.classList.remove('hidden');
        const activeButton = document.querySelector(`.detail-nav-button[data-detailtab="${tabId}"]`);
        if (activeButton) activeButton.classList.add('active');
    }

    // ログイン成功時の処理
    async function initializeMainContent() {
        showModule('practice-module'); 
        // デフォルトの「部活日程」モジュールを動的インポート
        if (!practiceModule) {
            practiceModule = await import('./practice.js');
        }
        // カレンダーを描画
        practiceModule.renderCalendar(DOMElements);
        // イベントハンドラをセットアップ (初回のみ)
        if (!isPracticeSetupDone) {
            practiceModule.setupPracticeHandlers(DOMElements);
            isPracticeSetupDone = true;
        }
        // ここで車両管理モジュールをバックグラウンドで読み込む
        loadVehicleModuleInBackground(); 
    }
    // ログアウト時の車両監視停止
    function stopVehicleUpdatesWrapper() {
        // vehicle.js が読み込み済みの場合のみ、停止処理を呼び出す
        if (vehicleModule && vehicleModule.stopVehicleUpdates) {
            vehicleModule.stopVehicleUpdates();
        }
    }
    
    // --- セットアップ ---
    setupAuthListeners(DOMElements, initializeMainContent, stopVehicleUpdatesWrapper);
    
    // --- メインのナビゲーション ---
    DOMElements.navButtons.forEach(b => {
        b.addEventListener('click', async () => {
            const moduleId = b.dataset.module;
            showModule(moduleId);
            
            try {
                if (moduleId === 'maintenance-module') {
                    if (!vehicleModule) {
                        vehicleModule = await import('./vehicle.js');
                    }
                    if (!isVehicleSetupDone) {
                        const onVehicleClick = (vehicleId) => vehicleModule.showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId);
                        vehicleModule.setupVehicleHandlers(DOMElements, showModule, showDetailTab, onVehicleClick);
                        isVehicleSetupDone = true;
                    }
                    // 車両リストを読み込む
                    vehicleModule.fetchVehicles(DOMElements, (vehicleId) => vehicleModule.showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId));                
                } else if (moduleId === 'info-module') {
                    // 「情報共有」が押されたら、ここで初めて info.js を読み込む
                    if (!infoModule) {
                        infoModule = await import('./info.js');
                    }
                    // ハンドラをセットアップ (初回のみ)
                    if (!isInfoSetupDone) {
                        infoModule.setupInfoHandlers(DOMElements);
                        isInfoSetupDone = true;
                    }
                    // Wikiリストを表示
                    infoModule.showWikiList(DOMElements);
                } else if (moduleId === 'practice-module') {
                    // 「部活日程」は読み込み済みのはず (デフォルトのため)
                    if (!practiceModule) {
                        practiceModule = await import('./practice.js');
                    }
                    // ハンドラをセットアップ (初回のみ)
                    if (!isPracticeSetupDone) {
                        practiceModule.setupPracticeHandlers(DOMElements);
                        isPracticeSetupDone = true;
                    }
                    // カレンダーを再描画
                    practiceModule.renderCalendar(DOMElements);

                }
            } catch (err) {
                console.error("モジュールの動的インポートに失敗しました:", moduleId, err);
                alert("機能の読み込みに失敗しました。ページをリロードしてください。");
            }
        });
    });

    // --- モーダルの「キャンセル」ボタン --- 
    DOMElements.cancelButtons.forEach(b => {
        b.addEventListener('click', () => {
            b.closest('.modal-background').classList.add('hidden');
        });
    });

    // 車両管理モジュールをバックグラウンドでプリロードする関数
    async function loadVehicleModuleInBackground() {
        if (vehicleModule || isVehicleSetupDone) return; // 既に読み込み済み、またはセットアップ済み
        console.log("車両モジュールをバックグラウンドで読み込み開始...");
        try {
            // vehicle.js をダウンロード
            vehicleModule = await import('./vehicle.js');
            const onVehicleClick = (vehicleId) => vehicleModule.showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId);
            vehicleModule.setupVehicleHandlers(DOMElements, showModule, showDetailTab, onVehicleClick);
            isVehicleSetupDone = true;
            console.log("車両モジュールのバックグラウンド読み込み＆セットアップ完了。");
        } catch (err) {
            // 失敗してもアプリは停止させない
            console.warn("車両モジュールのバックグラウンド読み込み失敗:", err);
        }
    }

    // スクロール時にヘッダーの見た目を変える
    window.addEventListener('scroll', () => {
        const header = document.querySelector('header');
        if (window.scrollY > 20) { // 20px以上スクロールしたら
            header.classList.add('header-scrolled');
        } else {
            header.classList.remove('header-scrolled');
        }
    });

    // 会場マップ ドロップダウン制御
    const locationSelect = document.getElementById('location-select');
    const locationActionArea = document.getElementById('location-action-area');
    const locationMapBtn = document.getElementById('location-map-btn');
    const locationInfoBtn = document.getElementById('location-info-btn');

    if (locationSelect) {
        locationSelect.addEventListener('change', (e) => {
            // 選択されたオプション要素を取得
            const selectedOption = e.target.options[e.target.selectedIndex];

            // カスタムデータ属性(data-*)からURLを取得
            const mapUrl = selectedOption.getAttribute('data-map');
            const infoUrl = selectedOption.getAttribute('data-info');

            if (mapUrl && infoUrl) {
                // ボタンのリンク先を更新
                locationMapBtn.href = mapUrl;
                locationInfoBtn.href = infoUrl;
                // ボタンエリアを表示
                locationActionArea.classList.remove('hidden');
            } else {
                // 値がない場合は非表示
                locationActionArea.classList.add('hidden');
            }
        });
    }

    // 活動報告書エクスポート制御
    const exportMonthInput = document.getElementById('export-month');
    const exportYearInput = document.getElementById('export-year');
    
    // 入力欄の初期値を「現在の月」および「現在の年」に設定
    if (exportMonthInput && exportYearInput) {
        const now = new Date();
        exportMonthInput.value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        exportYearInput.value = now.getFullYear();
    }

    // エクスポートの共通処理関数
    async function triggerExport(type, period, btnId) {
        const btn = document.getElementById(btnId);
        if (!btn) return;
        const originalText = btn.textContent;
        let targetWindow = null;
        if (type.endsWith('pdf')) {
            targetWindow = window.open('', '_blank');
            if (!targetWindow) {
                alert("ポップアップがブロックされました。ブラウザの設定で許可してください。");
                return;
            }
            targetWindow.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>出力中...</title></head><body style="font-family:sans-serif; padding:20px; color:#666;"><h3>📄 レポートを生成しています。少々お待ちください...</h3></body></html>');
            targetWindow.document.close();
        }

        btn.disabled = true;
        btn.textContent = "出力中...";

        try {
            const exportModule = await import('./export.js');
            await exportModule.handleExport(type, period, targetWindow);
        } catch (err) {
            console.error("エクスポートエラー:", err);
            alert("出力に失敗しました。電波状況を確認してください。");
            if (targetWindow) targetWindow.close();
        } finally {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }

    const exportTypes = ['calendar-csv', 'calendar-pdf', 'logs-csv', 'logs-pdf'];
    
    // 月次ボタンのリスナー登録
    exportTypes.forEach(type => {
        document.getElementById(`btn-export-month-${type}`)?.addEventListener('click', () => {
            const month = document.getElementById('export-month').value;
            if (!month) { alert("対象の月を選択してください。"); return; }
            triggerExport(type, month, `btn-export-month-${type}`);
        });
    });

    // 年次ボタンのリスナー登録
    exportTypes.forEach(type => {
        document.getElementById(`btn-export-year-${type}`)?.addEventListener('click', () => {
            const year = document.getElementById('export-year').value;
            if (!year) { alert("対象の年を入力してください。"); return; }
            triggerExport(type, year, `btn-export-year-${type}`);
        });
    });

    // オフライン・オンライン検知インジケーター
    const offlineBanner = document.getElementById('offline-banner');
    
    // 電波が切れた瞬間
    window.addEventListener('offline', () => {
        if (offlineBanner) {
            offlineBanner.textContent = 'オフライン（入力データは保存され、通信回復時に自動同期されます）';
            offlineBanner.style.backgroundColor = 'var(--danger)';
            offlineBanner.classList.add('show');
        }
    });

    // 電波が復帰した瞬間
    window.addEventListener('online', () => {
        if (offlineBanner) {
            offlineBanner.textContent = 'オンラインに復帰しました（データを同期しています）';
            offlineBanner.style.backgroundColor = 'var(--success)';
            setTimeout(() => {
                offlineBanner.classList.remove('show');
            }, 3000);
        }
    });

    // アプリ起動時にすでにオフラインだった場合のチェック
    if (!navigator.onLine && offlineBanner) {
        offlineBanner.classList.add('show');
    }

});
