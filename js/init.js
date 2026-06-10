// init.js - 初始化入口（ES Module）


import { loadAllMappings } from './loadMappings.js';
import { loadPinyinPro, _initPinyinPro } from './loadModule.js';
import {
    outputItems,
    cursor,
    pages,
} from './brailleState.js';
import {
    dotInput,
    inputSpace,
    deleteLast,
    deleteForward,
    deleteSelected,
    selectExtend,
    moveCursor,
    moveCursorUp,
    moveCursorDown,
    setInputMode,
    normalInputConfirm,
    dotCells,
    previewBox,
} from './brailleInput.js';
import {
    outputArea,
    renderOutput,
    invalidatePageCache,
    switchToPage,
    initBrailleOutput,
} from './brailleOutput.js';
import {
    speakText,
    speakBraille,
    readAloud,
} from './brailleSpeech.js';
import {
    SETTINGS,
    DEFAULT_SETTINGS,
    CONFIGURABLE_ACTIONS,
    saveSettings,
    loadSettings,
    applyKeyBindings,
    applyActionKeyBindings,
    applyBrailleFontSize,
    KEY_TO_DOT,
    KEY_ACTIONS,
    KEY_COMBOS,
} from './config.js';
import {
    renderActionKeyBindingsUI,
    renderToolbarKeyLabels,
    updateKeyLabels,
    initSettingsPanel,
    handleKeyBindingCapture,
    _startSeqBinding,
    settingsPanel,
    clearOutput,
    setActiveKeyGroup,
    toggleSettings,
} from './panelSettings.js';
import { helpPanel, renderHelpPanel, toggleHelp } from './panelHelp.js';
import { mappingPanel, renderMappingTable, toggleMapping } from './panelMapping.js';
import {
    playTutorial,
    handleTutorialNavigation,
    handleTutorialEscape,
    stopTutorial,
    _welcomeActive,
    initWelcome,
    initForceWelcomeToggle,
    welcomeConfirm,
    welcomeSkip,
} from './tutorial.js';
import { undo, redo } from './history.js';
import {
    handleOpenFile,
    handleSaveContent,
    initFileOperations,
} from './fileOperations.js';
import { initDevPanel } from './devPanel.js';

let _toggleKbOverlay = null;
let _toggleTheme = null;

/**
 * @description: 将配置中的动作名映射到实际函数调用
 * @param {string} action 动作名
 * @return {void}
 */
function dispatchAction(action) {
    switch (action) {
        case 'confirm': dotInput.confirm(); break;
        case 'clearInput': dotInput.clear(); break;
        case 'clearOutput': clearOutput(); break;
        case 'delete':
            if (SETTINGS.multiSelect && cursor.selectedIndices.size > 0) deleteSelected();
            else deleteLast();
            break;
        case 'deleteForward':
            if (SETTINGS.multiSelect && cursor.selectedIndices.size > 0) deleteSelected();
            else deleteForward();
            break;
        case 'selectAll':
            if (!SETTINGS.multiSelect) break;
            cursor.selectedIndices.clear();
            for (let i = 0; i < outputItems.length; i++) cursor.selectedIndices.add(i);
            cursor.selAnchor = 0;
            cursor.idx = outputItems.length;
            renderOutput();
            speakText('已全选');
            break;
        case 'space':
            if (dotInput.isLit) dotInput.confirm();
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
        case 'toggleSettings': toggleSettings(); break;
        case 'toggleHelp': toggleHelp(); break;
        case 'toggleMapping': toggleMapping(); break;
        case 'toggleKeyboard': if (_toggleKbOverlay) _toggleKbOverlay(); break;
        case 'toggleTheme': if (_toggleTheme) _toggleTheme(); break;
        case 'resetKeyBindings': _startSeqBinding(); break;
        case 'pageUp': if (pages.isActive) switchToPage(pages.idx - 1); break;
        case 'pageDown': if (pages.isActive) switchToPage(pages.idx + 1); break;
    }
}

/**
 * @description: 根据按键标识查找并执行对应动作（先查点位键，再查动作键）
 * @param {string} keyId 按键标识
 * @return {boolean} 是否已处理该按键
 */
function tryDispatch(keyId) {
    if (KEY_TO_DOT[keyId] !== undefined) {
        const dotIdx = KEY_TO_DOT[keyId];
        dotInput.toggle(dotIdx);
        setActiveKeyGroup(keyId);
        return true;
    }
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

//  initialization 根据不同的部分分成单独的函数



document.addEventListener('DOMContentLoaded', () => {
    // ── pinyin 分支：并行加载模块 → 后台拉字典 ──
    loadPinyinPro().then(() => _initPinyinPro());
    // ── 主页面分支 ──
    loadAllMappings()
        .then(() => {
            // ── Load settings & apply ──
            loadSettings();
            applyBrailleFontSize();
            applyKeyBindings();
            applyActionKeyBindings();
            renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));
            renderToolbarKeyLabels();

            // ── Fill key-label from config ──
            updateKeyLabels();

            // ── Panel initialization ──
            renderMappingTable();
            initSettingsPanel();

            // ── Init submodule event handlers ──
            initBrailleOutput();
            initFileOperations();

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

                // Shift+Esc 直接结束教程
                if (e.shiftKey && e.key === 'Escape') {
                    if (stopTutorial()) { e.preventDefault(); return; }
                }

                // Esc 关闭面板 / 暂停教程
                if (e.key === 'Escape') {
                    if (kbOverlay.classList.contains('open')) { closeKbOverlay(); e.preventDefault(); return; }
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
                    dotInput.toggle(dotIdx);
                    setActiveKeyGroup(e.code);
                    e.preventDefault();
                    return;
                }
            });

            // ── Dot-cell clicks & keyboard ──
            dotCells.forEach(cell => {
                cell.addEventListener('click', () => {
                    dotInput.toggle(+cell.dataset.idx);
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
                if (dotInput.isLit) speakBraille(dotInput.onehot);
            });

            // ── Theme toggle ──
            const themeToggle = document.getElementById('themeToggle');
            _toggleTheme = function () {
                const isLight = document.body.classList.toggle('light');
                localStorage.setItem('braille-theme', isLight ? 'light' : 'dark');
                themeToggle.textContent = isLight ? '☀' : '🌙';
                themeToggle.setAttribute('aria-pressed', String(isLight));
            };
            const savedTheme = localStorage.getItem('braille-theme');
            if (savedTheme === 'light') {
                document.body.classList.add('light');
                themeToggle.textContent = '☀';
                themeToggle.setAttribute('aria-pressed', 'true');
            }
            themeToggle.addEventListener('click', _toggleTheme);

            // ── Keyboard toggle button ──
            const btnKbToggle = document.getElementById('btnKbToggle');
            if (btnKbToggle) {
                btnKbToggle.addEventListener('click', () => _toggleKbOverlay());
            }
            const tkbdKbToggle = document.getElementById('tkbd-kbToggle');
            if (tkbdKbToggle) tkbdKbToggle.textContent = 'W';

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

            initForceWelcomeToggle();

            // 省写映射开关（dev panel）
            const omitToneMappingCheck = document.getElementById('omitToneMapping');
            if (omitToneMappingCheck) {
                omitToneMappingCheck.checked = SETTINGS.omitToneMapping !== false;
                omitToneMappingCheck.addEventListener('change', () => {
                    SETTINGS.omitToneMapping = omitToneMappingCheck.checked;
                    saveSettings();
                    renderOutput();
                });
            }

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
            dotInput.renderDots();
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
            document.getElementById('btnPrevPage').addEventListener('click', () => switchToPage(pages.idx - 1));
            document.getElementById('btnNextPage').addEventListener('click', () => switchToPage(pages.idx + 1));

            // ── Resize observer for page recalculation ──
            let _resizeTimer = null;
            new ResizeObserver(() => {
                clearTimeout(_resizeTimer);
                _resizeTimer = setTimeout(() => {
                    if (pages.isActive || outputArea.scrollHeight > outputArea.clientHeight + 2) {
                        invalidatePageCache();
                        renderOutput();
                    }
                }, 200);
            }).observe(outputArea);

            // ── Keyboard overlay ──
            const kbOverlay = document.getElementById('kbIframeOverlay');
            const kbIframeClose = document.getElementById('kbIframeClose');

            window._kbOpenSeqBinding = _startSeqBinding;
            window._kbSpeak = speakText;

            window._kbApplyPreset = function (scope, name) {
                const bindings = window._kbPresetToDotBindings && window._kbPresetToDotBindings(name);
                if (!bindings) return;
                const group = scope === 'numpad' ? 'numpad' : 'keyboard';
                SETTINGS.keyBindings[group] = { ...bindings };
                saveSettings();
                applyKeyBindings();
                updateKeyLabels();
                document.dispatchEvent(new CustomEvent('bindings-changed'));

                const groupLabel = scope === 'numpad' ? '小键盘' : '主键盘';
                const labels = [];
                for (let d = 1; d <= 6; d++) {
                    const code = bindings[d];
                    if (!code) continue;
                    if (code.startsWith('Key')) labels.push(code.slice(3));
                    else if (code.startsWith('Numpad')) labels.push(code.slice(6));
                    else if (code === 'Comma') labels.push('逗号');
                    else if (code === 'Period') labels.push('句号');
                    else labels.push(code);
                }
                speakText('启用' + groupLabel + '键位预设，' + labels.join(' '), SETTINGS.speechRate);
            };

            window._kbUpdateSetting = function (key, value) {
                SETTINGS[key] = value;
                if (key === 'brailleFontSize') applyBrailleFontSize();
                saveSettings();
            };

            window._kbOnDotDrop = function (scope, dot, code) {
                const group = scope === 'numpad' ? 'numpad' : 'keyboard';
                SETTINGS.keyBindings[group][String(dot)] = code;
                saveSettings();
                applyKeyBindings();
                updateKeyLabels();
            };

            window._kbResetDefaults = function () {
                const akbDefault = {};
                for (const [action, cfg] of Object.entries(CONFIGURABLE_ACTIONS)) {
                    akbDefault[action] = cfg.defaultKey;
                }
                SETTINGS.keyBindings = {
                    keyboard: { ...DEFAULT_SETTINGS.keyBindings.keyboard },
                    numpad: { ...DEFAULT_SETTINGS.keyBindings.numpad },
                };
                SETTINGS.actionKeyBindings = { ...akbDefault };
                SETTINGS.speechRate = DEFAULT_SETTINGS.speechRate;
                saveSettings();
                applyKeyBindings();
                applyActionKeyBindings();
                updateKeyLabels();
                renderToolbarKeyLabels();
                syncKeyboard();
                syncKbSettings();
                document.dispatchEvent(new CustomEvent('bindings-changed'));
            };

            function getSettingsData() {
                return {
                    multiSelect: SETTINGS.multiSelect,
                    debounceSpeech: SETTINGS.debounceSpeech,
                    speechRate: SETTINGS.speechRate,
                    brailleFontSize: SETTINGS.brailleFontSize,
                    maxUndoHistory: SETTINGS.maxUndoHistory,
                };
            }
            function syncKbSettings() {
                if (window._kbSyncSettings) window._kbSyncSettings(getSettingsData());
            }

            function getBindingsData() {
                return {
                    keyboard: SETTINGS.keyBindings.keyboard,
                    numpad: SETTINGS.keyBindings.numpad,
                    spaceKey: 'Space',
                    numConfirmKey: 'Numpad0',
                    deleteKey: SETTINGS.actionKeyBindings.delete,
                    backspaceKey: 'Backspace',
                    numDeleteKey: 'NumpadMultiply',
                    clearInputKey: SETTINGS.actionKeyBindings.clearInput,
                    numClearInputKey: 'NumpadDivide',
                };
            }
            function syncKeyboard() {
                if (window._kbApplyBindings) window._kbApplyBindings(getBindingsData());
            }
            function openKbOverlay() {
                kbOverlay.classList.add('open');
                syncKeyboard();
                syncKbSettings();
            }
            function closeKbOverlay() {
                kbOverlay.classList.remove('open');
            }
            _toggleKbOverlay = function () {
                kbOverlay.classList.contains('open') ? closeKbOverlay() : openKbOverlay();
            };

            kbIframeClose.addEventListener('click', closeKbOverlay);

            // 侧边关闭条：hover 显示，点击关闭键盘
            document.getElementById('kbCloseStripLeft')?.addEventListener('click', closeKbOverlay);
            document.getElementById('kbCloseStripRight')?.addEventListener('click', closeKbOverlay);

            // 键位变更后同步到键盘可视化
            document.addEventListener('bindings-changed', syncKeyboard);

            // 初始同步
            syncKeyboard();

            // ── Dev panel ──
            initDevPanel();
        });
});