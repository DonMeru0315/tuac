import { db, firestore, auth } from './firebase-init.js'; 
// ★ あなたのCloudinary設定等はそのまま維持してください
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/deeafjoya/image/upload";
const UPLOAD_PRESET = "club_auto_preset"; 

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
            const compressedBlob = await compressImageToBlob(file);
            
            const formData = new FormData();
            formData.append('file', compressedBlob);
            formData.append('upload_preset', UPLOAD_PRESET);
            formData.append('folder', 'tool_photos');

            const res = await fetch(CLOUDINARY_URL, {
                method: 'POST',
                body: formData
            });

            if (!res.ok) throw new Error('Upload failed');
            const cloudData = await res.json();
            
            const user = auth.currentUser;
            const todayStr = getTodayString();

            const data = {
                date: todayStr,
                uid: user.uid,
                displayName: user.displayName || '名称未設定',
                photoURL: cloudData.secure_url,
                // 即座に表示させるため、serverTimestamp() ではなく端末の時間を使う
                timestamp: new Date() 
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
                    // FirestoreのTimestamp型か、JSのDate型かを判定して処理
                    let dateObj;
                    if (typeof log.timestamp.toDate === 'function') {
                        dateObj = log.timestamp.toDate(); // Firestoreから来たデータ
                    } else {
                        dateObj = new Date(log.timestamp); // 今保存したばかりのデータ
                    }
                    timeStr = `${dateObj.getHours()}:${String(dateObj.getMinutes()).padStart(2, '0')}`;
                }

                // undefined チェックを厳密に行い、空の場合は画像タグを出さない、またはプレースホルダーを出す
                const imgSrc = (log.photoURL && log.photoURL.startsWith('http')) 
                                ? log.photoURL 
                                : (log.photoBase64 || ''); // 古いデータへの互換性

                // 画像がある場合のみ img タグを表示、なければ「画像なし」と表示
                const imgHtml = imgSrc 
                    ? `<img src="${imgSrc}" alt="工具写真" onclick="window.open(this.src)" loading="lazy">`
                    : `<div style="display:flex; align-items:center; justify-content:center; height:100%; color:#ccc;">画像なし</div>`;

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

             container.querySelectorAll('.tool-log-delete').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    if (confirm("この写真を削除しますか？")) {
                        await db.collection('tool_logs').doc(e.target.dataset.id).delete();
                    }
                });
            });
        });
}

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