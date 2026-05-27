// settings.js - 设置管理

// 从 CONFIGURABLE_ACTIONS 生成默认 actionKeyBindings
const _defaultActionKeyBindings = {};
for (const [action, cfg] of Object.entries(CONFIGURABLE_ACTIONS)) {
    _defaultActionKeyBindings[action] = cfg.defaultKey;
}

const DEFAULT_SETTINGS = {
    keyBindings: {
        keyboard: { ...DOT_KEY_DEFAULTS.keyboard },
        numpad:   { ...DOT_KEY_DEFAULTS.numpad },
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
};

const DOT_NAMES = ['①点', '②点', '③点', '④点', '⑤点', '⑥点'];
const DOT_NAME_AUDIOS = ['1号点', '2号点', '3号点', '4号点', '5号点', '6号点'];
const SEQ_ORDER = [1, 2, 3, 4, 5, 6]; // 一键重设顺序

let SETTINGS = {};
let _kbListening = null;      // 当前正在监听按键的 dot 编号，null 表示未监听
let _kbListeningGroup = null;  // 当前监听所属组：'keyboard' | 'numpad'
let _akbListening = null;      // 当前正在监听按键的动作名，null 表示未监听
let _seqBinding = null;        // 一键重设状态：{ step: 0..5, keys: {} } 或 null

const KEY_PRESETS = {
    'numpad-v-7': { '1': 'Numpad7', '2': 'Numpad4', '3': 'Numpad1', '4': 'Numpad8', '5': 'Numpad5', '6': 'Numpad2' },
    'numpad-v-8': { '1': 'Numpad8', '2': 'Numpad5', '3': 'Numpad2', '4': 'Numpad9', '5': 'Numpad6', '6': 'Numpad3' },
    'numpad-h-9': { '1': 'Numpad9', '2': 'Numpad8', '3': 'Numpad7', '4': 'Numpad6', '5': 'Numpad5', '6': 'Numpad4' },
    'numpad-h-6': { '1': 'Numpad6', '2': 'Numpad5', '3': 'Numpad4', '4': 'Numpad3', '5': 'Numpad2', '6': 'Numpad1' },
    'kbd-v-u': { '1': 'KeyU', '2': 'KeyJ', '3': 'KeyM', '4': 'KeyI', '5': 'KeyK', '6': 'Comma' },
    'kbd-v-i': { '1': 'KeyI', '2': 'KeyK', '3': 'Comma', '4': 'KeyO', '5': 'KeyL', '6': 'Period' },
    'kbd-h-o': { '1': 'KeyO', '2': 'KeyI', '3': 'KeyU', '4': 'KeyL', '5': 'KeyK', '6': 'KeyJ' },
    'kbd-h-l': { '1': 'KeyL', '2': 'KeyK', '3': 'KeyJ', '4': 'Period', '5': 'Comma', '6': 'KeyM' },
};

// 立即加载默认值，确保 SETTINGS 对象始终可用
SETTINGS = {
    ...DEFAULT_SETTINGS,
    keyBindings: {
        keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
        numpad:   { ...DEFAULT_SETTINGS.keyBindings.numpad },
    },
    actionKeyBindings: { ..._defaultActionKeyBindings },
};

/**
 * @description: 将旧格式键位标识迁移为 e.code 格式
 * @param {string} keyId 旧格式键位标识
 * @return {string} e.code 格式键位标识
 */
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

/**
 * @description: 从 localStorage 加载用户设置，缺失项用默认值填充
 * @return {void}
 */
function loadSettings() {
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

    // Ensure keyBindings exists
    if (!SETTINGS.keyBindings) SETTINGS.keyBindings = {};

    // 检测旧版单组格式并迁移为双组格式
    if (SETTINGS.keyBindings['1'] && typeof SETTINGS.keyBindings['1'] === 'string') {
        const oldKb = SETTINGS.keyBindings;
        _migrateKeyIds(oldKb);
        let numpadCount = 0;
        for (const key of Object.values(oldKb)) {
            if (_isNumpadKey(key)) numpadCount++;
        }
        SETTINGS.keyBindings = {
            keyboard: numpadCount > 3 ? { ...DOT_KEY_DEFAULTS.keyboard } : { ...oldKb },
            numpad:   numpadCount > 3 ? { ...oldKb } : { ...DOT_KEY_DEFAULTS.numpad },
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
    if (SETTINGS.maxUndoHistory === undefined) SETTINGS.maxUndoHistory = DEFAULT_SETTINGS.maxUndoHistory;
    if (SETTINGS.brailleFontSize === undefined) SETTINGS.brailleFontSize = DEFAULT_SETTINGS.brailleFontSize;
    if (SETTINGS.announceEmptyCell === undefined) SETTINGS.announceEmptyCell = DEFAULT_SETTINGS.announceEmptyCell;
    if (SETTINGS.wordSegmentation === undefined) SETTINGS.wordSegmentation = DEFAULT_SETTINGS.wordSegmentation;
    if (SETTINGS.cursorJumpMode === undefined) SETTINGS.cursorJumpMode = DEFAULT_SETTINGS.cursorJumpMode;
    if (SETTINGS.punctAutoSpacing === undefined) SETTINGS.punctAutoSpacing = DEFAULT_SETTINGS.punctAutoSpacing;
    if (SETTINGS.multiSelect === undefined) SETTINGS.multiSelect = DEFAULT_SETTINGS.multiSelect;
    if (SETTINGS.allowSpeech === undefined) SETTINGS.allowSpeech = DEFAULT_SETTINGS.allowSpeech;
    if (SETTINGS.forceWelcome === undefined) SETTINGS.forceWelcome = DEFAULT_SETTINGS.forceWelcome;
    applyBrailleFontSize();

    // 清理旧版备选键组存储（已迁移至 SETTINGS.keyBindings）
    localStorage.removeItem('braille-alt-groups');
}

function saveSettings() {
    localStorage.setItem('braille-settings', JSON.stringify(SETTINGS));
}

function resetToDefaults() {
    SETTINGS = {
        ...DEFAULT_SETTINGS,
        keyBindings: {
            keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
            numpad:   { ...DEFAULT_SETTINGS.keyBindings.numpad },
        },
        actionKeyBindings: { ..._defaultActionKeyBindings },
    };
    saveSettings();
    applyKeyBindings();
    applyActionKeyBindings();
    updateKeyLabels();
    applyBrailleFontSize();
    const kbContainer = document.getElementById('keyBindings');
    if (kbContainer) renderKeyBindingsUI(kbContainer);
    const akbContainer = document.getElementById('actionKeyBindings');
    if (akbContainer) renderActionKeyBindingsUI(akbContainer);
    const speechRate = document.getElementById('speechRate');
    const speechRateVal = document.getElementById('speechRateVal');
    if (speechRate) { speechRate.value = DEFAULT_SETTINGS.speechRate; speechRateVal.textContent = DEFAULT_SETTINGS.speechRate; }
    const debounce = document.getElementById('debounceSpeech');
    if (debounce) debounce.checked = DEFAULT_SETTINGS.debounceSpeech;
    const allowSp = document.getElementById('allowSpeech');
    if (allowSp) allowSp.checked = DEFAULT_SETTINGS.allowSpeech;
    const announce = document.getElementById('announceEmptyCell');
    if (announce) announce.checked = DEFAULT_SETTINGS.announceEmptyCell;
    const wordSeg = document.getElementById('wordSegmentation');
    if (wordSeg) wordSeg.checked = DEFAULT_SETTINGS.wordSegmentation;
    const jumpRadio = document.querySelector(`input[name="cursorJumpMode"][value="${DEFAULT_SETTINGS.cursorJumpMode}"]`);
    if (jumpRadio) jumpRadio.checked = true;
    const punct = document.getElementById('punctAutoSpacing');
    if (punct) punct.checked = DEFAULT_SETTINGS.punctAutoSpacing;
    const multiSel = document.getElementById('multiSelect');
    if (multiSel) multiSel.checked = DEFAULT_SETTINGS.multiSelect;
    const maxUndo = document.getElementById('maxUndoHistory');
    const maxUndoVal = document.getElementById('maxUndoHistoryVal');
    if (maxUndo) { maxUndo.value = DEFAULT_SETTINGS.maxUndoHistory; maxUndoVal.textContent = DEFAULT_SETTINGS.maxUndoHistory; }
    const brailleFs = document.getElementById('brailleFontSize');
    const brailleFsVal = document.getElementById('brailleFontSizeVal');
    if (brailleFs) { brailleFs.value = DEFAULT_SETTINGS.brailleFontSize; brailleFsVal.textContent = DEFAULT_SETTINGS.brailleFontSize; }
    invalidatePageCache();
    renderOutput();
    speakText('已恢复默认设置');
}

function getSettings() {
    return SETTINGS;
}

/**
 * @description: 根据设置重建 KEY_TO_DOT 和 DOT_TO_KEY 映射（合并两组键位）
 * @return {void}
 */
function applyKeyBindings() {
    const kb = SETTINGS.keyBindings;
    for (const k of Object.keys(KEY_TO_DOT)) delete KEY_TO_DOT[k];
    for (const k of Object.keys(DOT_TO_KEY)) delete DOT_TO_KEY[k];
    for (const k of Object.keys(DOT_TO_KEY_NUMPAD)) delete DOT_TO_KEY_NUMPAD[k];
    // 先合并 keyboard 组，再合并 numpad 组（同键不覆盖，keyboard 优先）
    for (const group of ['keyboard', 'numpad']) {
        for (const [dotStr, key] of Object.entries(kb[group] || {})) {
            if (key && !(key in KEY_TO_DOT)) {
                KEY_TO_DOT[key] = parseInt(dotStr, 10);
            }
        }
    }
    // DOT_TO_KEY 从 keyboard 组生成（用于点位上的键位标签显示）
    for (const [dotStr, key] of Object.entries(kb.keyboard || {})) {
        if (key) DOT_TO_KEY[parseInt(dotStr, 10)] = key;
    }
    // DOT_TO_KEY_NUMPAD 从 numpad 组生成（用于点位上的键位标签显示）
    for (const [dotStr, key] of Object.entries(kb.numpad || {})) {
        if (key) DOT_TO_KEY_NUMPAD[parseInt(dotStr, 10)] = key;
    }
}

function _eventToKeyId(e) {
    return e.code;
}

function _keyIdToLabel(keyId) {
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

function _showBindMask(text) {
    const mask = document.getElementById('bindMask');
    const textEl = document.getElementById('bindMaskText');
    if (mask && textEl) {
        textEl.textContent = text;
        mask.classList.add('active');
    }
    speakText(text);
}

function _hideBindMask() {
    const mask = document.getElementById('bindMask');
    if (mask) mask.classList.remove('active');
}

function _cancelAllListening() {
    _kbListening = null;
    _kbListeningGroup = null;
    _akbListening = null;
    _seqBinding = null;
    _hideBindMask();
    const kbContainer = document.getElementById('keyBindings');
    if (kbContainer) renderKeyBindingsUI(kbContainer);
    const akbContainer = document.getElementById('actionKeyBindings');
    if (akbContainer) renderActionKeyBindingsUI(akbContainer);
}

/**
 * @description: 渲染单个键位组的绑定 UI
 * @param {HTMLElement} container 容器
 * @param {string} group 'keyboard' | 'numpad'
 * @param {number[]} ORDER 渲染布局顺序
 */
function _renderGroupBindings(container, group, ORDER) {
    container.innerHTML = '';
    const kb = SETTINGS.keyBindings[group] || {};
    for (const d of ORDER) {
        const keyBadge = document.createElement('button');
        keyBadge.className = 'kb-badge';
        keyBadge.dataset.dot = d;
        keyBadge.dataset.group = group;
        keyBadge.title = '点击后按键盘任意键设置';
        keyBadge.innerHTML = `<span class="dot-name">${'①②③④⑤⑥'[d - 1]}</span><span class="key-label">${_keyIdToLabel(kb[d])}</span>`;

        keyBadge.addEventListener('click', () => {
            if (_kbListening === d && _kbListeningGroup === group && !_seqBinding) {
                _cancelAllListening();
                return;
            }
            if (_kbListening !== null || _seqBinding !== null) {
                _cancelAllListening();
            }
            const currentBadge = container.querySelector(`.kb-badge[data-dot="${d}"]`);
            _kbListening = d;
            _kbListeningGroup = group;
            if (currentBadge) {
                currentBadge.classList.add('listening');
                const kl = currentBadge.querySelector('.key-label');
                if (kl) kl.textContent = '…';
            }
            _showBindMask('请按下按键绑定：' + DOT_NAMES[d - 1]);
            speakText('请按下按键绑定：' + DOT_NAMES[d - 1]);
        });

        container.appendChild(keyBadge);
    }
}

/**
 * @description: 渲染键位设置 UI（两组并列，均可编辑）
 * @param {HTMLElement} container 主键盘键位绑定的容器元素
 * @return {void}
 */
function renderKeyBindingsUI(container) {
    if (!container) return;
    const ORDER = [1, 4, 2, 5, 3, 6]; // 渲染布局：匹配盲文输入区左右列

    // 渲染主键盘组
    _renderGroupBindings(container, 'keyboard', ORDER);

    // 渲染小键盘组
    const altContainer = document.getElementById('keyBindingsAlt');
    if (altContainer) {
        _renderGroupBindings(altContainer, 'numpad', ORDER);
    }

    // 一键重设按钮
    const resetBtn = document.getElementById('kbResetBtn');
    if (resetBtn) {
        const newBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newBtn, resetBtn);
        newBtn.addEventListener('click', () => _startSeqBinding());
    }
}

function _startSeqBinding() {
    if (!document.getElementById('settingsSlide').classList.contains('open')) {
        if (typeof toggleSettings === 'function') toggleSettings();
    }
    if (_kbListening !== null || _akbListening !== null) {
        _cancelAllListening();
    }
    if (_seqBinding) {
        _cancelAllListening();
        return;
    }
    _seqBinding = { step: 0, keys: {} };
    const dot = SEQ_ORDER[_seqBinding.step];
    _showBindMask('请按下第1个按键（1号点）');
    speakText('请按下第1个按键，1号点');
}

// KEY_ACTIONS 中不可配置的键位（不在 CONFIGURABLE_ACTIONS 管理范围内）
const _NON_CONFIGURABLE_KEYS = new Set([
    'Numpad0', 'NumpadDivide', 'NumpadMultiply',
    'Backspace', 'Delete', 'Space',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'KeyG', 'KeyH',
]);

function applyActionKeyBindings() {
    const akb = SETTINGS.actionKeyBindings;
    const configurableActions = new Set(Object.keys(CONFIGURABLE_ACTIONS));
    // 清理可配置动作的旧键位（保留不可配置键如 NumpadDivide、Backspace）
    for (const [key, act] of Object.entries(KEY_ACTIONS)) {
        if (configurableActions.has(act) && !_NON_CONFIGURABLE_KEYS.has(key)) {
            delete KEY_ACTIONS[key];
        }
    }
    for (const [action, key] of Object.entries(akb)) {
        if (key) KEY_ACTIONS[key] = action;
    }
}

function renderActionKeyBindingsUI(container) {
    if (!container) return;
    const akb = SETTINGS.actionKeyBindings;
    container.querySelectorAll('.kb-badge').forEach(badge => {
        const action = badge.dataset.action;
        const label = akb[action] || '';
        badge.classList.remove('listening');
        let keyLabel = badge.querySelector('.key-label');
        if (keyLabel) {
            keyLabel.textContent = _keyIdToLabel(label);
        } else {
            badge.textContent = _keyIdToLabel(label);
        }
        const newBadge = badge.cloneNode(true);
        badge.parentNode.replaceChild(newBadge, badge);
        newBadge.addEventListener('click', () => {
            if (_akbListening === action) {
                _cancelAllListening();
                return;
            }
            _cancelAllListening();
            const cur = container.querySelector(`.kb-badge[data-action="${action}"]`);
            if (!cur) return;
            _akbListening = action;
            cur.classList.add('listening');
            const kl = cur.querySelector('.key-label');
            if (kl) kl.textContent = '…';
            else cur.textContent = '…';
            const actionLabel = CONFIGURABLE_ACTIONS[action]?.label || action;
            _showBindMask('请按下按键绑定：' + actionLabel);
            speakText('请按下按键绑定：' + actionLabel);
        });
    });
}

/**
 * @description: 应用键位预设方案（更新对应组）
 * @param {string} presetName 预设名称
 * @return {void}
 */
function applyKeyPreset(presetName) {
    const preset = KEY_PRESETS[presetName];
    if (!preset) return;
    const isNumpadPreset = presetName.startsWith('numpad-');
    const group = isNumpadPreset ? 'numpad' : 'keyboard';
    SETTINGS.keyBindings[group] = { ...preset };
    saveSettings();
    applyKeyBindings();
    updateKeyLabels();
    const container = document.getElementById('keyBindings');
    if (container) renderKeyBindingsUI(container);
    const _keyIdToSpoken = {
        Comma: '逗号', Period: '句号', Semicolon: '分号', Quote: '引号',
        Slash: '斜杠', Backslash: '反斜杠', BracketLeft: '左方括号', BracketRight: '右方括号',
        Minus: '减号', Equal: '等号', Backquote: '反引号',
        NumpadDivide: '除号', NumpadMultiply: '乘号', NumpadAdd: '加号', NumpadSubtract: '减号',
        NumpadDecimal: '小数点', NumpadEnter: '回车',
        Space: '空格', Backspace: '退格', Delete: '删除',
    };
    function _keyIdToAudio(keyId) {
        if (!keyId) return '未知';
        if (/^Numpad\d$/.test(keyId)) return keyId.slice(6);
        if (/^Digit\d$/.test(keyId)) return keyId.slice(5);
        if (/^Key[A-Z]$/.test(keyId)) return keyId.slice(3);
        return _keyIdToSpoken[keyId] || keyId;
    }
    const orientation = presetName.includes('-v-') ? '纵向' : '横向';
    const groupLabel = isNumpadPreset ? '小键盘' : '主键盘';
    const labels = SEQ_ORDER.map(d => _keyIdToAudio(preset[d])).join(' ');
    speakText('启用' + groupLabel + orientation + '键位预设', SETTINGS.speechRate);
    speakText(labels, 3);
}

/**
 * @description: 全局按键捕获 —— 当键位处于监听模式时拦截按键
 * @param {KeyboardEvent} e 键盘事件
 * @return {boolean} 是否已处理（消费）该按键
 */
function handleKeyBindingCapture(e) {
    if (e.key === 'Escape') {
        if (_akbListening !== null) {
            e.preventDefault();
            e.stopPropagation();
            const akbContainer = document.getElementById('actionKeyBindings');
            const badge = akbContainer?.querySelector(`.kb-badge[data-action="${_akbListening}"]`);
            if (badge) badge.click();
            else _cancelAllListening();
            speakText('已取消');
            return true;
        }
        if (_kbListening !== null) {
            e.preventDefault();
            e.stopPropagation();
            const containerId = _kbListeningGroup === 'numpad' ? 'keyBindingsAlt' : 'keyBindings';
            const container = document.getElementById(containerId);
            const badge = container?.querySelector(`.kb-badge[data-dot="${_kbListening}"]`);
            if (badge) badge.click();
            else _cancelAllListening();
            speakText('已取消');
            return true;
        }
        if (_seqBinding !== null) {
            e.preventDefault();
            e.stopPropagation();
            _cancelAllListening();
            speakText('已取消');
            return true;
        }
        return false;
    }

    if (_kbListening === null && _akbListening === null && _seqBinding === null) return false;
    e.preventDefault();
    e.stopPropagation();

    const keyId = _eventToKeyId(e);

    // 一键重设模式
    if (_seqBinding !== null) {
        const ORDER = SEQ_ORDER;
        const dot = ORDER[_seqBinding.step];
        const dupDot = Object.entries(_seqBinding.keys).find(([, k]) => k === keyId);
        if (dupDot) {
            const dupDotNum = parseInt(dupDot[0], 10);
            _showBindMask('按键 ' + _keyIdToLabel(keyId) + ' 已被' + DOT_NAMES[dupDotNum - 1] + '使用，请换一个按键（' + DOT_NAMES[dot - 1] + '）');
            speakText(_keyIdToLabel(keyId) + '已被' + DOT_NAMES[dupDotNum - 1] + '使用，请换一个按键');
            return true;
        }
        _seqBinding.keys[dot] = keyId;
        _seqBinding.step++;
        if (_seqBinding.step >= 6) {
            // 判断键位类型，更新对应组
            let numpadCount = 0;
            for (const key of Object.values(_seqBinding.keys)) {
                if (_isNumpadKey(key)) numpadCount++;
            }
            const group = numpadCount > 3 ? 'numpad' : 'keyboard';
            SETTINGS.keyBindings[group] = { ..._seqBinding.keys };
            saveSettings();
            applyKeyBindings();
            updateKeyLabels();
            _seqBinding = null;
            _hideBindMask();
            const groupLabel = group === 'numpad' ? '小键盘' : '主键盘';
            speakText(groupLabel + '键位已全部更新');
            const container = document.getElementById('keyBindings');
            if (container) renderKeyBindingsUI(container);
            const slide = document.getElementById('settingsSlide');
            if (slide && slide.classList.contains('open') && typeof toggleSettings === 'function') {
                toggleSettings();
            }
        } else {
            const nextDot = ORDER[_seqBinding.step];
            _showBindMask('请按下第' + (_seqBinding.step + 1) + '个按键（' + DOT_NAME_AUDIOS[nextDot - 1] + '）');
            speakText('请按下第' + (_seqBinding.step + 1) + '个按键，' + DOT_NAME_AUDIOS[nextDot - 1]);
        }
        return true;
    }

    // 单个点位键位监听
    if (_kbListening !== null) {
        const boundDot = _kbListening;
        const group = _kbListeningGroup;
        // 检查该按键是否已映射到其他点位
        const existingDot = KEY_TO_DOT[keyId];
        if (existingDot !== undefined && existingDot !== boundDot) {
            _showBindMask('按键 ' + _keyIdToLabel(keyId) + ' 已被' + DOT_NAMES[existingDot - 1] + '使用，请换一个按键');
            speakText('按键已被' + DOT_NAMES[existingDot - 1] + '使用');
            return true;
        }
        SETTINGS.keyBindings[group][boundDot] = keyId;
        saveSettings();
        applyKeyBindings();
        updateKeyLabels();
        const containerId = group === 'numpad' ? 'keyBindingsAlt' : 'keyBindings';
        const badge = document.querySelector(`#${containerId} .kb-badge.listening`);
        if (badge) {
            badge.classList.remove('listening');
            const keyLabel = badge.querySelector('.key-label');
            if (keyLabel) keyLabel.textContent = _keyIdToLabel(keyId);
        }
        _kbListening = null;
        _kbListeningGroup = null;
        _hideBindMask();
        speakText(DOT_NAMES[boundDot - 1] + '已绑定' + _keyIdToLabel(keyId));
        return true;
    }

    // 动作键位监听
    if (_akbListening !== null) {
        const boundAction = _akbListening;
        SETTINGS.actionKeyBindings[boundAction] = keyId;
        saveSettings();
        applyActionKeyBindings();
        const badge = document.querySelector('#actionKeyBindings .kb-badge.listening');
        if (badge) {
            badge.classList.remove('listening');
            const keyLabel = badge.querySelector('.key-label');
            if (keyLabel) keyLabel.textContent = _keyIdToLabel(keyId);
        }
        _akbListening = null;
        _hideBindMask();
        const actionLabel = CONFIGURABLE_ACTIONS[boundAction]?.label || boundAction;
        speakText(actionLabel + '已绑定' + _keyIdToLabel(keyId));
        return true;
    }

    return true;
}

function updateKeyLabels() {
    const dotCells = document.querySelectorAll('.dot-cell');
    dotCells.forEach(cell => {
        const idx = +cell.dataset.idx;
        const label = cell.querySelector('.key-label');
        if (!label) return;
        const kbKey = DOT_TO_KEY[idx];
        const npKey = DOT_TO_KEY_NUMPAD[idx];
        if (kbKey !== undefined && npKey !== undefined) {
            label.innerHTML = '<span class="kb-lbl">' + _keyIdToLabel(kbKey) + '</span><span class="key-sep">/</span><span class="np-lbl">' + _keyIdToLabel(npKey) + '</span>';
        } else if (kbKey !== undefined) {
            label.innerHTML = '<span class="kb-lbl">' + _keyIdToLabel(kbKey) + '</span>';
        } else if (npKey !== undefined) {
            label.innerHTML = '<span class="np-lbl">' + _keyIdToLabel(npKey) + '</span>';
        }
    });
    applyActiveKeyGroup();
}

/**
 * @description: 根据 activeKeyGroup 全局变量，切换所有 .key-label 的活跃/非活跃样式
 */
function applyActiveKeyGroup() {
    const grid = document.getElementById('dotGrid');
    if (!grid) return;
    grid.classList.remove('active-group-keyboard', 'active-group-numpad');
    grid.classList.add('active-group-' + activeKeyGroup);
}

/**
 * @description: 点位输入时，根据实际按键切换全局活跃键组
 * @param {string} keyId 实际按下的按键标识
 */
function setActiveKeyGroup(keyId) {
    const group = _isNumpadKey(keyId) ? 'numpad' : 'keyboard';
    if (group === activeKeyGroup) return;
    activeKeyGroup = group;
    applyActiveKeyGroup();
}

function applyBrailleFontSize() {
    document.documentElement.style.setProperty('--braille-font-size', SETTINGS.brailleFontSize + 'px');
}

function clearOutput() {
    pushUndo();
    outputItems.length = 0;
    cursorIdx = 0;
    selectedIndices.clear();
    invalidatePageCache();
    speakText('输出区已清除');
    renderOutput();
}

// 键位监听时点击遮罩取消绑定
document.getElementById('bindMask')?.addEventListener('click', () => {
    if (_kbListening !== null || _akbListening !== null || _seqBinding !== null) {
        _cancelAllListening();
        speakText('已取消');
    }
});
