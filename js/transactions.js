
const { ref, computed, watch } = Vue;
import { formatCurrency, showConfirm, showToast } from './utils.js';
const API_BASE_URL = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || 'http://localhost:3000';

export function useTransactions(transactions, auth, updateCharts, showAddModal, showDayDetailModal, selectedDay) {
    
    const getCsrfToken = () => {
        const m = document.cookie.match(/(?:^|; )csrf=([^;]+)/);
        return m ? decodeURIComponent(m[1]) : '';
    };

    const persistLocal = () => {
        const key = auth?.getStorageKey ? auth.getStorageKey('sme_transactions') : 'sme_transactions';
        try { localStorage.setItem(key, JSON.stringify(transactions.value)); } catch {}
    };

    const customCategoryKey = 'อื่นๆ';
    const categorySets = {
        income: ['เงินเดือน', 'ขายสินค้า', 'บริการ', 'โบนัส', 'ดอกเบี้ยรับ', 'เงินคืน', 'งานฟรีแลนซ์', customCategoryKey],
        expense: ['ค่าข้าว', 'ค่าเช้า', 'ค่าเช่า', 'ค่าน้ำ', 'ค่าไฟ', 'ค่าเดินทาง', 'ค่าอินเทอร์เน็ต', 'ค่าโทรศัพท์', 'ค่ารักษาพยาบาล', 'การศึกษา', 'ช้อปปิ้ง', 'บันเทิง', 'ภาษี', customCategoryKey],
        debt: ['ลูกหนี้การค้า', 'ยืมเงิน', 'ยืมให้เพื่อน/ครอบครัว', customCategoryKey],
        payable: ['เจ้าหนี้การค้า', 'หนี้บัตรเครดิต', 'ผ่อนสินค้า', 'ยืมจากเพื่อน/ครอบครัว', customCategoryKey]
    };

    const categories = {
        income: [...categorySets.income],
        expense: [...categorySets.expense],
        debt: [...categorySets.debt],
        payable: [...categorySets.payable]
    };

    const categoryIcons = {
        'ขายสินค้า': 'shopping-bag',
        'บริการ': 'handshake',
        'ดอกเบี้ย': 'percent',
        'วัตถุดิบ': 'package',
        'ค่าเช่า': 'house',
        'ค่าน้ำ/ไฟ': 'lightbulb',
        'เงินเดือน': 'wallet',
        'การตลาด': 'megaphone',
        'ขนส่ง': 'truck',
        'ลูกหนี้การค้า': 'hand-coins',
        'ยืมเงิน': 'hand-coins',
        'เจ้าหนี้การค้า': 'receipt',
        'เครดิต': 'credit-card',
        'อื่นๆ': 'dots-three'
    };
    const getCategoryIcon = (cat) => {
        const key = (cat || '').trim();
        const icon = categoryIcons[key] || 'tag';
        return `ph ph-${icon}`;
    };

    const transactionTypeLabels = {
        income: { label: 'รายรับ', className: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        expense: { label: 'รายจ่าย', className: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
        debt: { label: 'ลูกหนี้', className: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' },
        payable: { label: 'เจ้าหนี้', className: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' }
    };

    const defaultCategoryFor = (type) => (categories[type] && categories[type][0]) || customCategoryKey;
    const form = ref({
        type: 'income',
        category: defaultCategoryFor('income'),
        customCategory: '',
        amount: '',
        title: '',
        date: new Date().toISOString().split('T')[0],
        method: 'cash',
        slip: null
    });
    const showCustomCategoryInput = computed(() => form.value.category === customCategoryKey);

    const amountInput = Vue.computed({
        get: () => {
            const v = form.value.amount;
            if (v === '' || v === null || v === undefined) return '';
            const n = typeof v === 'number' ? v : parseFloat(v);
            if (!n || isNaN(n)) return '';
            return n.toLocaleString('th-TH');
        },
        set: (str) => {
            if (typeof str !== 'string') {
                form.value.amount = Number(str) || 0;
                return;
            }
            const cleaned = str.replace(/[^0-9.,]/g, '').replace(/,/g, '');
            const num = parseFloat(cleaned);
            form.value.amount = isNaN(num) ? '' : num;
        }
    });

    const editingId = ref(null);
    const isEditing = computed(() => editingId.value !== null);
    const modalTitle = computed(() => (isEditing.value ? 'แก้ไขรายการ' : 'บันทึกรายการใหม่'));
    const modalSubmitLabel = computed(() => (isEditing.value ? 'บันทึกการแก้ไข' : 'บันทึกข้อมูล'));

    // Persist changes
    watch(transactions, (newVal) => {
        if (auth.isGuest.value) {
            updateCharts();
        } else if (auth.isLoggedIn.value) {
            updateCharts();
        }
    }, { deep: true });

    // Computed
    const monthlyIncome = computed(() => transactions.value.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
    const monthlyExpense = computed(() => transactions.value.filter(t => t.type === 'expense' || t.type === 'debt').reduce((sum, t) => sum + t.amount, 0));
    const sortedTransactions = computed(() => [...transactions.value].sort((a, b) => new Date(b.date) - new Date(a.date)));

    const filters = ref({
        query: '',
        type: 'all',
        category: 'all',
        dateFrom: '',
        dateTo: '',
        sort: 'date_desc'
    });

    const availableCategories = computed(() => {
        if (filters.value.type !== 'all' && categories[filters.value.type]) {
            return categories[filters.value.type];
        }
        const all = new Set();
        Object.values(categories).forEach(list => list.forEach(c => all.add(c)));
        return Array.from(all);
    });

    const filteredTransactions = computed(() => {
        const query = (filters.value.query || '').trim().toLowerCase();
        const type = filters.value.type;
        const category = filters.value.category;
        const dateFrom = filters.value.dateFrom ? new Date(filters.value.dateFrom) : null;
        const dateTo = filters.value.dateTo ? new Date(filters.value.dateTo) : null;

        const filtered = transactions.value.filter(t => {
            if (type !== 'all' && t.type !== type) return false;
            if (category !== 'all' && t.category !== category) return false;
            if (query) {
                const title = (t.title || '').toLowerCase();
                const cat = (t.category || '').toLowerCase();
                if (!title.includes(query) && !cat.includes(query)) return false;
            }
            if (dateFrom) {
                const d = new Date(t.date);
                if (d < dateFrom) return false;
            }
            if (dateTo) {
                const d = new Date(t.date);
                const end = new Date(dateTo);
                end.setHours(23, 59, 59, 999);
                if (d > end) return false;
            }
            return true;
        });

        const sort = filters.value.sort;
        if (sort === 'date_asc') return [...filtered].sort((a, b) => new Date(a.date) - new Date(b.date));
        if (sort === 'amount_desc') return [...filtered].sort((a, b) => (b.amount || 0) - (a.amount || 0));
        if (sort === 'amount_asc') return [...filtered].sort((a, b) => (a.amount || 0) - (b.amount || 0));
        return [...filtered].sort((a, b) => new Date(b.date) - new Date(a.date));
    });

    const filteredIncome = computed(() => filteredTransactions.value.filter(t => t.type === 'income').reduce((sum, t) => sum + (t.amount || 0), 0));
    const filteredExpense = computed(() => filteredTransactions.value.filter(t => t.type === 'expense' || t.type === 'debt').reduce((sum, t) => sum + (t.amount || 0), 0));

    const resetForm = () => {
        form.value = {
            type: 'income',
            category: defaultCategoryFor('income'),
            customCategory: '',
            amount: '',
            title: '',
            date: new Date().toISOString().split('T')[0],
            method: 'cash',
            slip: null
        };
    };

    const cancelEdit = () => {
        editingId.value = null;
        resetForm();
    };

    const startEditTransaction = (transaction) => {
        if (!transaction) return;
        editingId.value = transaction.id;
        const categoryForType = categories[transaction.type] || [];
        const categoryValue = transaction.category || '';
        const hasPresetCategory = categoryForType.includes(categoryValue);

        form.value = {
            type: transaction.type || 'income',
            category: hasPresetCategory ? categoryValue : customCategoryKey,
            customCategory: hasPresetCategory ? '' : categoryValue,
            amount: transaction.amount ?? '',
            title: transaction.title || '',
            date: transaction.date || new Date().toISOString().split('T')[0],
            method: 'cash',
            slip: transaction.slip ?? null
        };
        showDayDetailModal.value = false;
        showAddModal.value = true;
    };

    const saveTransaction = async () => {
        if (!form.value.amount || !form.value.title) {
            showToast('กรุณากรอกข้อมูลให้ครบ', 'error');
            return;
        }

        const normalizedCustomCategory = String(form.value.customCategory || '').trim();
        if (form.value.category === customCategoryKey && !normalizedCustomCategory) {
            showToast('กรุณาระบุหมวดหมู่อื่นๆ', 'error');
            return;
        }

        const payload = {
            ...form.value,
            category: form.value.category === customCategoryKey ? normalizedCustomCategory : form.value.category,
            method: 'cash'
        };

        if (isEditing.value) {
            const index = transactions.value.findIndex(t => t.id === editingId.value);
            if (index !== -1) {
                if (auth.isLoggedIn.value && !auth.isGuest.value) {
                    try {
                        const csrf = getCsrfToken();
                        const res = await fetch(`${API_BASE_URL}/api/transactions/${editingId.value}`, {
                            method: 'PUT',
                            headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ ...transactions.value[index], ...payload })
                        });
                        if (!res.ok) throw new Error();
                        const updated = await res.json();
                        transactions.value[index] = updated;
                        showToast('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');
                    } catch {
                        showToast('บันทึกการแก้ไขไม่สำเร็จ', 'error');
                        return;
                    }
                } else {
                    transactions.value[index] = { ...transactions.value[index], ...payload, id: editingId.value };
                    showToast('บันทึกการแก้ไขเรียบร้อยแล้ว', 'success');
                    persistLocal();
                }
            } else {
                showToast('ไม่พบรายการที่ต้องการแก้ไข', 'error');
            }
            showAddModal.value = false;
            cancelEdit();
            return;
        }

        if (auth.isLoggedIn.value && !auth.isGuest.value) {
            try {
                const csrf = getCsrfToken();
                const res = await fetch(`${API_BASE_URL}/api/transactions`, {
                    method: 'POST',
                    headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ ...payload, isPaid: 0 })
                });
                if (!res.ok) throw new Error();
                const created = await res.json();
                transactions.value.unshift(created);
                showToast('บันทึกรายการเรียบร้อยแล้ว', 'success');
            } catch {
                transactions.value.unshift({ id: Date.now(), ...payload });
                persistLocal();
                showToast('ระบบฐานข้อมูลไม่พร้อม: บันทึกชั่วคราวในเครื่อง', 'warning');
            }
        } else {
            transactions.value.unshift({ id: Date.now(), ...payload });
            showToast('บันทึกรายการเรียบร้อยแล้ว', 'success');
            persistLocal();
        }
        showAddModal.value = false;
        resetForm();
    };

    watch(showAddModal, (open) => {
        if (!open) cancelEdit();
    });

    watch(() => form.value.type, (nextType) => {
        const list = categories[nextType] || [];
        if (!list.includes(form.value.category)) {
            form.value.category = defaultCategoryFor(nextType);
            form.value.customCategory = '';
        }
    });

    watch(() => filters.value.type, () => {
        if (filters.value.category === 'all') return;
        if (filters.value.type === 'all') return;
        const list = categories[filters.value.type] || [];
        if (!list.includes(filters.value.category)) {
            filters.value.category = 'all';
        }
    });

    const deleteTransaction = async (id) => {
        const ok = await showConfirm({
            title: 'ลบรายการนี้?',
            message: 'คุณแน่ใจหรือไม่ที่จะลบรายการนี้?',
            confirmText: 'ลบรายการ',
            cancelText: 'ยกเลิก',
            danger: true
        });
        if (!ok) return;

        if (auth.isLoggedIn.value && !auth.isGuest.value) {
            try {
                const csrf = getCsrfToken();
                const res = await fetch(`${API_BASE_URL}/api/transactions/${id}`, { method: 'DELETE', credentials: 'include', headers: csrf ? { 'X-CSRF-Token': csrf } : {} });
                if (!res.ok && res.status !== 204) throw new Error();
                transactions.value = transactions.value.filter(t => t.id !== id);
                showToast('ลบรายการเรียบร้อยแล้ว', 'success');
            } catch {
                transactions.value = transactions.value.filter(t => t.id !== id);
                persistLocal();
                showToast('ระบบฐานข้อมูลไม่พร้อม: ลบเฉพาะข้อมูลในเครื่อง', 'warning');
            }
        } else {
            transactions.value = transactions.value.filter(t => t.id !== id);
            persistLocal();
        }
        if (showDayDetailModal.value) {
            const dayTrans = transactions.value.filter(t => t.date === selectedDay.value.dateStr);
            const income = dayTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
            const expense = dayTrans.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
            selectedDay.value = { ...selectedDay.value, transactions: dayTrans, income, expense };
        }
    };

    // Debt Management Logic
    const totalReceivable = computed(() => transactions.value.filter(t => t.type === 'debt' && !t.isPaid).reduce((sum, t) => sum + t.amount, 0));
    const totalPayable = computed(() => transactions.value.filter(t => t.type === 'payable' && !t.isPaid).reduce((sum, t) => sum + t.amount, 0));
    
    const receivableList = computed(() => transactions.value.filter(t => t.type === 'debt' && !t.isPaid).sort((a, b) => new Date(b.date) - new Date(a.date)));
    const payableList = computed(() => transactions.value.filter(t => t.type === 'payable' && !t.isPaid).sort((a, b) => new Date(b.date) - new Date(a.date)));

    const markAsPaid = async (transaction) => {
        const ok = await showConfirm({
            title: 'เคลียร์ยอดหนี้?',
            message: `ยืนยันการเคลียร์ยอด "${transaction.title}" จำนวน ${formatCurrency(transaction.amount)} ?`,
            confirmText: 'เคลียร์ยอด',
            cancelText: 'ยกเลิก'
        });
        if (ok) {
            const newTransaction = {
                type: transaction.type === 'debt' ? 'income' : 'expense',
                amount: transaction.amount,
                title: `[เคลียร์หนี้] ${transaction.title}`,
                date: new Date().toISOString().split('T')[0],
                method: 'cash',
                slip: null
            };
            if (auth.isLoggedIn.value && !auth.isGuest.value) {
                try {
                    const csrf = getCsrfToken();
                    const resCreate = await fetch(`${API_BASE_URL}/api/transactions`, {
                        method: 'POST',
                        headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ ...newTransaction, isPaid: 0 })
                    });
                    if (!resCreate.ok) throw new Error();
                    const created = await resCreate.json();
                    transactions.value.push(created);
                    const idx = transactions.value.findIndex(t => t.id === transaction.id);
                    if (idx !== -1) {
                        const updated = { ...transactions.value[idx], isPaid: 1 };
                        const resUpdate = await fetch(`${API_BASE_URL}/api/transactions/${transaction.id}`, {
                            method: 'PUT',
                            headers: csrf ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : { 'Content-Type': 'application/json' },
                            credentials: 'include',
                            body: JSON.stringify({ ...updated })
                        });
                        if (resUpdate.ok) {
                            transactions.value[idx] = updated;
                        }
                    }
                    showToast('เคลียร์ยอดเรียบร้อยแล้ว', 'success');
                } catch {
                    transactions.value.push({ id: Date.now(), ...newTransaction });
                    const index = transactions.value.findIndex(t => t.id === transaction.id);
                    if (index !== -1) transactions.value[index].isPaid = true;
                    persistLocal();
                    showToast('ระบบฐานข้อมูลไม่พร้อม: เคลียร์ยอดเฉพาะในเครื่อง', 'warning');
                }
            } else {
                transactions.value.push({ id: Date.now(), ...newTransaction });
                const index = transactions.value.findIndex(t => t.id === transaction.id);
                if (index !== -1) transactions.value[index].isPaid = true;
                persistLocal();
            }
        }
    };

    const downloadTextFile = (filename, content, mimeType) => {
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    };

    const exportFilteredToJSON = () => {
        const dataStr = JSON.stringify(filteredTransactions.value, null, 2);
        const filename = `transactions_${new Date().toISOString().split('T')[0]}.json`;
        downloadTextFile(filename, dataStr, 'application/json;charset=utf-8');
        showToast('ส่งออก JSON เรียบร้อยแล้ว', 'success');
    };

    const exportFilteredToCSV = () => {
        const header = ['Date', 'Title', 'Type', 'Category', 'Amount'];
        const rows = filteredTransactions.value.map(t => [
            t.date,
            (t.title || '').replaceAll('"', '""'),
            t.type,
            (t.category || '').replaceAll('"', '""'),
            t.amount
        ]);
        const csv = [header, ...rows]
            .map(cols => cols.map(v => `"${v ?? ''}"`).join(','))
            .join('\n');
        const filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
        downloadTextFile(filename, csv, 'text/csv;charset=utf-8');
        showToast('ส่งออก CSV เรียบร้อยแล้ว', 'success');
    };

    return {
        categories,
        transactionTypeLabels,
        form,
        isEditing,
        modalTitle,
        modalSubmitLabel,
        startEditTransaction,
        cancelEdit,
        monthlyIncome,
        monthlyExpense,
        sortedTransactions,
        filters,
        availableCategories,
        filteredTransactions,
        filteredIncome,
        filteredExpense,
        saveTransaction,
        deleteTransaction,
        exportFilteredToCSV,
        exportFilteredToJSON,
        totalReceivable,
        totalPayable,
        receivableList,
        payableList,
        markAsPaid,
        amountInput,
        getCategoryIcon,
        showCustomCategoryInput,
        customCategoryKey
    };
}
