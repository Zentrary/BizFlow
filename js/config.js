tailwind.config = {
    darkMode: 'class',
    theme: {
        extend: {
            fontFamily: {
                sans: ['Sarabun', 'sans-serif'],
            },
            colors: {
                dark: {
                    bg: '#111827',
                    card: '#1f2937',
                    text: '#f3f4f6',
                    muted: '#9ca3af',
                    border: '#374151'
                }
            }
        }
    }
}

window.APP_CONFIG = {
    API_BASE_URL: (() => {
        if (typeof window.__API_BASE_URL === 'string' && window.__API_BASE_URL.trim()) {
            return window.__API_BASE_URL.trim().replace(/\/$/, '');
        }

        const hostname = window.location.hostname;
        const port = window.location.port;

        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            if (port === '3000' || port === '3001') {
                return window.location.origin;
            }
            return 'http://localhost:3000';
        }

        return window.location.origin;
    })()
};
