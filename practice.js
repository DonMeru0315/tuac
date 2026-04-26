import { db, firestore, auth } from './firebase-init.js';
let currentMonth = new Date(); 
let eventGroupsCache = new Set();
let allHolidaysCache = null; // 祝日データをキャッシュ

// --- 祝日データを一度だけ取得する関数 ---
async function fetchAllHolidays() {
    if (allHolidaysCache) {
        return allHolidaysCache;
    }
    try {
        const response = await fetch('https://holidays-jp.github.io/api/v1/date.json');
        if (!response.ok) {
            console.error("祝日APIの取得に失敗しました。");
            allHolidaysCache = {}; 
            return allHolidaysCache;
        }
        const jsonData = await response.json();
        allHolidaysCache = jsonData;
        return allHolidaysCache;
    } catch (err) {
        console.error("祝日データの取得エラー:", err);
        allHolidaysCache = {};
        return allHolidaysCache;
    }
}

// 削除ボタンを DOMElements に動的に追加
function ensureDOMElements(DOMElements) {
    if (!DOMElements.deleteEventButton) {
        DOMElements.deleteEventButton = DOMElements.eventModal.querySelector('#delete-event-button');
    }
}

// イベントグループを読み込み
async function loadEventGroups(DOMElements) { 
    if (eventGroupsCache.size > 0) {
        DOMElements.eventGroupList.innerHTML = '';
        eventGroupsCache.forEach(g => DOMElements.eventGroupList.insertAdjacentHTML('beforeend', `<option value="${g}">`));
        return;
    }
    const snapshot = await db.collection('event_groups').orderBy('name').get();
    snapshot.forEach(doc => eventGroupsCache.add(doc.data().name));
    loadEventGroups(DOMElements);
}

// 新規グループを追加
async function addNewGroup(groupName, DOMElements) { 
    if (eventGroupsCache.has(groupName)) return;
    eventGroupsCache.add(groupName);
    DOMElements.eventGroupList.insertAdjacentHTML('beforeend', `<option value="${groupName}">`);
    await db.collection('event_groups').doc(groupName).set({ name: groupName });
}

// 新規予定モーダル
function openEventModalForNew(dateStr, DOMElements) {
    ensureDOMElements(DOMElements);
    DOMElements.eventForm.reset();
    delete DOMElements.eventModal.dataset.editingId;
    DOMElements.eventModal.querySelector('h3').textContent = '予定を追加';
    DOMElements.eventForm.querySelector('#event-date').value = dateStr;
    DOMElements.deleteEventButton.classList.add('hidden');
    DOMElements.eventModal.classList.remove('hidden');
}

// 編集モーダル
async function openEventModalForEdit(eventId, DOMElements) {
    ensureDOMElements(DOMElements);
    try {
        const doc = await db.collection('events').doc(eventId).get();
        if (!doc.exists) { alert("予定が見つかりません。"); return; }
        const event = doc.data();
        DOMElements.eventForm.reset();
        DOMElements.eventModal.dataset.editingId = eventId;
        DOMElements.eventModal.querySelector('h3').textContent = '予定を編集';
        DOMElements.eventForm.querySelector('#event-title').value = event.title || '';
        DOMElements.eventForm.querySelector('#event-group').value = event.group || '';
        const eventDate = event.date.toDate();
        const dateStr = eventDate.toISOString().split('T')[0];
        DOMElements.eventForm.querySelector('#event-date').value = dateStr;
        DOMElements.eventForm.querySelector('#event-time').value = event.time || ''; 
        DOMElements.eventForm.querySelector('#event-location').value = event.location || '';
        DOMElements.eventForm.querySelector('#event-notes').value = event.notes || '';
        DOMElements.deleteEventButton.classList.remove('hidden');
        DOMElements.eventModal.classList.remove('hidden');
    } catch (err) {
        console.error("Error fetching event for edit:", err);
        alert("予定の読み込みに失敗しました。");
    }
}

// カレンダー (部活日程) 関連のリスナーをセットアップ
export function setupPracticeHandlers(DOMElements) {
    ensureDOMElements(DOMElements);
    // 削除ボタン
    DOMElements.deleteEventButton.addEventListener('click', async () => {
        const eventId = DOMElements.eventModal.dataset.editingId;
        if (!eventId) return;
        if (confirm("この予定を本当に削除しますか？")) {
            try {
                await db.collection('events').doc(eventId).delete();
                DOMElements.eventModal.classList.add('hidden');
                delete DOMElements.eventModal.dataset.editingId;
                renderCalendar(DOMElements);
            } catch (err) {
                console.error("Error deleting event:", err);
                alert("削除に失敗しました。");
            }
        }
    });

    // 初期ロード (変更なし)
    loadEventGroups(DOMElements);

    // 月移動ボタン (変更なし)
    DOMElements.prevMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() - 1); 
        renderCalendar(DOMElements);
    });
    DOMElements.nextMonthButton.addEventListener('click', () => { 
        currentMonth.setMonth(currentMonth.getMonth() + 1); 
        renderCalendar(DOMElements);
    });

    // 予定追加ボタン (変更なし)
    DOMElements.showAddEventButton.addEventListener('click', () => {
        const todayStr = new Date().toISOString().split('T')[0];
        openEventModalForNew(todayStr, DOMElements);
    });

    // フォーム送信 (変更なし)
    DOMElements.eventForm.addEventListener('submit', async e => {
        e.preventDefault();
        const user = auth.currentUser;
        const eventId = DOMElements.eventModal.dataset.editingId || null;
        const title = DOMElements.eventForm.querySelector('#event-title').value;
        const dateStr = DOMElements.eventForm.querySelector('#event-date').value;
        const timeStr = DOMElements.eventForm.querySelector('#event-time').value;
        const location = DOMElements.eventForm.querySelector('#event-location').value || null;
        const group = DOMElements.eventForm.querySelector('#event-group').value || null;
        const notes = DOMElements.eventForm.querySelector('#event-notes').value || null;
        const combinedDate = new Date(`${dateStr}T${timeStr || '00:00:00'}`);
        const data = {
            title: title,
            date: firestore.Timestamp.fromDate(combinedDate),
            time: timeStr || null,
            location: location,
            group: group,
            notes: notes,
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };
        if (eventId) {
            await db.collection('events').doc(eventId).update(data);
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('events').add(data);
        }
        if (group) {
            await addNewGroup(group, DOMElements);
        }
        DOMElements.eventModal.classList.add('hidden');
        delete DOMElements.eventModal.dataset.editingId;
        renderCalendar(DOMElements);
    });

    // カレンダークリック (変更なし)
    DOMElements.calendarGrid.addEventListener('click', async e => {
        const eventElement = e.target.closest('.calendar-event');
        const dayElement = e.target.closest('.calendar-day');

        if (eventElement) {
            e.stopPropagation();
            const eventId = eventElement.dataset.id;
            await openEventModalForEdit(eventId, DOMElements);
        } else if (dayElement) {
            const dateStr = dayElement.dataset.date;
            if (!dateStr || dayElement.classList.contains('not-current-month')) {
                return; 
            }
            openEventModalForNew(dateStr, DOMElements);
        }
    });
}

// カレンダーを描画
export async function renderCalendar(DOMElements) {
    if (!DOMElements || !DOMElements.calendarMonthYear) {
        return; 
    }
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    DOMElements.calendarMonthYear.textContent = `${year}年 ${month + 1}月`;
    const holidays = await fetchAllHolidays(); // 祝日データを取得
    // Firestoreからイベント取得 (変更なし)
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
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dayDiv.dataset.date = dateStr;
        const holidayName = holidays[dateStr]; // 祝日名を取得
        // 日曜または祝日
        if (dayOfWeek === 0 || holidayName) {
            dayDiv.classList.add('sunday');
        } else if (dayOfWeek === 6) {
            dayDiv.classList.add('saturday');
        }        
        // 今日 (変更なし)
        if (day === todayDate && month === todayMonth && year === todayYear) {
            dayDiv.classList.add('today');
        }
        // --- ヘッダーコンテナを作成 ---
        const headerContainer = document.createElement('div');
        headerContainer.className = 'calendar-day-header-container';
        // 祝日名 (左上)
        if (holidayName) {
            const holidayDiv = document.createElement('div');
            holidayDiv.className = 'calendar-holiday-name';
            holidayDiv.textContent = holidayName;
            headerContainer.appendChild(holidayDiv); // 祝日名を先に追加
        }
        // 日付 (右上)
        const dayHeader = document.createElement('div');
        dayHeader.className = 'calendar-day-header';
        dayHeader.textContent = day;
        headerContainer.appendChild(dayHeader); // 日付を後に追加        
        dayDiv.appendChild(headerContainer); // コンテナをセルに追加       
        // イベント描画
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
            if (event.time) { html += `<div class="event-detail">🕒 ${event.time}</div>`; }
            if (event.group) { html += `<div class="event-detail">🏷️ ${event.group}</div>`; }
            if (event.location) { html += `<div class="event-detail">📍 ${event.location}</div>`; }
            eventDiv.innerHTML = html;
            dayDiv.appendChild(eventDiv);
        });
        DOMElements.calendarGrid.appendChild(dayDiv);
    }
}
