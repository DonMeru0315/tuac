import { db, firestore, auth } from './firebase-init.js'; 
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/deeafjoya/image/upload";
const UPLOAD_PRESET = "club_auto_log_preset"; 

let unsubscribeToolLogs = null;

export function setupToolsHandlers(DOMElements) {
    const fileInput = document.getElementById('tool-photo-input-tools');
    const addBtn = document.getElementById('add-tool-photo-button');
    const listContainer = document.getElementById('tool-log-list');

    addBtn.addEventListener('click', () => {
        const user = auth.currentUser;
        if (!user) {
            alert("写真を記録するにはログインが必要です。");
            return;
        }
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const originalText = addBtn.textContent;
        addBtn.textContent = "アップロード中...";
        addBtn.disabled = true;

        try {
            // 1. 画像圧縮 (以前のコードのまま)
            const compressedBlob = await compressImageToBlob(file);
            
            // 2. Cloudinaryへアップロード (FormDataを使う)
            const formData = new FormData();
            formData.append('file', compressedBlob);
            formData.append('upload_preset', UPLOAD_PRESET); // 設定したプリセット名
            formData.append('folder', 'tool_photos'); // フォルダ分けも可能

            const res = await fetch(CLOUDINARY_URL, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');
            const cloudData = await res.json();
            
            // 3. 取得した画像URLをFirestoreに保存
            const user = auth.currentUser;
            const todayStr = getTodayString();

            const data = {
                date: todayStr,
                uid: user.uid,
                displayName: user.displayName || '名称未設定',
                photoURL: cloudData.secure_url, // ★ CloudinaryのURL
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
            fileInput.value = '';
        }
    });

    subscribeTodayToolLogs(listContainer);
}

// 読み込み部分 (URLを表示するだけなので、Base64でもURLでも動くように互換性を持たせる)
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
                
                let timeStr = '';
                if (log.timestamp) {
                    const date = log.timestamp.toDate();
                    timeStr = `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
                }

                // URLがある場合はそれを、なければ(古いデータ)Base64を表示
                const imgSrc = log.photoURL || log.photoBase64 || '';

                card.innerHTML = `
                    <div class="tool-log-img-box">
                        <img src="${imgSrc}" alt="工具写真" onclick="window.open(this.src)" loading="lazy">
                    </div>
                    <div class="tool-log-info">
                        <div class="tool-log-user">${log.displayName}</div>
                        <div class="tool-log-time">${timeStr}</div>
                        ${auth.currentUser && auth.currentUser.uid === log.uid ? `<button class="tool-log-delete" data-id="${doc.id}">削除</button>` : ''}
                    </div>
                `;
                container.appendChild(card);
            });
            // 削除ボタンのイベント処理...（Firestoreのデータを消すだけでOK）
             container.querySelectorAll('.tool-log-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm("この写真を削除しますか？")) {
                        await db.collection('tool_logs').doc(e.target.dataset.id).delete();
                        // Cloudinary側の画像削除はクライアントからはセキュリティ上できない設定が一般的なので、
                        // Firestoreのリンク削除だけで十分（無料枠も広いので放置でOK）です。
                    }
                });
            });
        });
}

// 画像圧縮関数 (Canvasを使ってBlobを返す)
function compressImageToBlob(file) {
    return new Promise((resolve, reject) => {
        const maxWidth = 800; 
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
                // JPEG, 品質0.7
                canvas.toBlob((blob) => {
                    if(blob) resolve(blob);
                    else reject(new Error("Compression failed"));
                }, 'image/jpeg', 0.7);
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