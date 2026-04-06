
const { createApp, ref, onMounted, watch } = Vue;

import { initTheme } from './theme.js';
import { formatCurrency, formatDate, showToast } from './utils.js';
// import { useCharts } from './charts.js'; // Removed
import { useAuth } from './auth.js';
import { useTransactions } from './transactions.js';
import { useCalendar } from './calendar.js';
import { useDataManagement } from './data.js';
import { useInvoice } from './invoice.js';
import { useReports } from './report.js';

createApp({
    setup() {
        // Global State
        const currentView = ref('dashboard');
        const showAddModal = ref(false);
        const showDayDetailModal = ref(false);
        const selectedDay = ref({ dateStr: '', transactions: [], income: 0, expense: 0 });
        const transactions = ref([]);
        const shopProfile = ref({ name: '', address: '', phone: '', taxId: '' });
        
        // Theme
        const isDarkMode = ref(initTheme());
        
        const updateTheme = () => {
             if (isDarkMode.value) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        };
        
        const toggleDarkMode = () => {
            const goingDark = !isDarkMode.value;
            const root = document.documentElement;
            root.classList.add('theme-switching', goingDark ? 'theme-crossfade-to-dark' : 'theme-crossfade-to-light', 'theme-switching-hide');
            setTimeout(() => {
                isDarkMode.value = goingDark;
                localStorage.setItem('sme_dark_mode', isDarkMode.value);
                updateTheme();
                setTimeout(() => {
                    root.classList.remove('theme-switching-hide');
                }, 180);
                setTimeout(() => {
                    root.classList.remove('theme-switching', 'theme-crossfade-to-dark', 'theme-crossfade-to-light');
                }, 440);
            }, 10);
        };

        // Composables
        const reports = useReports(transactions); // Use reports logic instead of basic charts
        const auth = useAuth(transactions, shopProfile, reports.initReportCharts);
        
        
        const trans = useTransactions(transactions, auth, reports.initReportCharts, showAddModal, showDayDetailModal, selectedDay);
        
        const calendar = useCalendar(transactions, selectedDay, showDayDetailModal, showAddModal, trans.form);
        
        const dataMgr = useDataManagement(transactions, auth, shopProfile);
        
        const invoice = useInvoice();

        const newUsername = ref('');
        const currentPasswordInput = ref('');
        const newPasswordInput = ref('');
        const confirmNewPasswordInput = ref('');

        // Shop Profile Logic
        const saveShopProfile = () => {
            if (auth.isGuest.value) {
                showToast('โหมด Guest: บันทึกชั่วคราว (ไม่ลงฐานข้อมูล)', 'info');
                return;
            }
            localStorage.setItem(auth.getStorageKey('sme_shop_profile'), JSON.stringify(shopProfile.value));
            showToast('บันทึกข้อมูลร้านค้าเรียบร้อยแล้ว', 'success');
        };

        const submitChangeUsername = async () => {
            if (!newUsername.value) { showToast('กรุณากรอกชื่อผู้ใช้ใหม่', 'error'); return; }
            const ok = await auth.changeUsername(newUsername.value);
            if (ok) newUsername.value = '';
        };

        const submitChangePassword = async () => {
            if (!currentPasswordInput.value || !newPasswordInput.value || !confirmNewPasswordInput.value) {
                showToast('กรุณากรอกข้อมูลให้ครบ', 'error'); return;
            }
            if (newPasswordInput.value !== confirmNewPasswordInput.value) {
                showToast('รหัสผ่านใหม่ไม่ตรงกัน', 'error'); return;
            }
            const ok = await auth.changePassword(currentPasswordInput.value, newPasswordInput.value);
            if (ok) { currentPasswordInput.value = ''; newPasswordInput.value = ''; confirmNewPasswordInput.value = ''; }
        };

        // Watchers
        // watch(currentView, () => {
        //     if (currentView.value === 'dashboard') reports.initReportCharts();
        // });

        onMounted(() => {
            if (window.location.pathname.endsWith('dashboard.html')) {
                reports.initReportCharts();
            }
            updateTheme();

            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('mode') === 'register') {
                auth.authMode.value = 'register';
            }
            if (window.location.pathname.endsWith('register.html')) {
                auth.authMode.value = 'register';
            }
            
            // Guest Mode Initialization for Dashboard
            if (localStorage.getItem('sme_is_guest') === 'true' && window.location.pathname.endsWith('dashboard.html')) {
                auth.isGuest.value = true;
                auth.isLoggedIn.value = true;
                auth.currentUser.value = 'Guest';
                
                // Load Mock Data for Guest
                 transactions.value = [
                    { id: 1, title: 'ตัวอย่าง: ขายสินค้า', amount: 5000, type: 'income', category: 'ขายสินค้า', date: new Date().toISOString().split('T')[0], method: 'cash' },
                    { id: 2, title: 'ตัวอย่าง: ค่าเช่าที่', amount: 2000, type: 'expense', category: 'ค่าเช่า', date: new Date().toISOString().split('T')[0], method: 'transfer' },
                    { id: 3, title: 'ตัวอย่าง: ลูกหนี้ (นาย ก)', amount: 1000, type: 'debt', category: 'ลูกหนี้', date: new Date().toISOString().split('T')[0], method: 'unpaid', status: 'unpaid', dueDate: new Date().toISOString().split('T')[0] }
                ];
                shopProfile.value = { name: 'ร้านตัวอย่าง (Guest Mode)', address: 'กรุงเทพฯ', phone: '081-234-5678', taxId: '1234567890123' };
                reports.initReportCharts();
            }
            
            // Check Auth for Dashboard
            const pathname = window.location.pathname;
            const isProtectedPage = pathname.endsWith('dashboard.html') || 
                                  pathname.endsWith('transactions.html') ||
                                  pathname.endsWith('calendar.html') ||
                                  pathname.endsWith('debts.html') ||
                                  pathname.endsWith('settings.html');

            if (isProtectedPage && !auth.isLoggedIn.value && localStorage.getItem('sme_is_guest') !== 'true') {
                 if (window.location.pathname.includes('/pages/')) {
                      window.location.href = 'login.html';
                 } else {
                      window.location.href = 'pages/login.html';
                 }
                 return;
            }
            
            // Set Current View based on URL
            if (pathname.endsWith('transactions.html')) {
                currentView.value = 'transactions';
            } else if (pathname.endsWith('calendar.html')) {
                currentView.value = 'calendar';
            } else if (pathname.endsWith('debts.html')) {
                currentView.value = 'debts';
            } else if (pathname.endsWith('settings.html')) {
                currentView.value = 'settings';
            }

            if (auth.isLoggedIn.value && auth.currentUser.value) {
                auth.loadUserData();
                // Wait for data to load then init charts (loadUserData is async but we don't await here, so charts might init empty first, that's okay as they are reactive or we can add a watch on transactions)
                setTimeout(() => reports.initReportCharts(), 500); 
            } else {
                reports.initReportCharts();
            }
        });

        return {
            showAddModal,
            currentView,
            showDayDetailModal,
            selectedDay,
            transactions,
            shopProfile,
            isDarkMode,
            toggleDarkMode,
            formatCurrency,
            formatDate,
            saveShopProfile,
            newUsername,
            currentPasswordInput,
            newPasswordInput,
            confirmNewPasswordInput,
            submitChangeUsername,
            submitChangePassword,
            ...auth,
            ...trans,
            ...calendar,
            ...dataMgr,
            ...invoice,
            ...reports
        };
    }
}).mount('#app');
