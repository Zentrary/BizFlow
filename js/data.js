
import { showConfirm, showToast } from './utils.js';

export function useDataManagement(transactions, auth, shopProfile) {
    const exportData = () => {
        const dataStr = JSON.stringify(transactions.value);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
        const exportFileDefaultName = 'sme-money-data-'+ new Date().toISOString().split('T')[0] +'.json';
        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const importData = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                if (Array.isArray(data)) {
                    const ok = await showConfirm({
                        title: 'นำเข้าข้อมูล',
                        message: 'ข้อมูลเก่าจะถูกแทนที่ด้วยข้อมูลใหม่ทั้งหมด ยืนยันหรือไม่?',
                        confirmText: 'ยืนยันนำเข้า',
                        cancelText: 'ยกเลิก'
                    });
                    if (ok) {
                        transactions.value = data;
                        showToast('นำเข้าข้อมูลเรียบร้อยแล้ว', 'success');
                        setTimeout(() => window.location.reload(), 600);
                    }
                } else {
                    showToast('ไฟล์ไม่ถูกต้อง (ต้องเป็น JSON Array)', 'error');
                }
            } catch (err) {
                showToast('เกิดข้อผิดพลาดในการอ่านไฟล์', 'error');
                console.error(err);
            }
        };
        reader.readAsText(file);
    };

    const clearAllData = async () => {
        const ok = await showConfirm({
            title: 'ลบข้อมูลทั้งหมด?',
            message: 'การกระทำนี้ไม่สามารถย้อนกลับได้!',
            confirmText: 'ลบข้อมูล',
            cancelText: 'ยกเลิก',
            danger: true
        });
        if (!ok) return;

        transactions.value = [];

        const transKey = auth?.getStorageKey ? auth.getStorageKey('sme_transactions') : 'sme_transactions';
        const profileKey = auth?.getStorageKey ? auth.getStorageKey('sme_shop_profile') : 'sme_shop_profile';
        localStorage.removeItem(transKey);
        localStorage.removeItem(profileKey);
        if (shopProfile?.value) {
            shopProfile.value = { name: '', address: '', phone: '', taxId: '' };
        }

        showToast('ลบข้อมูลเรียบร้อยแล้ว', 'success');
        setTimeout(() => window.location.reload(), 600);
    };
    
    const exportToCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += "Date,Title,Type,Amount\n";
        transactions.value.forEach(t => {
            csvContent += `${t.date},${t.title},${t.type},${t.amount}\n`;
        });
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", "transactions.csv");
        document.body.appendChild(link);
        link.click();
    };

    return {
        exportData,
        importData,
        clearAllData,
        exportToCSV
    };
}
