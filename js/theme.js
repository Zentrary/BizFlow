
export const initTheme = () => {
    const savedTheme = localStorage.getItem('sme_dark_mode') === 'true';
    if (savedTheme) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
    return savedTheme;
};
