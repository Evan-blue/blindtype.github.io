// config.js - 全局静态配置与纯工具函数（无运行时可变状态）
//
// 按键标识约定（统一使用 e.code）：
//   - 小键盘数字：Numpad7, Numpad4, Numpad1, ...
//   - 主键盘数字：Digit1, Digit2, ...
//   - 字母键：KeyA, KeyB, ...
//   - 其他：Backspace, Space, ArrowLeft, ...

// ── 各预设对应的键位位置描述（用于教程第三节进一步描述手指位置）──
export const PRESET_POSITION_TEXTS = {
    keyboard: {
        'fdsjkl': '国际标准键位；左手食指、中指和无名指负责1、2、3点，右手食指、中指和无名指负责4、5、6点。',
        'ik,ujm': '纵向键位；右手中指从上到下就是i、k、逗号键，负责1、2、3点，食指从上到下就是u、j、m键，负责4、5、6点。',
        'ol.ik,': '纵向键位；右手无名指从上到下就是o、l、句号键，负责1、2、3点，中指从上到下就是i、k、逗号键，负责4、5、6点。',
        '.,mlkj': '横向键位；右手无名指、中指、食指下方的三个按键（句号、逗号、M键）负责1、2、3点，他们所在的L、K、J键负责4、5、6点。',
        'lkjoiu': '横向键位；右手无名指、中指、食指所在的L、K、J负责1、2、3点，他们上方的三个键（O、I、U）负责4、5、6点。',
    },
    numpad: {
        '852741': '',
        '963852': '',
        '654987': '',
        '321654': '',
    }
};

export function _codeToKbdPresetChar(code) {
    if (code.startsWith('Key')) return code.slice(3).toLowerCase();
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Semicolon') return ';';
    if (code === 'Quote') return '\'';
    return '';
}

export function _codeToNumpadPresetChar(code) {
    const m = code.match(/^Numpad(\d)$/);
    return m ? m[1] : '';
}

// ── 默认盲文点位键组（两组并列，始终同时生效）──
export const DOT_KEY_DEFAULTS = {
    keyboard: {
        '1': 'KeyF', '2': 'KeyD', '3': 'KeyS', '4': 'KeyJ', '5': 'KeyK', '6': 'KeyL',
    },
    numpad: {
        '4': 'Numpad7', '1': 'Numpad8',
        '5': 'Numpad4', '2': 'Numpad5',
        '6': 'Numpad1', '3': 'Numpad2'
    },
};

export function _isNumpadKey(keyId) {
    return keyId.startsWith('Numpad');
}

// ── 可配置动作定义 ──
export const CONFIGURABLE_ACTIONS = {
    clearInput: { defaultKey: 'KeyY', label: '清空当前输入' },
    clearOutput: { defaultKey: 'KeyC', label: '清空输出区' },
};

// ── 组合键配置 ──
export const KEY_COMBOS = [
    { ctrl: true, key: 'a', action: 'selectAll' },
    { ctrl: true, key: 's', action: 'save' },
    { ctrl: true, key: 'z', action: 'undo' },
    { ctrl: true, key: 'y', action: 'redo' },
    { ctrl: true, shift: true, key: 'Z', action: 'redo' },
    { ctrl: true, shift: true, key: 'K', action: 'customBind' },
    { ctrl: true, key: 'k', action: 'speakBindings' },
    { ctrl: true, key: 'o', action: 'openFile' },
    { ctrl: true, shift: true, key: 'H', action: 'tutorial' },
    { ctrl: true, key: 'ArrowUp', action: 'speechRateUp' },
    { ctrl: true, key: 'ArrowDown', action: 'speechRateDown' },
    { key: 'q', action: 'toggleMapping' },
    { key: 'w', action: 'toggleKeyboard' },
    { key: 't', action: 'toggleTheme' },
];

const _defaultActionKeyBindings = {};
for (const [action, cfg] of Object.entries(CONFIGURABLE_ACTIONS)) {
    _defaultActionKeyBindings[action] = cfg.defaultKey;
}

export const DEFAULT_SETTINGS = {
    keyBindings: {
        keyboard: { ...DOT_KEY_DEFAULTS.keyboard },
        numpad: { ...DOT_KEY_DEFAULTS.numpad },
    },
    actionKeyBindings: { ..._defaultActionKeyBindings },
    speechRate: 1.8,
    debounceSpeech: true,
    maxUndoHistory: 20,
    brailleFontSize: 12,
    allowSpeech: true,
    announceEmptyCell: false,
    wordSegmentation: true,
    cursorJumpMode: 'sentenceEnd',
    punctAutoSpacing: true,
    multiSelect: false,
    forceWelcome: false,
    mainKeyboardDigits: true,
    mergeNewlines: true,
    omitToneMapping: true,
    showVisualizer: true,
    dotFeedbackSpeak: false,
};

// 非可配置动作键集合
export const _NON_CONFIGURABLE_KEYS = new Set([
    'Numpad0', 'NumpadDivide', 'NumpadMultiply',
    'Backspace', 'Delete', 'Space',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'KeyG', 'KeyH',
]);

// ── 按键标识 → UI 显示名（短符号，用于面板 badge / 绑定状态）──
export function keyIdToLabel(keyId) {
    if (!keyId) return '?';
    if (/^Numpad\d$/.test(keyId)) return keyId.slice(6);
    const numpadLabels = { NumpadAdd: '+', NumpadSubtract: '-', NumpadMultiply: '*', NumpadDivide: '/', NumpadDecimal: '.', NumpadEnter: 'Enter' };
    if (numpadLabels[keyId]) return numpadLabels[keyId];
    if (/^Digit\d$/.test(keyId)) return keyId.slice(5);
    if (/^Key[A-Z]$/.test(keyId)) return keyId.slice(3);
    const punctLabels = { Comma: ',', Period: '.', Semicolon: ';', Quote: "'", Slash: '/', Backslash: '\\', BracketLeft: '[', BracketRight: ']', Minus: '-', Equal: '=', Backquote: '`' };
    if (punctLabels[keyId]) return punctLabels[keyId];
    if (keyId === 'Space') return 'Space';
    if (keyId === 'ArrowLeft') return '←';
    if (keyId === 'ArrowRight') return '→';
    if (keyId === 'ArrowUp') return '↑';
    if (keyId === 'ArrowDown') return '↓';
    if (keyId === 'Backspace') return '⌫';
    if (keyId === 'Delete') return 'DEL';
    return keyId;
}
