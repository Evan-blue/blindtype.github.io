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

loadAllMappings().then(async () => {

    // ── Load settings & apply ──
    loadSettings();
    applyKeyBindings();
    applyActionKeyBindings();
    renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));
    renderToolbarKeyLabels();

    // ── Fill key-label from config ──
    updateKeyLabels();

    // ── Render mapping table ──
    renderMappingTable();

    // ── Welcome mask for first-time visitors ──
    initWelcome();

    // ── Keyboard handler ──
    document.addEventListener('keydown', (e) => {
        // 焦点在 textarea/input 上时不拦截按键（正常输入模式）
        if (e.target.closest('textarea, input')) return;
        // 焦点在 button 上时不拦截 Enter（让原生 button 处理）；Space 不在此列——空格键用于盲文输入
        if (e.target.closest('button') && e.key === 'Enter') return;

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
            if (settingsPanel.slide.classList.contains('open')) { settingsPanel.close(); e.preventDefault(); return; }
            if (helpPanel.slide.classList.contains('open')) { helpPanel.close(); e.preventDefault(); return; }
            if (mappingPanel.slide.classList.contains('open') && !mappingPanel.pinLit) { mappingPanel.close(); e.preventDefault(); return; }
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

        // 主键盘数字键1-6映射到盲文点位1-6（开发面板开关控制）
        if (SETTINGS.mainKeyboardDigits && e.code >= 'Digit1' && e.code <= 'Digit6') {
            const dotIdx = parseInt(e.code.slice(-1), 10);
            toggleDot(dotIdx);
            setActiveKeyGroup(e.code);
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

    // ── Preview click/keyboard to speak ──
    previewBox.addEventListener('click', () => {
        if (dotState.some(d => d)) speakBraille(dotState.join(''));
    });

    // ── Theme toggle ──
    const themeToggle = document.getElementById('themeToggle');
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

    // ── Header tutorial button ──
    document.getElementById('btnTutorial').addEventListener('click', () => playTutorial());
    
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

    initSettingsPanel();

    initForceWelcomeToggle();

    // 主键盘数字1-6映射盲文点位（dev panel）
    const mainKeyboardDigitsCheck = document.getElementById('mainKeyboardDigits');
    if (mainKeyboardDigitsCheck) {
        mainKeyboardDigitsCheck.checked = SETTINGS.mainKeyboardDigits;
        mainKeyboardDigitsCheck.addEventListener('change', () => {
            SETTINGS.mainKeyboardDigits = mainKeyboardDigitsCheck.checked;
            saveSettings();
        });
    }


    // Initial render
    renderDots();
    renderOutput();

    // ── Normal input mode ──
    document.querySelectorAll('.mode-toggle-tab').forEach(tab => {
        tab.addEventListener('click', () => setInputMode(tab.dataset.mode));
    });
    const textarea = document.getElementById('normalInputTextarea');
    if (textarea) {
        textarea.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                normalInputConfirm();
            }
        });
    }
    const normalConfirmBtn = document.getElementById('normalInputConfirm');
    if (normalConfirmBtn) normalConfirmBtn.addEventListener('click', normalInputConfirm);

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