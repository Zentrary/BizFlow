import { showToast } from './utils.js';

const { ref, computed, watch } = Vue;

export function useAuth(transactions, shopProfile, updateCharts) {
    const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:3000';
    const isLoggedIn = ref(
        sessionStorage.getItem('sme_is_logged_in') === 'true' ||
        localStorage.getItem('sme_is_logged_in') === 'true'
    );
    const showLanding = ref(!isLoggedIn.value);
    const isGuest = ref(false);
    const currentUser = ref(localStorage.getItem('sme_current_user') || '');
    const authMode = ref('login');
    const authForm = ref({
        loginId: '',
        username: '',
        email: '',
        password: '',
        confirmPassword: '',
        remember: false
    });

    const showForgotModal = ref(false);
    const forgotEmail = ref('');

    const usersStorageKey = 'sme_users';

    const safeParseJSON = (value, fallback) => {
        try {
            return JSON.parse(value);
        } catch {
            return fallback;
        }
    };

    const normalizeUsername = (value) => (value || '').trim();
    const normalizeUsernameKey = (value) => normalizeUsername(value).toLowerCase();
    const normalizeEmail = (value) => (value || '').trim().toLowerCase();

    const loadUsers = () => {
        const raw = localStorage.getItem(usersStorageKey);
        const parsed = safeParseJSON(raw || '[]', []);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter(Boolean)
            .map(u => {
                const username = typeof u.username === 'string' ? u.username : '';
                const email = typeof u.email === 'string' ? normalizeEmail(u.email) : '';
                const usernameKey = typeof u.usernameKey === 'string' ? u.usernameKey : (username ? username.toLowerCase() : '');
                return { ...u, username, email, usernameKey };
            });
    };

    const registeredUsers = ref(loadUsers());

    const persistUsers = () => {
        localStorage.setItem(usersStorageKey, JSON.stringify(registeredUsers.value));
    };

    const findUserByLoginId = (loginId) => {
        const id = (loginId || '').trim();
        if (!id) return null;
        const lower = id.toLowerCase();
        return registeredUsers.value.find(u => (u?.usernameKey && u.usernameKey === lower) || (u?.email && u.email === lower)) || null;
    };

    const isUsernameValid = (value) => /^[a-zA-Z0-9_]{3,20}$/.test(value);
    const isEmailValid = (value) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);

    const usernameStatus = computed(() => {
        if (authMode.value !== 'register') return { state: 'idle', message: '' };
        const username = normalizeUsername(authForm.value.username);
        if (!username) return { state: 'idle', message: '' };
        if (!isUsernameValid(username)) return { state: 'invalid', message: 'ใช้ a-z, 0-9, _ (3-20 ตัวอักษร)' };
        const taken = registeredUsers.value.some(u => (u?.usernameKey || '').toLowerCase() === normalizeUsernameKey(username));
        if (taken) return { state: 'taken', message: 'ชื่อผู้ใช้นี้ถูกใช้ไปแล้ว' };
        return { state: 'available', message: 'ชื่อผู้ใช้นี้ใช้ได้' };
    });

    const emailStatus = computed(() => {
        if (authMode.value !== 'register') return { state: 'idle', message: '' };
        const email = normalizeEmail(authForm.value.email);
        if (!email) return { state: 'idle', message: '' };
        if (!isEmailValid(email)) return { state: 'invalid', message: 'รูปแบบอีเมลไม่ถูกต้อง' };
        const taken = registeredUsers.value.some(u => u?.email === email);
        if (taken) return { state: 'taken', message: 'อีเมลนี้ถูกใช้ไปแล้ว' };
        return { state: 'available', message: 'อีเมลนี้ใช้ได้' };
    });

    const getStorageKey = (key) => currentUser.value ? `${key}_${currentUser.value}` : key;

    const loadUserData = () => {
        if (isLoggedIn.value && !isGuest.value) {
            fetch(`${API_BASE_URL}/api/transactions`, { credentials: 'include' })
                .then(r => r.json())
                .then(data => {
                    transactions.value = Array.isArray(data) ? data : [];
                    updateCharts();
                })
                .catch(() => {
                    const transKey = getStorageKey('sme_transactions');
                    const savedTrans = localStorage.getItem(transKey);
                    const parsed = savedTrans ? safeParseJSON(savedTrans, []) : [];
                    if (Array.isArray(parsed)) {
                        transactions.value = parsed;
                    } else {
                        transactions.value = [];
                        localStorage.setItem(transKey, JSON.stringify([]));
                    }
                    updateCharts();
                });
        } else {
            const transKey = getStorageKey('sme_transactions');
            const savedTrans = localStorage.getItem(transKey);
            const parsed = savedTrans ? safeParseJSON(savedTrans, []) : [];
            if (Array.isArray(parsed)) {
                transactions.value = parsed;
            } else {
                transactions.value = [];
                localStorage.setItem(transKey, JSON.stringify([]));
            }
        }

        // Load Shop Profile
        const profileKey = getStorageKey('sme_shop_profile');
        const savedProfile = localStorage.getItem(profileKey);
        const parsedProfile = savedProfile ? safeParseJSON(savedProfile, null) : null;
        if (parsedProfile && typeof parsedProfile === 'object' && !Array.isArray(parsedProfile)) {
            shopProfile.value = parsedProfile;
        } else {
            shopProfile.value = { name: '', address: '', phone: '', taxId: '' };
            localStorage.setItem(profileKey, JSON.stringify(shopProfile.value));
        }
        
        updateCharts();
    };

    const getCsrfToken = () => {
        const m = document.cookie.match(/(?:^|; )csrf=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    };

    const loginAsGuest = () => {
        isGuest.value = true;
        isLoggedIn.value = true;
        currentUser.value = 'Guest';
        showLanding.value = false;
        
        // Mock Data for Guest (This logic will be handled in dashboard.html or via app.js initialization if guest flag is set)
        // Set Guest Flag in Session Storage (or just rely on current user)
        localStorage.setItem('sme_is_guest', 'true');
        
        // Redirect
        window.location.href = window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html';
    };

    const hashPassword = async (password) => {
        const msgBuffer = new TextEncoder().encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const handleAuth = async () => {
        try {
            registeredUsers.value = loadUsers();

            if (authMode.value === 'login') {
                const loginId = (authForm.value.loginId || '').trim();
                const password = authForm.value.password || '';
                if (!loginId || !password) {
                    showToast('กรุณากรอกชื่อผู้ใช้/อีเมล และรหัสผ่าน', 'error');
                    return;
                }

                try {
                    const res = await fetch(`${API_BASE_URL}/auth/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ loginId, password })
                    });
                    if (res.ok) {
                        const data = await res.json();
                        isLoggedIn.value = true;
                        showLanding.value = false;
                        currentUser.value = data.username;
                        localStorage.setItem('sme_current_user', currentUser.value);
                        localStorage.removeItem('sme_is_guest');
                        sessionStorage.setItem('sme_is_logged_in', 'true');
                        if (authForm.value.remember) localStorage.setItem('sme_is_logged_in', 'true');
                        else localStorage.removeItem('sme_is_logged_in');
                        showToast('เข้าสู่ระบบสำเร็จ!', 'success');
                        setTimeout(() => {
                            window.location.href = window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html';
                        }, 700);
                        return;
                    }
                } catch {}

                const user = findUserByLoginId(loginId);
                if (!user) {
                    showToast('ไม่พบบัญชีนี้ กรุณาตรวจสอบชื่อผู้ใช้/อีเมล', 'error');
                    return;
                }
                
                // Verify Password (Hash check first, then legacy plain text)
                const hashedPassword = await hashPassword(password);
                let isPasswordCorrect = user.password === hashedPassword;
                
                // Migration: Check legacy plain text
                if (!isPasswordCorrect && user.password === password) {
                    isPasswordCorrect = true;
                    // Update to hash
                    user.password = hashedPassword;
                    persistUsers();
                }

                if (!isPasswordCorrect) {
                    showToast('รหัสผ่านไม่ถูกต้อง', 'error');
                    return;
                }

                isLoggedIn.value = true;
                showLanding.value = false;
                currentUser.value = user.username;
                localStorage.setItem('sme_current_user', currentUser.value);
                localStorage.removeItem('sme_is_guest');

                sessionStorage.setItem('sme_is_logged_in', 'true');
                if (authForm.value.remember) localStorage.setItem('sme_is_logged_in', 'true');
                else localStorage.removeItem('sme_is_logged_in');

                showToast('เข้าสู่ระบบสำเร็จ!', 'success');
                setTimeout(() => {
                    window.location.href = window.location.pathname.includes('/pages/') ? 'dashboard.html' : 'pages/dashboard.html';
                }, 700);
                return;
            }

            const username = normalizeUsername(authForm.value.username);
            const usernameKey = normalizeUsernameKey(username);
            const email = normalizeEmail(authForm.value.email);
            const password = authForm.value.password || '';
            const confirmPassword = authForm.value.confirmPassword || '';

            if (!username || !email || !password || !confirmPassword) {
                showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
                return;
            }
            if (!isUsernameValid(username)) {
                showToast('ชื่อผู้ใช้ไม่ถูกต้อง (ใช้ a-z, 0-9, _ 3-20 ตัวอักษร)', 'error');
                return;
            }
            if (!isEmailValid(email)) {
                showToast('รูปแบบอีเมลไม่ถูกต้อง', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร', 'error');
                return;
            }
            if (password !== confirmPassword) {
                showToast('รหัสผ่านไม่ตรงกัน', 'error');
                return;
            }

            try {
                const res = await fetch(`${API_BASE_URL}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ username, email, password })
                });
                if (res.ok) {
                    showToast('สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ', 'success');
                    authMode.value = 'login';
                    authForm.value.loginId = username;
                    authForm.value.password = '';
                    authForm.value.confirmPassword = '';
                    return;
                }
            } catch {}

            const usernameTaken = registeredUsers.value.some(u => (u?.usernameKey || '').toLowerCase() === usernameKey);
            if (usernameTaken) {
                showToast('ชื่อผู้ใช้นี้มีคนใช้ไปแล้ว กรุณาตรวจสอบความถูกต้อง', 'error');
                return;
            }
            const emailTaken = registeredUsers.value.some(u => u?.email === email);
            if (emailTaken) {
                showToast('อีเมลนี้มีคนใช้ไปแล้ว กรุณาตรวจสอบความถูกต้อง', 'error');
                return;
            }

            const hashedPassword = await hashPassword(password);
            registeredUsers.value.push({ username, usernameKey, email, password: hashedPassword, createdAt: Date.now() });
            persistUsers();

            showToast('สมัครสมาชิกสำเร็จ! กรุณาเข้าสู่ระบบ', 'success');
            authMode.value = 'login';
            authForm.value.loginId = username;
            authForm.value.password = '';
            authForm.value.confirmPassword = '';
        } catch (err) {
            console.error(err);
            showToast('เกิดข้อผิดพลาดของระบบ กรุณาติดต่อแอดมิน', 'error');
        }
    };

    watch(authMode, (mode) => {
        registeredUsers.value = loadUsers();
        if (mode === 'login') {
            authForm.value.username = '';
            authForm.value.email = '';
            authForm.value.confirmPassword = '';
        } else {
            authForm.value.loginId = '';
        }
    });

    window.addEventListener('storage', (e) => {
        if (e.key === usersStorageKey) {
            registeredUsers.value = loadUsers();
        }
    });

    const openForgotPassword = () => {
        showForgotModal.value = true;
        forgotEmail.value = '';
    };

    const closeForgotPassword = () => {
        showForgotModal.value = false;
        forgotEmail.value = '';
    };

    const submitForgotPassword = async () => {
        try {
            registeredUsers.value = loadUsers();
            const email = normalizeEmail(forgotEmail.value);
            if (!email) {
                showToast('กรุณากรอกอีเมล', 'error');
                return;
            }
            if (!isEmailValid(email)) {
                showToast('รูปแบบอีเมลไม่ถูกต้อง', 'error');
                return;
            }

            const index = registeredUsers.value.findIndex(u => u?.email === email);
            if (index === -1) {
                showToast('ไม่พบบัญชีนี้ กรุณาตรวจสอบอีเมล หรือ ติดต่อแอดมิน', 'error');
                return;
            }

            const tempPassword = String(Math.floor(100000 + Math.random() * 900000));
            const hashedTempPassword = await hashPassword(tempPassword);
            registeredUsers.value[index] = { ...registeredUsers.value[index], password: hashedTempPassword, updatedAt: Date.now() };
            persistUsers();

            showToast(`ตั้งรหัสผ่านชั่วคราวสำเร็จ: ${tempPassword}`, 'success');
            closeForgotPassword();
        } catch {
            showToast('เว็บมีปัญหา กรุณาติดต่อแอดมิน', 'error');
        }
    };

    const logout = () => {
        const csrf = getCsrfToken();
        fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers: csrf ? { 'X-CSRF-Token': csrf } : {} }).catch(() => {});
        isLoggedIn.value = false;
        isGuest.value = false;
        showLanding.value = true;
        sessionStorage.removeItem('sme_is_logged_in');
        localStorage.removeItem('sme_is_logged_in');
        localStorage.removeItem('sme_current_user');
        localStorage.removeItem('sme_is_guest');
        currentUser.value = '';
        transactions.value = []; // Clear view
        
        if (window.location.pathname.includes('/pages/')) {
             window.location.href = '../index.html';
        } else {
             window.location.href = 'index.html';
        }
    };

    const changeUsername = async (newUsername) => {
        try {
            const username = normalizeUsername(newUsername);
            if (!isUsernameValid(username)) {
                showToast('ชื่อผู้ใช้ไม่ถูกต้อง', 'error');
                return false;
            }
            const csrf = getCsrfToken();
            const res = await fetch(`${API_BASE_URL}/auth/change-username`, {
                method: 'POST',
                headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ newUsername: username })
            });
            if (res.status === 429) {
                showToast('วันนี้ถูกบล็อกการเปลี่ยนข้อมูล โปรดลองวันถัดไป', 'error');
                return false;
            }
            if (res.status === 409) {
                showToast('ชื่อผู้ใช้ซ้ำ กรุณาเลือกชื่ออื่น', 'error');
                return false;
            }
            if (!res.ok) {
                showToast('เปลี่ยนชื่อผู้ใช้ไม่สำเร็จ', 'error');
                return false;
            }
            const data = await res.json();
            currentUser.value = data.username;
            localStorage.setItem('sme_current_user', currentUser.value);
            showToast('เปลี่ยนชื่อผู้ใช้สำเร็จ', 'success');
            return true;
        } catch {
            showToast('ระบบขัดข้อง กรุณาลองใหม่', 'error');
            return false;
        }
    };

    const changePassword = async (currentPassword, newPassword) => {
        try {
            const np = String(newPassword || '');
            if (np.length < 6) {
                showToast('รหัสผ่านใหม่ต้องยาวอย่างน้อย 6 ตัวอักษร', 'error');
                return false;
            }
            const csrf = getCsrfToken();
            const res = await fetch(`${API_BASE_URL}/auth/change-password`, {
                method: 'POST',
                headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ currentPassword, newPassword: np })
            });
            if (res.status === 429) {
                showToast('วันนี้ถูกบล็อกการเปลี่ยนข้อมูล โปรดลองวันถัดไป', 'error');
                return false;
            }
            if (res.status === 401) {
                showToast('รหัสผ่านปัจจุบันไม่ถูกต้อง', 'error');
                return false;
            }
            if (!res.ok) {
                showToast('เปลี่ยนรหัสผ่านไม่สำเร็จ', 'error');
                return false;
            }
            showToast('เปลี่ยนรหัสผ่านสำเร็จ', 'success');
            return true;
        } catch {
            showToast('ระบบขัดข้อง กรุณาลองใหม่', 'error');
            return false;
        }
    };

    return {
        isLoggedIn,
        showLanding,
        isGuest,
        currentUser,
        authMode,
        authForm,
        showForgotModal,
        forgotEmail,
        openForgotPassword,
        closeForgotPassword,
        submitForgotPassword,
        usernameStatus,
        emailStatus,
        getStorageKey,
        loadUserData,
        loginAsGuest,
        handleAuth,
        logout,
        changeUsername,
        changePassword
    };
}
