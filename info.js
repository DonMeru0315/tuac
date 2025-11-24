import { db, firestore, auth } from './firebase-init.js';
export function setupInfoHandlers(DOMElements) {
    DOMElements.showAddWikiButton.addEventListener('click', () => {
        DOMElements.wikiForm.reset();
        DOMElements.wikiForm.querySelector('#wiki-id').value = '';
        DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを新規作成';
        DOMElements.wikiModal.classList.remove('hidden');
    });

    DOMElements.wikiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const user = auth.currentUser;
        const id = DOMElements.wikiForm.querySelector('#wiki-id').value;
        const data = {
            title: DOMElements.wikiForm.querySelector('#wiki-title').value,
            content: DOMElements.wikiForm.querySelector('#wiki-content').value,
            difficulty: DOMElements.wikiForm.querySelector('#wiki-difficulty').value,
            time: DOMElements.wikiForm.querySelector('#wiki-time').value,
            tags: DOMElements.wikiForm.querySelector('#wiki-tags').value.split(',').map(t => t.trim()).filter(t=>t), // 配列化
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
        if (e.target.matches('.wiki-list-item')) showWikiArticle(e.target.dataset.id, DOMElements); // DOMElements を渡す
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
            form.querySelector('#wiki-content').value = article.content;
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
    
    // ★ 変更: updatedBy もソートキーに（念のため）
    const snapshot = await db.collection('wiki').orderBy('updatedAt', 'desc').get();
    
    if (snapshot.empty) {
        DOMElements.wikiListContainer.innerHTML = '<p>Wiki記事はまだありません。</p>';
        return; // ★ 空の場合はここで処理終了 (追加)
    }
    
    snapshot.forEach(doc => {
        const article = doc.data(); // ★ データを取得
        const item = document.createElement('div');
        item.className = 'wiki-list-item';
        item.dataset.id = doc.id;
        
        // ★ 変更: タイムスタンプと更新者を表示
        
        let updateInfo = '更新情報なし';
        if (article.updatedAt) {
            // FirestoreのTimestampをJavaScriptのDateオブジェクトに変換
            const date = article.updatedAt.toDate(); 
            // YYYY/MM/DD 形式にフォーマット
            const dateString = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
            updateInfo = `( ${dateString} 更新 - ${article.updatedBy || '不明'} )`;
        }
        
        // ★ 変更: HTML構造を変更
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
    DOMElements.wikiArticleView.innerHTML = `
        <button id="back-to-wiki-list">＜ 記事一覧に戻る</button>
        <h2>${article.title}</h2>
        <div style="margin-bottom: 1rem; color: #555;">
            <span class="wiki-difficulty">${article.difficulty || '難易度不明'}</span>
            <span>⏱ ${article.time || '時間不明'}</span>
            <div style="margin-top:5px;">${tagsHtml}</div>
        </div>
        <div class="article-content">${marked.parse(article.content)}</div>
        <div class="article-actions">
            <button class="edit-button" data-id="${doc.id}">編集</button>
            <button class="delete-button" data-id="${doc.id}">削除</button>
        </div>`;
}
