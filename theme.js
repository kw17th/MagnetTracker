(function () {
    try {
        const savedTheme = localStorage.getItem('magnettracker_theme') || 'auto';
        let themeToApply = savedTheme;
        if (savedTheme === 'auto') {
            themeToApply = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        }
        document.documentElement.setAttribute('data-theme', themeToApply);
    } catch (e) {
        console.error('Failed to apply theme:', e);
    }
})();
