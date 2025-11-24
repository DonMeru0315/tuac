import { auth } from './firebase-init.js'
let isLoginMode = true;
export function setupAuthListeners(DOMElements, initializeMainContent, stopVehicleUpdates) {
    // 認証状態の監視
    auth.onAuthStateChanged(user => {
        if (user) {
            // ログイン成功時の処理
            DOMElements.loginRegisterArea.classList.add('hidden');
            DOMElements.userInfo.classList.remove('hidden');
            // ★変更: ドロップダウン内に名前とメールアドレスを表示
            DOMElements.dropdownUserName.textContent = user.displayName || '名称未設定';
            DOMElements.dropdownUserEmail.textContent = user.email;
            DOMElements.mainContent.classList.remove('hidden');
            DOMElements.loginPrompt.classList.add('hidden');
            // 引数で受け取った関数を呼び出す
            initializeMainContent();
        } else {
            // ログアウト時の処理
            DOMElements.loginRegisterArea.classList.remove('hidden');
            DOMElements.userInfo.classList.add('hidden');
            // ドロップダウンが開いたままにならないように隠す
            DOMElements.userDropdown.classList.add('hidden');
            DOMElements.mainContent.classList.add('hidden');
            DOMElements.loginPrompt.classList.remove('hidden');
            // ログアウトしたら、車両リストのリアルタイム監視を停止
            if (stopVehicleUpdates) stopVehicleUpdates();
        }
    });

    // ユーザーアイコンクリックでメニューの表示/非表示を切り替え
    if (DOMElements.userMenuButton) {
        DOMElements.userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation(); // 親要素へのイベント伝播を止める
            DOMElements.userDropdown.classList.toggle('hidden');
        });
    }

    // メニューの外側をクリックしたら閉じる
    document.addEventListener('click', (e) => {
        // ドロップダウンが表示されていて、かつクリックした場所がドロップダウン内部でなければ閉じる
        if (DOMElements.userDropdown && !DOMElements.userDropdown.classList.contains('hidden')) {
            if (!DOMElements.userDropdown.contains(e.target) && e.target !== DOMElements.userMenuButton) {
                DOMElements.userDropdown.classList.add('hidden');
            }
        }
    });

    // 認証フォーム（ログイン/新規登録）の送信
    DOMElements.authForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        if (isLoginMode) {
            // ログイン処理
            auth.signInWithEmailAndPassword(email, password)
                .catch(error => alert("ログイン失敗: " + error.message));
        } else {
            // 新規登録処理
            const name = document.getElementById('auth-name').value;
            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    // ユーザー作成成功後、プロファイル(表示名)を更新
                    return userCredential.user.updateProfile({
                        displayName: name
                    });
                })
                .then(() => {
                    // プロファイル更新成功
                })
                .catch(error => alert("新規登録失敗: " + error.message));
        }
    });

    // ログアウト
    DOMElements.logoutButton.addEventListener('click', () => auth.signOut());

    // ログイン/新規登録モードの切り替え
    DOMElements.toggleModeButton.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        
        const authNameInput = document.getElementById('auth-name'); // 名前フィールドを取得

        DOMElements.formTitle.textContent = isLoginMode ? 'ログイン' : '新規登録';
        DOMElements.authButton.textContent = isLoginMode ? 'ログイン' : '登録する';
        DOMElements.toggleModeButton.textContent = isLoginMode ? '新規登録はこちら' : 'ログインはこちら';

        if (isLoginMode) {
            authNameInput.classList.add('hidden'); // ログイン時は非表示
            authNameInput.required = false;         // 必須でなくす
        } else {
            authNameInput.classList.remove('hidden'); // 新規登録時は表示
            authNameInput.required = true;          // 必須にする
        }
    });
}
