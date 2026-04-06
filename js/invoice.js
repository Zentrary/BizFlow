
const { ref, nextTick, watch } = Vue;
import { showToast } from './utils.js';

export function useInvoice() {
    const showInvoiceModal = ref(false);
    const selectedInvoiceTransaction = ref(null);
    const showDailyInvoiceModal = ref(false);
    const dailyInvoice = ref({ date: '', transactions: [], total: 0 });
    const paperSizeSingle = ref('a4');
    const paperSizeDaily = ref('a4');

    // Fit to Screen Logic
    const fitToScreen = (elementId) => {
        nextTick(() => {
            const scaler = document.getElementById(elementId);
            if (!scaler) return;
            
            const container = scaler.closest('.receipt-container-wrapper');
            if (!container) return;

            // Reset to get natural size
            scaler.style.transform = 'scale(1)';
            scaler.style.transformOrigin = 'center center';
            
            const containerWidth = container.clientWidth;
            const containerHeight = container.clientHeight;
            const contentWidth = scaler.scrollWidth;
            const contentHeight = scaler.scrollHeight;
            
            // Add padding buffer
            const padding = 32; // 2rem total
            const availableWidth = containerWidth - padding;
            const availableHeight = containerHeight - padding;

            const scaleX = availableWidth / contentWidth;
            const scaleY = availableHeight / contentHeight;
            
            // Use the smaller scale to fit both dimensions, max 1
            const scale = Math.min(scaleX, scaleY, 1); 
            
            scaler.style.transform = `scale(${scale})`;
        });
    };

    // Watchers for Auto-Scaling
    watch(showInvoiceModal, (val) => {
        if (val) fitToScreen('receipt-scaler-single');
    });

    watch(showDailyInvoiceModal, (val) => {
        if (val) fitToScreen('receipt-scaler-daily');
    });

    watch(paperSizeSingle, () => {
        if (showInvoiceModal.value) fitToScreen('receipt-scaler-single');
    });

    watch(paperSizeDaily, () => {
        if (showDailyInvoiceModal.value) fitToScreen('receipt-scaler-daily');
    });

    // Handle Window Resize
    window.addEventListener('resize', () => {
        if (showInvoiceModal.value) fitToScreen('receipt-scaler-single');
        if (showDailyInvoiceModal.value) fitToScreen('receipt-scaler-daily');
    });

    const openInvoice = (transaction) => {
        selectedInvoiceTransaction.value = transaction;
        showInvoiceModal.value = true;
    };
    
    const viewSlip = (t) => {
        showToast('ฟีเจอร์ดูรูปสลิปจะใช้งานได้เมื่อเชื่อมต่อระบบ Backend จริง', 'info');
    };
    
    const openDailyInvoice = (dateStr, list) => {
        const items = Array.isArray(list) ? list : [];
        const total = items.reduce((sum, t) => {
            const amount = t.amount || 0;
            return sum + ((t.type === 'expense' || t.type === 'debt') ? -amount : amount);
        }, 0);
        dailyInvoice.value = { date: dateStr, transactions: items, total };
        showDailyInvoiceModal.value = true;
    };

    const downloadInvoiceAsPDF = (type) => {
        const elementId = type === 'single' ? 'receipt-scaler-single' : 'receipt-scaler-daily';
        const element = document.getElementById(elementId);
        const size = type === 'single' ? paperSizeSingle.value : paperSizeDaily.value;
        
        if (!element) return;

        // Save original styles
        const originalTransform = element.style.transform;
        const originalTransformOrigin = element.style.transformOrigin;
        const originalBoxShadow = element.style.boxShadow;
        
        // Reset styles for clear PDF generation
        element.style.transform = 'none';
        element.style.transformOrigin = 'top left'; 
        element.style.boxShadow = 'none'; 
        
        // Calculate dynamic height for small receipts
        let pdfFormat = 'a4';
        let pdfOrientation = 'portrait';
        
        if (size === 'small') {
             // Convert height px to mm (approx 1px = 0.264583 mm)
             const heightMm = (element.scrollHeight * 0.264583) + 10; 
             pdfFormat = [80, heightMm];
        } else if (size === 'a4-landscape') {
            pdfOrientation = 'landscape';
        }

        const opt = {
            margin:       0,
            filename:     `receipt-${type}-${new Date().getTime()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true, logging: false },
            jsPDF:        { unit: 'mm', format: pdfFormat, orientation: pdfOrientation }
        };

        // Check if html2pdf is loaded
        if (typeof html2pdf === 'undefined') {
            showToast('กำลังโหลดไลบรารี PDF...', 'info');
            setTimeout(() => {
                if (typeof html2pdf !== 'undefined') {
                    downloadInvoiceAsPDF(type);
                } else {
                    showToast('ไม่สามารถโหลดไลบรารี PDF ได้', 'error');
                    // Restore styles
                    element.style.transform = originalTransform;
                    element.style.transformOrigin = originalTransformOrigin;
                    element.style.boxShadow = originalBoxShadow;
                }
            }, 1000);
            return;
        }

        html2pdf().set(opt).from(element).save().then(() => {
            // Restore styles
            element.style.transform = originalTransform;
            element.style.transformOrigin = originalTransformOrigin;
            element.style.boxShadow = originalBoxShadow;
        }).catch(err => {
            console.error('PDF Generation Error:', err);
            // Restore styles
            element.style.transform = originalTransform;
            element.style.transformOrigin = originalTransformOrigin;
            element.style.boxShadow = originalBoxShadow;
            showToast('เกิดข้อผิดพลาดในการสร้าง PDF', 'error');
        });
    };

    return {
        showInvoiceModal,
        selectedInvoiceTransaction,
        openInvoice,
        viewSlip,
        showDailyInvoiceModal,
        dailyInvoice,
        openDailyInvoice,
        paperSizeSingle,
        paperSizeDaily,
        downloadInvoiceAsPDF
    };
}
