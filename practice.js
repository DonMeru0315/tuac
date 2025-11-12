// ★ 新規ファイル: practice.js ★

// db, firestore(Timestamp用) をインポート
import { db, firestore } from './firebase-init.js';

// カレンダーの現在表示月
let currentMonth = new Date(); 
// ★ 追加: 読み込んだグループ名をキャッシュ (重複読み込み防止)
let eventGroupsCache = new Set();

// ★ 新関数: グループ一覧を読み込み、Datalist (<datalist>) を生成
async function loadEventGroups(DOMElements) {
    // 既に読み込み済みの場合は（コスト削減のため）何もしない
    if (eventGroupsCache.size > 0 || !DOMElements.eventGroupList) {
        return;
    }

    try {
        const snapshot = await db.collection('eventGroups').get();
        const datalist = DOMElements.eventGroupList;
        datalist.innerHTML = ''; // クリア
        
        snapshot.forEach(doc => {
            const groupName = doc.data().name;
            if (groupName) {
                eventGroupsCache.add(groupName);
                const option = document.createElement('option');
                option.value = groupName;
                datalist.appendChild(option);
            }
        });
    } catch (err) {
        console.error("Error loading event groups:", err);
    }
}

// ★ 新関数: 新しいグループをDBとDatalistに追加
async function addNewGroup(groupName, DOMElements) {
    if (!groupName || eventGroupsCache.has(groupName)) {
        return; // 空か、既にキャッシュにあれば何もしない
    }

    // 1. キャッシュとDatalistのDOMに追加
    eventGroupsCache.add(groupName);
    const option = document.createElement('option');
    option.value = groupName;
    DOMElements.eventGroupList.appendChild(option);

    // 2. Firestoreに保存 (ドキュメントIDをグループ名にすることで、書き込みコストを削減)
    try {
        // 'set' を使うと、もし"走行会"が既に存在しても上書きするだけ (実質1書き込み)
        await db.collection('eventGroups').doc(groupName).set({ name: groupName });
    } catch (error) {
        console.error("Failed to save new group:", error);
    }
}


// カレンダー (部活日程) 関連のリスナーをセットアップ
export function setupPracticeHandlers(DOMElements) {

    // ★ 追加: モジュールロード時にグループ一覧を読み込む
    loadEventGroups(DOMElements);

    // --- カレンダー --- (info.js から移動)
    DOMElements.prevMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() - 1); 
        renderCalendar(DOMElements); // ★ DOMElements を渡す ★
    });
    DOMElements.nextMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() + 1); 
        renderCalendar(DOMElements); // ★ DOMElements を渡す ★
    });

    DOMElements.showAddEventButton.addEventListener('click', () => {
        DOMElements.eventForm.reset();
        DOMElements.eventModal.classList.remove('hidden');
    });

    // ★ 変更: フォーム送信処理を仕様変更に対応
    DOMElements.eventForm.addEventListener('submit', async e => {
        e.preventDefault();
        
        // フォームから値を取得
        const title = DOMElements.eventForm.querySelector('#event-title').value;
        const dateStr = DOMElements.eventForm.querySelector('#event-date').value; // "2025-11-12"
        const timeStr = DOMElements.eventForm.querySelector('#event-time').value; // "14:30" or ""
        const location = DOMElements.eventForm.querySelector('#event-location').value || null;
        const group = DOMElements.eventForm.querySelector('#event-group').value || null;

        // ★ 重要: 日付と時刻を正しく組み合わせて
        // "2025-11-12" と "14:30" -> "2025-11-12T14:30:00" (ローカル時刻)
        // "2025-11-12" と ""       -> "2025-11-12T00:00:00" (ローカル時刻)
        const combinedDate = new Date(`${dateStr}T${timeStr || '00:00:00'}`);

        const data = {
            title: title,
            // 'date' には日付と時刻を組み合わせたTimestampを保存 (ソートに使う)
            date: firestore.Timestamp.fromDate(combinedDate),
            // 'time' には時刻の文字列を保存 (表示に使う)
            time: timeStr || null,
            location: location,
            group: group,
        };

        // DBに保存
        await db.collection('events').add(data);
        
        // ★ 追加: もし新しいグループなら、`eventGroups` コレクションにも保存
        if (group) {
            await addNewGroup(group, DOMElements);
        }
        
        DOMElements.eventModal.classList.add('hidden');
        renderCalendar(DOMElements); // ★ DOMElements を渡す ★
    });

    // ★ 変更: 削除時の確認メッセージを少し詳細に
    DOMElements.calendarGrid.addEventListener('click', async e => {
        const eventElement = e.target.closest('.calendar-event');
        if (eventElement) {
            const eventTitle = eventElement.querySelector('.event-title')?.textContent || 'この予定';
            if (confirm(`予定「${eventTitle}」を削除しますか？`)) {
                await db.collection('events').doc(eventElement.dataset.id).delete();
                renderCalendar(DOMElements); // ★ DOMElements を渡す ★
            }
        }
    });
}

// --- データ取得・描画関数 ---

// カレンダーを描画 (info.js から移動)
// (main.js からも呼び出されるため export する)
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
        .orderBy('date', 'asc') // ★ 'date' (Timestamp) でソート (時間順になる)
        .get();

    const events = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }));
    
    DOMElements.calendarGrid.innerHTML = '';
    
    for (let i = 0; i < firstDay.getDay(); i++) {
        DOMElements.calendarGrid.insertAdjacentHTML('beforeend', '<div class="calendar-day not-current-month"></div>');
    }
    
    for (let day = 1; day <= lastDay.getDate(); day++) {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'calendar-day';
        dayDiv.innerHTML = `<div class="calendar-day-header">${day}</div>`;
        
        // その日のイベントをフィルタリング
        const dayEvents = events.filter(e => {
            const eventDate = e.date.toDate();
            // ★ 月と年も比較 (バグ防止)
            return eventDate.getDate() === day &&
                   eventDate.getMonth() === month &&
                   eventDate.getFullYear() === year;
        });
        
        dayEvents.forEach(event => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'calendar-event';
            eventDiv.dataset.id = event.id;
            
            // ★ 変更: 表示内容をリッチにする
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