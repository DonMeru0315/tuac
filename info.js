import { db, firestore, auth } from './firebase-init.js';

let quill;
export function setupInfoHandlers(DOMElements) {
    if (!quill) {
        quill = new Quill('#wiki-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [2, 3, false] }], // 見出し
                    ['bold', 'color'],             // 太字、文字色
                    [{ 'list': 'bullet' }, { 'list': 'ordered' }] // 箇条書き、段落番号
                ]
            },
        });
    }
    DOMElements.showAddWikiButton.addEventListener('click', () => {
        DOMElements.wikiForm.reset();
        DOMElements.wikiForm.querySelector('#wiki-id').value = '';
        quill.root.innerHTML = '';
        DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを新規作成';
        DOMElements.wikiModal.classList.remove('hidden');
    });

    const btnUploadImage = DOMElements.wikiForm.querySelector('#btn-upload-wiki-image');
    const imageInput = DOMElements.wikiForm.querySelector('#wiki-image-file');
    const statusSpan = DOMElements.wikiForm.querySelector('#wiki-upload-status');

    btnUploadImage.addEventListener('click', () => {
        imageInput.click();
    });

    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        statusSpan.textContent = '⏳ アップロード中...';
        try {
            const cloudName = 'tuac';
            const uploadPreset = 'club_auto_preset';
            
            const formData = new FormData();
            formData.append('file', file);
            formData.append('upload_preset', uploadPreset);

            const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            const imageUrl = data.secure_url;

            if (imageUrl) {
                const range = quill.getSelection(true); 
                const index = range ? range.index : quill.getLength();
                quill.insertEmbed(index, 'image', imageUrl);
                
                statusSpan.textContent = '✅ 挿入完了！';
                setTimeout(() => { statusSpan.textContent = ''; }, 3000);
            } else {
                statusSpan.textContent = '❌ 失敗しました';
            }

        } catch (error) {
            console.error('Cloudinaryアップロードエラー:', error);
            statusSpan.textContent = '❌ エラーが発生しました';
        }
        e.target.value = '';
    });

    DOMElements.wikiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const user = auth.currentUser;
        const id = DOMElements.wikiForm.querySelector('#wiki-id').value;
        const data = {
            title: DOMElements.wikiForm.querySelector('#wiki-title').value,
            content: quill.root.innerHTML,
            difficulty: DOMElements.wikiForm.querySelector('#wiki-difficulty').value,
            time: DOMElements.wikiForm.querySelector('#wiki-time').value,
            tags: DOMElements.wikiForm.querySelector('#wiki-tags').value.split(',').map(t => t.trim()).filter(t=>t), // 配列化
            tools: DOMElements.wikiForm.querySelector('#wiki-tools').value,
            parts: DOMElements.wikiForm.querySelector('#wiki-parts').value,
            notices: DOMElements.wikiForm.querySelector('#wiki-notices').value,
            links: DOMElements.wikiForm.querySelector('#wiki-links').value,
            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };
        if (id) {
            await db.collection('wiki').doc(id).update(data);
            showWikiArticle(id, DOMElements); // DOMElements を渡す
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('wiki').add(data);
            showWikiList(DOMElements); // DOMElements を渡す
        }
        DOMElements.wikiModal.classList.add('hidden');
    });

    // Wikiリストのクリック
    DOMElements.wikiListContainer.addEventListener('click', e => {
        // e.targetから親要素に向かって .wiki-list-item を探す
        const listItem = e.target.closest('.wiki-list-item');
        
        // listItemが見つかった場合のみ処理を実行
        if (listItem) {
            // 見つかった要素の dataset.id を取得して渡す
            showWikiArticle(listItem.dataset.id, DOMElements);
        }
    });

    // Wiki記事内のクリック（戻る、編集、削除）
    DOMElements.wikiArticleView.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (e.target.matches('#back-to-wiki-list')) showWikiList(DOMElements); // DOMElements を渡す
        if (e.target.matches('.edit-button')) {
            const doc = await db.collection('wiki').doc(id).get();
            const article = doc.data();
            const form = DOMElements.wikiForm;
            form.querySelector('#wiki-id').value = doc.id;
            form.querySelector('#wiki-title').value = article.title;
            form.querySelector('#wiki-difficulty').value = article.difficulty || '★☆☆';
            form.querySelector('#wiki-time').value = article.time || '';
            form.querySelector('#wiki-tags').value = (article.tags || []).join(', ');
            form.querySelector('#wiki-tools').value = article.tools || '';
            form.querySelector('#wiki-parts').value = article.parts || '';
            form.querySelector('#wiki-notices').value = article.notices || '';
            form.querySelector('#wiki-links').value = article.links || '';
            quill.root.innerHTML = article.content;
            DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを編集';
            DOMElements.wikiModal.classList.remove('hidden');
        }
        if (e.target.matches('.delete-button')) {
            if (confirm('この記事を削除しますか？')) {
                await db.collection('wiki').doc(id).delete();
                showWikiList(DOMElements); // DOMElements を渡す
            }
        }
    });

    
}

// Wikiリストを表示
export async function showWikiList(DOMElements) {
    DOMElements.wikiArticleView.classList.add('hidden');
    DOMElements.wikiListContainer.classList.remove('hidden');
    DOMElements.wikiListContainer.innerHTML = '';
    const snapshot = await db.collection('wiki').orderBy('updatedAt', 'desc').get();
    
    if (snapshot.empty) {
        DOMElements.wikiListContainer.innerHTML = '<p>Wiki記事はまだありません。</p>';
        return; // 
    }
    
    snapshot.forEach(doc => {
        const article = doc.data(); // ★ データを取得
        const item = document.createElement('div');
        item.className = 'wiki-list-item';
        item.dataset.id = doc.id;
        
        let updateInfo = '更新情報なし';
        if (article.updatedAt) {
            // FirestoreのTimestampをJavaScriptのDateオブジェクトに変換
            const date = article.updatedAt.toDate(); 
            // YYYY/MM/DD 形式にフォーマット
            const dateString = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            updateInfo = `( ${dateString} 更新 - ${article.updatedBy || '不明'} )`;
        }
        
        item.innerHTML = `
            <div class="wiki-list-title">${article.title}</div>
            <div class="wiki-list-meta">
                <span class="wiki-difficulty">${article.difficulty || '難易度不明'}</span>
                <span>⏱ ${article.time || '時間不明'}</span>
                <span class="wiki-list-updater">${updateInfo}</span>
            </div>
        `;
        
        DOMElements.wikiListContainer.appendChild(item);
    });
}

// Wiki記事を個別表示
async function showWikiArticle(id, DOMElements) {
    const doc = await db.collection('wiki').doc(id).get();
    if (!doc.exists) { showWikiList(DOMElements); return; }
    const article = doc.data();
    DOMElements.wikiListContainer.classList.add('hidden');
    DOMElements.wikiArticleView.classList.remove('hidden');
    const tagsHtml = (article.tags || []).map(t => `<span style="background:#eee; padding:2px 5px; border-radius:4px; margin-right:4px; font-size:0.8rem;">#${t}</span>`).join('');
    const toolsHtml = article.tools ? `<div style="white-space: pre-wrap;">${article.tools}</div>` : '<div style="color:#999;">なし</div>';
    const partsHtml = article.parts ? `<div style="white-space: pre-wrap;">${article.parts}</div>` : '<div style="color:#999;">なし</div>';
    const noticesHtml = article.notices ? `<div class="wiki-notice-box" style="margin-top: 1.5rem;"><strong>⚠️ 注意点・コツ</strong><br><div style="white-space: pre-wrap; margin-top: 0.5rem;">${article.notices}</div></div>` : '';

    let linksHtml = '';
    if (article.links) {
        // 「タイトル | URL」の形式を解析して、自動でリンクボタンを作る
        const linkItems = article.links.split('\n').map(line => {
            if (!line.trim()) return '';
            const separatorMatch = line.match(/[,，、|]/);
            if (separatorMatch) {
                // 最初の区切り記号の位置で、タイトルとURLに真っ二つに分ける
                const separatorIndex = line.indexOf(separatorMatch[0]);
                const title = line.substring(0, separatorIndex).trim();
                const url = line.substring(separatorIndex + 1).trim();
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="wiki-ref-link">${title}</a>`;
            }
            return `<div style="margin-bottom:0.5rem; white-space: pre-wrap;">${line}</div>`; // URL形式でない場合はそのまま表示
        }).join('');
        linksHtml = `<div class="wiki-section" style="margin-top: 1.5rem;"><h3>参考リンク</h3><div style="display:flex; flex-wrap:wrap; gap:0.5rem;">${linkItems}</div></div>`;
    }
    DOMElements.wikiArticleView.innerHTML = `
        <button id="back-to-wiki-list">＜ 記事一覧に戻る</button>
        <h2>${article.title}</h2>
        <div style="margin-bottom: 1rem; color: #555;">
            <span class="wiki-difficulty">${article.difficulty || '難易度不明'}</span>
            <span>⏱ ${article.time || '時間不明'}</span>
            <div style="margin-top:5px;">${tagsHtml}</div>
        </div>
        
        <div class="wiki-prep-grid">
            <div class="wiki-section">
                <h3>必要工具</h3>
                ${toolsHtml}
            </div>
            <div class="wiki-section">
                <h3>必要部品・油脂類</h3>
                ${partsHtml}
            </div>
        </div>
        
        <div class="article-content ql-editor">${article.content}</div>
        
        ${noticesHtml}
        ${linksHtml}

        <div class="article-actions">
            <button class="edit-button" data-id="${doc.id}">編集</button>
            <button class="delete-button" data-id="${doc.id}">削除</button>
        </div>`;
}
