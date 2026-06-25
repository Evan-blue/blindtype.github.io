// settings.js — 设置逻辑（原 panelSettings.js 去面板化）

import { speakText, cancelAllSpeech } from './brailleSpeech.js';
import { cursor } from './state.js';
import { invalidatePageCache, renderOutput } from './brailleOutput.js';
import { updateKeyLabels, renderToolbarKeyLabels } from './brailleInput.js';
import {
    _isNumpadKey,
    CONFIGURABLE_ACTIONS,
    DEFAULT_SETTINGS,
    keyIdToLabel,
} from './config.js';
import {
    KEY_TO_DOT,
    SETTINGS,
    saveSettings,
    applyKeyBindings,
    applyActionKeyBindings,
    applyBrailleFontSize,
} from './state.js';

const DOT_NAMES = ['1点', '2点', '3点', '4点', '5点', '6点'];
const DOT_NAME_AUDIOS = ['1号点', '2号点', '3号点', '4号点', '5号点', '6号点'];
const SEQ_ORDER = [1, 2, 3, 4, 5, 6];

let _akbListening = null;
let _seqBinding = null;

function _eventToKeyId(e) { return e.code; }

function _codeToDataKey(code) {
    const m = code.match(/^Key([A-Z])$/);
    if (m) return m[1].toLowerCase();
    const nm = code.match(/^Numpad(\d)$/);
    if (nm) return 'num' + nm[1];
    if (code === 'NumpadDivide') return 'num/';
    if (code === 'NumpadMultiply') return 'num*';
    if (code === 'NumpadAdd') return 'num+';
    if (code === 'NumpadSubtract') return 'num-';
    if (code === 'NumpadDecimal') return 'num.';
    if (code === 'NumpadEnter') return 'numenter';
    if (code === 'Comma') return ',';
    if (code === 'Period') return '.';
    if (code === 'Semicolon') return ';';
    if (code === 'Quote') return '\'';
    if (code === 'Space') return 'space';
    if (code === 'Backspace') return 'backspace';
    return null;
}

function _isKeyColored(keyId) {
    const dk = _codeToDataKey(keyId);
    if (!dk) return false;
    const el = document.querySelector(`.kb-key[data-key="${dk}"]`);
    if (!el || !el.hasAttribute('data-color')) return false;
    return !el.getAttribute('data-color').startsWith('dot');
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
    _akbListening = null;
    _seqBinding = null;
    _hideBindMask();
    const akbContainer = document.getElementById('actionKeyBindings');
    if (akbContainer) renderActionKeyBindingsUI(akbContainer);
}

// ── 动作键位绑定 UI（开发者面板） ──

export function renderActionKeyBindingsUI(container) {
    if (!container) return;
    const akb = SETTINGS.actionKeyBindings;
    container.querySelectorAll('.kb-badge').forEach(badge => {
        const action = badge.dataset.action;
        const label = akb[action] || '';
        badge.classList.remove('listening');
        let keyLabel = badge.querySelector('.key-label');
        if (keyLabel) {
            keyLabel.textContent = keyIdToLabel(label);
        } else {
            badge.textContent = keyIdToLabel(label);
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

// ── 顺序键位绑定（工具栏"自定义键位"按钮） ──

export function _startSeqBinding() {
    if (_akbListening !== null) {
        _cancelAllListening();
    }
    if (_seqBinding) {
        _cancelAllListening();
        return;
    }
    _seqBinding = { step: 0, keys: {} };
    _showBindMask('请按下第1个按键（1号点）');
    speakText('请按下第1个按键，1号点');
}

// ── 键位捕获（全局键盘事件拦截） ──

export function handleKeyBindingCapture(e) {
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
        if (_seqBinding !== null) {
            e.preventDefault();
            e.stopPropagation();
            _cancelAllListening();
            speakText('已取消');
            return true;
        }
        return false;
    }

    if (_akbListening === null && _seqBinding === null) return false;
    e.preventDefault();
    e.stopPropagation();

    const keyId = _eventToKeyId(e);

    if (_seqBinding !== null) {
        const ORDER = SEQ_ORDER;
        const dot = ORDER[_seqBinding.step];
        const dupDot = Object.entries(_seqBinding.keys).find(([, k]) => k === keyId);
        if (dupDot) {
            const dupDotNum = parseInt(dupDot[0], 10);
            _showBindMask('按键 ' + keyIdToLabel(keyId) + ' 已被' + DOT_NAMES[dupDotNum - 1] + '使用，请换一个按键（' + DOT_NAMES[dot - 1] + '）');
            speakText(keyIdToLabel(keyId) + '已被' + DOT_NAMES[dupDotNum - 1] + '使用，请换一个按键');
            return true;
        }
        if (_isKeyColored(keyId)) {
            _showBindMask('按键 ' + keyIdToLabel(keyId) + ' 已分配功能，请换一个按键（' + DOT_NAMES[dot - 1] + '）');
            speakText(keyIdToLabel(keyId) + '已分配功能，请换一个按键');
            return true;
        }
        _seqBinding.keys[dot] = keyId;
        _seqBinding.step++;
        if (_seqBinding.step >= 6) {
            let numpadCount = 0;
            for (const key of Object.values(_seqBinding.keys)) {
                if (_isNumpadKey(key)) numpadCount++;
            }
            const group = numpadCount > 3 ? 'numpad' : 'keyboard';
            SETTINGS.keyBindings[group] = { ..._seqBinding.keys };
            saveSettings();
            applyKeyBindings();
            updateKeyLabels();
            document.dispatchEvent(new CustomEvent('bindings-changed'));
            _seqBinding = null;
            _hideBindMask();
            const groupLabel = group === 'numpad' ? '小键盘' : '主键盘';
            speakText(groupLabel + '键位已全部更新');
        } else {
            const nextDot = ORDER[_seqBinding.step];
            _showBindMask('请按下第' + (_seqBinding.step + 1) + '个按键（' + DOT_NAME_AUDIOS[nextDot - 1] + '）');
            speakText('请按下第' + (_seqBinding.step + 1) + '个按键，' + DOT_NAME_AUDIOS[nextDot - 1]);
        }
        return true;
    }

    if (_akbListening !== null) {
        const boundAction = _akbListening;
        SETTINGS.actionKeyBindings[boundAction] = keyId;
        saveSettings();
        applyActionKeyBindings();
        renderToolbarKeyLabels();
        document.dispatchEvent(new CustomEvent('bindings-changed'));
        const badge = document.querySelector('#actionKeyBindings .kb-badge.listening');
        if (badge) {
            badge.classList.remove('listening');
            const keyLabel = badge.querySelector('.key-label');
            if (keyLabel) keyLabel.textContent = keyIdToLabel(keyId);
        }
        _akbListening = null;
        _hideBindMask();
        const actionLabel = CONFIGURABLE_ACTIONS[boundAction]?.label || boundAction;
        speakText(actionLabel + '已绑定' + keyIdToLabel(keyId));
        return true;
    }

    return true;
}

// ── 恢复默认设置 ──

export function resetToDefaults() {
    const akbDefault = {};
    for (const [action, cfg] of Object.entries(CONFIGURABLE_ACTIONS)) {
        akbDefault[action] = cfg.defaultKey;
    }
    for (const k of Object.keys(SETTINGS)) delete SETTINGS[k];
    Object.assign(SETTINGS, {
        ...DEFAULT_SETTINGS,
        keyBindings: {
            keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
            numpad: { ...DEFAULT_SETTINGS.keyBindings.numpad },
        },
        actionKeyBindings: { ...akbDefault },
    });
    saveSettings();
    applyKeyBindings();
    applyActionKeyBindings();
    updateKeyLabels();
    applyBrailleFontSize();
    renderToolbarKeyLabels();
    const akbContainer = document.getElementById('actionKeyBindings');
    if (akbContainer) renderActionKeyBindingsUI(akbContainer);
    invalidatePageCache();
    renderOutput();
    speakText('已恢复默认设置');
}

// ── 设置初始化（仅开发者面板中的控件） ──

export function initSettings() {
    const allowSpeechCheck = document.getElementById('allowSpeech');
    if (allowSpeechCheck) {
        allowSpeechCheck.checked = SETTINGS.allowSpeech;
        allowSpeechCheck.addEventListener('change', () => {
            SETTINGS.allowSpeech = allowSpeechCheck.checked;
            if (!SETTINGS.allowSpeech) cancelAllSpeech();
            saveSettings();
        });
    }

    const announceEmptyCellCheck = document.getElementById('announceEmptyCell');
    if (announceEmptyCellCheck) {
        announceEmptyCellCheck.checked = SETTINGS.announceEmptyCell;
        announceEmptyCellCheck.addEventListener('change', () => {
            SETTINGS.announceEmptyCell = announceEmptyCellCheck.checked;
            saveSettings();
        });
    }

    const wordSegCheck = document.getElementById('wordSegmentation');
    if (wordSegCheck) {
        wordSegCheck.checked = SETTINGS.wordSegmentation;
        wordSegCheck.addEventListener('change', () => {
            SETTINGS.wordSegmentation = wordSegCheck.checked;
            saveSettings();
        });
    }

    document.querySelectorAll('input[name="cursorJumpMode"]').forEach(radio => {
        if (radio.value === SETTINGS.cursorJumpMode) radio.checked = true;
        radio.addEventListener('change', () => {
            SETTINGS.cursorJumpMode = radio.value;
            saveSettings();
        });
    });

    const punctAutoSpacingCheck = document.getElementById('punctAutoSpacing');
    if (punctAutoSpacingCheck) {
        punctAutoSpacingCheck.checked = SETTINGS.punctAutoSpacing;
        punctAutoSpacingCheck.addEventListener('change', () => {
            SETTINGS.punctAutoSpacing = punctAutoSpacingCheck.checked;
            saveSettings();
        });
    }

    const multiSelectCheck = document.getElementById('multiSelect');
    if (multiSelectCheck) {
        multiSelectCheck.checked = SETTINGS.multiSelect;
        multiSelectCheck.addEventListener('change', () => {
            SETTINGS.multiSelect = multiSelectCheck.checked;
            if (!SETTINGS.multiSelect) {
                cursor.clearSelection();
                renderOutput();
            }
            saveSettings();
        });
    }

    const mergeNewlinesCheck = document.getElementById('mergeNewlines');
    if (mergeNewlinesCheck) {
        mergeNewlinesCheck.checked = SETTINGS.mergeNewlines;
        mergeNewlinesCheck.addEventListener('change', () => {
            SETTINGS.mergeNewlines = mergeNewlinesCheck.checked;
            saveSettings();
        });
    }

    const showVisualizerCheck = document.getElementById('showVisualizer');
    if (showVisualizerCheck) {
        showVisualizerCheck.checked = SETTINGS.showVisualizer !== false;
        showVisualizerCheck.addEventListener('change', () => {
            SETTINGS.showVisualizer = showVisualizerCheck.checked;
            saveSettings();
            const indicator = document.getElementById('speechIndicator');
            if (indicator) indicator.style.display = SETTINGS.showVisualizer ? '' : 'none';
        });
    }

    const dotFeedbackRadios = document.querySelectorAll('input[name="dotFeedbackMode"]');
    if (dotFeedbackRadios.length) {
        const current = SETTINGS.dotFeedbackMode || 'beep';
        dotFeedbackRadios.forEach(r => {
            r.checked = (r.value === current);
            r.addEventListener('change', () => {
                if (r.checked) { SETTINGS.dotFeedbackMode = r.value; saveSettings(); }
            });
        });
    }

    const textConvRadios = document.querySelectorAll('input[name="textConversionDisplay"]');
    if (textConvRadios.length) {
        const current = SETTINGS.textConversionDisplay || 'pinyin';
        textConvRadios.forEach(r => {
            r.checked = (r.value === current);
            r.addEventListener('change', () => {
                if (r.checked) { SETTINGS.textConversionDisplay = r.value; saveSettings(); renderOutput(); }
            });
        });
    }
}

// 绑定遮罩点击取消
document.getElementById('bindMask')?.addEventListener('click', () => {
    if (_akbListening !== null || _seqBinding !== null) {
        _cancelAllListening();
        speakText('已取消');
    }
});
