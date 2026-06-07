// panelSettings.js - 设置面板 UI

import { speakText, cancelAllSpeech } from './brailleSpeech.js';
import { createSlidePanel } from './panelManager.js';
import { outputItems, cursor } from './brailleState.js';
import { invalidatePageCache, renderOutput } from './brailleOutput.js';
import { helpPanel, renderHelpPanel } from './panelHelp.js';
import { pushUndo } from './history.js';
import {
    DOT_KEY_DEFAULTS,
    KEY_TO_DOT,
    DOT_TO_KEY,
    DOT_TO_KEY_NUMPAD,
    activeKeyGroup,
    setActiveKeyGroupRaw,
    _isNumpadKey,
    KEY_ACTIONS,
    CONFIGURABLE_ACTIONS,
    KEY_COMBOS,
    DEFAULT_SETTINGS,
    SETTINGS,
    _CHAR_TO_KEYID,
    saveSettings,
    applyKeyBindings,
    applyActionKeyBindings,
    applyBrailleFontSize,
} from './config.js';

const DOT_NAMES = ['1点', '2点', '3点', '4点', '5点', '6点'];
const DOT_NAME_AUDIOS = ['1号点', '2号点', '3号点', '4号点', '5号点', '6号点'];
const SEQ_ORDER = [1, 2, 3, 4, 5, 6];

let _kbListening = null;
let _kbListeningGroup = null;
let _akbListening = null;
let _seqBinding = null;

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

function _eventToKeyId(e) { return e.code; }

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

function _renderGroupBindings(container, group, ORDER) {
    container.innerHTML = '';
    const kb = SETTINGS.keyBindings[group] || {};
    for (const d of ORDER) {
        const keyBadge = document.createElement('button');
        keyBadge.className = 'kb-badge';
        keyBadge.dataset.dot = d;
        keyBadge.dataset.group = group;
        keyBadge.title = '点击后按键盘任意键设置';
        keyBadge.innerHTML = `<span class="dot-label">${d}</span><span class="key-label">${_keyIdToLabel(kb[d])}</span>`;

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

export function renderKeyBindingsUI(container) {
    if (!container) return;
    const ORDER = [1, 4, 2, 5, 3, 6];

    _renderGroupBindings(container, 'keyboard', ORDER);

    const altContainer = document.getElementById('keyBindingsAlt');
    if (altContainer) {
        _renderGroupBindings(altContainer, 'numpad', ORDER);
    }

    const resetBtn = document.getElementById('kbResetBtn');
    if (resetBtn) {
        const newBtn = resetBtn.cloneNode(true);
        resetBtn.parentNode.replaceChild(newBtn, resetBtn);
        newBtn.addEventListener('click', () => _startSeqBinding());
    }
}

export function _startSeqBinding() {
    if (!settingsPanel.slide.classList.contains('open')) {
        settingsPanel.open();
    }
    if (_kbListening !== null || _akbListening !== null) {
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

export function renderActionKeyBindingsUI(container) {
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
    const mergeNL = document.getElementById('mergeNewlines');
    if (mergeNL) mergeNL.checked = DEFAULT_SETTINGS.mergeNewlines;
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

export function applyKeyPreset(btn) {
    const device = btn.dataset.preset;
    const chars = [...btn.innerText.trim()];
    if (chars.length !== 6) return;

    const isNumpad = device === 'numpad';
    const group = isNumpad ? 'numpad' : 'keyboard';

    const preset = {};
    chars.forEach((ch, i) => {
        const dot = i + 1;
        if (isNumpad) {
            preset[dot] = /^\d$/.test(ch) ? 'Numpad' + ch : _CHAR_TO_KEYID[ch] || '';
        } else {
            preset[dot] = /^[a-zA-Z]$/.test(ch) ? 'Key' + ch.toUpperCase() : (_CHAR_TO_KEYID[ch] || '');
        }
    });

    SETTINGS.keyBindings[group] = preset;
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

    const orientation = btn.closest('.kb-preset-row')?.querySelector('.kb-preset-cat')?.textContent || '';
    const groupLabel = isNumpad ? '小键盘' : '主键盘';
    const labels = Object.values(preset).map(_keyIdToAudio).join(' ');
    speakText('启用' + groupLabel + orientation + '键位预设', SETTINGS.speechRate);
    speakText(labels, 3);
}

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
            if (settingsPanel.slide.classList.contains('open')) {
                settingsPanel.close();
            }
        } else {
            const nextDot = ORDER[_seqBinding.step];
            _showBindMask('请按下第' + (_seqBinding.step + 1) + '个按键（' + DOT_NAME_AUDIOS[nextDot - 1] + '）');
            speakText('请按下第' + (_seqBinding.step + 1) + '个按键，' + DOT_NAME_AUDIOS[nextDot - 1]);
        }
        return true;
    }

    if (_kbListening !== null) {
        const boundDot = _kbListening;
        const group = _kbListeningGroup;
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

    if (_akbListening !== null) {
        const boundAction = _akbListening;
        SETTINGS.actionKeyBindings[boundAction] = keyId;
        saveSettings();
        applyActionKeyBindings();
        renderToolbarKeyLabels();
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

export function updateKeyLabels() {
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

export function applyActiveKeyGroup() {
    const grid = document.getElementById('dotGrid');
    if (!grid) return;
    grid.classList.remove('active-group-keyboard', 'active-group-numpad');
    grid.classList.add('active-group-' + activeKeyGroup);
}

export function setActiveKeyGroup(keyId) {
    const group = _isNumpadKey(keyId) ? 'numpad' : 'keyboard';
    if (group === activeKeyGroup) return;
    setActiveKeyGroupRaw(group);
    applyActiveKeyGroup();
}

export function clearOutput() {
    pushUndo();
    outputItems.length = 0;
    cursor.idx = 0;
    cursor.selectedIndices.clear();
    invalidatePageCache();
    speakText('输出区已清除');
    renderOutput();
}

export function renderToolbarKeyLabels() {
    function _labelForAction(action) {
        for (const combo of KEY_COMBOS) {
            if (combo.action === action) {
                const parts = [];
                if (combo.ctrl) parts.push('Ctrl');
                if (combo.alt) parts.push('Alt');
                if (combo.shift) parts.push('Shift');
                parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
                return parts.join('+');
            }
        }
        for (const [key, act] of Object.entries(KEY_ACTIONS)) {
            if (act === action) return _keyIdToLabel(key);
        }
        return '?';
    }
    const map = {
        'tkbd-tutorial': 'tutorial',
        'tkbd-helpTutorial': 'tutorial',
        'tkbd-readAloud': 'readAloud',
        'tkbd-clearOutput': 'clearOutput',
        'tkbd-openFile': 'openFile',
        'tkbd-save': 'save',
        'tkbd-toggleMapping': 'toggleMapping',
        'tkbd-toggleHelp': 'toggleHelp',
        'tkbd-toggleSettings': 'toggleSettings',
        'tkbd-resetKeyBindings': 'resetKeyBindings',
    };
    for (const [id, action] of Object.entries(map)) {
        const el = document.getElementById(id);
        if (el) el.textContent = _labelForAction(action);
    }
}

export const settingsPanel = createSlidePanel({
    slideId: 'settingsSlide',
    overlayId: 'settingsOverlay',
    btnId: 'btnSettings',
    closeBtnId: 'settingsSlideClose',
    onOpen: () => {
        renderKeyBindingsUI(document.getElementById('keyBindings'));
        renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));
    },
    onClose: () => {
        _kbListening = null;
        _akbListening = null;
        _seqBinding = null;
        _hideBindMask();
        const kbContainer = document.getElementById('keyBindings');
        if (kbContainer) renderKeyBindingsUI(kbContainer);
        const akbContainer = document.getElementById('actionKeyBindings');
        if (akbContainer) renderActionKeyBindingsUI(akbContainer);
    },
    openSpeak: '打开设置',
    closeSpeak: '关闭设置',
});

export let toggleSettings = settingsPanel.toggle;

export function initSettingsPanel() {
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => e.preventDefault());
    }

    const btnResetDefaults = document.getElementById('btnResetDefaults');
    if (btnResetDefaults) {
        btnResetDefaults.addEventListener('click', () => {
            speakText('确定要恢复所有设置为默认值吗？此操作不可撤销。');
            if (confirm('确定要恢复所有设置为默认值吗？此操作不可撤销。')) {
                resetToDefaults();
            }
        });
    }

    document.querySelectorAll('#kbPresets .kb-preset').forEach(btn => {
        btn.addEventListener('click', () => applyKeyPreset(btn));
    });

    const speechRateInput = document.getElementById('speechRate');
    const speechRateVal = document.getElementById('speechRateVal');
    if (speechRateInput) {
        speechRateInput.value = SETTINGS.speechRate;
        speechRateVal.textContent = SETTINGS.speechRate;
        speechRateInput.addEventListener('input', () => {
            SETTINGS.speechRate = parseFloat(speechRateInput.value);
            speechRateVal.textContent = SETTINGS.speechRate;
            saveSettings();
        });
    }

    const debounceSpeechCheck = document.getElementById('debounceSpeech');
    if (debounceSpeechCheck) {
        debounceSpeechCheck.checked = SETTINGS.debounceSpeech;
        debounceSpeechCheck.addEventListener('change', () => {
            SETTINGS.debounceSpeech = debounceSpeechCheck.checked;
            saveSettings();
        });
    }

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
                cursor.selectedIndices.clear();
                cursor.clearAnchor();
                renderOutput();
            }
            saveSettings();
            if (helpPanel.slide.classList.contains('open')) renderHelpPanel();
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

    const maxUndoInput = document.getElementById('maxUndoHistory');
    const maxUndoVal = document.getElementById('maxUndoHistoryVal');
    if (maxUndoInput) {
        maxUndoInput.value = SETTINGS.maxUndoHistory;
        maxUndoVal.textContent = SETTINGS.maxUndoHistory;
        maxUndoInput.addEventListener('input', () => {
            SETTINGS.maxUndoHistory = parseInt(maxUndoInput.value, 10);
            maxUndoVal.textContent = SETTINGS.maxUndoHistory;
            saveSettings();
        });
    }

    const brailleFsInput = document.getElementById('brailleFontSize');
    const brailleFsVal = document.getElementById('brailleFontSizeVal');
    if (brailleFsInput) {
        brailleFsInput.value = SETTINGS.brailleFontSize;
        brailleFsVal.textContent = SETTINGS.brailleFontSize;
        brailleFsInput.addEventListener('input', () => {
            SETTINGS.brailleFontSize = parseInt(brailleFsInput.value, 10);
            brailleFsVal.textContent = SETTINGS.brailleFontSize;
            applyBrailleFontSize();
            saveSettings();
        });
    }
}

document.getElementById('bindMask')?.addEventListener('click', () => {
    if (_kbListening !== null || _akbListening !== null || _seqBinding !== null) {
        _cancelAllListening();
        speakText('已取消');
    }
});
