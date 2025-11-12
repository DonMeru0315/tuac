// ★ 変更: practice.js ★ (既存のファイルと差し替え)

// db, firestore(Timestamp用) をインポート
import { db, firestore } from './firebase-init.js';

// カレンダーの現在表示月
let currentMonth = new Date(); 
// 読み込んだグループ名をキャッシュ (重複読み込み防止)
let eventGroupsCache = new Set();

// ★ 追加: 削除ボタンを DOMElements に動的に追加
function ensureDOMElements(DOMElements) {
    if (!DOMElements.deleteEventButton) {
        DOMElements.deleteEventButton = DOMElements.eventModal.querySelector('#delete-event-button');
    }
}

// (中略: loadEventGroups, addNewGroup は変更なし)
async function loadEventGroups(DOMElements) { /* ... 変更なし ... */ }
async function addNewGroup(groupName, DOMElements) { /* ... 変更なし ... */ }


// ★ 変更: 新規モーダルでは削除ボタンを隠す
function openEventModalForNew(dateStr, DOMElements) {
    ensureDOMElements(DOMElements); // ★ 削除ボタンを取得
    
    DOMElements.eventForm.reset();
    delete DOMElements.eventModal.dataset.editingId; // 編集IDをクリア
    DOMElements.eventModal.querySelector('h3').textContent = '予定を追加';
    
    // 日付をプリセット
    DOMElements.eventForm.querySelector('#event-date').value = dateStr;
    
    DOMElements.deleteEventButton.classList.add('hidden'); // ★ 削除ボタンを隠す
    DOMElements.eventModal.classList.remove('hidden');
}

// ★ 変更: 編集モーダルでは削除ボタンを表示
async function openEventModalForEdit(eventId, DOMElements) {
    ensureDOMElements(DOMElements); // ★ 削除ボタンを取得
    
    try {
        const doc = await db.collection('events').doc(eventId).get();
        if (!doc.exists) {
            alert("予定が見つかりません。");
            return;
        }
        const event = doc.data();
        
        DOMElements.eventForm.reset();
        DOMElements.eventModal.dataset.editingId = eventId; // ★ 編集IDをセット
        DOMElements.eventModal.querySelector('h3').textContent = '予定を編集';

        // フォームに既存の値をセット
        DOMElements.eventForm.querySelector('#event-title').value = event.title || '';
        DOMElements.eventForm.querySelector('#event-group').value = event.group || '';
        
        // Timestamp から YYYY-MM-DD を抽出
        const eventDate = event.date.toDate();
        const dateStr = eventDate.toISOString().split('T')[0];
        DOMElements.eventForm.querySelector('#event-date').value = dateStr;
        
        // time は 'HH:MM' (文字列) または null
        DOMElements.eventForm.querySelector('#event-time').value = event.time || ''; 
        
        DOMElements.eventForm.querySelector('#event-location').value = event.location || '';
        
        DOMElements.deleteEventButton.classList.remove('hidden'); // ★ 削除ボタンを表示
        DOMElements.eventModal.classList.remove('hidden');

    } catch (err) {
        console.error("Error fetching event for edit:", err);
        alert("予定の読み込みに失敗しました。");
    }
}


// カレンダー (部活日程) 関連のリスナーをセットアップ
export function setupPracticeHandlers(DOMElements) {

    // ★ 削除ボタンの取得（リスナーセットアップ時に行う）
    ensureDOMElements(DOMElements);
    
    // ★ 追加: 削除ボタンのクリックイベント
    DOMElements.deleteEventButton.addEventListener('click', async () => {
        const eventId = DOMElements.eventModal.dataset.editingId;
        if (!eventId) return; // 編集時以外は何もしない

        if (confirm("この予定を本当に削除しますか？")) {
            try {
                await db.collection('events').doc(eventId).delete();
                DOMElements.eventModal.classList.add('hidden');
                delete DOMElements.eventModal.dataset.editingId;
                renderCalendar(DOMElements); // カレンダーを再描画
            } catch (err) {
                console.error("Error deleting event:", err);
                alert("削除に失敗しました。");
            }
        }
    });

    // モジュールロード時にグループ一覧を読み込む
    loadEventGroups(DOMElements);

    // --- カレンダー --- (前月/次月ボタンは変更なし)
    DOMElements.prevMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() - 1); 
        renderCalendar(DOMElements);
    });
    DOMElements.nextMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() + 1); 
        renderCalendar(DOMElements);
    });

    // 「＋ 予定を追加」ボタン (変更なし)
    DOMElements.showAddEventButton.addEventListener('click', () => {
        const todayStr = new Date().toISOString().split('T')[0];
        openEventModalForNew(todayStr, DOMElements);
    });

    // ★ 変更: フォーム送信 (新規・編集 兼用) (この関数自体は変更なし)
    DOMElements.eventForm.addEventListener('submit', async e => {
        e.preventDefault();
        
        const eventId = DOMElements.eventModal.dataset.editingId || null;
        
        // フォームから値を取得
        const title = DOMElements.eventForm.querySelector('#event-title').value;
        const dateStr = DOMElements.eventForm.querySelector('#event-date').value; // "2025-11-12"
        const timeStr = DOMElements.eventForm.querySelector('#event-time').value; // "14:30" or ""
        const location = DOMElements.eventForm.querySelector('#event-location').value || null;
        const group = DOMElements.eventForm.querySelector('#event-group').value || null;

        const combinedDate = new Date(`${dateStr}T${timeStr || '00:00:00'}`);

        const data = {
            title: title,
            date: firestore.Timestamp.fromDate(combinedDate),
            time: timeStr || null,
            location: location,
            group: group,
        };

        if (eventId) {
            await db.collection('events').doc(eventId).update(data);
        } else {
            await db.collection('events').add(data);
        }
        
        if (group) {
            await addNewGroup(group, DOMElements);
        }
        
        DOMElements.eventModal.classList.add('hidden');
        delete DOMElements.eventModal.dataset.editingId; 
        renderCalendar(DOMElements);
    });

    // ★ 変更: カレンダーのクリックイベント (編集モーダルを開く)
    DOMElements.calendarGrid.addEventListener('click', async e => {
        const eventElement = e.target.closest('.calendar-event');
        const dayElement = e.target.closest('.calendar-day');

        if (eventElement) {
            // --- 1. 予定 (.calendar-event) がクリックされた ---
            e.stopPropagation(); // 日付セル本体のクリックイベントを発火させない
            const eventId = eventElement.dataset.id;
            
            // ★ 変更: 常に編集モーダルを開く (confirm を削除)
            await openEventModalForEdit(eventId, DOMElements);

        } else if (dayElement) {
            // --- 2. 日付セル (.calendar-day) がクリックされた (予定以外) ---
            const dateStr = dayElement.dataset.date; // "YYYY-MM-DD"
            
            // データがないセル (前月・次月など) は無視
            if (!dateStr || dayElement.classList.contains('not-current-month')) {
                return; 
            }
            
            // ★ 新規追加モーダルを開く (変更なし)
            openEventModalForNew(dateStr, DOMElements);
        }
    });
}

// --- データ取得・描画関数 ---

// カレンダーを描画 (この関数自体は変更なし)
export async function renderCalendar(DOMElements) {
    if (!DOMElements || !DOMElements.calendarMonthYear) {
        return; 
    }

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    DOMElements.calendarMonthYear.textContent = `${year}年 ${month + 1}月`;
    
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const startOfMonth = firestore.Timestamp.fromDate(firstDay);
    const endOfMonth = firestore.Timestamp.fromDate(new Date(year, month + 1, 0, 23, 59, 59));

    const snapshot = await db.collection('events')
        .where('date', '>=', startOfMonth)
        .where('date', '<=', endOfMonth)
        .orderBy('date', 'asc')
        .get();

    const events = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    
    DOMElements.calendarGrid.innerHTML = '';
    
    const today = new Date();
    const todayDate = today.getDate();
    const todayMonth = today.getMonth();
    const todayYear = today.getFullYear();

    // 前月の日付セル
    for (let i = 0; i < firstDay.getDay(); i++) {
        DOMElements.calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day not-current-month"></div>');
    }
    
    // 今月の日付セル
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const currentDate = new Date(year, month, day); 
        const dayOfWeek = currentDate.getDay(); // 0=日, 6=土

        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        
        dayDiv.dataset.date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

        if (dayOfWeek === 0) dayDiv.classList.add('sunday');
        if (dayOfWeek === 6) dayDiv.classList.add('saturday');
        if (day === todayDate && month === todayMonth && year === todayYear) {
            dayDiv.classList.add('today');
        }

        dayDiv.innerHTML = `<div class="calendar-day-header">${day}</div>`;
        
        const dayEvents = events.filter(e => {
            const eventDate = e.date.toDate();
            return eventDate.getDate() === day &&
                   eventDate.getMonth() === month &&
                   eventDate.getFullYear() === year;
        });
        
        dayEvents.forEach(event => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'calendar-event';
            eventDiv.dataset.id = event.id;
            
            let html = `<div class="event-title">${event.title}</div>`;
            if (event.time) {
                html += `<div class="event-detail">🕒 ${event.time}</div>`;
            }
            if (event.group) {
                html += `<div class="event-detail">🏷️ ${event.group}</div>`;
            }
            if (event.location) {
                html += `<div class="event-detail">📍 ${event.location}</div>`;
            }
            eventDiv.innerHTML = html;
            
            dayDiv.appendChild(eventDiv);
        });
        DOMElements.calendarGrid.appendChild(dayDiv);
    }
}
