import { db, firestore, auth } from './firebase-init.js'; // storageは不要

let unsubscribeTodayList = null;
let currentDocId = null; 

// 拓殖大学 八王子キャンパス (GPS設定)
const CLUB_LAT = 35.623911; 
const CLUB_LON = 139.277921;
const ALLOWED_RADIUS = 100; 

export function setupAttendanceHandlers(DOMElements) {
    // 日付表示
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    const dateDisplay = document.getElementById('today-date-display');
    if(dateDisplay) dateDisplay.textContent = dateStr;

    // --- 過去履歴読み込みボタンのイベント ---
    const loadHistoryBtn = document.getElementById('load-history-button');
    if (loadHistoryBtn) {
        loadHistoryBtn.addEventListener('click', () => {
            loadMonthlyHistory();
        });
    }

    // --- 写真入力の動的生成 ---
    let fileInput = document.getElementById('tool-photo-input');
    if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.id = 'tool-photo-input';
        fileInput.accept = 'image/*';
        fileInput.capture = 'environment'; // スマホカメラ起動
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!currentDocId) {
                alert("出席データが見つかりません。先に出席ボタンを押してください。");
                return;
            }
            // ★変更: アップロードではなくBase64保存を実行
            await saveToolPhotoToBase64(file);
        });
    }

    // --- 出席ボタン ---
    document.getElementById('clock-in-button').addEventListener('click', async () => {
        const user = auth.currentUser;
        if (!user) return;
        
        // GPSチェックロジック
        const confirmMsg = "位置情報を確認して出席を記録しますか？\n(許可ダイアログが出たら「許可」してください)";
        if (!confirm(confirmMsg)) return;

        const btn = document.getElementById('clock-in-button');
        const originalText = btn.textContent;
        btn.textContent = "確認中...";
        btn.disabled = true;

        if (!navigator.geolocation) {
            alert("位置情報に対応していません。");
            resetButton(btn, originalText);
            return;
        }

        navigator.geolocation.getCurrentPosition(async (position) => {
            const currentLat = position.coords.latitude;
            const currentLon = position.coords.longitude;
            const distance = getDistanceFromLatLonInKm(currentLat, currentLon, CLUB_LAT, CLUB_LON);
            
            if (distance > ALLOWED_RADIUS) {
                alert(`ガレージから離れています。`);
                resetButton(btn, originalText);
                return;
            }

            try {
                btn.textContent = "出席記録中...";
                const todayStr = getTodayString();
                let geoPoint;
                try { geoPoint = new firestore.GeoPoint(currentLat, currentLon); } 
                catch(e) { geoPoint = { lat: currentLat, lon: currentLon }; }

                const data = {
                    uid: user.uid,
                    displayName: user.displayName || '名称未設定',
                    date: todayStr,
                    clockIn: firestore.FieldValue.serverTimestamp(),
                    clockOut: null,
                    status: 'active',
                    location: geoPoint,
                    toolPhotoBase64: null // 文字列として保存するフィールド
                };

                await db.collection('attendance').add(data);
                alert(`出席しました！`);
                checkMyStatus(); 

            } catch (err) {
                console.error("出席記録エラー:", err);
                alert("記録に失敗しました。");
                resetButton(btn, originalText);
            }
        }, (error) => {
            console.error("位置情報エラー:", error);
            alert("位置情報の取得に失敗しました。");
            resetButton(btn, originalText);
        }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });

    // --- 退席ボタン ---
    document.getElementById('clock-out-button').addEventListener('click', async () => {
        if (!currentDocId) return;
        if (!confirm("退席(帰宅)を記録しますか？\n※使用した工具の写真を登録しましたか？")) return;

        try {
            await db.collection('attendance').doc(currentDocId).update({
                clockOut: firestore.FieldValue.serverTimestamp(),
                status: 'left'
            });
            alert("退席しました。お疲れ様でした！");
            checkMyStatus(); 
        } catch (err) {
            console.error("退席記録エラー:", err);
            alert("記録に失敗しました。");
        }
    });

    // 写真ボタン連携
    const photoBtn = document.getElementById('upload-photo-button');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    // 初期化
    checkMyStatus();
    subscribeTodayList();
}

// --- 過去1ヶ月分の履歴を取得・表示する関数 ---
async function loadMonthlyHistory() {
    const btn = document.getElementById('load-history-button');
    const container = document.getElementById('attendance-history-container');
    
    btn.disabled = true;
    btn.textContent = "読み込み中...";
    container.innerHTML = '';
    container.classList.remove('hidden');

    try {
        // 日付範囲の計算 (今日 〜 30日前)
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 30); // 30日前

        const todayStr = getTodayString(today); // YYYY-MM-DD
        const pastStr = getTodayString(pastDate);

        // Firestoreクエリ
        const snapshot = await db.collection('attendance')
            .where('date', '>=', pastStr)
            .where('date', '<', todayStr) // 今日(todayStr)は上のリストに出ているので除外
            .orderBy('date', 'desc')      // 新しい日付順
            .orderBy('clockIn', 'asc')    // 同じ日なら出席順
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p>過去1ヶ月の履歴はありません。</p>';
            btn.textContent = "表示完了";
            return;
        }

        // データの整形 (日付ごとにグルーピング)
        const historyMap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!historyMap[data.date]) {
                historyMap[data.date] = [];
            }
            historyMap[data.date].push(data);
        });

        // HTML生成
        Object.keys(historyMap).forEach(date => {
            // 日付ヘッダー
            const dateHeader = document.createElement('div');
            dateHeader.className = 'history-date-header';
            dateHeader.textContent = date.replace(/-/g, '/');
            container.appendChild(dateHeader);

            // その日の参加者リスト
            const listGroup = document.createElement('div');
            listGroup.className = 'history-group';
            
            historyMap[date].forEach(record => {
                const row = document.createElement('div');
                row.className = 'history-row';

                const inTime = record.clockIn ? record.clockIn.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                const outTime = record.clockOut ? record.clockOut.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '(忘れ)';
                
                // 滞在時間の計算 (おまけ)
                let durationStr = '';
                if (record.clockIn && record.clockOut) {
                    const diffMs = record.clockOut.toDate() - record.clockIn.toDate();
                    const diffHrs = (diffMs / (1000 * 60 * 60)).toFixed(1);
                    durationStr = `<span class="history-duration">(${diffHrs}h)</span>`;
                }

                row.innerHTML = `
                    <span class="history-name">${record.displayName}</span>
                    <span class="history-time">${inTime} 〜 ${outTime} ${durationStr}</span>
                `;
                listGroup.appendChild(row);
            });
            container.appendChild(listGroup);
        });

        btn.textContent = "過去1ヶ月の履歴を表示 (再読み込み)";

    } catch (err) {
        console.error("履歴取得エラー:", err);
        container.innerHTML = '<p>履歴の読み込みに失敗しました。</p>';
        btn.textContent = "読み込み失敗";
    } finally {
        btn.disabled = false;
    }
}

// --- 画像を圧縮してBase64文字列としてFirestoreに保存 ---
async function saveToolPhotoToBase64(file) {
    const photoBtn = document.getElementById('upload-photo-button');
    const originalText = photoBtn ? photoBtn.textContent : '';
    if(photoBtn) {
        photoBtn.textContent = "圧縮＆保存中...";
        photoBtn.disabled = true;
    }

    try {
        // 1. 画像圧縮 & Base64変換
        const base64String = await compressImageToBase64(file);

        // 2. Storageではなく、Firestoreのドキュメントに直接文字として書き込む
        // ※ 圧縮しているので 30kb-50kb 程度。Firestore制限(1MB)に対して余裕あり。
        await db.collection('attendance').doc(currentDocId).update({
            toolPhotoBase64: base64String
        });

        alert("工具写真を保存しました！");
        checkMyStatus(); 

    } catch (err) {
        console.error("写真保存エラー:", err);
        alert("写真の保存に失敗しました: " + err.message);
    } finally {
        if(photoBtn) {
            photoBtn.textContent = originalText;
            photoBtn.disabled = false;
        }
    }
}

// 画像圧縮してBase64文字列を返す関数 (Max幅 600px, 画質 0.5 に落として容量節約)
function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 600; // 少し小さくして安全マージン確保
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round(height * (maxWidth / width));
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // JPEG, 品質0.5 (かなり軽量化)
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

function resetButton(btn, originalText) {
    btn.textContent = originalText;
    btn.disabled = false;
}

async function checkMyStatus() {
    const user = auth.currentUser;
    if (!user) return;
    
    const todayStr = getTodayString();
    const msgEl = document.getElementById('attendance-message');
    const statusTextEl = document.getElementById('attendance-status-text');
    const inBtn = document.getElementById('clock-in-button');
    const outBtn = document.getElementById('clock-out-button');
    const photoBtn = document.getElementById('upload-photo-button');

    inBtn.classList.add('hidden');
    outBtn.classList.add('hidden');
    inBtn.disabled = false; inBtn.textContent = "出 席";
    if(photoBtn) photoBtn.classList.add('hidden');

    const snapshot = await db.collection('attendance')
        .where('date', '==', todayStr)
        .where('uid', '==', user.uid)
        .limit(1)
        .get();

    if (snapshot.empty) {
        currentDocId = null;
        msgEl.textContent = `${user.displayName}さん`;
        statusTextEl.textContent = "本日はまだ出席していません。";
        inBtn.classList.remove('hidden');
    } else {
        const doc = snapshot.docs[0];
        const data = doc.data();
        currentDocId = doc.id;

        if (data.clockOut === null) {
            msgEl.textContent = "活動中";
            statusTextEl.textContent = "使用した工具の写真を撮ってください";
            outBtn.classList.remove('hidden');
            
            if(photoBtn) {
                photoBtn.classList.remove('hidden');
                if(data.toolPhotoBase64) {
                    photoBtn.textContent = "📷 写真を撮り直す";
                    photoBtn.style.backgroundColor = "#17a2b8"; 
                } else {
                    photoBtn.textContent = "📷 工具写真を登録";
                    photoBtn.style.backgroundColor = "#ffc107"; 
                }
            }
        } else {
            msgEl.textContent = "本日の活動は終了";
            statusTextEl.textContent = "お疲れ様でした";
        }
    }
}

function subscribeTodayList() {
    if (unsubscribeTodayList) unsubscribeTodayList();
    const todayStr = getTodayString();
    const container = document.getElementById('attendance-list-container');

    unsubscribeTodayList = db.collection('attendance')
        .where('date', '==', todayStr)
        .orderBy('clockIn', 'asc')
        .onSnapshot(snapshot => {
            container.innerHTML = '';
            if (snapshot.empty) {
                container.innerHTML = '<p>本日の参加者はまだいません。</p>';
                return;
            }

            snapshot.forEach(doc => {
                const data = doc.data();
                const item = document.createElement('div');
                item.className = `attendance-item ${data.status}`; 

                const inTime = data.clockIn ? data.clockIn.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                const outTime = data.clockOut ? data.clockOut.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '';
                let statusBadge = data.status === 'active' ? '<span class="badge badge-active">活動中</span>' : '<span class="badge badge-left">帰宅済</span>';

                // ★ 画像表示ロジック (URLではなくBase64を直接表示)
                let photoHtml = '';
                if (data.toolPhotoBase64) {
                    // クリックで拡大できるよう、画像タグを直接埋め込む
                    photoHtml = `
                        <div style="margin-top:5px;">
                            <img src="${data.toolPhotoBase64}" class="tool-photo-thumb" onclick="window.open(this.src)" title="クリックで拡大">
                        </div>`;
                } else {
                    photoHtml = `<div style="font-size:0.8rem; color:#ccc; margin-top:5px;">(写真なし)</div>`;
                }

                item.innerHTML = `
                    <div class="att-name">${data.displayName}</div>
                    <div class="att-times">
                        ${inTime} 〜 ${outTime}
                        ${photoHtml}
                    </div>
                    <div class="att-status">${statusBadge}</div>
                `;
                container.appendChild(item);
            });
        });
}

export function stopAttendanceUpdates() {
    if (unsubscribeTodayList) unsubscribeTodayList();
}

function getTodayString(targetDate) { 
    const d = targetDate || new Date(); // 引数がなければ今日
    const year = d.getFullYear();
    const month = (`0${d.getMonth() + 1}`).slice(-2);
    const day = (`0${d.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}
function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; 
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c * 1000;
}
function deg2rad(deg) { return deg * (Math.PI / 180); }