import { db, firestore, auth } from './firebase-init.js';

// Cloudinary設定 (tools.js等と共通)
const CLOUDINARY_URL = "https://api.cloudinary.com/v1_1/tuac/image/upload";
const UPLOAD_PRESET = "club_auto_preset"; 

export function setupInfoHandlers(DOMElements) {
    // 新規作成ボタン
    DOMElements.showAddWikiButton.addEventListener('click', () => {
        DOMElements.wikiForm.reset();
        DOMElements.wikiForm.querySelector('#wiki-id').value = '';
        DOMElements.wikiModal.querySelector('h3').textContent = '整備マニュアルを新規作成';
        DOMElements.wikiModal.classList.remove('hidden');
    });

    // --- 画像アップロード機能 ---
    const uploadBtn = document.getElementById('btn-upload-wiki-image');
    const fileInput = document.getElementById('wiki-image-file');
    const statusSpan = document.getElementById('wiki-upload-status');
    const contentArea = document.getElementById('wiki-content');

    if (uploadBtn && fileInput) {
        uploadBtn.addEventListener('click', () => fileInput.click());

        fileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            uploadBtn.disabled = true;
            statusSpan.textContent = "アップロード中...";

            try {
                // 簡易圧縮 (tools.jsのロジック簡易版)
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', UPLOAD_PRESET);
                formData.append('folder', 'wiki_images'); // Wiki用フォルダ

                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!res.ok) throw new Error('Upload failed');
                const cloudData = await res.json();

                // Markdown形式で本文に挿入
                const markdownImage = `\n![画像](${cloudData.secure_url})\n`;
                const cursorPos = contentArea.selectionStart;
                const textBefore = contentArea.value.substring(0, cursorPos);
                const textAfter  = contentArea.value.substring(cursorPos);
                
                contentArea.value = textBefore + markdownImage + textAfter;
                statusSpan.textContent = "挿入完了！";

            } catch (err) {
                console.error(err);
                statusSpan.textContent = "失敗しました";
                alert("画像のアップロードに失敗しました。");
            } finally {
                uploadBtn.disabled = false;
                fileInput.value = '';
                setTimeout(() => { statusSpan.textContent = ""; }, 3000);
            }
        });
    }

    // 保存処理 (項目の追加に対応)
    DOMElements.wikiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const user = auth.currentUser;
        const id = DOMElements.wikiForm.querySelector('#wiki-id').value;
        
        const data = {
            title: DOMElements.wikiForm.querySelector('#wiki-title').value,
            targetVehicle: DOMElements.wikiForm.querySelector('#wiki-target-vehicle').value, // 追加
            time: DOMElements.wikiForm.querySelector('#wiki-time').value,
            difficulty: DOMElements.wikiForm.querySelector('#wiki-difficulty').value,
            tags: DOMElements.wikiForm.querySelector('#wiki-tags').value.split(',').map(t => t.trim()).filter(t=>t),
            
            tools: DOMElements.wikiForm.querySelector('#wiki-tools').value,   // 追加
            parts: DOMElements.wikiForm.querySelector('#wiki-parts').value,   // 追加
            content: DOMElements.wikiForm.querySelector('#wiki-content').value,
            notices: DOMElements.wikiForm.querySelector('#wiki-notices').value, // 追加
            links: DOMElements.wikiForm.querySelector('#wiki-links').value,     // 追加

            updatedAt: firestore.FieldValue.serverTimestamp(),
            updatedBy: user ? user.displayName : '不明',
            updatedById: user ? user.uid : '不明',
        };

        if (id) {
            await db.collection('wiki').doc(id).update(data);
            showWikiArticle(id, DOMElements);
        } else {
            data.createdAt = firestore.FieldValue.serverTimestamp();
            data.createdBy = user ? user.displayName : '不明';
            data.createdById = user ? user.uid : '不明';
            await db.collection('wiki').add(data);
            showWikiList(DOMElements);
        }
        DOMElements.wikiModal.classList.add('hidden');
    });

    // Wikiリストのクリック
    DOMElements.wikiListContainer.addEventListener('click', e => {
        const item = e.target.closest('.wiki-list-item');
        if (item) showWikiArticle(item.dataset.id, DOMElements);
    });

    // 記事詳細内のアクション
    DOMElements.wikiArticleView.addEventListener('click', async e => {
        const id = e.target.dataset.id;
        
        // 戻る
        if (e.target.closest('#back-to-wiki-list')) { // ボタン内のアイコン対応
            showWikiList(DOMElements);
        }

        // 編集 (項目の追加に対応)
        if (e.target.matches('.edit-button')) {
            const doc = await db.collection('wiki').doc(id).get();
            const article = doc.data();
            const form = DOMElements.wikiForm;

            form.querySelector('#wiki-id').value = doc.id;
            form.querySelector('#wiki-title').value = article.title || '';
            form.querySelector('#wiki-target-vehicle').value = article.targetVehicle || '';
            form.querySelector('#wiki-time').value = article.time || '';
            form.querySelector('#wiki-difficulty').value = article.difficulty || '★☆☆';
            form.querySelector('#wiki-tags').value = (article.tags || []).join(', ');
            
            form.querySelector('#wiki-tools').value = article.tools || '';
            form.querySelector('#wiki-parts').value = article.parts || '';
            form.querySelector('#wiki-content').value = article.content || '';
            form.querySelector('#wiki-notices').value = article.notices || '';
            form.querySelector('#wiki-links').value = article.links || '';

            DOMElements.wikiModal.querySelector('h3').textContent = '整備マニュアルを編集';
            DOMElements.wikiModal.classList.remove('hidden');
        }

        // 削除
        if (e.target.matches('.delete-button')) {
            if (confirm('この記事を削除しますか？')) {
                await db.collection('wiki').doc(id).delete();
                showWikiList(DOMElements);
            }
        }
    });
}

// Wikiリスト表示 (変更なしだが、importが必要なので記述)
export async function showWikiList(DOMElements) {
    DOMElements.wikiArticleView.classList.add('hidden');
    DOMElements.wikiListContainer.classList.remove('hidden');
    DOMElements.wikiListContainer.innerHTML = '';
    
    const snapshot = await db.collection('wiki').orderBy('updatedAt', 'desc').get();
    
    if (snapshot.empty) {
        DOMElements.wikiListContainer.innerHTML = '<p>記事はまだありません。</p>';
        return;
    }
    
    snapshot.forEach(doc => {
        const article = doc.data();
        const item = document.createElement('div');
        item.className = 'wiki-list-item';
        item.dataset.id = doc.id;
        
        let dateStr = '日付不明';
        if(article.updatedAt) {
             const d = article.updatedAt.toDate();
             dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
        }
        
        // リストにも対象車両を表示
        const targetV = article.targetVehicle ? `<span style="color:#007bff; font-weight:bold; margin-right:5px;">[${article.targetVehicle}]</span>` : '';

        item.innerHTML = `
            <div class="wiki-list-title">${targetV}${article.title}</div>
            <div class="wiki-list-meta">
                <span class="wiki-difficulty">${article.difficulty || '-'}</span>
                <span>⏱ ${article.time || '-'}</span>
                <span class="wiki-list-updater">${dateStr} (${article.updatedBy})</span>
            </div>
        `;
        DOMElements.wikiListContainer.appendChild(item);
    });
}

// 記事詳細表示 (デザイン刷新)
async function showWikiArticle(id, DOMElements) {
    const doc = await db.collection('wiki').doc(id).get();
    if (!doc.exists) { showWikiList(DOMElements); return; }
    const article = doc.data();
    
    DOMElements.wikiListContainer.classList.add('hidden');
    DOMElements.wikiArticleView.classList.remove('hidden');
    
    // 一番上へスクロール
    window.scrollTo(0, 0);

    const tagsHtml = (article.tags || []).map(t => `<span class="article-tag">#${t}</span>`).join('');
    
    let dateStr = '日付不明';
    if(article.updatedAt) {
         const d = article.updatedAt.toDate();
         dateStr = `${d.getFullYear()}/${d.getMonth()+1}/${d.getDate()}`;
    }

    // --- HTML生成ヘルパー ---
    const createSection = (title, content, icon) => {
        if (!content) return '';
        // 改行を <br> に変換
        const htmlContent = content.replace(/\n/g, '<br>');
        return `
            <div class="wiki-section">
                <h3>${icon} ${title}</h3>
                <div class="wiki-section-body">${htmlContent}</div>
            </div>
        `;
    };

    // リンクの解析 (タイトル | URL 形式)
    let linksHtml = '';
    if (article.links) {
        const linkItems = article.links.split('\n').map(line => {
            const parts = line.split('|');
            const url = parts[parts.length - 1].trim();
            const title = parts.length > 1 ? parts[0].trim() : '参考リンク';
            if (!url.startsWith('http')) return '';
            return `<a href="${url}" target="_blank" class="wiki-ref-link">🔗 ${title}</a>`;
        }).join('');
        if (linkItems) {
            linksHtml = `<div class="wiki-section"><h3>🌐 参考リンク</h3><div style="display:flex; flex-wrap:wrap; gap:10px;">${linkItems}</div></div>`;
        }
    }

    // 注意点 (アラート表示)
    const noticeHtml = article.notices ? `
        <div class="wiki-notice-box">
            <strong>⚠️ 注意・ポイント</strong><br>
            ${article.notices.replace(/\n/g, '<br>')}
        </div>` : '';

    // HTML組み立て
    DOMElements.wikiArticleView.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <button id="back-to-wiki-list" class="primary-button" style="background-color:#6c757d; font-size:0.9rem;">
                ＜ 一覧に戻る
            </button>
        </div>

        <div class="article-container">
            <div class="article-header">
                <div style="font-size:0.9rem; color:#007bff; font-weight:bold;">${article.targetVehicle || '対象車両: 指定なし'}</div>
                <h2>${article.title}</h2>
                <div class="article-meta-row">
                    <span class="wiki-difficulty">${article.difficulty || '-'}</span>
                    <span>⏱ ${article.time || '時間不明'}</span>
                    <span>📅 ${dateStr}</span>
                    <span>👤 ${article.updatedBy}</span>
                </div>
                <div class="article-meta-row" style="margin-top:0.5rem;">${tagsHtml}</div>
            </div>

            <div style="padding: 1.5rem;">
                ${noticeHtml}

                <div class="wiki-prep-grid">
                    ${createSection('必要工具', article.tools, '🔧')}
                    ${createSection('部品・油脂類', article.parts, '🔩')}
                </div>

                ${linksHtml}

                <div class="article-content">
                    <h3>📖 手順</h3>
                    ${marked.parse(article.content || '')}
                </div>
            </div>

            <div class="article-footer">
                <button class="edit-button" data-id="${doc.id}">編集</button>
                <button class="delete-button" data-id="${doc.id}" style="margin-left:0.5rem;">削除</button>
            </div>
        </div>
    `;
}