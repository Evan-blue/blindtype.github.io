// keyConfig.js - 键位配置（单一数据源，修改此处即可调整所有键位）
//
// 按键标识约定（统一使用 e.code）：
//   - 小键盘数字：Numpad7, Numpad4, Numpad1, ...
//   - 主键盘数字：Digit1, Digit2, ...
//   - 字母键：KeyA, KeyB, ...
//   - 其他：Backspace, Space, ArrowLeft, ...

// 默认点位键组（两组并列，始终同时生效）
const DOT_KEY_DEFAULTS = {
    keyboard: { 
        '1': 'KeyU', '4': 'KeyI', 
        '2': 'KeyJ', '5': 'KeyK', 
        '3': 'KeyM', '6': 'Comma'
    },
    numpad:   { 
        '1': 'Numpad7', '4': 'Numpad8', 
        '2': 'Numpad4', '5': 'Numpad5',
        '3': 'Numpad1', '6': 'Numpad2' 
    },
};

// 运行时点位映射：按键标识 → 点位索引 (1-6)
const KEY_TO_DOT = {};

// 反向映射：点位索引 → 按键标识（keyboard 组，用于显示标签）
const DOT_TO_KEY = {};

// 反向映射：点位索引 → 按键标识（numpad 组，用于显示标签）
const DOT_TO_KEY_NUMPAD = {};

// 当前活跃键组：'keyboard' | 'numpad'
let activeKeyGroup = 'keyboard';

/**
 * @description: 判断一个键位标识是否属于小键盘
 * @param {string} keyId e.code 格式键位标识
 * @return {boolean}
 */
function _isNumpadKey(keyId) {
    return keyId.startsWith('Numpad');
}

// 动作键：按键标识 → 动作名（不可配置 + 可配置的初始值）
const KEY_ACTIONS = {
    // 不可配置
    'Numpad0':      'space',
    'NumpadDivide': 'clearInput',
    'NumpadMultiply': 'delete',
    'Backspace':    'delete',
    'Delete':       'deleteForward',
    'Space':        'space',
    'ArrowLeft':    'cursorLeft',
    'ArrowRight':   'cursorRight',
    'ArrowUp':      'cursorUp',
    'ArrowDown':    'cursorDown',
    'KeyG':         'pageUp',
    'KeyH':         'pageDown',
    // 可配置（初始映射，运行时由 settings 覆盖）
    'KeyF':         'clearInput',
    'KeyD':         'delete',
    'KeyC':         'clearOutput',
    'KeyR':         'readAloud',
};

// 可配置的动作键：动作名 → { defaultKey, label }
const CONFIGURABLE_ACTIONS = {
    clearInput:  { defaultKey: 'KeyF', label: '清空当前输入' },
    delete:      { defaultKey: 'KeyD', label: '删除上一个字符' },
    clearOutput: { defaultKey: 'KeyC', label: '清空输出区' },
};

// 组合键（修饰键 + 按键匹配时触发）
const KEY_COMBOS = [
    { ctrl: true,  key: 'a', action: 'selectAll' },
    { ctrl: true,  key: 's', action: 'save' },
    { ctrl: true,  key: 'z', action: 'undo' },
    { ctrl: true,  key: 'y', action: 'redo' },
    { ctrl: true, shift: true, key: 'Z', action: 'redo' },
    { ctrl: true, shift: true, key: 'S', action: 'toggleSettings' },
    { ctrl: true, shift: true, key: 'Q', action: 'toggleHelp' },
    { ctrl: true, shift: true, key: 'K', action: 'resetKeyBindings' },
    { ctrl: true, key: 'o', action: 'openFile' },
    { ctrl: true, shift: true, key: 'H', action: 'tutorial' },
    { ctrl: true, shift: true, key: 'W', action: 'toggleMapping' },
];
