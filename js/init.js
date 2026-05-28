// init.js - 初始化（事件绑定）
//

var toggleSettings, toggleHelp, toggleMapping; // assigned inside loadMapping().then()

/**
 * @description: 将配置中的动作名映射到实际函数调用
 * @param {string} action 动作名，如 'confirm'、'delete'、'space'
 * @return {void}
 */
function dispatchAction(action) {
    switch (action) {
        case 'confirm': confirmInput(); break;
        case 'clearInput': clearInput(); break;
        case 'clearOutput': clearOutput(); break;
        case 'delete':
            if (SETTINGS.multiSelect && selectedIndices.size > 0) deleteSelected();
            else deleteLast();
            break;
        case 'deleteForward':
            if (SETTINGS.multiSelect && selectedIndices.size > 0) deleteSelected();
            else deleteForward();
            break;
        case 'selectAll':
            if (!SETTINGS.multiSelect) break;
            selectedIndices.clear();
            for (let i = 0; i < outputItems.length; i++) selectedIndices.add(i);
            _selAnchor = 0;
            cursorIdx = outputItems.length;
            renderOutput();
            speakText('已全选');
            break;
        case 'space':
            if (dotState.some(d => d)) confirmInput();
            else inputSpace();
            break;
        case 'cursorLeft': moveCursor(-1); break;
        case 'cursorRight': moveCursor(1); break;
        case 'cursorUp': moveCursorUp(); break;
        case 'cursorDown': moveCursorDown(); break;
        case 'undo': undo(); break;
        case 'redo': redo(); break;
        case 'readAloud': readAloud(); break;
        case 'save': handleSaveContent(); break;
        case 'openFile': handleOpenFile(); break;
        case 'tutorial': playTutorial(); break;
        case 'toggleSettings': toggleSettings && toggleSettings(); break;
        case 'toggleHelp': toggleHelp && toggleHelp(); break;
        case 'toggleMapping': toggleMapping && toggleMapping(); break;
        case 'resetKeyBindings': _startSeqBinding && _startSeqBinding(); break;
        case 'pageUp': if (_isPaginationActive) switchToPage(_currentPage - 1); break;
        case 'pageDown': if (_isPaginationActive) switchToPage(_currentPage + 1); break;
    }
}

/**
 * @description: 根据按键标识查找并执行对应动作（先查点位键，再查动作键）
 * @param {string} keyId 按键标识，如 'Numpad7'、'Backspace'、'KeyD'
 * @return {boolean} 是否已处理该按键
 */
function tryDispatch(keyId) {
    // 先检查是否为点位切换键
    if (KEY_TO_DOT[keyId] !== undefined) {
        const dotIdx = KEY_TO_DOT[keyId];
        toggleDot(dotIdx);
        setActiveKeyGroup(keyId);
        return true;
    }
    // 再检查是否为动作键
    if (KEY_ACTIONS[keyId] !== undefined) {
        dispatchAction(KEY_ACTIONS[keyId]);
        return true;
    }
    return false;
}

/**
 * @description: 检查键盘事件是否匹配某个组合键配置
 * @param {KeyboardEvent} e 键盘事件
 * @return {string|null} 匹配到的动作名，无匹配返回 null
 */
function matchCombo(e) {
    for (const combo of KEY_COMBOS) {
        if ((combo.ctrl === undefined || combo.ctrl === e.ctrlKey) &&
            (combo.alt === undefined || combo.alt === e.altKey) &&
            (combo.shift === undefined || combo.shift === e.shiftKey) &&
            combo.key === e.key) {
            return combo.action;
        }
    }
    return null;
}

/**
 * @description: oneHot 编码转点位数组（支持组合编码）
 */
function _oneHotToDots(oneHot) {
    if (oneHot.includes('+')) {
        return oneHot.split('+').map(part => part.split('').map(Number));
    }
    return oneHot.split('').map(Number);
}

/**
 * @description: 点位数组转为标注字符串，如 "100100" => "1 4"
 */
function _dotsLabel(dots) {
    return dots.map((d, i) => d ? (i + 1) : '').filter(Boolean).join(' ');
}

/**
 * @description: 渲染对照表内容到 盲文对照表 mapping slide panel
 */
function renderMappingTable() {
    const container = document.getElementById('mappingContainer');
    if (!container) return;
    container.innerHTML = '';

    MAPPING_CATEGORIES.forEach(cat => {
        const section = document.createElement('section');
        section.className = 'category';

        const title = document.createElement('h2');
        title.textContent = cat.name;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'mapping-grid';

        cat.entries.forEach(entry => {
            if (entry.hidden) return;
            const braille = oneHotToBrailleChar(entry.oneHot);
            const dotsData = _oneHotToDots(entry.oneHot);
            const isCombined = Array.isArray(dotsData[0]);
            const dotsStr = isCombined
                ? dotsData.map(d => _dotsLabel(d)).join(' + ')
                : _dotsLabel(dotsData);

            const card = document.createElement('div');
            card.className = 'mapping-card';
            if (isCombined) card.classList.add('combined');
            card.innerHTML =
                '<span class="mc-braille">' + braille + '</span>' +
                '<span class="mc-dots">' + dotsStr + '</span>' +
                '<span class="mc-label">' + entry.label + '</span>';
            const forceNum = cat.name === '数字';
            card.addEventListener('click', () => {
                speakBraille(entry.oneHot, 1, { forceNumber: forceNum });
                speakText('键位' + onehotToIndex(entry.oneHot), 2);
            });
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}

loadAllMappings().then(async () => {

    // ── Load settings & apply ──
    loadSettings();
    applyKeyBindings();
    applyActionKeyBindings();
    renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));

    // ── Fill key-label from config ──
    updateKeyLabels();

    // ── 移动端语音唤醒：首次用户触摸时激活 speechSynthesis ──
    (function () {
        if (!window.speechSynthesis) return;
        function prime() {
            document.removeEventListener('touchstart', prime);
            document.removeEventListener('click', prime);
            const u = new SpeechSynthesisUtterance('');
            u.volume = 0;
            window.speechSynthesis.speak(u);
            if (typeof window.speechSynthesis.resume === 'function') {
                window.speechSynthesis.resume();
            }
        }
        document.addEventListener('touchstart', prime, { once: true });
        document.addEventListener('click', prime, { once: true });
    })();

    // ── Render mapping table ──
    renderMappingTable();

    // ── Welcome mask for first-time visitors ──
    initWelcome();

    // ── Keyboard handler ──
    document.addEventListener('keydown', (e) => {
        // 焦点在 button 上时不拦截 Enter/Space（让原生 button 处理）
        if (e.target.closest('button') && (e.key === 'Enter' || e.key === ' ')) return;

        // 欢迎遮罩键盘选择：Escape 跳过，其他任意键确认
        if (_welcomeActive) {
            e.preventDefault();
            if (e.key === 'Escape') {
                welcomeSkip();
            } else {
                welcomeConfirm();
            }
            return;
        }

        // 键位设置捕获优先（监听模式下拦截所有按键）
        if (handleKeyBindingCapture(e)) return;

        // 教程播放中：G/H 切换章节（优先于普通键位分发）
        if (handleTutorialNavigation(e.code)) { e.preventDefault(); return; }

        // 面板焦点陷阱：Tab 在打开的面板内循环
        if (e.key === 'Tab') {
            const openPanel = document.querySelector('.settings-slide.open, .help-slide.open, .mapping-slide.open, .welcome-mask.active');
            if (openPanel) {
                const focusable = openPanel.querySelectorAll(
                    'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
                );
                if (focusable.length > 0) {
                    const first = focusable[0];
                    const last = focusable[focusable.length - 1];
                    if (e.shiftKey && document.activeElement === first) {
                        e.preventDefault();
                        last.focus();
                        return;
                    }
                    if (!e.shiftKey && document.activeElement === last) {
                        e.preventDefault();
                        first.focus();
                        return;
                    }
                }
            }
        }

        // Esc 关闭面板 / 暂停教程
        if (e.key === 'Escape') {
            if (handleTutorialEscape()) { e.preventDefault(); return; }
            if (settingsSlide.classList.contains('open')) { closeSettings(); e.preventDefault(); return; }
            if (helpSlide.classList.contains('open')) { closeHelp(); e.preventDefault(); return; }
            const pinBtn = document.getElementById('pinToggle');
            if (mappingSlide.classList.contains('open') && !pinBtn?.classList.contains('lit')) { closeMapping(); e.preventDefault(); return; }
        }

        // 组合键优先
        const comboAction = matchCombo(e);
        if (comboAction) {
            e.preventDefault();
            dispatchAction(comboAction);
            return;
        }

        // Shift+方向键：范围选择
        if (SETTINGS.multiSelect && e.shiftKey && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            e.preventDefault();
            selectExtend(e.code === 'ArrowRight' ? 1 : -1);
            return;
        }

        // 修饰键组合（Ctrl/Alt/Meta）留给浏览器，本项目不拦截
        if (e.ctrlKey || e.altKey || e.metaKey) return;

        // 小键盘：用 e.code 查找
        if (e.code.startsWith('Numpad')) {
            if (tryDispatch(e.code)) {
                e.preventDefault();
                return;
            }
        }

        // 普通键：用 e.code 查找
        if (tryDispatch(e.code)) {
            e.preventDefault();
            return;
        }
    });

    // ── Dot-cell clicks & keyboard ──
    dotCells.forEach(cell => {
        cell.addEventListener('click', () => {
            toggleDot(+cell.dataset.idx);
            cell.blur(); // 点击后移除焦点，避免后续空格键误触发按钮原生click
        });
    });

    // ── Action bar clicks (直接调用动作，不走键位查找)
    document.getElementById('actionBar').addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-action]');
        if (!btn) return;
        dispatchAction(btn.dataset.action);
    });

    // ── Help slide panel ──
    const helpSlide = document.getElementById('helpSlide');
    const helpOverlay = document.getElementById('helpOverlay');
    const helpBtn = document.getElementById('helpBtn');
    const helpSlideClose = document.getElementById('helpSlideClose');

    const DOT_NAMES_HELP = ['1', '2', '3', '4', '5', '6'];

    /**
     * @description: 渲染键位帮助面板中的动态按键标签
     * @return {void}
     */
    function renderHelpPanel() {
        // 教程按钮事件（只绑一次）
        const tutorialBtn = document.getElementById('helpTutorialBtn');
        if (tutorialBtn && !tutorialBtn._bound) {
            tutorialBtn._bound = true;
            tutorialBtn.addEventListener('click', () => {
                playTutorial();
                closeHelp();
            });
        }

        // 盲文点位（2×3 grid: 列序 1,4 / 2,5 / 3,6）
        const dotGridOrder = [1, 4, 2, 5, 3, 6];
        for (const d of dotGridOrder) {
            const kbdEl = document.getElementById('helpDot' + d + 'L');
            const npEl = document.getElementById('helpDot' + d + 'Np');
            if (kbdEl) kbdEl.textContent = _keyIdToLabel(DOT_TO_KEY[d] || '?');
            if (npEl) npEl.textContent = _keyIdToLabel(DOT_TO_KEY_NUMPAD[d] || '?');
        }

        // 操作表格
        const actionKeys = {};
        for (const [key, action] of Object.entries(KEY_ACTIONS)) {
            if (!actionKeys[action]) actionKeys[action] = [];
            actionKeys[action].push(key);
        }

        const tableMap = [
            { action: 'space', kbdId: 'htKbdSpace', npId: 'htNpSpace' },
            { action: 'clearInput', kbdId: 'htKbdClearInput', npId: 'htNpClearInput' },
            { action: 'delete', kbdId: 'htKbdDelete', npId: 'htNpDelete' },
        ];
        for (const { action, kbdId, npId } of tableMap) {
            const keys = (actionKeys[action] || []).filter(k => k !== 'Backspace');
            const kbdKeys = keys.filter(k => !_isNumpadKey(k));
            const npKeys = keys.filter(k => _isNumpadKey(k));
            const kbdEl = document.getElementById(kbdId);
            const npEl = document.getElementById(npId);
            if (kbdEl) kbdEl.textContent = kbdKeys.length ? kbdKeys.map(k => _keyIdToLabel(k)).join(' ') : '—';
            if (npEl) npEl.textContent = npKeys.length ? npKeys.map(k => _keyIdToLabel(k)).join(' ') : '—';
        }

        // 通用操作
        const setKbd = (id, keys) => {
            const el = document.getElementById(id);
            if (el && keys && keys.length) el.textContent = keys.map(k => _keyIdToLabel(k)).join(' / ');
        };
        setKbd('helpDeleteForward', actionKeys['deleteForward']);
        setKbd('helpClearOutput', actionKeys['clearOutput']);
        setKbd('helpReadAloud', actionKeys['readAloud']);
        setKbd('helpPageUp', actionKeys['pageUp']);
        setKbd('helpPageDown', actionKeys['pageDown']);

        // 组合键
        const comboMap = {};
        for (const combo of KEY_COMBOS) {
            const parts = [];
            if (combo.ctrl) parts.push('Ctrl');
            if (combo.alt) parts.push('Alt');
            if (combo.shift) parts.push('Shift');
            parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
            const comboStr = parts.join('+');
            if (!comboMap[combo.action]) comboMap[combo.action] = [];
            comboMap[combo.action].push(comboStr);
        }

        const comboIds = {
            undo: 'helpComboUndo', redo: 'helpComboRedo', selectAll: 'helpComboSelectAll',
            save: 'helpComboSave', openFile: 'helpComboOpenFile', toggleSettings: 'helpComboToggleSettings',
            toggleHelp: 'helpComboToggleHelp', tutorial: 'helpComboTutorial', resetKeyBindings: 'helpComboResetKeyBindings',
            toggleMapping: 'helpComboToggleMapping',
        };
        for (const [action, id] of Object.entries(comboIds)) {
            const el = document.getElementById(id);
            const combos = comboMap[action];
            if (el && combos && combos.length) el.textContent = combos.join(' / ');
        }

        // 多选关闭时隐藏相关条目
        const selectAllRow = document.getElementById('helpRowSelectAll');
        if (selectAllRow) selectAllRow.style.display = SETTINGS.multiSelect ? '' : 'none';
        const shiftSelectRow = document.getElementById('helpRowShiftSelect');
        if (shiftSelectRow) shiftSelectRow.style.display = SETTINGS.multiSelect ? '' : 'none';
    }

    /**
     * @description: 打开键位帮助滑动面板
     * @return {void}
     */
    function openHelp() {
        renderHelpPanel();
        helpSlide.classList.add('open');
        helpSlide.removeAttribute('inert');
        helpOverlay.classList.add('open');
        helpBtn.setAttribute('aria-expanded', 'true');
        helpSlideClose.focus();
        speakText('打开键位帮助', 1.5);
    }
    /**
     * @description: 关闭键位帮助滑动面板
     * @return {void}
     */
    function closeHelp() {
        helpSlide.classList.remove('open');
        helpSlide.setAttribute('inert', '');
        helpOverlay.classList.remove('open');
        helpBtn.setAttribute('aria-expanded', 'false');
        helpBtn.focus();
        speakText('关闭键位帮助', 1.5);
    }
    /**
     * @description: 切换键位帮助面板的显示/隐藏
     * @return {void}
     */
    toggleHelp = function () {
        if (helpSlide.classList.contains('open')) closeHelp();
        else openHelp();
    }

    helpBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openHelp();
    });
    helpOverlay.addEventListener('click', closeHelp);
    helpSlideClose.addEventListener('click', closeHelp);
    helpSlide.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ── Preview click/keyboard to speak ──
    previewBox.addEventListener('click', () => {
        if (dotState.some(d => d)) speakBraille(dotState.join(''));
    });

    // ── Theme toggle ──
    const themeToggle = document.getElementById('themeToggle');

    // ── Header tutorial button ──
    document.getElementById('btnTutorial').addEventListener('click', () => playTutorial());
    const savedTheme = localStorage.getItem('braille-theme');
    if (savedTheme === 'light') {
        document.body.classList.add('light');
        themeToggle.textContent = '☀';
        themeToggle.setAttribute('aria-pressed', 'true');
    }
    themeToggle.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light');
        localStorage.setItem('braille-theme', isLight ? 'light' : 'dark');
        themeToggle.textContent = isLight ? '☀' : '🌙';
        themeToggle.setAttribute('aria-pressed', String(isLight));
    });

    // ── Read aloud ──
    const btnReadAloud = document.getElementById('btnReadAloud');
    if (btnReadAloud) {
        btnReadAloud.addEventListener('click', readAloud);
    }

    // ── Clear all ──
    const btnClearAll = document.getElementById('btnClearAll');
    if (btnClearAll) {
        btnClearAll.addEventListener('click', clearOutput);
    }

    // ── Mapping slide panel ──
    const mappingSlide = document.getElementById('mappingSlide');
    const mappingOverlay = document.getElementById('mappingOverlay');
    const btnMapping = document.getElementById('btnMapping');
    const mappingSlideClose = document.getElementById('mappingSlideClose');
    const pinToggle = document.getElementById('pinToggle');
    let pinLit = false;

    /**
     * @description: 打开盲文对照表滑动面板
     * @return {void}
     */
    function openMapping() {
        mappingSlide.classList.add('open');
        mappingSlide.removeAttribute('inert');
        mappingOverlay.classList.add('open');
        btnMapping.setAttribute('aria-expanded', 'true');
        mappingSlideClose.focus();
    }
    /**
     * @description: 关闭盲文对照表滑动面板
     * @return {void}
     */
    function closeMapping() {
        mappingSlide.classList.remove('open');
        mappingSlide.setAttribute('inert', '');
        mappingOverlay.classList.remove('open');
        btnMapping.setAttribute('aria-expanded', 'false');
        btnMapping.focus();
    }
    toggleMapping = function () {
        if (mappingSlide.classList.contains('open')) closeMapping();
        else openMapping();
    };

    btnMapping.addEventListener('click', (e) => {
        e.stopPropagation();
        openMapping();
    });
    mappingOverlay.addEventListener('click', () => {
        if (pinLit) return;
        closeMapping();
    });
    mappingSlideClose.addEventListener('click', closeMapping);
    mappingSlide.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    pinToggle.addEventListener('click', () => {
        pinLit = !pinLit;
        pinToggle.classList.toggle('lit', pinLit);
        pinToggle.setAttribute('aria-pressed', String(pinLit));
        pinToggle.title = pinLit ? '已锁定（仅可通过✕关闭）' : '锁定面板';
    });

    // ── Settings slide panel ──
    const settingsSlide = document.getElementById('settingsSlide');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const btnSettings = document.getElementById('btnSettings');
    const settingsSlideClose = document.getElementById('settingsSlideClose');

    /**
     * @description: 打开设置滑动面板，渲染键位绑定 UI
     * @return {void}
     */
    function openSettings() {
        renderKeyBindingsUI(document.getElementById('keyBindings'));
        renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));
        settingsSlide.classList.add('open');
        settingsSlide.removeAttribute('inert');
        settingsOverlay.classList.add('open');
        btnSettings.setAttribute('aria-expanded', 'true');
        settingsSlideClose.focus();
        speakText('打开设置', 1.5);
    }
    /**
     * @description: 关闭设置滑动面板，清理键位监听状态
     * @return {void}
     */
    function closeSettings() {
        _kbListening = null;
        _akbListening = null;
        _seqBinding = null;
        _hideBindMask();
        // 刷新键位 UI，恢复原始键值
        const kbContainer = document.getElementById('keyBindings');
        if (kbContainer && typeof renderKeyBindingsUI === 'function') renderKeyBindingsUI(kbContainer);
        const akbContainer = document.getElementById('actionKeyBindings');
        if (akbContainer && typeof renderActionKeyBindingsUI === 'function') renderActionKeyBindingsUI(akbContainer);
        settingsSlide.classList.remove('open');
        settingsSlide.setAttribute('inert', '');
        settingsOverlay.classList.remove('open');
        btnSettings.setAttribute('aria-expanded', 'false');
        btnSettings.focus();
        speakText('关闭设置', 1.5);
    }
    /**
     * @description: 切换设置面板的显示/隐藏
     * @return {void}
     */
    toggleSettings = function () {
        if (settingsSlide.classList.contains('open')) closeSettings();
        else openSettings();
    };

    btnSettings.addEventListener('click', (e) => {
        e.stopPropagation();
        openSettings();
    });
    settingsOverlay.addEventListener('click', closeSettings);
    settingsSlideClose.addEventListener('click', closeSettings);
    settingsSlide.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // ── Settings controls ──
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
        btn.addEventListener('click', () => {
            applyKeyPreset(btn.dataset.preset);
        });
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
                selectedIndices.clear();
                _selAnchor = -1;
                renderOutput();
            }
            saveSettings();
            // 帮助面板打开时刷新，同步多选相关条目
            if (helpSlide.classList.contains('open')) renderHelpPanel();
        });
    }

    // 强制欢迎询问（dev panel）
    initForceWelcomeToggle();

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

    // Initial render
    renderDots();
    renderOutput();

    // ── Page navigation ──
    document.getElementById('btnPrevPage').addEventListener('click', () => switchToPage(_currentPage - 1));
    document.getElementById('btnNextPage').addEventListener('click', () => switchToPage(_currentPage + 1));

    // ── Resize observer for page recalculation ──
    let _resizeTimer = null;
    new ResizeObserver(() => {
        clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(() => {
            if (_isPaginationActive || outputArea.scrollHeight > outputArea.clientHeight + 2) {
                invalidatePageCache();
                renderOutput();
            }
        }, 200);
    }).observe(outputArea);

    // ── Dev panel ──
    initDevPanel();
});