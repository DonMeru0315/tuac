// db, firestore(Timestamp用) をインポート
import { db, firestore } from './firebase-init.js';

// ★ 変更点: currentMonth を削除
// let currentMonth = new Date();

// ★ 引数で DOMElements を受け取る ★
export function setupInfoHandlers(DOMElements) {

    // --- Wiki --- (変更なし)
    DOMElements.showAddWikiButton.addEventListener('click', () => {
        DOMElements.wikiForm.reset();
        DOMElements.wikiForm.querySelector('#wiki-id').value = '';
        DOMElements.wikiModal.querySelector('h3').textContent = 'Wikiを新規作成';
        DOMElements.wikiModal.classList.remove('hidden');
    });

    DOMElements.wikiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const id = DOMElements.wikiForm.querySelector('#wiki-id').value;
        const data = {
            title: DOMElements.wikiForm.querySelector('#wiki-title').value,
            content: DOMElements.wikiForm.querySelector('#wiki-content').value,
            updatedAt: firestore.FieldValue.serverTimestamp(),
        };
        if (id) {
            await db.collection('wiki').doc(id).update(data);
            showWikiArticle(id, DOMElements); // ★ DOMElements を渡す ★
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            await db.collection('wiki').add(data);
            showWikiList(DOMElements); // ★ DOMElements を渡す ★
        }
        DOMElements.wikiModal.classList.add('hidden');
    });

    // Wikiリストのクリック（記事表示） (変更なし)
    DOMElements.wikiListContainer.addEventListener('click', e => {
        if (e.target.matches('.wiki-list-item')) showWikiArticle(e.target.dataset.id, DOMElements); // ★ DOMElements を渡す ★
    });

    // Wiki記事内のクリック（戻る、編集、削除） (変更なし)
    DOMElements.wikiArticleView.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        if (e.target.matches('#back-to-wiki-list')) showWikiList(DOMElements); // ★ DOMElements を渡す ★
        
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
                showWikiList(DOMElements); // ★ DOMElements を渡す ★
            }
        }
    });

    // ★ 変更点: 「--- カレンダー ---」のセクションをすべて削除 ★
    // DOMElements.prevMonthButton.addEventListener('click', ...);
    // DOMElements.nextMonthButton.addEventListener('click', ...);
    // DOMElements.showAddEventButton.addEventListener('click', ...);
    // DOMElements.eventForm.addEventListener('submit', ...);
    // DOMElements.calendarGrid.addEventListener('click', ...);
}

// --- データ取得・描画関数 (main.js から呼び出される) ---

// Wikiリストを表示 (変更なし)
export async function showWikiList(DOMElements) {
    DOMElements.wikiArticleView.classList.add('hidden');
    DOMElements.wikiListContainer.classList.remove('hidden');
    DOMElements.wikiListContainer.innerHTML = '';
    const snapshot = await db.collection('wiki').orderBy('updatedAt', 'desc').get();
    if (snapshot.empty) {
        DOMElements.wikiListContainer.innerHTML = '<p>Wiki記事はまだありません。</p>';
    }
    snapshot.forEach(doc => {
        const item = document.createElement('div');
        item.className = 'wiki-list-item';
        item.textContent = doc.data().title;
        item.dataset.id = doc.id;
        DOMElements.wikiListContainer.appendChild(item);
    });
}

// Wiki記事を個別表示 (変更なし)
async function showWikiArticle(id, DOMElements) {
    const doc = await db.collection('wiki').doc(id).get();
    if (!doc.exists) { showWikiList(DOMElements); return; }
    const article = doc.data();
    DOMElements.wikiListContainer.classList.add('hidden');
    DOMElements.wikiArticleView.classList.remove('hidden');
    
    // marked.parse を使う (index.html でライブラリが読み込まれている前提)
    DOMElements.wikiArticleView.innerHTML = `
        <button id="back-to-wiki-list">＜ 記事一覧に戻る</button>
        <h2>${article.title}</h2>
        <div class="article-content">${marked.parse(article.content)}</div>
        <div class="article-actions">
            <button class="edit-button" data-id="${doc.id}">編集</button>
            <button class="delete-button" data-id="${doc.id}">削除</button>
        </div>`;
}

// ★ 変更点: renderCalendar 関数をすべて削除 ★
// export async function renderCalendar(DOMElements) { ... }
