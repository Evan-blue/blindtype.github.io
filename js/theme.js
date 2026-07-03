// theme.js - 明暗主题切换

const STORAGE_KEY = 'braille-theme';

export function toggleTheme() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const isLight = document.body.classList.toggle('light');
    localStorage.setItem(STORAGE_KEY, isLight ? 'light' : 'dark');
    btn.textContent = isLight ? '☀' : '🌙';
    btn.setAttribute('aria-pressed', String(isLight));
}

export function initTheme() {
    const btn = document.getElementById('themeToggle');
    if (!btn) return;
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'light') {
        document.body.classList.add('light');
        btn.textContent = '☀';
        btn.setAttribute('aria-pressed', 'true');
    }
    btn.addEventListener('click', toggleTheme);
}
