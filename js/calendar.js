
const { ref, computed } = Vue;

export function useCalendar(transactions, selectedDay, showDayDetailModal, showAddModal, form) {
    const calendarDate = ref(new Date());

    const calendarHeader = computed(() => {
        return calendarDate.value.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    });

    const calendarDays = computed(() => {
        const year = calendarDate.value.getFullYear();
        const month = calendarDate.value.getMonth();
        
        const firstDayOfMonth = new Date(year, month, 1);
        const lastDayOfMonth = new Date(year, month + 1, 0);
        
        const daysInMonth = lastDayOfMonth.getDate();
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
        
        const days = [];
        
        // Padding days (previous month)
        for (let i = 0; i < startingDayOfWeek; i++) {
            days.push({ date: null, isCurrentMonth: false });
        }
        
        // Days of current month
        for (let i = 1; i <= daysInMonth; i++) {
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
            const dayTrans = transactions.value.filter(t => t.date === dateStr);
            const income = dayTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
            const expense = dayTrans.filter(t => t.type === 'expense' || t.type === 'debt').reduce((sum, t) => sum + t.amount, 0);
            
            days.push({
                day: i,
                dateStr: dateStr,
                isCurrentMonth: true,
                isToday: dateStr === new Date().toISOString().split('T')[0],
                transactions: dayTrans,
                income,
                expense
            });
        }
        
        return days;
    });

    const prevMonth = () => {
        calendarDate.value = new Date(calendarDate.value.getFullYear(), calendarDate.value.getMonth() - 1, 1);
    };

    const nextMonth = () => {
        calendarDate.value = new Date(calendarDate.value.getFullYear(), calendarDate.value.getMonth() + 1, 1);
    };

    const monthTransactions = computed(() => {
        const y = calendarDate.value.getFullYear();
        const m = calendarDate.value.getMonth();
        return transactions.value.filter(t => {
            const d = new Date(t.date);
            return d.getFullYear() === y && d.getMonth() === m;
        });
    });

    const topExpenseCats = computed(() => {
        const groups = {};
        monthTransactions.value.filter(t => t.type === 'expense' || t.type === 'debt').forEach(t => {
            const k = t.category || 'อื่นๆ';
            groups[k] = (groups[k] || 0) + t.amount;
        });
        return Object.entries(groups).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
    });

    const topIncomeCats = computed(() => {
        const groups = {};
        monthTransactions.value.filter(t => t.type === 'income').forEach(t => {
            const k = t.category || 'อื่นๆ';
            groups[k] = (groups[k] || 0) + t.amount;
        });
        return Object.entries(groups).map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount).slice(0, 5);
    });

    const recentMonthTransactions = computed(() => {
        const arr = [...monthTransactions.value];
        arr.sort((a, b) => (a.date < b.date ? 1 : -1));
        return arr.slice(0, 6);
    });

    const selectDate = (dateStr) => {
        if(!dateStr) return;
        
        const dayTrans = transactions.value.filter(t => t.date === dateStr);
        const income = dayTrans.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
        const expense = dayTrans.filter(t => t.type === 'expense' || t.type === 'debt').reduce((sum, t) => sum + t.amount, 0);

        selectedDay.value = {
            dateStr,
            transactions: dayTrans,
            income,
            expense
        };
        showDayDetailModal.value = true;
    };

    const openAddModalFromDay = () => {
        form.value.date = selectedDay.value.dateStr;
        showDayDetailModal.value = false;
        showAddModal.value = true;
    };

    return {
        calendarHeader,
        calendarDays,
        prevMonth,
        nextMonth,
        monthTransactions,
        topExpenseCats,
        topIncomeCats,
        recentMonthTransactions,
        selectDate,
        openAddModalFromDay
    };
}
