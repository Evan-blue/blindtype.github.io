// practice.js - 练习模式 (ES Module)

import { DOT_TO_KEY, KEY_TO_DOT, KEY_ACTIONS, SETTINGS } from './state.js';
import { playBeep } from './brailleSpeech.js';
import { speak } from './brailleSpeech.js';
import { keyIdToLabel } from './config.js';
import { dotsToBrailleChar } from './utils-braille.js';
import { _lookupBraille, ONEHOT_MAPPINGS } from './loadMappings.js';

// ── 题库 ──
const questionBanks = { number: [], english: [], pinyin: [], punc: [] };

function buildQuestionBanks() {
    const cats = ONEHOT_MAPPINGS.categories;
    if (!cats || !cats.length) return;
    for (const cat of cats) {
        if (cat.name === '数字') {
            for (const e of cat.entries) questionBanks.number.push(e);
        } else if (cat.name === '英文字母') {
            for (const e of cat.entries) questionBanks.english.push(e);
        } else if (cat.name === '声母' || cat.name === '韵母') {
            for (const e of cat.entries) questionBanks.pinyin.push(e);
        } else if (cat.name === '标点') {
            for (const e of cat.entries) {
                if (!e.hidden) questionBanks.punc.push(e);
            }
        }
    }
}

const overlay = document.getElementById('practiceOverlay');
const targetGrid = document.getElementById('practiceTargetGrid');
const inputGrid = document.getElementById('practiceInputGrid');
const targetPreview = document.getElementById('practiceTargetPreview');
const targetWriting = document.querySelector('#practiceTargetBraille .braille-writing');
const targetReading = document.querySelector('#practiceTargetBraille .braille-reading');
const targetDots = document.getElementById('practiceTargetDots');
const targetLabel = document.getElementById('practiceTargetLabel');
const inputPreview = document.getElementById('practiceInputPreview');
const inputWriting = document.querySelector('#practiceInputBraille .braille-writing');
const inputReading = document.querySelector('#practiceInputBraille .braille-reading');
const inputDots = document.getElementById('practiceInputDots');
const inputLabel = document.getElementById('practiceInputLabel');
const closeBtn = document.getElementById('practiceClose');
const closeLeft = document.getElementById('practiceCloseLeft');
const closeRight = document.getElementById('practiceCloseRight');

// DOM 就绪前调用则跳过
if (!overlay) throw new Error('Practice overlay DOM not found');

// ── 状态 ──
const state = {
    topic: 'number',
    currentQuestion: null,
    inputCells: [[0, 0, 0, 0, 0, 0]],  // 二维：每个元素是一个盲文方
    currentCell: 0,
    questionCells: [],  // 题目的 oneHot 按 + 拆分，长度即格数
    score: 0,
    total: 0,
    _active: false,
    _debounceTimer: null,
    _DEBOUNCE_MS: 500,
};

function getCurrentInput() {
    return state.inputCells[state.currentCell] || [0, 0, 0, 0, 0, 0];
}

function getCurrentQuestionOH() {
    return state.questionCells[state.currentCell] || '000000';
}

function cellCount() {
    return state.questionCells.length || 1;
}

// ── 生成随机题目 ──
function nextQuestion() {
    clearTimeout(state._debounceTimer);
    const bank = questionBanks[state.topic];
    if (!bank || !bank.length) {
        state.currentQuestion = null;
        return;
    }
    const entry = bank[Math.floor(Math.random() * bank.length)];
    state.currentQuestion = entry;
    state.questionCells = entry.oneHot.split('+');
    state.currentCell = 0;
    state.inputCells = state.questionCells.map(() => [0, 0, 0, 0, 0, 0]);
    renderTarget();
    renderInput();
    speakQuestion(state.currentQuestion);
}

function speakQuestion(entry) {
    if (!entry) return;
    if (state.topic === 'english' && entry.char) {
        speak.text(entry.char[0]);
    } else {
        speak.text(entry.audio || entry.label || entry.char);
    }
}

// ── 辅助：oneHot 转点位描述文本 ──
function dotsDescription(oneHot) {
    const parts = [];
    for (let i = 0; i < 6; i++) {
        if (oneHot[i] === '1') parts.push(i + 1);
    }
    return parts.length ? '点位 ' + parts.join(' ') : '';
}

// 写方盲文：左右列镜像 [d4,d5,d6,d1,d2,d3]
function writingBrailleChar(dots) {
    return dotsToBrailleChar([dots[3], dots[4], dots[5], dots[0], dots[1], dots[2]]);
}

function readingBrailleChar(dots) {
    return dotsToBrailleChar(dots);
}

// ── 渲染目标点位（只读展示）──
function renderTarget() {
    const cells = targetGrid.querySelectorAll('.dot-cell');
    const entry = state.currentQuestion;
    const oh = getCurrentQuestionOH();
    cells.forEach(cell => {
        const idx = parseInt(cell.dataset.idx, 10);
        cell.classList.toggle('active', oh[idx - 1] === '1');
    });
    const dots = oh.split('').map(Number);
    const charWrite = writingBrailleChar(dots);
    const charRead = readingBrailleChar(dots);
    // 多格题目预览：拼接所有格的盲文字符
    let allWrite = '', allRead = '';
    for (const qoh of state.questionCells) {
        const qd = qoh.split('').map(Number);
        allWrite += writingBrailleChar(qd);
        allRead += readingBrailleChar(qd);
    }
    // 单格就用当前格的，多格用拼接的
    if (state.questionCells.length > 1) {
        targetWriting.textContent = allWrite;
        targetReading.textContent = allRead;
    } else {
        targetWriting.textContent = charWrite;
        targetReading.textContent = charRead;
    }
    let dotsText = dotsDescription(oh);
    if (state.questionCells.length > 1) {
        dotsText += ' | 第 ' + (state.currentCell + 1) + '/' + state.questionCells.length + ' 格';
    }
    targetDots.textContent = dotsText;
    let labelText = '';
    if (entry) {
        if (state.topic === 'english') {
            labelText = entry.char ? entry.char[0] : (entry.label || '');
        } else if (state.topic === 'number' && entry.char === '数号') {
            labelText = '数号';
        } else {
            labelText = entry.label || entry.char;
        }
    }
    targetLabel.textContent = labelText || ' ';
    targetPreview.classList.toggle('empty', !entry);
}

// ── 渲染用户输入点位 ──
function renderInput() {
    const cells = inputGrid.querySelectorAll('.dot-cell');
    const cur = getCurrentInput();
    cells.forEach(cell => {
        const idx = parseInt(cell.dataset.idx, 10);
        cell.classList.toggle('active', cur[idx - 1] === 1);
    });
    const hasInput = cur.some(d => d);
    const charWrite = hasInput ? writingBrailleChar(cur) : '⠀';
    const charRead = hasInput ? readingBrailleChar(cur) : '⠀';
    inputWriting.textContent = charWrite;
    inputReading.textContent = charRead;
    let dotsText = hasInput ? dotsDescription(cur.join('')) : '';
    // 多格：拼接所有已输入格的预览，加格指示
    if (state.questionCells.length > 1) {
        let allWrite = '', allRead = '';
        for (const ic of state.inputCells) {
            const any = ic.some(d => d);
            allWrite += any ? writingBrailleChar(ic) : '⠀';
            allRead += any ? readingBrailleChar(ic) : '⠀';
        }
        inputWriting.textContent = allWrite;
        inputReading.textContent = allRead;
        dotsText += ' | 第 ' + (state.currentCell + 1) + '/' + state.questionCells.length + ' 格';
    }
    inputDots.textContent = dotsText;
    inputLabel.textContent = ' ';
    inputPreview.classList.toggle('empty', !state.inputCells.some(ic => ic.some(d => d)));
}

// ── 防抖查询：查找当前输入的盲文映射 ──
function debouncedLookup() {
    if (!state._active) return;
    const cur = getCurrentInput();
    const oneHot = cur.join('');
    const hasInput = cur.some(d => d);
    const charWrite = hasInput ? writingBrailleChar(cur) : '⠀';
    let charRead = hasInput ? readingBrailleChar(cur) : '⠀';
    let labelText = '';
    let speechText = '';
    if (hasInput) {
        if (state.topic === 'number') {
            const obj = ONEHOT_MAPPINGS.number?.[oneHot];
            if (obj) {
                labelText = obj.label || obj.char;
                speechText = obj.audio || labelText;
            }
        } else if (state.topic === 'english') {
            const letterEntry = ONEHOT_MAPPINGS.letter?.[oneHot];
            if (letterEntry) {
                labelText = letterEntry.char ? letterEntry.char[0] : (letterEntry.label || '');
                speechText = letterEntry.audio || labelText;
            }
        } else {
            const entry = _lookupBraille(oneHot);
            if (entry) {
                charRead = readingBrailleChar(entry.oneHot.split('').map(Number));
                labelText = entry.label || entry.char;
                speechText = entry.audio || labelText;
            }
        }
    }
    inputWriting.textContent = charWrite;
    inputReading.textContent = charRead;
    let dotsText = hasInput ? dotsDescription(oneHot) : '';
    if (state.questionCells.length > 1) {
        // 保持多格预览
        let allWrite = '', allRead = '';
        for (const ic of state.inputCells) {
            const any = ic.some(d => d);
            allWrite += any ? writingBrailleChar(ic) : '⠀';
            allRead += any ? readingBrailleChar(ic) : '⠀';
        }
        inputWriting.textContent = allWrite;
        inputReading.textContent = allRead;
        dotsText += ' | 第 ' + (state.currentCell + 1) + '/' + state.questionCells.length + ' 格';
    }
    inputDots.textContent = dotsText;
    inputLabel.textContent = labelText || ' ';
    inputPreview.classList.toggle('empty', !state.inputCells.some(ic => ic.some(d => d)));
    if (hasInput && SETTINGS.debounceSpeech && speechText) {
        // speak.text(speechText);
    }
}

// ── 检查是否匹配 ──
function getInputOneHot() {
    return state.inputCells.map(c => c.join('')).join('+');
}

function isMatch() {
    return state.currentQuestion && getInputOneHot() === state.currentQuestion.oneHot;
}

// ── 匹配成功 ──
function onCorrect() {
    state.score++;
    state.total++;

    // 成功蜂鸣：两个短促的上行音
    playBeep(880, 60);
    setTimeout(() => playBeep(1100, 80), 80);

    // 播报正确点位（所有格）
    const dotParts = [];
    for (let ci = 0; ci < state.inputCells.length; ci++) {
        const nums = [];
        for (let i = 0; i < 6; i++) {
            if (state.inputCells[ci][i]) nums.push(i + 1);
        }
        if (nums.length) dotParts.push('点位 ' + nums.join(' '));
    }
    const entry = state.currentQuestion;
    let name = '';
    if (state.topic === 'number') {
        name = entry.char === '数号' ? '数号' : '数字' + (entry.label || entry.char);
    } else if (state.topic === 'english') {
        name = entry.char ? '字母' + entry.char[0] : (entry.label || '');
    } else {
        name = entry.label || entry.char;
    }
    speak.text('正确！' + name + '，' + dotParts.join(' '), null, {
        onend: () => nextQuestion()
    });
}

// ── 切换用户输入点位 ──
function toggleInputDot(idx) {
    if (!state._active) return;
    const cur = getCurrentInput();
    cur[idx - 1] = cur[idx - 1] ? 0 : 1;
    renderInput();

    const freq = cur[idx - 1] ? 880 : 440;
    playBeep(freq, 50);

    // 防抖查询
    clearTimeout(state._debounceTimer);
    state._debounceTimer = setTimeout(() => debouncedLookup(), state._DEBOUNCE_MS);

    if (isMatch()) {
        onCorrect();
    }
}

// ── 切换到下一格（多格题目用）──
function nextCell() {
    if (state.currentCell < state.questionCells.length - 1) {
        state.currentCell++;
        renderTarget();
        renderInput();
        playBeep(660, 50);
    }
}

// ── 切换到上一格 ──
function prevCell() {
    if (state.currentCell > 0) {
        state.currentCell--;
        renderTarget();
        renderInput();
        playBeep(440, 50);
    }
}

// ── 清空当前格输入 ──
function clearInput() {
    if (!state._active) return;
    clearTimeout(state._debounceTimer);
    state.inputCells[state.currentCell] = [0, 0, 0, 0, 0, 0];
    renderInput();
    playBeep(440, 50);
}

// ── 撤销当前格最近一个点位，或跳到上一格 ──
function clearLastDot() {
    if (!state._active) return;
    clearTimeout(state._debounceTimer);
    const cur = getCurrentInput();
    for (let i = 5; i >= 0; i--) {
        if (cur[i]) {
            cur[i] = 0;
            renderInput();
            playBeep(440, 50);
            return;
        }
    }
    // 当前格已空，跳到上一格
    prevCell();
}

// ── 打开/关闭 ──
function openPractice() {
    buildQuestionBanks();
    state._active = true;
    state.score = 0;
    state.total = 0;
    state.topic = 'number';
    // 同步 topic bar 激活状态
    const tabs = document.querySelectorAll('.practice-topic-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.topic === state.topic));
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    nextQuestion();
}

const TOPIC_ORDER = ['number', 'english', 'pinyin', 'punc'];

function cycleTopic() {
    const idx = TOPIC_ORDER.indexOf(state.topic);
    const next = TOPIC_ORDER[(idx + 1) % TOPIC_ORDER.length];
    state.topic = next;
    state.score = 0;
    state.total = 0;
    clearTimeout(state._debounceTimer);
    document.querySelectorAll('.practice-topic-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.topic === next);
    });
    speak.text(TOPIC_NAMES[next] || next, null, {
        onend: () => nextQuestion()
    });
}

function switchTopic(topic) {
    if (state.topic === topic) return;
    state.topic = topic;
    state.score = 0;
    state.total = 0;
    clearTimeout(state._debounceTimer);
    speak.text(TOPIC_NAMES[topic] || topic, null, {
        onend: () => nextQuestion()
    });
}

const TOPIC_NAMES = { number: '数字', english: '英文', pinyin: '拼音', punc: '标点' };

function closePractice() {
    state._active = false;
    clearTimeout(state._debounceTimer);
    state.inputCells = [[0, 0, 0, 0, 0, 0]];
    state.currentCell = 0;
    state.questionCells = [];
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    speak.text('练习结束');
}

export function togglePractice() {
    if (overlay.classList.contains('open')) {
        closePractice();
    } else {
        openPractice();
    }
}

export function isPracticeActive() {
    return state._active;
}

// ── 初始化 ──
function init() {
    // 目标网格的点击不做任何事（只读展示）
    targetGrid.addEventListener('click', (e) => {
        const cell = e.target.closest('.dot-cell');
        if (cell && state.currentQuestion) speakQuestion(state.currentQuestion);
    });

    // 用户输入网格的点击
    inputGrid.querySelectorAll('.dot-cell').forEach(cell => {
        cell.addEventListener('click', () => {
            toggleInputDot(parseInt(cell.dataset.idx, 10));
            cell.blur();
        });
    });

    // 关闭按钮
    closeBtn.addEventListener('click', closePractice);
    closeLeft.addEventListener('click', closePractice);
    closeRight.addEventListener('click', closePractice);

    // 主题切换 tab
    document.querySelectorAll('.practice-topic-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const topic = tab.dataset.topic;
            if (!topic || topic === state.topic) return;
            document.querySelectorAll('.practice-topic-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            switchTopic(topic);
        });
    });

    // 更新键位标签
    updatePracticeKeyLabels();
    window.addEventListener('bindings-changed', updatePracticeKeyLabels);
}

// ── 同步键位标签到练习面板 ──
function updatePracticeKeyLabels() {
    [targetGrid, inputGrid].forEach(grid => {
        grid.querySelectorAll('.dot-cell').forEach(cell => {
            const idx = parseInt(cell.dataset.idx, 10);
            const label = cell.querySelector('.key-label');
            if (!label) return;
            const kbdKey = DOT_TO_KEY[idx];
            if (kbdKey) {
                label.textContent = keyIdToLabel(kbdKey);
            }
        });
    });
}

// ── 处理练习模式下的按键 ──
// 返回 true 表示已处理（调用方应该 e.preventDefault() 并 return）
export function handlePracticeKey(e) {
    if (!state._active) return false;

    // Ctrl/Meta 组合键放行（浏览器快捷键如 Ctrl+Shift+C 等）
    if (e.ctrlKey || e.metaKey) return false;

    // 点位键
    if (e.code in KEY_TO_DOT) {
        const dotIdx = KEY_TO_DOT[e.code];
        toggleInputDot(dotIdx);
        return true;
    }

    // 主键盘数字键1-6
    if (e.code >= 'Digit1' && e.code <= 'Digit6') {
        toggleInputDot(parseInt(e.code.slice(-1), 10));
        return true;
    }

    // 清除输入（单格：清空当前格；多格：Space 进下一格）
    if (e.code === 'Space' || e.code === 'Numpad0') {
        if (state.questionCells.length > 1) {
            nextCell();
        } else {
            clearInput();
        }
        return true;
    }
    if (e.code === 'KeyY' || e.code === 'NumpadDivide' || e.code === 'KeyC') {
        clearInput();
        return true;
    }

    // Backspace 撤销最近一个点位（当前格空时跳到上一格）
    if (e.code === 'Backspace' || e.code === 'NumpadMultiply') {
        clearLastDot();
        return true;
    }

    // Escape 关闭
    if (e.key === 'Escape') {
        closePractice();
        return true;
    }

    // Tab 切换练习主题
    if (e.code === 'Tab') {
        cycleTopic();
        return true;
    }

    // 重新播报当前题目
    if (e.code === 'KeyR') {
        speakQuestion(state.currentQuestion);
        return true;
    }

    // 其他点位/动作键拦截，防止触发 dotInput
    if (e.code in KEY_ACTIONS) return true;
    if (e.code.startsWith('Arrow')) return true;
    if (e.code === 'KeyG' || e.code === 'KeyH') return true;

    return false;
}

// ── 导出供 init.js 使用 ──
export { openPractice, closePractice };

init();
