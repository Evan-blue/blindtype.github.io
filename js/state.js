// state.js — 运行时状态与变更函数的唯一来源
// 静态配置与纯工具函数在 config.js 中

import { splitPinyinChars, _resolveOmittedTone } from './utils-pinyin.js';
import {
    DEFAULT_SETTINGS,
    DOT_KEY_DEFAULTS,
    CONFIGURABLE_ACTIONS,
    _NON_CONFIGURABLE_KEYS,
    _isNumpadKey,
    _codeToKbdPresetChar,
    _codeToNumpadPresetChar,
    PRESET_POSITION_TEXTS,
} from './config.js';

// ── 光标 ──
export const cursor = {
    _idx: 0,
    _selAnchor: -1,
    _DEBOUNCE_MS: 300,
    _debounceTimer: null,
    _SENTENCE_END: new Set([
        '000010+011000', // 。
        '000011+010000', // ！
        '000010+001000', // ？
        '000010+000010+000010', // ……
    ]),
    dom: null,
    selectedIndices: new Set(),

    set idx(n) { this._idx = n; },
    get idx() { return this._idx; },
    set selAnchor(n) { this._selAnchor = n; },
    get selAnchor() { return this._selAnchor; },

    clearAnchor() { this.selAnchor = -1; },
    clearSelection() { this.selectedIndices.clear(); this.clearAnchor(); },
    ensureAnchor() {
        if (this.selectedIndices.size === 0) this.selAnchor = this.idx;
    },
    rebuildSelection() {
        this.selectedIndices.clear();
        const from = Math.min(this.selAnchor, this.idx);
        const to = Math.max(this.selAnchor, this.idx);
        for (let i = from; i < to; i++) this.selectedIndices.add(i);
    },

    isInsideGroup(idx, itemCount, meta) {
        if (idx <= 0 || idx >= itemCount) return false;
        const left = meta[idx - 1], right = meta[idx];
        return !!(left && right && !left.isLast);
    },
    snapToBoundary(idx, itemCount, meta, direction) {
        if (idx <= 0) return 0;
        if (idx >= itemCount) return itemCount;
        let result = idx;
        if (direction < 0) {
            while (this.isInsideGroup(result, itemCount, meta)) result--;
        } else {
            while (this.isInsideGroup(result, itemCount, meta)) result++;
        }
        return result;
    },
    isJumpBoundary(idx, outputItems, jumpMode) {
        const item = outputItems[idx];
        if (!item) return false;
        switch (jumpMode) {
            case 'emptyCell': return item.oneHot === '000000';
            case 'sentenceEnd': return cursor._SENTENCE_END.has(item.oneHot);
            case 'newline':
                return idx + 1 < outputItems.length
                    && item.oneHot === '000000'
                    && outputItems[idx + 1].oneHot === '000000';
            default: return item.oneHot === '000000';
        }
    },
};

// ── 输出区 ──
const _outputItems = [];

function _isInCtx(target, idx, key) {
    if (idx === 0) return false;
    const prev = target[idx - 1];
    return !!(prev && prev[key]);
}

function _getCtxStartIdx(target, idx, key) {
    if (idx === 0) return -1;
    const prev = target[idx - 1];
    if (!prev || !prev[key]) return -1;
    let i = idx - 1;
    while (i >= 0 && target[i][key]) i--;
    return i + 1;
}

const CTX_KEYS = [
    ['isNumber', 'number'],
    ['isEnglish', 'english'],
];

export const outputItems = new Proxy(_outputItems, {
    get(target, prop) {
        // ── 上下文判断方法 ──
        if (prop === 'isInNumberContext') return (idx) => _isInCtx(target, idx, 'isNumber');
        if (prop === 'isInEnglishContext') return (idx) => _isInCtx(target, idx, 'isEnglish');
        if (prop === 'getNumberStartIdx') return (idx) => _getCtxStartIdx(target, idx, 'isNumber');
        if (prop === 'getEnglishStartIdx') return (idx) => _getCtxStartIdx(target, idx, 'isEnglish');
        if (prop === 'getContext') return (idx) => {
            for (const [key, name] of CTX_KEYS) {
                if (_isInCtx(target, idx, key)) return name;
            }
            return 'pinyin';
        };
        if (prop === 'getEnglishCase') {
            return (idx) => {
                const start = _getCtxStartIdx(target, idx, 'isEnglish');
                return start === -1 ? null : target[start].letterCase || null;
            };
        }

        // ── 数组行为透传 ──
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    }
});

// ── 分页 ──
export const pages = {
    _idx: 0,
    breaks: [],
    isActive: false,
    preRendered: new Map(),

    set idx(n) { this._idx = n; },
    get idx() { return this._idx; },
    setBreaks(breaks) { this.breaks = breaks; },
    setActive(v) { this.isActive = v; },
};

let _renderSuppressed = false;

export function setRenderSuppressed(v) { _renderSuppressed = v; }
export function getRenderSuppressed() { return _renderSuppressed; }

// ── 元数据计算 ──
export function computeItemMeta() {
    const emptyIndices = [];
    outputItems.forEach((item, i) => {
        if (item.oneHot === '000000') emptyIndices.push(i);
    });

    const meta = new Array(outputItems.length).fill(null);
    for (let g = 0; g <= emptyIndices.length; g++) {
        const start = g === 0 ? 0 : emptyIndices[g - 1] + 1;
        const end = g < emptyIndices.length ? emptyIndices[g] : outputItems.length;
        if (outputItems.slice(start, end).some(it => it.isNumber || it.isEnglish)) continue;
        if (end - start >= 2) {
            const TONE_SYM_TO_NUM = { '¯': '1', '´': '2', 'ˇ': '3', '`': '4' };
            const chars = outputItems.slice(start, end).map((it, ci, arr) => {
                const ch = TONE_SYM_TO_NUM[it.char] || it.char || '';
                if (ch !== 'e/o') return ch;
                const prevCh = ci > 0 ? (TONE_SYM_TO_NUM[arr[ci - 1].char] || arr[ci - 1].char || '') : '';
                if (prevCh === 'b' || prevCh === 'p' || prevCh === 'f') return 'o';
                if (prevCh === 'm') return 'o';
                return 'e';
            });
            const syllables = splitPinyinChars(chars);
            if (syllables) {
                let pos = start;
                for (const syl of syllables) {
                    let merged = syl.merged;
                    if (SETTINGS.omitToneMapping !== false && !/\d$/.test(merged)) {
                        const tone = _resolveOmittedTone(merged);
                        if (tone) merged += tone;
                    }
                    let sourceChar = undefined;
                    for (let k = 0; k < syl.count; k++) {
                        if (outputItems[pos + k]._sourceChar) sourceChar = outputItems[pos + k]._sourceChar;
                    }
                    for (let k = 0; k < syl.count; k++) {
                        meta[pos + k] = { merged, sourceChar, isFirst: k === 0, isLast: k === syl.count - 1 };
                    }
                    pos += syl.count;
                }
            }
        }
    }
    return meta;
}


// ── 运行时点位映射 ──
export const KEY_TO_DOT = {};
export const DOT_TO_KEY = {};
export const DOT_TO_KEY_NUMPAD = {};

// ── 当前活跃键组 ──
export let activeKeyGroup = 'keyboard';
export function setActiveKeyGroupRaw(group) { activeKeyGroup = group; }

// ── 动作键映射 ──
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
    'KeyY': 'clearInput',
    'KeyC': 'clearOutput',
    'KeyR': 'readAloud',
};

// ── SETTINGS ──
export let SETTINGS = {};

SETTINGS = {
    ...DEFAULT_SETTINGS,
    keyBindings: {
        keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
        numpad: { ...DEFAULT_SETTINGS.keyBindings.numpad },
    },
    actionKeyBindings: { ...DEFAULT_SETTINGS.actionKeyBindings },
};

// ── 键位迁移 ──
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

// ── 配置持久化 ──
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

    if (!SETTINGS.actionKeyBindings) SETTINGS.actionKeyBindings = { ...DEFAULT_SETTINGS.actionKeyBindings };
    _migrateActionKeyIds(SETTINGS.actionKeyBindings);

    for (const [action, key] of Object.entries(DEFAULT_SETTINGS.actionKeyBindings)) {
        if (SETTINGS.actionKeyBindings[action] === undefined) SETTINGS.actionKeyBindings[action] = key;
    }
    // 迁移：F 清除点位 → Y，D 删除盲文 → 移除
    if (SETTINGS.actionKeyBindings.clearInput === 'KeyF') SETTINGS.actionKeyBindings.clearInput = 'KeyY';
    if (SETTINGS.actionKeyBindings.delete === 'KeyD') delete SETTINGS.actionKeyBindings.delete;
    for (const key of Object.keys(DEFAULT_SETTINGS)) {
        if (SETTINGS[key] === undefined) SETTINGS[key] = DEFAULT_SETTINGS[key];
    }

    localStorage.removeItem('braille-alt-groups');
}

export function saveSettings() {
    localStorage.setItem('braille-settings', JSON.stringify(SETTINGS));
}

// ── 键位应用 ──
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

// ── 键位预设位置 ──
export function getCurrentPresetPositionText(group = 'keyboard') {
    const bindings = SETTINGS.keyBindings?.[group];
    if (!bindings) return '';
    const chars = [];
    for (let d = 1; d <= 6; d++) {
        chars.push(group === 'numpad'
            ? _codeToNumpadPresetChar(bindings[d] || '')
            : _codeToKbdPresetChar(bindings[d] || ''));
    }
    const name = chars.join('');
    return PRESET_POSITION_TEXTS[group]?.[name] || '';
}
