// keyboard.js - 键盘和设置可视化逻辑（与主页集成）

(function () {
    // ── 预设映射（名称即定义：键盘预设每个字符是 data-key，numpad 预设取数字部分）──
    const PRESET_NAMES = [
        'fdsjkl', 
        'ik,ujm', 'ol.ik,', '.,mlkj', 'lkjoiu',
        'numpad852741', 'numpad963852', 'numpad654987', 'numpad321654',
    ];

    function buildPresets() {
        const out = {};
        for (const name of PRESET_NAMES) {
            const preset = {};
            const isNumpad = name.startsWith('numpad');
            const keys = isNumpad ? [...name.slice(6)].map(d => 'num' + d) : [...name];
            keys.forEach((k, i) => { preset[k] = 'dot' + (i + 1); });
            if (!isNumpad) preset.space = 'space';
            out[name] = preset;
        }
        return out;
    }

    const presets = buildPresets();

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
            k.draggable = false;
        });
    }

    function applyBindings(kbdBindings, numBindings, spaceKey, numConfirmKey, deleteKey, backspaceKey, numDeleteKey, clearInputKey, numClearInputKey, functionKeys) {
        clearAll();
        if (kbdBindings) {
            for (const [dot, code] of Object.entries(kbdBindings)) {
                const dataKey = codeToDataKey(code);
                if (dataKey) {
                    const el = kbSection.querySelector(`.kb-key[data-key="${dataKey}"]`);
                    if (el) {
                        el.setAttribute('data-color', 'dot' + dot);
                        el.setAttribute('data-dot', dot);
                        el.draggable = true;
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
                        el.draggable = true;
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
        if (functionKeys) {
            functionKeys.forEach(dk => {
                const el = kbSection.querySelector(`.kb-key[data-key="${CSS.escape(dk)}"]`);
                if (el) el.setAttribute('data-color', 'function');
            });
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

    // ── 当前绑定状态占位 ──
    function _kl(code) {
        var fn = window._keyIdToLabel;
        return fn ? fn(code) : (code || '?');
    }

    function bindingsMatchPreset(bindings, scope) {
        if (!bindings) return false;
        for (const name of PRESET_NAMES) {
            if (presetScope(name) !== scope) continue;
            const presetBinding = presetToDotBindings(name);
            if (!presetBinding) continue;
            let match = true;
            for (let d = 1; d <= 6; d++) {
                if (presetBinding[d] !== bindings[d]) { match = false; break; }
            }
            if (match) return true;
        }
        return false;
    }

    function updateBindingStatus(data) {
        const kbdRect = document.getElementById('kbKbdRect');
        const kbdLabel = document.getElementById('kbKbdLabel');
        const numpadRect = document.getElementById('kbNumpadRect');
        const numpadLabel = document.getElementById('kbNumpadLabel');
        if (kbdRect) {
            const matched = bindingsMatchPreset(data.keyboard, 'kbd');
            if (matched) {
                kbdRect.style.display = 'none';
                if (kbdLabel) kbdLabel.style.display = 'none';
            } else {
                kbdRect.textContent = [...Array(6)].map((_, i) => _kl(data.keyboard[i + 1])).join(' ');
                kbdRect.style.display = '';
                if (kbdLabel) kbdLabel.style.display = '';
            }
        }
        if (numpadRect) {
            const matched = bindingsMatchPreset(data.numpad, 'numpad');
            if (matched) {
                numpadRect.style.display = 'none';
                if (numpadLabel) numpadLabel.style.display = 'none';
            } else {
                numpadRect.textContent = [...Array(6)].map((_, i) => _kl(data.numpad[i + 1])).join(' ');
                numpadRect.style.display = '';
                if (numpadLabel) numpadLabel.style.display = '';
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
                k.draggable = false;
            });
            controls.querySelectorAll('button[data-preset^="numpad"]').forEach(b => b.classList.remove('active'));
        } else {
            kbSection.querySelectorAll('.keyboard .kb-key[data-dot]').forEach(k => {
                k.removeAttribute('data-color');
                k.removeAttribute('data-dot');
                k.draggable = false;
            });
            controls.querySelectorAll('button[data-preset]:not([data-preset^="numpad"])').forEach(b => b.classList.remove('active'));
        }

        const map = presets[name] || {};
        for (const [key, color] of Object.entries(map)) {
            const el = kbSection.querySelector(`.kb-key[data-key="${CSS.escape(key)}"]`);
            if (el) {
                el.setAttribute('data-color', color);
                const d = dotNum(color);
                if (d) { el.setAttribute('data-dot', d); el.draggable = true; }
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

    // ── 预设按钮悬停播报 ──
    const _PUNCT_SPEAK = { '.': '句号', ',': '逗号', ';': '分号', '/': '斜杠' };
    controls.addEventListener('mouseover', (e) => {
        const btn = e.target.closest('button[data-preset]');
        if (!btn || !window._kbSpeakImmediate) return;
        const text = btn.textContent.trim();
        let spoken;
        if (/^\d+$/.test(text)) {
            // 小键盘数字：每个数字之间插入空格，让TTS逐位读出
            spoken = text.split('').join(' ');
        } else {
            spoken = text.replace(/[.,;/]/g, c => _PUNCT_SPEAK[c] || c);
        }
        spoken = '键盘预设，' + spoken
        window._kbSpeakImmediate(spoken);
    });

    // ── 播报盲文键位按钮 ──
    const btnSpeakBindings = document.getElementById('btnSpeakBindings');
    if (btnSpeakBindings) {
        btnSpeakBindings.addEventListener('click', () => {
            if (window._kbSpeakAllBindings) window._kbSpeakAllBindings();
        });
        btnSpeakBindings.addEventListener('mouseover', () => {
            if (window._kbSpeakImmediate) window._kbSpeakImmediate('播报当前盲文键位');
        });
    }

    // ── 自定义键位按钮 ──
    const btnCustomBind = document.getElementById('btnCustomBind');
    if (btnCustomBind) {
        btnCustomBind.addEventListener('click', () => {
            if (window._kbOpenSeqBinding) window._kbOpenSeqBinding();
        });
        btnCustomBind.addEventListener('mouseover', () => {
            if (window._kbSpeakImmediate) window._kbSpeakImmediate('自定义键位');
        });
    }

    // ── 着色按键 hover / 点击反馈 ──
    const DOT_SPEAK = ['', '1号点', '2号点', '3号点', '4号点', '5号点', '6号点'];
    const KEY_LABEL = {
        'num/': '小键盘斜杠', 'num*': '小键盘星号', 'num+': '小键盘加号',
        'num-': '小键盘减号', 'num.': '小键盘点号', 'numenter': '小键盘回车',
        ',': '逗号', '.': '句号', ';': '分号', '\'': '引号',
        'space': '空格', 'backspace': '退格',
    };
    const FUNC_LABEL = {
        q: '盲文对照表', w: '键盘和设置',
        r: '朗读', t: '切换主题', c: '清空输出区',
        g: '上一节', h: '下一节',
    };

    function speakKey(keyEl) {
        const color = keyEl.getAttribute('data-color');
        if (!color) return;
        const dataKey = keyEl.getAttribute('data-key') || '';
        const label = KEY_LABEL[dataKey] || (dataKey.startsWith('num') ? '小键盘' + dataKey.replace('num', '') : keyEl.querySelector('.primary')?.textContent?.trim()) || dataKey;

        let msg = '';
        if (color.startsWith('dot')) {
            msg = DOT_SPEAK[parseInt(color.slice(3))] || '';
        } else if (color === 'space') {
            msg = '确认输入';
        } else if (color === 'delete') {
            msg = '删除';
        } else if (color === 'action') {
            msg = '清空输入';
        } else if (color === 'function') {
            msg = FUNC_LABEL[dataKey] || '功能键';
        }
        if (window._kbSpeakImmediate && msg) {
            window._kbSpeakImmediate(label + '，' + msg);
        }
    }

    kbSection.addEventListener('mouseover', (e) => {
        const key = e.target.closest('.kb-key[data-color]');
        if (key) speakKey(key);
    });

    kbSection.addEventListener('click', (e) => {
        const key = e.target.closest('.kb-key[data-color]');
        if (key) speakKey(key);
    });

    // ── 恢复默认键位按钮 ──
    const btnResetDefaults = document.getElementById('btnKbResetDefaults');
    if (btnResetDefaults) {
        btnResetDefaults.addEventListener('click', () => {
            if (window._kbResetDefaults) window._kbResetDefaults();
        });
        btnResetDefaults.addEventListener('mouseover', () => {
            if (window._kbSpeakImmediate) window._kbSpeakImmediate('恢复默认键位');
        });
    }

    window._kbPresetToDotBindings = presetToDotBindings;

    // ── 对外接口（init.js 调用）──
    window._kbApplyBindings = function (data) {
        _lastBindings = data;
        applyBindings(data.keyboard, data.numpad, data.spaceKey, data.numConfirmKey, data.deleteKey, data.backspaceKey, data.numDeleteKey, data.clearInputKey, data.numClearInputKey, data.functionKeys);
        matchPresets(data.keyboard, data.numpad);
        updateBindingStatus(data);
    };

    // ── 设置控件同步 ──
    const kbMultiSelect = document.getElementById('kbMultiSelect');
    const kbDebounceSpeech = document.getElementById('kbDebounceSpeech');
    const kbSpeechRate = document.getElementById('kbSpeechRate');
    const kbSpeechRateVal = document.getElementById('kbSpeechRateVal');
    const kbBrailleFontSize = document.getElementById('kbBrailleFontSize');
    const kbBrailleFontSizeVal = document.getElementById('kbBrailleFontSizeVal');
    const kbMaxUndoHistory = document.getElementById('kbMaxUndoHistory');
    const kbMaxUndoHistoryVal = document.getElementById('kbMaxUndoHistoryVal');

    window._kbSyncSettings = function (s) {
        if (kbMultiSelect && s.multiSelect !== undefined) kbMultiSelect.checked = s.multiSelect;
        if (kbDebounceSpeech && s.debounceSpeech !== undefined) kbDebounceSpeech.checked = s.debounceSpeech;
        if (kbSpeechRate && s.speechRate !== undefined) { kbSpeechRate.value = s.speechRate; kbSpeechRateVal.textContent = s.speechRate; }
        if (kbBrailleFontSize && s.brailleFontSize !== undefined) { kbBrailleFontSize.value = s.brailleFontSize; kbBrailleFontSizeVal.textContent = s.brailleFontSize; }
        if (kbMaxUndoHistory && s.maxUndoHistory !== undefined) { kbMaxUndoHistory.value = s.maxUndoHistory; kbMaxUndoHistoryVal.textContent = s.maxUndoHistory; }
    };

    if (kbMultiSelect) {
        kbMultiSelect.addEventListener('change', () => {
            if (window._kbUpdateSetting) window._kbUpdateSetting('multiSelect', kbMultiSelect.checked);
        });
    }
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
        el.addEventListener('change', () => el.blur());
    }
    if (kbSpeechRate) _onRangeInput(kbSpeechRate, kbSpeechRateVal, 'speechRate');
    if (kbBrailleFontSize) {
        _onRangeInput(kbBrailleFontSize, kbBrailleFontSizeVal, 'brailleFontSize');
        const kbOverlay = kbSection.closest('.kb-iframe-overlay');
        if (kbOverlay) {
            kbBrailleFontSize.addEventListener('mousedown', () => kbOverlay.classList.add('kb-transparent'));
            kbBrailleFontSize.addEventListener('touchstart', () => kbOverlay.classList.add('kb-transparent'));
            const _restoreOpacity = () => kbOverlay.classList.remove('kb-transparent');
            kbBrailleFontSize.addEventListener('mouseup', _restoreOpacity);
            kbBrailleFontSize.addEventListener('touchend', _restoreOpacity);
            kbBrailleFontSize.addEventListener('change', _restoreOpacity);
        }
    }
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
            // 语音播报键位说明
            const row = el.closest('.kb-ref-row');
            if (row && window._kbSpeakImmediate) {
                window._kbSpeakImmediate(row.textContent.trim());
            }
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

    // ── 拖拽换位：点亮点位键可拖到空白字母/标点/数字键上 ──
    const VALID_KBD_DROP = /^[a-z]$|^[,.\/;]$/;
    const VALID_NUMPAD_DROP = /^num\d$/;
    let _dragInfo = null;

    function _dotFromKey(el) {
        const color = el.getAttribute('data-color');
        if (!color || !color.startsWith('dot')) return null;
        const dot = el.getAttribute('data-dot');
        if (!dot) return null;
        const scope = el.closest('.numpad') ? 'numpad' : 'keyboard';
        const dataKey = el.getAttribute('data-key');
        return { dot, color, scope, dataKey };
    }

    function _validDrop(el, scope) {
        if (!el || !el.classList.contains('kb-key')) return false;
        if (el.hasAttribute('data-color')) return false;
        const dk = el.getAttribute('data-key');
        if (!dk) return false;
        if (scope === 'keyboard') {
            return !!el.closest('.keyboard') && VALID_KBD_DROP.test(dk);
        }
        return !!el.closest('.numpad') && VALID_NUMPAD_DROP.test(dk);
    }

    kbSection.addEventListener('dragstart', (e) => {
        const key = e.target.closest('.kb-key');
        if (!key || !key.draggable) { e.preventDefault(); return; }
        const info = _dotFromKey(key);
        if (!info) { e.preventDefault(); return; }
        _dragInfo = info;
        key.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('application/x-braille-dot', info.dot);
    });

    kbSection.addEventListener('dragend', (e) => {
        kbSection.querySelectorAll('.kb-key.dragging').forEach(k => k.classList.remove('dragging'));
        kbSection.querySelectorAll('.kb-key.drop-target').forEach(k => k.classList.remove('drop-target'));
        _dragInfo = null;
    });

    kbSection.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!_dragInfo) return;
        const key = e.target.closest('.kb-key');
        kbSection.querySelectorAll('.kb-key.drop-target').forEach(k => {
            if (k !== key) k.classList.remove('drop-target');
        });
        if (_validDrop(key, _dragInfo.scope)) {
            key.classList.add('drop-target');
            e.dataTransfer.dropEffect = 'move';
        } else {
            e.dataTransfer.dropEffect = 'none';
        }
    });

    kbSection.addEventListener('dragleave', (e) => {
        const key = e.target.closest('.kb-key');
        if (key) key.classList.remove('drop-target');
    });

    kbSection.addEventListener('drop', (e) => {
        e.preventDefault();
        kbSection.querySelectorAll('.kb-key.drop-target').forEach(k => k.classList.remove('drop-target'));
        if (!_dragInfo) return;
        const key = e.target.closest('.kb-key');
        if (!_validDrop(key, _dragInfo.scope)) { _dragInfo = null; return; }

        const targetDataKey = key.getAttribute('data-key');

        // 移除源键着色
        const sourceEl = kbSection.querySelector(
            `.kb-key[data-dot="${_dragInfo.dot}"][data-key="${CSS.escape(_dragInfo.dataKey)}"]`
        );
        if (sourceEl) {
            sourceEl.removeAttribute('data-color');
            sourceEl.removeAttribute('data-dot');
            sourceEl.draggable = false;
        }

        // 给目标键着色
        key.setAttribute('data-color', _dragInfo.color);
        key.setAttribute('data-dot', _dragInfo.dot);
        key.draggable = true;

        // 更新内存中的绑定数据
        const code = dataKeyToCode(targetDataKey);
        if (code) {
            const group = _dragInfo.scope === 'numpad' ? 'numpad' : 'keyboard';
            if (_lastBindings && _lastBindings[group]) {
                _lastBindings[group][_dragInfo.dot] = code;
            }
            matchPresets(
                _lastBindings && _lastBindings.keyboard,
                _lastBindings && _lastBindings.numpad
            );
            if (_lastBindings) updateBindingStatus(_lastBindings);
            if (window._kbOnDotDrop) {
                window._kbOnDotDrop(_dragInfo.scope, _dragInfo.dot, code);
            }
        }

        _dragInfo = null;
    });
})();
