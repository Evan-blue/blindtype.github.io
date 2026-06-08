// config.js - 全局配置、键位定义与持久化（无 UI 依赖）
//
// 按键标识约定（统一使用 e.code）：
//   - 小键盘数字：Numpad7, Numpad4, Numpad1, ...
//   - 主键盘数字：Digit1, Digit2, ...
//   - 字母键：KeyA, KeyB, ...
//   - 其他：Backspace, Space, ArrowLeft, ...

// ── 默认盲文点位键组（两组并列，始终同时生效）──
export const DOT_KEY_DEFAULTS = {
    keyboard: {
        '4': 'KeyI','1': 'KeyU', 
        '5': 'KeyK','2': 'KeyJ', 
        '6': 'Comma','3': 'KeyM', 
    },
    numpad: {
        '4': 'Numpad7', '1': 'Numpad8',
        '5': 'Numpad4', '2': 'Numpad5',
        '6': 'Numpad1', '3': 'Numpad2'
    },
};

// 运行时点位映射：按键标识 → 点位索引 (1-6)
export const KEY_TO_DOT = {};

// 反向映射：点位索引 → 按键标识（keyboard 组）
export const DOT_TO_KEY = {};

// 反向映射：点位索引 → 按键标识（numpad 组）
export const DOT_TO_KEY_NUMPAD = {};

// 当前活跃键组：'keyboard' | 'numpad'
export let activeKeyGroup = 'keyboard';
export function setActiveKeyGroupRaw(group) { activeKeyGroup = group; }

export function _isNumpadKey(keyId) {
    return keyId.startsWith('Numpad');
}

// ── 动作键：按键标识 → 动作名 ──
export const KEY_ACTIONS = {
    'Numpad0': 'space',
    'NumpadDivide': 'clearInput',
    'NumpadMultiply': 'delete',
    'Backspace': 'delete',
    'Delete': 'deleteForward',
    'Space': 'space',
    'ArrowLeft': 'cursorLeft',
    'ArrowRight': 'cursorRight',
    'ArrowUp': 'cursorUp',
    'ArrowDown': 'cursorDown',
    'KeyG': 'pageUp',
    'KeyH': 'pageDown',
    'KeyF': 'clearInput',
    'KeyD': 'delete',
    'KeyC': 'clearOutput',
    'KeyR': 'readAloud',
};

export const CONFIGURABLE_ACTIONS = {
    clearInput: { defaultKey: 'KeyF', label: '清空当前输入' },
    delete: { defaultKey: 'KeyD', label: '删除上一个字符' },
    clearOutput: { defaultKey: 'KeyC', label: '清空输出区' },
};

export const KEY_COMBOS = [
    { ctrl: true, key: 'a', action: 'selectAll' },
    { ctrl: true, key: 's', action: 'save' },
    { ctrl: true, key: 'z', action: 'undo' },
    { ctrl: true, key: 'y', action: 'redo' },
    { ctrl: true, shift: true, key: 'Z', action: 'redo' },
    { ctrl: true, shift: true, key: 'K', action: 'resetKeyBindings' },
    { ctrl: true, key: 'o', action: 'openFile' },
    { ctrl: true, shift: true, key: 'H', action: 'tutorial' },
    { key: 'q', action: 'toggleMapping' },
    { key: 'w', action: 'toggleHelp' },
    { key: 'e', action: 'toggleSettings' },
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
    speechRate: 1.2,
    debounceSpeech: true,
    maxUndoHistory: 10,
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
};

export let SETTINGS = {};

export const _CHAR_TO_KEYID = {
    ',': 'Comma', '.': 'Period', ';': 'Semicolon', "'": 'Quote',
    '/': 'NumpadDivide', '*': 'NumpadMultiply',
};

SETTINGS = {
    ...DEFAULT_SETTINGS,
    keyBindings: {
        keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
        numpad: { ...DEFAULT_SETTINGS.keyBindings.numpad },
    },
    actionKeyBindings: { ..._defaultActionKeyBindings },
};

function _migrateKeyId(keyId) {
    if (/^[0-9]$/.test(keyId)) return 'Numpad' + keyId;
    if (/^[a-zA-Z]$/.test(keyId)) return 'Key' + keyId.toUpperCase();
    if (keyId === ',') return 'Comma';
    if (keyId === '.') return 'Period';
    if (keyId === ';') return 'Semicolon';
    if (keyId === "'") return 'Quote';
    if (keyId === '/') return 'NumpadDivide';
    if (keyId === '*') return 'NumpadMultiply';
    if (keyId === ' ') return 'Space';
    return keyId;
}

function _migrateKeyIds(kb) {
    for (const dot of Object.keys(kb)) {
        const old = kb[dot];
        const migrated = _migrateKeyId(old);
        if (migrated !== old) kb[dot] = migrated;
    }
}

function _migrateActionKeyIds(akb) {
    for (const action of Object.keys(akb)) {
        const old = akb[action];
        if (!old) continue;
        const migrated = _migrateKeyId(old);
        if (migrated !== old) akb[action] = migrated;
    }
}

export function loadSettings() {
    const saved = localStorage.getItem('braille-settings');
    if (saved) {
        try {
            SETTINGS = JSON.parse(saved);
        } catch (_) {
            SETTINGS = {};
        }
    } else {
        SETTINGS = {};
    }

    if (!SETTINGS.keyBindings) SETTINGS.keyBindings = {};

    if (SETTINGS.keyBindings['1'] && typeof SETTINGS.keyBindings['1'] === 'string') {
        const oldKb = SETTINGS.keyBindings;
        _migrateKeyIds(oldKb);
        let numpadCount = 0;
        for (const key of Object.values(oldKb)) {
            if (_isNumpadKey(key)) numpadCount++;
        }
        SETTINGS.keyBindings = {
            keyboard: numpadCount > 3 ? { ...DOT_KEY_DEFAULTS.keyboard } : { ...oldKb },
            numpad: numpadCount > 3 ? { ...oldKb } : { ...DOT_KEY_DEFAULTS.numpad },
        };
    } else {
        if (!SETTINGS.keyBindings.keyboard) SETTINGS.keyBindings.keyboard = { ...DOT_KEY_DEFAULTS.keyboard };
        if (!SETTINGS.keyBindings.numpad) SETTINGS.keyBindings.numpad = { ...DOT_KEY_DEFAULTS.numpad };
        _migrateKeyIds(SETTINGS.keyBindings.keyboard);
        _migrateKeyIds(SETTINGS.keyBindings.numpad);
    }

    if (!SETTINGS.actionKeyBindings) SETTINGS.actionKeyBindings = { ..._defaultActionKeyBindings };
    _migrateActionKeyIds(SETTINGS.actionKeyBindings);

    for (const [action, key] of Object.entries(_defaultActionKeyBindings)) {
        if (SETTINGS.actionKeyBindings[action] === undefined) SETTINGS.actionKeyBindings[action] = key;
    }
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (SETTINGS[key] === undefined) SETTINGS[key] = DEFAULT_SETTINGS[key];
    }

    localStorage.removeItem('braille-alt-groups');
}

export function saveSettings() {
    localStorage.setItem('braille-settings', JSON.stringify(SETTINGS));
}

const _NON_CONFIGURABLE_KEYS = new Set([
    'Numpad0', 'NumpadDivide', 'NumpadMultiply',
    'Backspace', 'Delete', 'Space',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'KeyG', 'KeyH',
]);

export function applyKeyBindings() {
    const kb = SETTINGS.keyBindings;
    for (const k of Object.keys(KEY_TO_DOT)) delete KEY_TO_DOT[k];
    for (const k of Object.keys(DOT_TO_KEY)) delete DOT_TO_KEY[k];
    for (const k of Object.keys(DOT_TO_KEY_NUMPAD)) delete DOT_TO_KEY_NUMPAD[k];
    for (const group of ['keyboard', 'numpad']) {
        for (const [dotStr, key] of Object.entries(kb[group] || {})) {
            if (key && !(key in KEY_TO_DOT)) {
                KEY_TO_DOT[key] = parseInt(dotStr, 10);
            }
        }
    }
    for (const [dotStr, key] of Object.entries(kb.keyboard || {})) {
        if (key) DOT_TO_KEY[parseInt(dotStr, 10)] = key;
    }
    for (const [dotStr, key] of Object.entries(kb.numpad || {})) {
        if (key) DOT_TO_KEY_NUMPAD[parseInt(dotStr, 10)] = key;
    }
}

export function applyActionKeyBindings() {
    const akb = SETTINGS.actionKeyBindings;
    const configurableActions = new Set(Object.keys(CONFIGURABLE_ACTIONS));
    for (const [key, act] of Object.entries(KEY_ACTIONS)) {
        if (configurableActions.has(act) && !_NON_CONFIGURABLE_KEYS.has(key)) {
            delete KEY_ACTIONS[key];
        }
    }
    for (const [action, key] of Object.entries(akb)) {
        if (key) KEY_ACTIONS[key] = action;
    }
}

export function applyBrailleFontSize() {
    document.documentElement.style.setProperty('--braille-font-size', SETTINGS.brailleFontSize + 'px');
}
