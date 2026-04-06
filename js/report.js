
const { ref, computed, watch, nextTick } = Vue;
import { formatCurrency } from './utils.js';

export function useReports(transactions) {
    // State
    const reportDate = ref(new Date());
    const reportType = ref('monthly'); // 'monthly', 'yearly'
    let categoryChartInstance = null;
    let trendReportChartInstance = null;

    // Computed Headers
    const reportHeader = computed(() => {
        if (reportType.value === 'monthly') {
            return reportDate.value.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
        }
        return reportDate.value.toLocaleDateString('th-TH', { year: 'numeric' });
    });

    // Navigation
    const prevPeriod = () => {
        if (reportType.value === 'monthly') {
            reportDate.value = new Date(reportDate.value.getFullYear(), reportDate.value.getMonth() - 1, 1);
        } else {
            reportDate.value = new Date(reportDate.value.getFullYear() - 1, 0, 1);
        }
    };

    const nextPeriod = () => {
        if (reportType.value === 'monthly') {
            reportDate.value = new Date(reportDate.value.getFullYear(), reportDate.value.getMonth() + 1, 1);
        } else {
            reportDate.value = new Date(reportDate.value.getFullYear() + 1, 0, 1);
        }
    };

    // Data Filtering
    const reportTransactions = computed(() => {
        const year = reportDate.value.getFullYear();
        const month = reportDate.value.getMonth();

        return transactions.value.filter(t => {
            const d = new Date(t.date);
            if (reportType.value === 'monthly') {
                return d.getFullYear() === year && d.getMonth() === month;
            } else {
                return d.getFullYear() === year;
            }
        });
    });

    // Stats
    const totalIncome = computed(() => reportTransactions.value.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0));
    const totalExpense = computed(() => reportTransactions.value.filter(t => t.type === 'expense' || t.type === 'debt').reduce((sum, t) => sum + t.amount, 0));
    const netProfit = computed(() => totalIncome.value - totalExpense.value);
    const profitMargin = computed(() => {
        if (totalIncome.value === 0) return 0;
        return ((netProfit.value / totalIncome.value) * 100).toFixed(1);
    });

    // Category Breakdown
    const expenseByCategory = computed(() => {
        const groups = {};
        reportTransactions.value.filter(t => t.type === 'expense' || t.type === 'debt').forEach(t => {
            if (!groups[t.category]) groups[t.category] = 0;
            groups[t.category] += t.amount;
        });
        
        return Object.entries(groups)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);
    });

    const incomeByCategory = computed(() => {
        const groups = {};
        reportTransactions.value.filter(t => t.type === 'income').forEach(t => {
            if (!groups[t.category]) groups[t.category] = 0;
            groups[t.category] += t.amount;
        });
        
        return Object.entries(groups)
            .map(([name, amount]) => ({ name, amount }))
            .sort((a, b) => b.amount - a.amount);
    });

    // Charts
    const initReportCharts = async () => {
        await nextTick();

        // 1. Expense Category Chart (Doughnut)
        const ctxCat = document.getElementById('reportCategoryChart');
        if (ctxCat) {
            if (categoryChartInstance) categoryChartInstance.destroy();
            
            const data = expenseByCategory.value;
            const labels = data.map(d => d.name);

            const CATEGORY_COLOR_MAP = {
                'การตลาด': '#EF4444',    // Red
                'บริการ': '#06B6D4',     // Cyan (distinct from red/pink/orange)
                // Optional mappings for consistency; others fall back to palette order
                'ขนส่ง': '#F59E0B',      // Orange
                'ค่าเช่า': '#10B981',     // Emerald
                'ขายสินค้า': '#3B82F6',  // Blue
                'อื่นๆ': '#6366F1',       // Indigo
                'ค่าน้ำ/ไฟ': '#8B5CF6',  // Violet
                'วัตถุดิบ': '#EC4899'    // Pink
            };

            const FALLBACK_PALETTE = [
                '#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899'
            ];

            const backgroundColors = labels.map((name, i) => CATEGORY_COLOR_MAP[name] || FALLBACK_PALETTE[i % FALLBACK_PALETTE.length]);
            
            categoryChartInstance = new Chart(ctxCat, {
                type: 'doughnut',
                data: {
                    labels,
                    datasets: [{
                        data: data.map(d => d.amount),
                        backgroundColor: backgroundColors,
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'right' }
                    }
                }
            });
        }

        // 2. Trend Chart (Bar/Line) - Daily for Monthly, Monthly for Yearly
        const ctxTrend = document.getElementById('reportTrendChart');
        if (ctxTrend) {
            if (trendReportChartInstance) trendReportChartInstance.destroy();

            let labels = [];
            let incomeData = [];
            let expenseData = [];

            if (reportType.value === 'monthly') {
                // Daily breakdown
                const daysInMonth = new Date(reportDate.value.getFullYear(), reportDate.value.getMonth() + 1, 0).getDate();
                labels = Array.from({length: daysInMonth}, (_, i) => i + 1);
                
                incomeData = new Array(daysInMonth).fill(0);
                expenseData = new Array(daysInMonth).fill(0);

                reportTransactions.value.forEach(t => {
                    const day = new Date(t.date).getDate() - 1;
                    if (t.type === 'income') incomeData[day] += t.amount;
                    if (t.type === 'expense' || t.type === 'debt') expenseData[day] += t.amount;
                });
            } else {
                // Monthly breakdown
                labels = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
                incomeData = new Array(12).fill(0);
                expenseData = new Array(12).fill(0);

                reportTransactions.value.forEach(t => {
                    const month = new Date(t.date).getMonth();
                    if (t.type === 'income') incomeData[month] += t.amount;
                    if (t.type === 'expense' || t.type === 'debt') expenseData[month] += t.amount;
                });
            }

            trendReportChartInstance = new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'รายรับ',
                            data: incomeData,
                            backgroundColor: '#10B981',
                            borderRadius: 4
                        },
                        {
                            label: 'รายจ่าย',
                            data: expenseData,
                            backgroundColor: '#EF4444',
                            borderRadius: 4
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { beginAtZero: true, grid: { display: false } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    };

    // Watch for data changes
    watch([reportDate, reportType, transactions], () => {
        initReportCharts();
    });

    return {
        reportDate,
        reportType,
        reportHeader,
        prevPeriod,
        nextPeriod,
        totalIncome,
        totalExpense,
        netProfit,
        profitMargin,
        expenseByCategory,
        incomeByCategory,
        initReportCharts
    };
}
