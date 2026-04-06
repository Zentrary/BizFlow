
export const formatCurrency = (value) => {
    return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(value);
};

export const formatDate = (dateString) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('th-TH', { dateStyle: 'long' }).format(date);
};

export const showToast = (message, type = 'success') => {
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        toastContainer.className = 'fixed top-4 right-4 z-50 flex flex-col gap-2';
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement('div');
    
    let iconClass = '';
    let bgColor = '';
    let textColor = '';
    
    if (type === 'success') {
        iconClass = 'ph ph-check-circle text-xl';
        bgColor = 'bg-white dark:bg-gray-800';
        textColor = 'text-green-600 dark:text-green-400';
    } else if (type === 'error') {
        iconClass = 'ph ph-warning-circle text-xl';
        bgColor = 'bg-white dark:bg-gray-800';
        textColor = 'text-red-600 dark:text-red-400';
    } else {
        iconClass = 'ph ph-info text-xl';
        bgColor = 'bg-white dark:bg-gray-800';
        textColor = 'text-blue-600 dark:text-blue-400';
    }

    toast.className = `${bgColor} ${textColor} px-6 py-4 rounded-xl shadow-xl border border-gray-100 dark:border-gray-700 flex items-center gap-3 transform transition-all duration-300 translate-x-full opacity-0 min-w-[300px]`;
    const icon = document.createElement('i');
    icon.className = iconClass;
    const text = document.createElement('span');
    text.className = 'font-medium text-gray-800 dark:text-white';
    text.textContent = String(message ?? '');
    toast.append(icon, text);

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full', 'opacity-0');
    });

    setTimeout(() => {
        toast.classList.add('translate-x-full', 'opacity-0');
        setTimeout(() => {
            toast.remove();
            if (toastContainer.children.length === 0) {
                toastContainer.remove();
            }
        }, 300);
    }, 3000);
};

export const showConfirm = ({
    title = 'ยืนยันการทำรายการ',
    message = '',
    confirmText = 'ตกลง',
    cancelText = 'ยกเลิก',
    danger = false
} = {}) => {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4';

        const modal = document.createElement('div');
        modal.className = 'bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full border border-gray-100 dark:border-gray-700 transform transition-all duration-200 scale-95 opacity-0';

        const headerClass = danger ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-white';
        const confirmClass = danger
            ? 'bg-red-600 hover:bg-red-700 text-white'
            : 'bg-indigo-600 hover:bg-indigo-700 text-white';

        const content = document.createElement('div');
        content.className = 'p-6';

        const heading = document.createElement('h3');
        heading.className = `text-lg font-bold ${headerClass} mb-2`;
        heading.textContent = String(title ?? '');

        const body = document.createElement('p');
        body.className = 'text-sm text-gray-600 dark:text-gray-300 whitespace-pre-line';
        body.textContent = String(message ?? '');

        content.append(heading, body);

        const actions = document.createElement('div');
        actions.className = 'px-6 pb-6 flex gap-3 justify-end';

        const cancelBtn = document.createElement('button');
        cancelBtn.type = 'button';
        cancelBtn.setAttribute('data-action', 'cancel');
        cancelBtn.className = 'px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600 dark:text-gray-200 transition';
        cancelBtn.textContent = String(cancelText ?? '');

        const confirmBtn = document.createElement('button');
        confirmBtn.type = 'button';
        confirmBtn.setAttribute('data-action', 'confirm');
        confirmBtn.className = `px-4 py-2 rounded-lg ${confirmClass} transition`;
        confirmBtn.textContent = String(confirmText ?? '');

        actions.append(cancelBtn, confirmBtn);
        modal.append(content, actions);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        const cleanup = (value) => {
            document.removeEventListener('keydown', onKeyDown);
            overlay.remove();
            resolve(value);
        };

        const closeWithAnimation = (value) => {
            modal.classList.remove('scale-100', 'opacity-100');
            modal.classList.add('scale-95', 'opacity-0');
            setTimeout(() => cleanup(value), 180);
        };

        const onKeyDown = (e) => {
            if (e.key === 'Escape') closeWithAnimation(false);
        };

        document.addEventListener('keydown', onKeyDown);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeWithAnimation(false);
        });

        modal.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-action]');
            if (!btn) return;
            const action = btn.getAttribute('data-action');
            closeWithAnimation(action === 'confirm');
        });

        requestAnimationFrame(() => {
            modal.classList.remove('scale-95', 'opacity-0');
            modal.classList.add('scale-100', 'opacity-100');
        });
    });
};
