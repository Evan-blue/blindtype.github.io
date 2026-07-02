// helpTooltip.js - 帮助提示系统（兼顾正常用户视觉展示与视障用户语音播报）

import { speak } from './brailleSpeech.js';

// ── 帮助文本注册中心 ──
// 所有篇幅较长的帮助文本集中在此，HTML 中只需 data-help="key" 即可引用

export const HELP_TEXTS = {
    'mapping-mode':          '书写从右向左，阅读从左向右',
    
    'initial-braille':       'g、k、h 与 j、q、x 的判断方法：前者韵母起头字母为：a、o、e、u；后者韵母起头字母为：i、ü',
    
    'number-braille':        '数字记忆方法：除了数号的点位是3 4 5 6以外，所有数字字符都只用上方四个点位，即1 2 4 5实现。\n1是点位1，2是点位1 2，小数点是点位2；\n数字3、4、5是在1的基础上叠加了4、4 5、5点位。\n数字6、7、8是在2的基础上叠加了4、4 5、5点位。\n数字9和0是在小数点的基础上叠加了4、4 5点位。\n几个数字可以按照 1 2 小数点、3 4 5、6 7 8、9 0 的规律记忆。',
    
    'english-braille':       '英文字母记忆方法：字母A到J只有上面四个点位。\nA的点位是1，B的点位是1 2。\nC、D、E是在A的基础上叠加了4、4 5、5点位。\nF、G、H是在B的基础上叠加了4、4 5、5点位。\nI和J是在点位2的基础上叠加了4和4 5点位。\n\nK到T是在A到J的此基础上增加了点位3。\nU到Z是在A到J的增加了点位3和6（注意W例外）。\n我们只需记忆A、K、U和例外的W，其余的按此规律就能推到。',
};

// ── 拼音字母播报转换 ──
// 帮助文本中的单字母拼音需先转为汉字再播报，否则读屏会读成英文字母

const PINYIN_LETTER_TO_CHAR = {
    // 声母
    'b': '玻', 'p': '坡', 'm': '摸', 'f': '佛',
    'd': '得', 't': '特', 'n': '讷', 'l': '勒',
    'g': '哥', 'k': '科', 'h': '喝',
    'j': '基', 'q': '七', 'x': '西',
    'zh': '知', 'ch': '吃', 'sh': '诗',
    'r': '日', 'z': '资', 'c': '雌', 's': '思',
    // 韵母
    'a': '啊', 'o': '哦', 'e': '鹅',
    'i': '衣', 'u': '乌', 'ü': '迂',
};

function _toSpeakable(text) {
    return text.replace(/(?<![a-züA-Z])(zh|ch|sh|[bpmfdtnlgkhjqxrzcs]|[aoeiuü])(?![a-züA-Z])/g, (m) => {
        return PINYIN_LETTER_TO_CHAR[m] || m;
    });
}

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
    const spoken = _toSpeakable(text);
    const speak = (e) => {
        e.preventDefault();
        e.stopPropagation();
        _showTooltip(el, text);
        speak.text(spoken);
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
