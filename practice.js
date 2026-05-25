import { db, firestore, auth } from './firebase-init.js';
let currentMonth = new Date(); 
let eventGroupsCache = new Set();
let allHolidaysCache = null; // 祝日データをキャッシュ
let vehiclesCache = null; // 車両データを記憶しておく変数

// 祝日データを一度だけ取得する関数
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

// 車両IDと車種名のマップを取得する
async function getVehicleMap() {
    if (vehiclesCache) return vehiclesCache;
    
    vehiclesCache = {};
    const snapshot = await db.collection('vehicles').get();
    snapshot.forEach(doc => {
        vehiclesCache[doc.id] = doc.data().name || '不明';
    });
    return vehiclesCache;
}

// 削除ボタンを DOMElements に動的に追加
// 削除ボタンなどを DOMElements に動的に追加し、要素をキャッシュ
function ensureDOMElements(DOMElements) {
    if (!DOMElements.deleteEventButton) {
        DOMElements.deleteEventButton = DOMElements.eventModal.querySelector('#delete-event-button');
        DOMElements.editEventToggle = DOMElements.eventModal.querySelector('#edit-event-toggle');
        DOMElements.saveEventButton = DOMElements.eventModal.querySelector('button[type="submit"]');
        DOMElements.cancelEventButton = DOMElements.eventModal.querySelector('.cancel-button');
        DOMElements.eventModalTitle = DOMElements.eventModal.querySelector('h3');
        DOMElements.eventInputs = DOMElements.eventForm.querySelectorAll('input, select, textarea');
        if (DOMElements.editEventToggle) {
            DOMElements.editEventToggle.addEventListener('click', () => {
                setEventModalMode(DOMElements, 'edit');
            });
        }
    }
    if (!DOMElements.toggleEventDetailsBtn) {
        DOMElements.toggleEventDetailsBtn = DOMElements.eventModal.querySelector('#toggle-event-details-btn');
        DOMElements.timeWrapper = DOMElements.eventModal.querySelector('#event-time-wrapper');
        DOMElements.locationWrapper = DOMElements.eventModal.querySelector('#event-location-wrapper');
        DOMElements.notesWrapper = DOMElements.eventModal.querySelector('#event-notes-wrapper');
        DOMElements.toggleEventDetailsBtn.addEventListener('click', () => {
            DOMElements.timeWrapper.classList.remove('hidden');
            DOMElements.locationWrapper.classList.remove('hidden');
            DOMElements.notesWrapper.classList.remove('hidden');
            DOMElements.toggleEventDetailsBtn.classList.add('hidden');
        });
    }
}

// モーダルの状態（新規、閲覧、編集）を切り替えるヘルパー関数
function setEventModalMode(DOMElements, mode) {
    if (mode === 'view') {
        DOMElements.eventModalTitle.textContent = '予定の詳細';
        DOMElements.editEventToggle.classList.remove('hidden');
        DOMElements.saveEventButton.classList.add('hidden');
        DOMElements.deleteEventButton.classList.add('hidden');
        DOMElements.cancelEventButton.textContent = '閉じる';
        DOMElements.eventInputs.forEach(input => {
            input.disabled = true;
            input.classList.add('view-mode-input');
        });
        DOMElements.timeWrapper.classList.remove('hidden');
        DOMElements.locationWrapper.classList.remove('hidden');
        DOMElements.notesWrapper.classList.remove('hidden');
        if (DOMElements.toggleEventDetailsBtn) DOMElements.toggleEventDetailsBtn.classList.add('hidden');
        
    } else if (mode === 'edit') {
        DOMElements.eventModalTitle.textContent = '予定を編集';
        DOMElements.editEventToggle.classList.add('hidden');
        DOMElements.saveEventButton.classList.remove('hidden');
        DOMElements.deleteEventButton.classList.remove('hidden');
        DOMElements.cancelEventButton.textContent = 'キャンセル';
        
        DOMElements.eventInputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('view-mode-input');
        });
    } else if (mode === 'new') {
        DOMElements.eventModalTitle.textContent = '予定を追加';
        DOMElements.editEventToggle.classList.add('hidden');
        DOMElements.saveEventButton.classList.remove('hidden');
        DOMElements.deleteEventButton.classList.add('hidden');
        DOMElements.cancelEventButton.textContent = 'キャンセル';
        
        DOMElements.eventInputs.forEach(input => {
            input.disabled = false;
            input.classList.remove('view-mode-input');
        });
        // 新規作成時は詳細は隠しておく
        DOMElements.timeWrapper.classList.add('hidden');
        DOMElements.locationWrapper.classList.add('hidden');
        DOMElements.notesWrapper.classList.add('hidden');
        if (DOMElements.toggleEventDetailsBtn) DOMElements.toggleEventDetailsBtn.classList.remove('hidden');
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
    setEventModalMode(DOMElements, 'new'); // 新規モードを適用
    DOMElements.eventForm.querySelector('#event-date').value = dateStr;
    DOMElements.eventModal.classList.remove('hidden');
}

// 編集（閲覧）モーダル
async function openEventModalForEdit(eventId, DOMElements) {
    ensureDOMElements(DOMElements);
    try {
        const doc = await db.collection('events').doc(eventId).get();
        if (!doc.exists) { alert("予定が見つかりません。"); return; }
        const event = doc.data();
        DOMElements.eventForm.reset();
        DOMElements.eventModal.dataset.editingId = eventId;
        
        // データをフォームにセット
        DOMElements.eventForm.querySelector('#event-title').value = event.title || '';
        DOMElements.eventForm.querySelector('#event-group').value = event.group || '';
        const eventDate = event.date.toDate();
        const dateStr = eventDate.toISOString().split('T')[0];
        DOMElements.eventForm.querySelector('#event-date').value = dateStr;
        DOMElements.eventForm.querySelector('#event-time').value = event.time || ''; 
        DOMElements.eventForm.querySelector('#event-location').value = event.location || '';
        DOMElements.eventForm.querySelector('#event-notes').value = event.notes || '';
        
        // 最初は「閲覧モード」で開く
        setEventModalMode(DOMElements, 'view');
        
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

    // カレンダークリック
    DOMElements.calendarGrid.addEventListener('click', async e => {
        const eventElement = e.target.closest('.calendar-event');
        const taskElement = e.target.closest('.calendar-task');
        const dayElement = e.target.closest('.calendar-day');
        if (eventElement) {
            e.stopPropagation();
            const eventId = eventElement.dataset.id;
            await openEventModalForEdit(eventId, DOMElements);
        } else if (taskElement) {
            e.stopPropagation();
            alert(`整備予定: ${taskElement.textContent}\n※タスクの編集等は「整備管理」画面から行ってください。`);
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
    const holidays = await fetchAllHolidays();
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
    const vehicleMap = await getVehicleMap();
    const startStr = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const endStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
    const tasksSnapshot = await db.collectionGroup('tasks')
        .where('dueDate', '>=', startStr)
        .where('dueDate', '<=', endStr)
        .get();
    const tasks = tasksSnapshot.docs.map(doc => {
        const vehicleId = doc.ref.parent.parent.id;
        return { 
            ...doc.data(), 
            id: doc.id,
            vehicleName: vehicleMap[vehicleId] || '不明'
        };
    });
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
        // 今日
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
            return eventDate.getDate() === day && eventDate.getMonth() === month && eventDate.getFullYear() === year;
        });
        dayEvents.forEach(event => {
            const eventDiv = document.createElement('div');
            eventDiv.className = 'calendar-event';
            eventDiv.dataset.id = event.id;
            eventDiv.textContent = event.title;
            dayDiv.appendChild(eventDiv);
        });
        const dayTasks = tasks.filter(t => t.dueDate === dateStr && t.status !== 'done');
        dayTasks.forEach(task => {
            const taskDiv = document.createElement('div');
            taskDiv.className = 'calendar-task';
            taskDiv.textContent = `${task.vehicleName}${task.title}`;
            dayDiv.appendChild(taskDiv);
        });
        DOMElements.calendarGrid.appendChild(dayDiv);
    }
}
