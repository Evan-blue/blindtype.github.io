// panelManager.js - 滑动面板工厂

function createSlidePanel(cfg) {
    const slide = document.getElementById(cfg.slideId);
    const overlay = document.getElementById(cfg.overlayId);
    const btn = document.getElementById(cfg.btnId);
    const closeBtn = document.getElementById(cfg.closeBtnId);

    const panel = {
        slide,
        overlay,
        btn,
        closeBtn,
        pinToggle: null,
        pinLit: false,

        open() {
            if (cfg.onOpen) cfg.onOpen();
            slide.classList.add('open');
            slide.removeAttribute('inert');
            overlay.classList.add('open');
            btn.setAttribute('aria-expanded', 'true');
            closeBtn.focus();
            if (cfg.openSpeak) speakText(cfg.openSpeak, 1.5);
        },

        close() {
            if (cfg.onClose) cfg.onClose();
            slide.classList.remove('open');
            slide.setAttribute('inert', '');
            overlay.classList.remove('open');
            btn.setAttribute('aria-expanded', 'false');
            btn.focus();
            if (cfg.closeSpeak) speakText(cfg.closeSpeak, 1.5);
        },

        toggle() {
            if (slide.classList.contains('open')) panel.close();
            else panel.open();
        },
    };

    if (cfg.pinId) {
        panel.pinToggle = document.getElementById(cfg.pinId);
        panel.pinToggle.addEventListener('click', () => {
            panel.pinLit = !panel.pinLit;
            panel.pinToggle.classList.toggle('lit', panel.pinLit);
            panel.pinToggle.setAttribute('aria-pressed', String(panel.pinLit));
            panel.pinToggle.title = panel.pinLit ? '已锁定（仅可通过✕关闭）' : '锁定面板';
        });
    }

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.open();
    });

    overlay.addEventListener('click', () => {
        if (panel.pinLit) return;
        panel.close();
    });

    closeBtn.addEventListener('click', () => panel.close());

    slide.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    return panel;
}
