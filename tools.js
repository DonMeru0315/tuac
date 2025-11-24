import { db, firestore, auth } from './firebase-init.js';

let unsubscribeToolLogs = null;

export function setupToolsHandlers(DOMElements) {
    const fileInput = document.getElementById('tool-photo-input-tools');
    const addBtn = document.getElementById('add-tool-photo-button');
    const listContainer = document.getElementById('tool-log-list');

    // ボタンを押したらカメラ/ファイル選択を起動
    addBtn.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) {
            alert("写真を記録するにはログインが必要です。");
            return;
        }
        fileInput.click();
    });

    // 写真が選択されたら圧縮して保存
    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // ボタンをロード中に
        const originalText = addBtn.textContent;
        addBtn.textContent = "圧縮＆保存中...";
        addBtn.disabled = true;

        try {
            // 圧縮 & Base64変換
            const base64String = await compressImageToBase64(file);
            const user = auth.currentUser;
            const todayStr = getTodayString();

            // tool_logs コレクションに保存
            const data = {
                date: todayStr,
                uid: user.uid,
                displayName: user.displayName || '名称未設定',
                photoBase64: base64String,
                timestamp: firestore.FieldValue.serverTimestamp()
            };

            await db.collection('tool_logs').add(data);
            alert("工具の写真を記録しました！");

        } catch (err) {
            console.error("保存エラー:", err);
            alert("保存に失敗しました: " + err.message);
        } finally {
            addBtn.textContent = originalText;
            addBtn.disabled = false;
            fileInput.value = ''; // 入力をリセット
        }
    });

    // 今日のログをリアルタイム監視
    subscribeTodayToolLogs(listContainer);
}

// リアルタイム監視を開始
function subscribeTodayToolLogs(container) {
    if (unsubscribeToolLogs) unsubscribeToolLogs();

    const todayStr = getTodayString();

    unsubscribeToolLogs = db.collection('tool_logs')
        .where('date', '==', todayStr)
        .orderBy('timestamp', 'desc')
        .onSnapshot(snapshot => {
            container.innerHTML = '';
            if (snapshot.empty) {
                container.innerHTML = '<p style="color:#888;">本日の記録はまだありません。</p>';
                return;
            }

            snapshot.forEach(doc => {
                const log = doc.data();
                const card = document.createElement('div');
                card.className = 'tool-log-card';
                
                // 時間のフォーマット
                let timeStr = '';
                if (log.timestamp) {
                    const date = log.timestamp.toDate();
                    timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                }

                card.innerHTML = `
                    <div class="tool-log-img-box">
                        <img src="${log.photoBase64}" alt="工具写真" onclick="window.open(this.src)">
                    </div>
                    <div class="tool-log-info">
                        <div class="tool-log-user">${log.displayName}</div>
                        <div class="tool-log-time">${timeStr}</div>
                        ${auth.currentUser && auth.currentUser.uid === log.uid ? `<button class="tool-log-delete" data-id="${doc.id}">削除</button>` : ''}
                    </div>
                `;
                container.appendChild(card);
            });

            // 削除ボタンのイベント設定
            container.querySelectorAll('.tool-log-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm("この写真を削除しますか？")) {
                        await db.collection('tool_logs').doc(e.target.dataset.id).delete();
                    }
                });
            });
        });
}

// 画像圧縮関数 (attendance.jsと同じロジック)
function compressImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 600; 
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
                // JPEG, 品質0.5
                const dataUrl = canvas.toDataURL('image/jpeg', 0.5);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

function getTodayString() {
    const d = new Date();
    const year = d.getFullYear();
    const month = (`0${d.getMonth() + 1}`).slice(-2);
    const day = (`0${d.getDate()}`).slice(-2);
    return `${year}-${month}-${day}`;
}
