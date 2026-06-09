// keyboard.js - 键盘键位可视化逻辑（与主页集成）

(function () {
    // ── 预设映射 ──
    const presets = {
        fdsjkl: {
            f: 'dot1', d: 'dot2', s: 'dot3',
            j: 'dot4', k: 'dot5', l: 'dot6',
            space: 'space',
        },
        'ik,ujm': {
            i: 'dot1', k: 'dot2', ',': 'dot3',
            u: 'dot4', j: 'dot5', m: 'dot6',
            space: 'space',
        },
        'ol.ik,': {
            o: 'dot1', l: 'dot2', '.': 'dot3',
            i: 'dot4', k: 'dot5', ',': 'dot6',
            space: 'space',
        },
        '.,mlkj': {
            '.': 'dot1', ',': 'dot2', m: 'dot3',
            l: 'dot4', k: 'dot5', j: 'dot6',
            space: 'space',
        },
        lkjoiu: {
            l: 'dot1', k: 'dot2', j: 'dot3',
            o: 'dot4', i: 'dot5', u: 'dot6',
            space: 'space',
        },
        numpad852741: {
            num8: 'dot1', num5: 'dot2', num2: 'dot3',
            num7: 'dot4', num4: 'dot5', num1: 'dot6',
        },
        numpad963852: {
            num9: 'dot1', num6: 'dot2', num3: 'dot3',
            num8: 'dot4', num5: 'dot5', num2: 'dot6',
        },
        numpad654987: {
            num6: 'dot1', num5: 'dot2', num4: 'dot3',
            num9: 'dot4', num8: 'dot5', num7: 'dot6',
        },
        numpad321654: {
            num3: 'dot1', num2: 'dot2', num1: 'dot3',
            num6: 'dot4', num5: 'dot5', num4: 'dot6',
        },
    };

    const kbSection = document.getElementById('kbSection');
    const legend = document.getElementById('kbLegend');
    const controls = document.getElementById('kbControls');
    let _lastBindings = null;

    // ── e.code → data-key ──
    function codeToDataKey(code) {
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
        const dm = code.match(/^Digit(\d)$/);
        if (dm) return dm[1];
        return null;
    }

    function dotNum(color) {
        const m = color && color.match(/^dot(\d)$/);
        return m ? m[1] : '';
    }

    function clearAll() {
        kbSection.querySelectorAll('.kb-key[data-color]').forEach(k => {
            k.removeAttribute('data-color');
            k.removeAttribute('data-dot');
        });
    }

    function applyBindings(kbdBindings, numBindings, spaceKey, numConfirmKey, deleteKey, backspaceKey, numDeleteKey, clearInputKey, numClearInputKey) {
        clearAll();
        if (kbdBindings) {
            for (const [dot, code] of Object.entries(kbdBindings)) {
                const dataKey = codeToDataKey(code);
                if (dataKey) {
                    const el = kbSection.querySelector(`.kb-key[data-key="${dataKey}"]`);
                    if (el) {
                        el.setAttribute('data-color', 'dot' + dot);
                        el.setAttribute('data-dot', dot);
                    }
                }
            }
        }
        if (numBindings) {
            for (const [dot, code] of Object.entries(numBindings)) {
                const dataKey = codeToDataKey(code);
                if (dataKey) {
                    const el = kbSection.querySelector(`.kb-key[data-key="${dataKey}"]`);
                    if (el) {
                        el.setAttribute('data-color', 'dot' + dot);
                        el.setAttribute('data-dot', dot);
                    }
                }
            }
        }
        if (spaceKey) {
            const dk = codeToDataKey(spaceKey);
            if (dk) {
                const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`);
                if (el) el.setAttribute('data-color', 'space');
            }
        }
        if (numConfirmKey) {
            const dk = codeToDataKey(numConfirmKey);
            if (dk) {
                const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`);
                if (el) el.setAttribute('data-color', 'space');
            }
        }
        [deleteKey, backspaceKey, numDeleteKey].forEach(code => {
            if (!code) return;
            const dk = codeToDataKey(code);
            if (dk) {
                const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`);
                if (el) el.setAttribute('data-color', 'delete');
            }
        });
        if (clearInputKey) {
            const dk = codeToDataKey(clearInputKey);
            if (dk) {
                const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`);
                if (el) el.setAttribute('data-color', 'action');
            }
        }
        if (numClearInputKey) {
            const dk = codeToDataKey(numClearInputKey);
            if (dk) {
                const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`);
                if (el) el.setAttribute('data-color', 'action');
            }
        }
        legend.style.display = 'flex';
    }

    function dataKeyToCode(dk) {
        if (dk === 'space') return 'Space';
        if (dk === 'backspace') return 'Backspace';
        if (dk === ',') return 'Comma';
        if (dk === '.') return 'Period';
        if (dk === ';') return 'Semicolon';
        if (dk === '\'') return 'Quote';
        const nm = dk.match(/^num(\d)$/);
        if (nm) return 'Numpad' + nm[1];
        if (dk === 'num/') return 'NumpadDivide';
        if (dk === 'num*') return 'NumpadMultiply';
        if (dk === 'num+') return 'NumpadAdd';
        if (dk === 'num-') return 'NumpadSubtract';
        if (dk === 'num.') return 'NumpadDecimal';
        if (dk === 'numenter') return 'NumpadEnter';
        const lm = dk.match(/^[a-z]$/);
        if (lm) return 'Key' + dk.toUpperCase();
        return null;
    }

    function presetToDotBindings(name) {
        const map = presets[name];
        if (!map) return null;
        const result = {};
        for (const [key, color] of Object.entries(map)) {
            const dot = dotNum(color);
            if (!dot) continue;
            const code = dataKeyToCode(key);
            if (code) result[dot] = code;
        }
        return Object.keys(result).length === 6 ? result : null;
    }

    function presetScope(name) {
        return name.startsWith('numpad') ? 'numpad' : 'kbd';
    }

    function matchPresets(kbdBindings, numBindings) {
        controls.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        let fdsjklMatched = false;
        for (const btn of controls.querySelectorAll('button[data-preset]')) {
            const name = btn.dataset.preset;
            const presetBinding = presetToDotBindings(name);
            if (!presetBinding) continue;
            const scope = presetScope(name);
            const target = scope === 'numpad' ? numBindings : kbdBindings;
            if (!target) continue;
            if (scope !== 'numpad' && fdsjklMatched) continue;
            let match = true;
            for (let d = 1; d <= 6; d++) {
                if (presetBinding[d] !== target[d]) { match = false; break; }
            }
            if (match) {
                btn.classList.add('active');
                if (name === 'fdsjkl') fdsjklMatched = true;
            }
        }
    }

    // ── 预设点击 ──
    controls.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-preset]');
        if (!btn) return;
        const name = btn.dataset.preset;
        const scope = presetScope(name);

        if (scope === 'numpad') {
            kbSection.querySelectorAll('.numpad .kb-key[data-dot]').forEach(k => {
                k.removeAttribute('data-color');
                k.removeAttribute('data-dot');
            });
            controls.querySelectorAll('button[data-preset^="numpad"]').forEach(b => b.classList.remove('active'));
        } else {
            kbSection.querySelectorAll('.keyboard .kb-key[data-dot]').forEach(k => {
                k.removeAttribute('data-color');
                k.removeAttribute('data-dot');
            });
            controls.querySelectorAll('button[data-preset]:not([data-preset^="numpad"])').forEach(b => b.classList.remove('active'));
        }

        const map = presets[name] || {};
        for (const [key, color] of Object.entries(map)) {
            const el = kbSection.querySelector(`.kb-key[data-key="${CSS.escape(key)}"]`);
            if (el) {
                el.setAttribute('data-color', color);
                const d = dotNum(color);
                if (d) el.setAttribute('data-dot', d);
            }
        }
        if (_lastBindings) {
            if (scope === 'numpad') {
                if (_lastBindings.numConfirmKey) {
                    const dk = codeToDataKey(_lastBindings.numConfirmKey);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'space'); }
                }
                if (_lastBindings.numDeleteKey) {
                    const dk = codeToDataKey(_lastBindings.numDeleteKey);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'delete'); }
                }
                if (_lastBindings.numClearInputKey) {
                    const dk = codeToDataKey(_lastBindings.numClearInputKey);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'action'); }
                }
            } else {
                if (_lastBindings.spaceKey) {
                    const dk = codeToDataKey(_lastBindings.spaceKey);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'space'); }
                }
                [_lastBindings.deleteKey, _lastBindings.backspaceKey].forEach(code => {
                    if (!code) return;
                    const dk = codeToDataKey(code);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'delete'); }
                });
                if (_lastBindings.clearInputKey) {
                    const dk = codeToDataKey(_lastBindings.clearInputKey);
                    if (dk) { const el = kbSection.querySelector(`.kb-key[data-key="${dk}"]`); if (el) el.setAttribute('data-color', 'action'); }
                }
            }
        }
        btn.classList.add('active');
        legend.style.display = 'flex';

        if (window._kbApplyPreset) window._kbApplyPreset(scope, name);
    });

    // ── 自定义键位按钮 ──
    const btnCustomBind = document.getElementById('btnCustomBind');
    if (btnCustomBind) {
        btnCustomBind.addEventListener('click', () => {
            if (window._kbOpenSeqBinding) window._kbOpenSeqBinding();
        });
    }

    // ── 恢复默认键位按钮 ──
    const btnResetDefaults = document.getElementById('btnKbResetDefaults');
    if (btnResetDefaults) {
        btnResetDefaults.addEventListener('click', () => {
            if (window._kbResetDefaults) window._kbResetDefaults();
        });
    }

    window._kbPresetToDotBindings = presetToDotBindings;

    // ── 对外接口（init.js 调用）──
    window._kbApplyBindings = function (data) {
        _lastBindings = data;
        applyBindings(data.keyboard, data.numpad, data.spaceKey, data.numConfirmKey, data.deleteKey, data.backspaceKey, data.numDeleteKey, data.clearInputKey, data.numClearInputKey);
        matchPresets(data.keyboard, data.numpad);
    };

    // ── 设置控件同步 ──
    const kbDebounceSpeech = document.getElementById('kbDebounceSpeech');
    const kbSpeechRate = document.getElementById('kbSpeechRate');
    const kbSpeechRateVal = document.getElementById('kbSpeechRateVal');
    const kbBrailleFontSize = document.getElementById('kbBrailleFontSize');
    const kbBrailleFontSizeVal = document.getElementById('kbBrailleFontSizeVal');
    const kbMaxUndoHistory = document.getElementById('kbMaxUndoHistory');
    const kbMaxUndoHistoryVal = document.getElementById('kbMaxUndoHistoryVal');

    window._kbSyncSettings = function (s) {
        if (kbDebounceSpeech) kbDebounceSpeech.checked = s.debounceSpeech;
        if (kbSpeechRate) { kbSpeechRate.value = s.speechRate; kbSpeechRateVal.textContent = s.speechRate; }
        if (kbBrailleFontSize) { kbBrailleFontSize.value = s.brailleFontSize; kbBrailleFontSizeVal.textContent = s.brailleFontSize; }
        if (kbMaxUndoHistory) { kbMaxUndoHistory.value = s.maxUndoHistory; kbMaxUndoHistoryVal.textContent = s.maxUndoHistory; }
    };

    if (kbDebounceSpeech) {
        kbDebounceSpeech.addEventListener('change', () => {
            if (window._kbUpdateSetting) window._kbUpdateSetting('debounceSpeech', kbDebounceSpeech.checked);
        });
    }
    function _onRangeInput(el, valEl, key) {
        el.addEventListener('input', () => {
            valEl.textContent = el.value;
            if (window._kbUpdateSetting) window._kbUpdateSetting(key, key === 'brailleFontSize' || key === 'maxUndoHistory' ? parseInt(el.value, 10) : parseFloat(el.value));
        });
    }
    if (kbSpeechRate) _onRangeInput(kbSpeechRate, kbSpeechRateVal, 'speechRate');
    if (kbBrailleFontSize) _onRangeInput(kbBrailleFontSize, kbBrailleFontSizeVal, 'brailleFontSize');
    if (kbMaxUndoHistory) _onRangeInput(kbMaxUndoHistory, kbMaxUndoHistoryVal, 'maxUndoHistory');

    // ── 参考面板悬停高亮对应键盘按键 ──
    const kbRef = document.querySelector('.kb-ref');
    if (kbRef) {
        kbRef.addEventListener('mouseover', (e) => {
            const el = e.target.closest('[data-hl]');
            if (!el || !el.closest('.kb-ref')) return;
            const keys = el.dataset.hl.split(/\s+/);
            keys.forEach(k => {
                kbSection.querySelectorAll(`.kb-key[data-key="${CSS.escape(k)}"]`).forEach(el => el.classList.add('highlight'));
            });
        });
        kbRef.addEventListener('mouseout', (e) => {
            const el = e.target.closest('[data-hl]');
            if (!el || !el.closest('.kb-ref')) return;
            const keys = el.dataset.hl.split(/\s+/);
            keys.forEach(k => {
                kbSection.querySelectorAll(`.kb-key[data-key="${CSS.escape(k)}"]`).forEach(el => el.classList.remove('highlight'));
            });
        });
    }
})();
