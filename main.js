// --- インポート ---
import { setupAuthListeners } from './auth.js';
import { 
    setupVehicleHandlers, 
    fetchVehicles, 
    stopVehicleUpdates, 
    showVehicleDetail 
} from './vehicle.js';
// ★ 変更点: info.js から renderCalendar を削除
import { 
    setupInfoHandlers, 
    showWikiList
} from './info.js';
// ★ 変更点: practice.js をインポート (renderCalendar は別名で)
import { 
    setupPracticeHandlers, 
    renderCalendar as renderPracticeCalendar 
} from './practice.js';
import { auth } from './firebase-init.js';

// --- アプリケーションの起動 ---
document.addEventListener('DOMContentLoaded', () => {

    // ★ DOMの準備完了後に、すべてのDOM要素を取得 ★
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
        
        // ★ 変更点: info-module のタブ関連DOMを削除
        // infoNavButtons: document.querySelectorAll('.info-nav-button'),
        // infoTabContents: document.querySelectorAll('.info-tab-content'),
        
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
    };

    // --- グローバル関数 (ここで定義し、必要なモジュールに渡す) ---

    // メインモジュール切り替え
    function showModule(moduleId) {
        DOMElements.moduleContents.forEach(m => m.classList.add('hidden'));
        DOMElements.navButtons.forEach(b => b.classList.remove('active'));
        const moduleToShow = document.getElementById(moduleId);
        if (moduleToShow) moduleToShow.classList.remove('hidden');
        const activeButton = document.querySelector(`.nav-button[data-module="${moduleId}"]`);
        if (activeButton) activeButton.classList.add('active');
    }

    // ★ 変更点: showInfoTab 関数は不要になったため削除 ★
    // function showInfoTab(tabId) { ... }

    // 車両詳細タブ切り替え (変更なし)
    function showDetailTab(tabId) {
        DOMElements.detailTabContents.forEach(c => c.classList.add('hidden'));
        DOMElements.detailNavButtons.forEach(b => b.classList.remove('active'));
        const tabToShow = document.getElementById(`${tabId}-tab`);
        if (tabToShow) tabToShow.classList.remove('hidden');
        const activeButton = document.querySelector(`.detail-nav-button[data-detailtab="${tabId}"]`);
        if (activeButton) activeButton.classList.add('active');
    }

    // ログイン成功時に呼び出される関数 (変更なし)
    function initializeMainContent() {
        showModule('maintenance-module'); // デフォルトは整備管理
        fetchVehicles(DOMElements, (vehicleId) => showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId));
    }

    // --- セットアップ ---
    // ★ 各モジュールに、必要な「DOM」と「関数」を引数として渡す ★
    setupAuthListeners(DOMElements, initializeMainContent, stopVehicleUpdates);
    setupVehicleHandlers(DOMElements, showModule, showDetailTab, (vehicleId) => showVehicleDetail(DOMElements, showModule, showDetailTab, vehicleId));
    setupInfoHandlers(DOMElements);
    // ★ 変更点: practice.js のセットアップを追加 ★
    setupPracticeHandlers(DOMElements);

    // --- メインのナビゲーション（モジュール切り替え） ---
    // ★ 変更点: クリック時の処理をモジュールごとに変更 ★
    DOMElements.navButtons.forEach(b => {
        b.addEventListener('click', () => {
            const moduleId = b.dataset.module;
            showModule(moduleId);
            
            if (moduleId === 'info-module') {
                // 「情報共有」は Wikiリストを表示
                showWikiList(DOMElements);
            }
            if (moduleId === 'practice-module') {
                // 「部活日程」は カレンダーを表示
                renderPracticeCalendar(DOMElements);
            }
        });
    });

    // ★ 変更点: infoNavButtons のリスナーは不要になったため削除 ★
    // DOMElements.infoNavButtons.forEach(b => { ... });

    // --- モーダルの「キャンセル」ボタン --- (変更なし)
    DOMElements.cancelButtons.forEach(b => {
        b.addEventListener('click', () => {
            b.closest('.modal-background').classList.add('hidden');
        });
    });
});