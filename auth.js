import { auth, db, firestore} from './firebase-init.js'
let isLoginMode = true;
let unsubscribeUserDoc = null; // ログイン中ユーザーのデータ監視用リスナー

export function setupAuthListeners(DOMElements, initializeMainContent, stopVehicleUpdates) {
    // 認証状態の監視
    auth.onAuthStateChanged(user => {
        if (user) {
            DOMElements.loginRegisterArea.classList.add('hidden');
            DOMElements.userInfo.classList.remove('hidden');
            DOMElements.dropdownUserName.textContent = user.displayName || '名称未設定';
            DOMElements.dropdownUserEmail.textContent = user.email;
            DOMElements.mainContent.classList.remove('hidden');
            DOMElements.loginPrompt.classList.add('hidden');
            
            if (unsubscribeUserDoc) unsubscribeUserDoc();
            unsubscribeUserDoc = db.collection('users').doc(user.uid).onSnapshot(doc => {
                if (doc.exists) {
                    const userData = doc.data();
                    document.getElementById('dropdown-user-student-id').textContent = `学生番号: ${userData.studentId || '未設定'}`;
                    document.getElementById('dropdown-user-department').textContent = `学部: ${userData.department || '未設定'}`;
                    
                    if (userData.createdAt) {
                        const date = userData.createdAt.toDate();
                        const joinYear = date.getMonth() < 3 ? date.getFullYear() - 1 : date.getFullYear();
                        const now = new Date();
                        const currentYear = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
                        
                        const term = joinYear - 2022 + 124;
                        const grade = currentYear - joinYear + 1;
                        const gradeStr = grade > 4 ? 'OB/OG' : `${grade}年`;
                        
                        document.getElementById('dropdown-user-term').textContent = `${term}期生 (${gradeStr})`;
                    }
                }
            });

            initializeMainContent();
        } else {
            if (unsubscribeUserDoc) { unsubscribeUserDoc(); unsubscribeUserDoc = null; }
            DOMElements.loginRegisterArea.classList.remove('hidden');
            DOMElements.userInfo.classList.add('hidden');
            DOMElements.userDropdown.classList.add('hidden');
            DOMElements.mainContent.classList.add('hidden');
            DOMElements.loginPrompt.classList.remove('hidden');
            if (stopVehicleUpdates) stopVehicleUpdates();
        }
    });

    if (DOMElements.userMenuButton) {
        DOMElements.userMenuButton.addEventListener('click', (e) => {
            e.stopPropagation();
            DOMElements.userDropdown.classList.toggle('hidden');
        });
    }

    document.addEventListener('click', (e) => {
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
            auth.signInWithEmailAndPassword(email, password)
                .catch(error => alert("ログイン失敗: " + error.message));
        } else {
            // ★変更: 姓と名を取得してフルネームに結合
            const lastName = document.getElementById('auth-last-name').value.trim();
            const firstName = document.getElementById('auth-first-name').value.trim();
            const fullName = `${lastName} ${firstName}`; // スペースを入れて結合
            
            const studentId = document.getElementById('auth-student-id').value;
            const department = document.getElementById('auth-department').value;
            
            auth.createUserWithEmailAndPassword(email, password)
                .then(userCredential => {
                    return userCredential.user.updateProfile({
                        displayName: fullName
                    }).then(() => {
                        // データベースにはフルネームと、分割した姓名も保存しておく
                        return db.collection('users').doc(userCredential.user.uid).set({
                            name: fullName,
                            lastName: lastName,
                            firstName: firstName,
                            email: email,
                            studentId: studentId,
                            department: department,
                            role: 'member',
                            createdAt: firestore.FieldValue.serverTimestamp()
                        });
                    });
                })
                .then(() => console.log("ユーザー登録と名簿データの作成が完了しました。"))
                .catch(error => alert("新規登録失敗: " + error.message));
        }
    });

    DOMElements.logoutButton.addEventListener('click', () => auth.signOut());

    // ログイン/新規登録モードの切り替え
    DOMElements.toggleModeButton.addEventListener('click', () => {
        isLoginMode = !isLoginMode;
        const authNameGroup = document.getElementById('auth-name-group');
        const authLastNameInput = document.getElementById('auth-last-name');
        const authFirstNameInput = document.getElementById('auth-first-name');
        
        const authStudentIdInput = document.getElementById('auth-student-id');
        const authDepartmentInput = document.getElementById('auth-department');

        DOMElements.formTitle.textContent = isLoginMode ? 'ログイン' : '新規登録';
        DOMElements.authButton.textContent = isLoginMode ? 'ログイン' : '登録する';
        DOMElements.toggleModeButton.textContent = isLoginMode ? '新規登録はこちら' : 'ログインはこちら';

        if (isLoginMode) {
            authNameGroup.classList.add('hidden');
            authLastNameInput.required = false;
            authFirstNameInput.required = false;
            authStudentIdInput.classList.add('hidden');
            authStudentIdInput.required = false;
            authDepartmentInput.classList.add('hidden');
            authDepartmentInput.required = false;
        } else {
            authNameGroup.classList.remove('hidden');
            authLastNameInput.required = true;
            authFirstNameInput.required = true;
            authStudentIdInput.classList.remove('hidden');
            authStudentIdInput.required = true;
            authDepartmentInput.classList.remove('hidden');
            authDepartmentInput.required = true;
        }
    });

    // プロフィール編集モーダルの制御
    const editProfileBtn = document.getElementById('show-edit-profile-button');
    const profileModal = document.getElementById('profile-modal');
    const profileForm = document.getElementById('profile-form');

    if (editProfileBtn && profileModal && profileForm) {
        editProfileBtn.addEventListener('click', async () => {
            const user = auth.currentUser;
            if (!user) return;
            
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists) {
                const userData = doc.data();
                let last = userData.lastName || '';
                let first = userData.firstName || '';
                if (!last && !first && userData.name) {
                    const parts = userData.name.split(/[\s ]+/); // スペース(半角/全角)で分割
                    if (parts.length >= 2) {
                        last = parts[0];
                        first = parts.slice(1).join(' ');
                    } else {
                        last = parts[0]; // 分割できない場合は姓に入れる
                    }
                }
                
                document.getElementById('profile-last-name').value = last;
                document.getElementById('profile-first-name').value = first;
                document.getElementById('profile-student-id').value = userData.studentId || '';
                document.getElementById('profile-department').value = userData.department || '';
            }
            
            DOMElements.userDropdown.classList.add('hidden'); 
            profileModal.classList.remove('hidden'); 
        });

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user = auth.currentUser;
            if (!user) return;
            const newLastName = document.getElementById('profile-last-name').value.trim();
            const newFirstName = document.getElementById('profile-first-name').value.trim();
            const newFullName = `${newLastName} ${newFirstName}`;
            
            const newStudentId = document.getElementById('profile-student-id').value;
            const newDepartment = document.getElementById('profile-department').value;

            try {
                await user.updateProfile({ displayName: newFullName });
                
                const docRef = db.collection('users').doc(user.uid);
                const docSnap = await docRef.get();

                if (docSnap.exists) {
                    await docRef.update({
                        name: newFullName,
                        lastName: newLastName,
                        firstName: newFirstName,
                        studentId: newStudentId,
                        department: newDepartment
                    });
                } else {
                    await docRef.set({
                        name: newFullName,
                        lastName: newLastName,
                        firstName: newFirstName,
                        email: user.email,
                        studentId: newStudentId,
                        department: newDepartment,
                        role: 'member',
                        createdAt: firestore.FieldValue.serverTimestamp()
                    });
                }

                alert("情報を更新しました！");
                profileModal.classList.add('hidden');
            } catch (error) {
                alert("更新に失敗しました: " + error.message);
            }
        });
    }
}