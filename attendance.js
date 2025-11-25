import { db, firestore, auth } from './firebase-init.js';

// ★ Cloudinary設定 (tools.jsと同じものを使用)
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/tuac/image/upload";
const UPLOAD_PRESET = "club_auto_preset"; 

let unsubscribeTodayList = null;
let currentDocId = null; 

// 拓殖大学 八王子キャンパス (GPS設定)
const CLUB_LAT = 35.623911; 
const CLUB_LON = 139.277921;
const ALLOWED_RADIUS = 300; 

export function setupAttendanceHandlers(DOMElements) {
    // ... (日付表示、履歴ボタンなどの既存コードはそのまま) ...
    const today = new Date();
    const dateStr = `${today.getFullYear()}/${today.getMonth() + 1}/${today.getDate()}`;
    const dateDisplay = document.getElementById('today-date-display');
    if(dateDisplay) dateDisplay.textContent = dateStr;

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
        fileInput.capture = 'environment'; 
        fileInput.style.display = 'none';
        document.body.appendChild(fileInput);

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            if (!currentDocId) {
                alert("出席データが見つかりません。先に出席ボタンを押してください。");
                return;
            }
            // ★変更: Base64保存関数ではなく、Cloudinaryアップロード関数を呼ぶ
            await uploadPhotoToCloudinary(file);
        });
    }

    // ... (clock-in-button, clock-out-button のイベントリスナーは変更なしなので省略) ...
    document.getElementById('clock-in-button').addEventListener('click', async () => {
        // (省略: 既存の出席ロジックそのまま)
        // ...
        // attendanceへのadd部分も、toolPhotoBase64: null のままでOK、
        // あるいは toolPhotoURL: null にフィールド名を変えても良いですが、
        // 既存データとの兼ね合いで新しいフィールドを追加する形にします。
        const user = auth.currentUser;
        if (!user) return;
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
                    toolPhotoURL: null // ★ URL保存用に変更
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

    // clock-out-button も変更なし
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

    const photoBtn = document.getElementById('upload-photo-button');
    if (photoBtn) {
        photoBtn.addEventListener('click', () => {
            fileInput.click();
        });
    }

    checkMyStatus();
    subscribeTodayList();
}

// ... (loadMonthlyHistory関数は変更なしのため省略) ...
async function loadMonthlyHistory() {
    // (省略: 既存コードのまま)
    // ただし、過去ログ表示部分で toolPhotoBase64 を参照している箇所があれば
    // 修正が必要ですが、今回は「本日のリスト」の修正を優先します。
    // 必要であれば後述の subscribeTodayList と同様に修正してください。
    
    // ※ここでは省略しますが、元のコードをそのまま貼り付けてください
    const btn = document.getElementById('load-history-button');
    const container = document.getElementById('attendance-history-container');
    
    btn.disabled = true;
    btn.textContent = "読み込み中...";
    container.innerHTML = '';
    container.classList.remove('hidden');

    try {
        const today = new Date();
        const pastDate = new Date();
        pastDate.setDate(today.getDate() - 30); 
        const todayStr = getTodayString(today); 
        const pastStr = getTodayString(pastDate);

        const snapshot = await db.collection('attendance')
            .where('date', '>=', pastStr)
            .where('date', '<', todayStr) 
            .orderBy('date', 'desc')      
            .orderBy('clockIn', 'asc')    
            .get();

        if (snapshot.empty) {
            container.innerHTML = '<p>過去1ヶ月の履歴はありません。</p>';
            btn.textContent = "表示完了";
            return;
        }

        const historyMap = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            if (!historyMap[data.date]) {
                historyMap[data.date] = [];
            }
            historyMap[data.date].push(data);
        });

        Object.keys(historyMap).forEach(date => {
            const dateHeader = document.createElement('div');
            dateHeader.className = 'history-date-header';
            dateHeader.textContent = date.replace(/-/g, '/');
            container.appendChild(dateHeader);

            const listGroup = document.createElement('div');
            listGroup.className = 'history-group';
            
            historyMap[date].forEach(record => {
                const row = document.createElement('div');
                row.className = 'history-row';

                const inTime = record.clockIn ? record.clockIn.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '--:--';
                const outTime = record.clockOut ? record.clockOut.toDate().toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'}) : '(忘れ)';
                
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

// ★ Cloudinaryへアップロードして URL を Firestore に保存する関数
async function uploadPhotoToCloudinary(file) {
    const photoBtn = document.getElementById('upload-photo-button');
    const originalText = photoBtn ? photoBtn.textContent : '';
    if(photoBtn) {
        photoBtn.textContent = "アップロード中...";
        photoBtn.disabled = true;
    }

    try {
        // 1. 軽くリサイズ (通信量と時間の節約のため、これは残すことを推奨！)
        const compressedBlob = await compressImageToBlob(file);

        // 2. Cloudinaryへ送信
        const formData = new FormData();
        formData.append('file', compressedBlob);
        formData.append('upload_preset', UPLOAD_PRESET);
        formData.append('folder', 'attendance_photos'); // フォルダ分け

        const res = await fetch(CLOUDINARY_URL, {
            method: 'POST',
            body: formData
        });

        if (!res.ok) throw new Error('Cloudinary Upload failed');
        const cloudData = await res.json();
        
        // 3. 取得したURLをFirestoreに保存 (Base64データの保存は廃止)
        await db.collection('attendance').doc(currentDocId).update({
            toolPhotoURL: cloudData.secure_url,
            toolPhotoBase64: firestore.FieldValue.delete() // 古いフィールドがあれば消す
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

// ★ リサイズ用の関数 (tools.jsと同じもの。画質は少し上げて0.8にしています)
function compressImageToBlob(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 1000; // スマホ写真(4000px超)を1000px程度に縮小
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
                
                // 画質0.8でBlob化 (これだけで容量は1/10以下になります)
                canvas.toBlob((blob) => {
                    if(blob) resolve(blob);
                    else reject(new Error("Compression failed"));
                }, 'image/jpeg', 0.8);
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
                // ★ URLがあるかどうかで判定
                if(data.toolPhotoURL) {
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

                // ★ URLを表示 (Base64があれば互換性のため表示、なければURL)
                let photoHtml = '';
                const imgSrc = data.toolPhotoURL || data.toolPhotoBase64;
                
                if (imgSrc) {
                    photoHtml = `
                        <div style="margin-top:5px;">
                            <img src="${imgSrc}" class="tool-photo-thumb" onclick="window.open(this.src)" title="クリックで拡大">
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
    const d = targetDate || new Date(); 
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