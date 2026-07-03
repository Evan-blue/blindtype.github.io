// init.js - 初始化入口（ES Module）


import { loadAllMappings } from './loadMappings.js';
import { loadPinyinPro, _initPinyinPro } from './loadModule.js';
import {
    outputItems,
    cursor,
    pages,
    SETTINGS,
    saveSettings,
    loadSettings,
    applyKeyBindings,
    applyActionKeyBindings,
    applyBrailleFontSize,
    KEY_TO_DOT,
    KEY_ACTIONS,
} from './state.js';
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
    updateKeyLabels,
    renderToolbarKeyLabels,
    setActiveKeyGroup,
    clearOutput,
    initBrailleInput,
} from './brailleInput.js';
import {
    outputArea,
    renderOutput,
    invalidatePageCache,
    switchToPage,
    initBrailleOutput,
} from './brailleOutput.js';
import {
    speak,
    readAloud,
} from './brailleSpeech.js';
import { initAudioVisualizer } from './audioVisualizer.js';
import {
    syncSettings,
    initKeyboard,
    openKbOverlay,
    closeKbOverlay,
    toggleKbOverlay,
} from './keyboard.js';
import {
    DEFAULT_SETTINGS,
    KEY_COMBOS,
    keyIdToLabel,
} from './config.js';

import {
    renderActionKeyBindingsUI,
    handleKeyBindingCapture,
    _startSeqBinding,
    resetToDefaults,
    initSettings,
} from './settings.js';
import { mappingPanel, renderMappingTable, toggleMapping } from './panelMapping.js';
import { initHelpTooltips } from './helpTooltip.js';
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
    _keyLabel,
} from './tutorial.js';
import { undo, redo } from './history.js';
import {
    handleOpenFile,
    handleSaveContent,
    initFileOperations,
} from './fileOperations.js';
import { initDevPanel } from './devPanel.js';
import { togglePractice, isPracticeActive, handlePracticeKey, initPractice } from './practice.js';
import { initTheme, toggleTheme } from './theme.js';

// ── ACTION_HANDLERS 的 helper 函数 ──

/**
 * @description: 处理删除操作（根据是否多选以及是否按下 Forward）
 * @param {boolean} isForward 是否为向前删除
 * @return {void}
 */
function _handleDelete(isForward = false) {
    if (SETTINGS.multiSelect && cursor.selectedIndices.size > 0) {
        deleteSelected();
    } else {
        isForward ? deleteForward() : deleteLast();
    }
}

/**
 * @description: 全选所有输出项
 * @return {void}
 */
function _handleSelectAll() {
    if (!SETTINGS.multiSelect) return;
    cursor.selectedIndices.clear();
    for (let i = 0; i < outputItems.length; i++) cursor.selectedIndices.add(i);
    cursor.selAnchor = 0;
    cursor.idx = outputItems.length;
    renderOutput();
    speak.text('已全选');
}

/**
 * @description: 调整语速（增减）
 * @param {number} delta 调整量（正为增加，负为减少）
 * @return {void}
 */
function _handleSpeechRateChange(delta) {
    const newRate = delta > 0
        ? Math.min(4, +(SETTINGS.speechRate + 0.1).toFixed(1))
        : Math.max(0.5, +(SETTINGS.speechRate - 0.1).toFixed(1));
    SETTINGS.speechRate = newRate;
    saveSettings();
    syncSettings({ speechRate: SETTINGS.speechRate });
    speak.text('语速' + SETTINGS.speechRate, SETTINGS.speechRate);
}

/**
 * @description: 将配置中的动作名映射到实际函数调用
 * @type {Record<string, () => void>}
 */
const ACTION_HANDLERS = {
    confirm: () => dotInput.confirm(),
    clearInput: () => dotInput.clear(),
    clearOutput: () => clearOutput(),
    delete: () => _handleDelete(false),
    deleteForward: () => _handleDelete(true),
    selectAll: () => _handleSelectAll(),
    space: () => {
        if (dotInput.isLit) dotInput.confirm();
        else inputSpace();
    },
    cursorLeft: () => moveCursor(-1),
    cursorRight: () => moveCursor(1),
    cursorUp: () => moveCursorUp(),
    cursorDown: () => moveCursorDown(),
    undo: () => undo(),
    redo: () => redo(),
    readAloud: () => readAloud(),
    save: () => handleSaveContent(),
    openFile: () => handleOpenFile(),
    tutorial: () => playTutorial(),
    toggleMapping: () => toggleMapping(),
    customBind: () => _startSeqBinding(),
    toggleKeyboard: () => toggleKbOverlay(),
    toggleTheme: () => toggleTheme(),
    speechRateUp: () => _handleSpeechRateChange(1),
    speechRateDown: () => _handleSpeechRateChange(-1),
    speakBindings: () => { _speakAllBindings(); },
    pageUp: () => { if (pages.isActive) switchToPage(pages.idx - 1); },
    pageDown: () => { if (pages.isActive) switchToPage(pages.idx + 1); },
    togglePractice: () => {
        if (document.getElementById('kbIframeOverlay').classList.contains('open')) closeKbOverlay();
        togglePractice();
    },
};

function dispatchAction(action) {
    const handler = ACTION_HANDLERS[action];
    if (handler) handler();
}

/**
 * @description: 根据按键标识查找并执行对应动作（先查点位键，再查动作键）
 * @param {string} keyId 按键标识
 * @return {boolean} 是否已处理该按键
 */
function tryDispatch(keyId) {
    // 点位键
    if (KEY_TO_DOT[keyId] !== undefined) {
        const dotIdx = KEY_TO_DOT[keyId];
        dotInput.toggle(dotIdx);
        setActiveKeyGroup(keyId);
        return true;
    }
    // 动作键
    const action = KEY_ACTIONS[keyId];
    if (action !== undefined) {
        dispatchAction(action);
        return true;
    }
    return false;
}

function normalizeComboKey(key) {
    if (typeof key !== 'string') return key;
    return key.length === 1 ? key.toLowerCase() : key;
}

function isEditableTarget(target) {
    return !!target && !!target.closest('textarea, input, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]');
}

/**
 * @description: 检查键盘事件是否匹配某个组合键配置
 * @param {KeyboardEvent} e 键盘事件
 * @return {string|null} 匹配到的动作名，无匹配返回 null
 */
function matchCombo(e) {
    const eventKey = normalizeComboKey(e.key);
    for (const combo of KEY_COMBOS) {
        if ((combo.ctrl === undefined || combo.ctrl === e.ctrlKey) &&
            (combo.alt === undefined || combo.alt === e.altKey) &&
            (combo.shift === undefined || combo.shift === e.shiftKey) &&
            normalizeComboKey(combo.key) === eventKey) {
            return combo.action;
        }
    }
    return null;
}




document.addEventListener('DOMContentLoaded', () => {
    // ── pinyin 分支：并行加载模块 → 后台拉字典 ──
    loadPinyinPro().then(() => _initPinyinPro());

    // ── Internal init helpers ──

    function _applySettings() {
        loadSettings();
        applyBrailleFontSize();
        applyKeyBindings();
        applyActionKeyBindings();
        renderActionKeyBindingsUI(document.getElementById('actionKeyBindings'));
        renderToolbarKeyLabels();
    }

    function _initHeaderButtons() {
        const btnKbToggle = document.getElementById('btnKbToggle');
        if (btnKbToggle) {
            btnKbToggle.addEventListener('click', () => toggleKbOverlay());
        }
        const tkbdKbToggle = document.getElementById('tkbd-kbToggle');
        if (tkbdKbToggle) tkbdKbToggle.textContent = 'W';

        const btnTutorial = document.getElementById('btnTutorial');
        btnTutorial.addEventListener('click', () => playTutorial());
        btnTutorial.addEventListener('mouseenter', () => speak.immediate('打开/关闭新手教程'));

        const btnReadAloud = document.getElementById('btnReadAloud');
        if (btnReadAloud) {
            btnReadAloud.addEventListener('click', readAloud);
        }

        const btnClearAll = document.getElementById('btnClearAll');
        if (btnClearAll) {
            btnClearAll.addEventListener('click', clearOutput);
        }
    }

    function _initKeydownHandler() {
        document.addEventListener('keydown', (e) => {
            // 焦点在可编辑控件上时不拦截按键（正常输入模式）
            if (isEditableTarget(e.target)) return;
            // 焦点在 button 上时不拦截 Enter（让原生 button 处理）；Space 不在此列——空格键用于盲文输入
            if (e.target.closest('button') && e.key === 'Enter') return;

            // 欢迎遮罩键盘选择：Escape 跳过，其他任意键确认
            if (_welcomeActive) {
                e.preventDefault();
                if (e.key === 'Escape') { welcomeSkip(); }
                else { welcomeConfirm(); }
                return;
            }

            // 键位设置捕获优先（监听模式下拦截所有按键）
            if (handleKeyBindingCapture(e)) return;

            // 练习快捷键 Ctrl+Shift+E（直接检测，避免IME/浏览器拦截）
            if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
                e.preventDefault();
                if (document.getElementById('kbIframeOverlay').classList.contains('open')) closeKbOverlay();
                togglePractice();
                return;
            }

            // 组合键优先（须在教程G/H导航之前，避免Ctrl+Shift+H被H拦截）
            const comboAction = matchCombo(e);
            if (comboAction) {
                e.preventDefault();
                dispatchAction(comboAction);
                return;
            }

            // 练习模式：拦截点位键和动作键
            if (isPracticeActive() && handlePracticeKey(e)) { e.preventDefault(); return; }

            // 教程播放中：G/H 切换章节
            if (handleTutorialNavigation(e.code)) { e.preventDefault(); return; }

            // 面板焦点陷阱：Tab 在打开的面板内循环
            if (e.key === 'Tab') {
                const openPanel = document.querySelector('.mapping-slide.open, .welcome-mask.active');
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
                if (document.getElementById('kbIframeOverlay').classList.contains('open')) { closeKbOverlay(); e.preventDefault(); return; }
                if (handleTutorialEscape()) { e.preventDefault(); return; }
                if (mappingPanel.slide.classList.contains('open') && !mappingPanel.pinLit) { mappingPanel.close(); e.preventDefault(); return; }
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
    }

    // ── 主页面分支 ──
    loadAllMappings()
        .then(() => {
            _applySettings();

            // ── Fill key-label from config ──
            updateKeyLabels();

            // ── Panel initialization ──
            mappingPanel.init();
            renderMappingTable();
            initHelpTooltips();
            initSettings();

            // ── Init submodule event handlers ──
            initBrailleOutput();
            initFileOperations();

            // ── Welcome mask for first-time visitors ──
            initWelcome();

            _initKeydownHandler();

            // ── Dot-cell clicks & keyboard ──
            initBrailleInput();

            // ── Action bar clicks (直接调用动作，不走键位查找)
            document.getElementById('actionBar').addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action]');
                if (!btn) return;
                dispatchAction(btn.dataset.action);
            });

            // ── Theme ──
            initTheme();

            _initHeaderButtons();

            initForceWelcomeToggle();

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

            // ── 分页重检：字体大小调整结束后触发（防快速拖拽）──
            let _fontSizeTimer = null;
            function _handleKbSettingChange(key, value) {
                SETTINGS[key] = value;
                if (key === 'brailleFontSize') {
                    applyBrailleFontSize();
                    clearTimeout(_fontSizeTimer);
                    _fontSizeTimer = setTimeout(() => {
                        if (pages.isActive || outputArea.scrollHeight > outputArea.clientHeight + 2) {
                            invalidatePageCache();
                            renderOutput();
                        }
                    }, 500);
                }
                saveSettings();
            }

            // ── 键盘面板设置变更 / 序列绑定 / 播报键位 ──
            function _speakAllBindings() {
                const kb = SETTINGS.keyBindings.keyboard || {};
                const nkb = SETTINGS.keyBindings.numpad || {};
                const kbdParts = [];
                const numParts = [];
                for (let d = 1; d <= 6; d++) {
                    if (kb[d]) kbdParts.push(_keyLabel(kb[d]));
                    if (nkb[d]) numParts.push(_keyLabel(nkb[d]).replace('小键盘', ''));
                }
                const msg = '主键盘点位键：' + kbdParts.join('、') + '。小键盘点位键：' + numParts.join('、') + '。';
                speak.text(msg, SETTINGS.speechRate);
            }

            document.addEventListener('kb-setting-change', (e) => {
                _handleKbSettingChange(e.detail.key, e.detail.value);
            });

            document.addEventListener('kb-open-seq-binding', () => {
                _startSeqBinding();
            });

            document.addEventListener('kb-speak-all-bindings', () => {
                _speakAllBindings();
            });

            // 初始化键盘模块（含 overlay 管理 + 初始同步）
            initKeyboard();

            // ── Dev panel ──
            initDevPanel();

            // ── Practice ──
            initPractice();

            // ── Audio visualizer ──
            initAudioVisualizer();
        });
});