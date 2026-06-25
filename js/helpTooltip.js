// helpTooltip.js - 帮助提示系统（兼顾正常用户视觉展示与视障用户语音播报）

import { speakText } from './brailleSpeech.js';

// ── 帮助文本注册中心 ──
// 所有篇幅较长的帮助文本集中在此，HTML 中只需 data-help="key" 即可引用

export const HELP_TEXTS = {
    'mapping-mode':          '书写从右向左，阅读从左向右',
    'number-braille':        '除了数号的点位是3 4 5 6以外，所有数字字符都只用上方四个点位，即1 2 4 5实现。1是1点位，2是1 2点位，小数点是2点位；3、4、5是在1的基础上叠加了4、4 5、5点位。6、7、8是在2的基础上叠加了4、4 5、5点位。9和0是在小数点的基础上上叠加了4、4 5点位。',
    'english-braille':       '字母A到J只有上面四个点位。A的点位是1，B的点位是2。C、D、E是在A的基础上叠加了4、4 5、5点位。F、G、H是在B的基础上叠加了4、4 5、5点位。I和J是在点位2的基础上叠加了4和4 5点位。K到T在此基础上增加了点位5。U到Z增加了点位5和6，W例外。我们只需记忆A、K、U和例外的W，其余的按此规律就能推到。',
};

// ── 浮层工具提示 ──

let _tooltipEl = null;
let _tooltipHideTimer = null;

function _ensureTooltipEl() {
    if (_tooltipEl) return;
    _tooltipEl = document.createElement('div');
    _tooltipEl.className = 'help-popover';
    _tooltipEl.setAttribute('role', 'tooltip');
    _tooltipEl.setAttribute('aria-live', 'polite');
    document.body.appendChild(_tooltipEl);

    // 浮层上鼠标离开即隐藏
    _tooltipEl.addEventListener('mouseleave', () => {
        _tooltipEl.classList.remove('show');
    });
}

function _showTooltip(trigger, text) {
    _ensureTooltipEl();
    clearTimeout(_tooltipHideTimer);
    _tooltipEl.textContent = text;
    _tooltipEl.classList.add('show');

    // 定位：优先在触发元素下方，空间不够则上方
    const rect = trigger.getBoundingClientRect();
    const popoverH = _tooltipEl.offsetHeight || 120;
    const popoverW = _tooltipEl.offsetWidth || 320;
    const gap = 8;

    let top = rect.bottom + gap;
    let left = rect.left;
    if (top + popoverH > window.innerHeight - 8) {
        top = rect.top - popoverH - gap;
    }
    if (left + popoverW > window.innerWidth - 8) {
        left = window.innerWidth - popoverW - 8;
    }
    if (left < 8) left = 8;

    _tooltipEl.style.top = top + 'px';
    _tooltipEl.style.left = left + 'px';
}

function _hideTooltip(delay) {
    clearTimeout(_tooltipHideTimer);
    if (delay) {
        _tooltipHideTimer = setTimeout(() => {
            if (_tooltipEl) _tooltipEl.classList.remove('show');
        }, delay);
    } else {
        if (_tooltipEl) _tooltipEl.classList.remove('show');
    }
}

// ── 初始化 ──

function _bindTrigger(el, text) {
    el.addEventListener('mouseenter', () => _showTooltip(el, text));
    el.addEventListener('mouseleave', () => _hideTooltip(300));
    el.addEventListener('focus', () => _showTooltip(el, text));
    el.addEventListener('blur', () => _hideTooltip(0));
}

function _bindSpeak(el, text) {
    const speak = (e) => {
        e.preventDefault();
        e.stopPropagation();
        _showTooltip(el, text);
        speakText(text);
    };
    el.addEventListener('click', speak);
    el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            speak(e);
        }
    });
}

export function initHelpTooltips() {
    // 1. .category-title[data-help]：标题与 ? 图标共同触发
    document.querySelectorAll('.category-title[data-help]').forEach(titleEl => {
        const key = titleEl.dataset.help;
        const text = HELP_TEXTS[key];
        if (!text) return;

        // 标题区域：hover/focus → 浮层，点击 → 播报
        titleEl.setAttribute('tabindex', '0');
        _bindTrigger(titleEl, text);
        _bindSpeak(titleEl, text);

        // ? 图标：aria + 可聚焦 + 点击播报
        const icon = titleEl.querySelector('.tooltip-help');
        if (icon) {
            icon.setAttribute('aria-label', text);
            icon.setAttribute('tabindex', '0');
            icon.setAttribute('role', 'button');
            _bindSpeak(icon, text);
        }
    });

    // 2. 独立 [data-help] 元素（不在 .category-title 内）
    document.querySelectorAll('[data-help]:not(.category-title)').forEach(el => {
        const key = el.dataset.help;
        const text = HELP_TEXTS[key];
        if (!text) return;

        el.setAttribute('aria-label', text);
        el.setAttribute('tabindex', '0');
        el.setAttribute('role', 'button');
        _bindTrigger(el, text);
        _bindSpeak(el, text);
    });

    // 全局 Escape 关闭浮层
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && _tooltipEl && _tooltipEl.classList.contains('show')) {
            _tooltipEl.classList.remove('show');
        }
    });
}
