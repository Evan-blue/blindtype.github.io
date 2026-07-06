// practice.js - 练习模式 (ES Module)

import { DOT_TO_KEY, KEY_TO_DOT, KEY_ACTIONS, SETTINGS } from './state.js';
import { playBeep, speak, stopPracticeSpeech, isPracticeSpeechActive } from './brailleSpeech.js';
import { keyIdToLabel } from './config.js';
import { dotsToBrailleChar, toOneHot } from './utils-braille.js';
import { _lookupBraille, ONEHOT_MAPPINGS } from './loadMappings.js';
import { pinyinToSpokenChar, chineseToPinyin } from './utils-pinyin.js';

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
    difficulty: 'basic',
    currentQuestion: null,
    inputCells: [[0, 0, 0, 0, 0, 0]],  // 二维：每个元素是一个盲文方
    currentCell: 0,
    questionCells: [],  // 题目的 oneHot 按 + 拆分，长度即格数
    score: 0,
    total: 0,
    _active: false,
    _debounceTimer: null,
    _DEBOUNCE_MS: 500,
    _correctPending: false,  // 答对后、TTS 开始前的窗口期
    _speechTimer: null,
    _modeTimer: null,   // 模式切换防抖：停止切换 1s 后才加载题目
};

// ── 高级模式辅助映射 ──
const NUMBER_SIGN_OH = '001111';
const DECIMAL_POINT_OH = '010000';
const LOWERCASE_SIGN_OH = '000011';

let _digitToOH = null;   // { '0': '010110', '1': '100000', ... }
let _letterToOH = null;  // { 'a': '100000', 'b': '110000', ... }

function _ensureAdvancedMaps() {
    if (_digitToOH && _letterToOH) return;
    _digitToOH = {};
    _letterToOH = {};
    const numMap = ONEHOT_MAPPINGS.number || {};
    for (const [oh, entry] of Object.entries(numMap)) {
        const ch = entry.char;
        if (ch === '数号' || ch === '.') continue;
        _digitToOH[ch] = oh;
    }
    const letterMap = ONEHOT_MAPPINGS.letter || {};
    for (const [oh, entry] of Object.entries(letterMap)) {
        const ch = entry.char;
        if (!ch || ch.length < 2) continue;
        _letterToOH[ch[1]] = oh; // 小写字母
    }
}

// ── 高级模式：随机数字 → 盲文 ──
function generateAdvancedNumber() {
    _ensureAdvancedMaps();
    let numStr;
    if (Math.random() < 0.3) {
        // 2位小数
        const intPart = Math.floor(Math.random() * 100);
        const fracPart = Math.floor(Math.random() * 90 + 10);
        numStr = intPart + '.' + fracPart;
    } else {
        // 0~100 整数
        numStr = String(Math.floor(Math.random() * 101));
    }
    const cells = [NUMBER_SIGN_OH];
    for (const ch of numStr) {
        if (ch === '.') {
            cells.push(DECIMAL_POINT_OH);
        } else {
            cells.push(_digitToOH[ch]);
        }
    }
    return {
        oneHot: cells.join('+'),
        char: numStr,
        label: numStr,
        audio: numStr,
    };
}

// ── 高级模式：日常单词 → 盲文 ──
const DAILY_WORDS = [
    'the', 'be', 'to', 'of', 'and', 'in', 'that', 'have', 'it', 'is',
    'for', 'not', 'on', 'with', 'he', 'as', 'you', 'do', 'at', 'this',
    'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her', 'she', 'or',
    'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so',
    'up', 'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when',
    'make', 'can', 'like', 'time', 'no', 'just', 'him', 'know', 'take', 'people',
    'into', 'year', 'your', 'good', 'some', 'could', 'them', 'see', 'other', 'than',
    'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think', 'also', 'back',
    'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
    'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us',
];

function generateAdvancedEnglish() {
    _ensureAdvancedMaps();
    const word = DAILY_WORDS[Math.floor(Math.random() * DAILY_WORDS.length)];
    const cells = [LOWERCASE_SIGN_OH];
    for (const ch of word) {
        const oh = _letterToOH[ch];
        if (oh) cells.push(oh);
    }
    return {
        oneHot: cells.join('+'),
        char: word,
        label: word,
        audio: word,
    };
}

// ── 高级模式：汉字/词语/成语 → 盲文 ──
const PINYIN_CHARS = [
    '我', '你', '他', '她', '是', '的', '了', '在', '不', '有',
    '人', '大', '小', '上', '下', '中', '国', '家', '学', '生',
    '好', '来', '去', '看', '说', '想', '做', '能', '会', '要',
    '对', '这', '那', '个', '和', '也', '就', '都', '很', '把',
    '被', '从', '到', '得', '地', '出', '过', '还', '没', '时',
    '年', '月', '日', '天', '水', '火', '山', '花', '马', '鸟',
    '鱼', '红', '黄', '蓝', '白', '黑', '手', '口', '目', '耳',
    '心', '头', '走', '跑', '吃', '喝', '买', '卖', '高', '长',
];

const PINYIN_WORDS = [
    '我们', '他们', '自己', '什么', '怎么', '可以', '因为', '所以',
    '但是', '如果', '虽然', '而且', '不过', '已经', '正在', '没有',
    '所有', '知道', '喜欢', '觉得', '东西', '时候', '地方', '问题',
    '事情', '生活', '工作', '学习', '朋友', '孩子', '老师', '同学',
    '父母', '电脑', '手机', '电影', '音乐', '游戏', '衣服', '天气',
    '世界', '中国', '今天', '明天', '昨天', '早上', '晚上', '下午',
    '吃饭', '睡觉', '开车', '说话', '回家', '帮忙',
];

const PINYIN_IDIOMS = [
    '春暖花开', '一帆风顺', '心想事成', '万事如意', '马到成功',
    '龙马精神', '步步高升', '年年有余', '花好月圆', '风和日丽',
    '风调雨顺', '国泰民安', '天下太平', '喜气洋洋', '蒸蒸日上',
    '欣欣向荣', '百发百中', '十全十美', '天长地久', '海阔天空',
    '鸟语花香', '开门见山', '大吉大利', '红红火火', '平平安安',
];

function generateAdvancedPinyin() {
    const r = Math.random();
    let text;
    if (r < 0.35) {
        text = PINYIN_CHARS[Math.floor(Math.random() * PINYIN_CHARS.length)];
    } else if (r < 0.75) {
        text = PINYIN_WORDS[Math.floor(Math.random() * PINYIN_WORDS.length)];
    } else {
        text = PINYIN_IDIOMS[Math.floor(Math.random() * PINYIN_IDIOMS.length)];
    }
    const items = toOneHot.chinese(text);
    const oneHot = items
        .filter(x => x.oneHot !== '000000')
        .map(x => x.oneHot)
        .join('+');
    const pyArr = chineseToPinyin(text, { toneType: 'num', type: 'array' });
    return {
        oneHot,
        char: text,
        label: text,
        audio: pyArr.join(' '),
    };
}

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
    clearTimeout(state._speechTimer);
    clearTimeout(state._modeTimer);
    state._correctPending = false;
    state._speechTimer = null;
    state._modeTimer = null;

    let entry;
    if (state.difficulty === 'advanced') {
        if (state.topic === 'number') {
            entry = generateAdvancedNumber();
        } else if (state.topic === 'english') {
            entry = generateAdvancedEnglish();
        } else if (state.topic === 'pinyin') {
            entry = generateAdvancedPinyin();
        } else {
            entry = _pickFromBank();
        }
    } else {
        entry = _pickFromBank();
    }

    if (!entry) {
        state.currentQuestion = null;
        return;
    }
    state.currentQuestion = entry;
    state.questionCells = entry.oneHot.split('+');
    state.currentCell = 0;
    state.inputCells = state.questionCells.map(() => [0, 0, 0, 0, 0, 0]);
    renderTarget();
    renderInput();
    speakQuestion(state.currentQuestion);
}

function _pickFromBank() {
    const bank = questionBanks[state.topic];
    if (!bank || !bank.length) return null;
    const pool = state.currentQuestion && bank.length > 1
        ? bank.filter(e => e !== state.currentQuestion)
        : bank;
    return pool[Math.floor(Math.random() * pool.length)];
}

function speakQuestion(entry) {
    if (!entry) return;
    if (state.topic === 'english' && entry.char) {
        if (state.difficulty === 'advanced') {
            speak.text(entry.audio || entry.char);
        } else {
            speak.text(entry.char[0]);
        }
    } else if (state.topic === 'pinyin') {
        if (state.difficulty === 'advanced') {
            speak.text(entry.char || entry.label);
        } else {
            const raw = entry.audio || entry.label || entry.char;
            speak.text(pinyinToSpokenChar(raw) || raw);
        }
    } else if (state.topic === 'punc') {
        speak.text(entry.audio || entry.label || entry.char);
    } else {
        speak.text(entry.audio || entry.label || entry.char);
    }
}

function _speakAnswer() {
    const entry = state.currentQuestion;
    if (!entry) return;
    const dotParts = [];
    for (const qoh of state.questionCells) {
        const nums = [];
        for (let i = 0; i < 6; i++) {
            if (qoh[i] === '1') nums.push(i + 1);
        }
        if (nums.length) dotParts.push('点位 ' + nums.join(' '));
    }
    let name = '';
    if (state.topic === 'number') {
        name = entry.char === '数号' ? '数号' : '数字' + (entry.label || entry.char);
    } else if (state.topic === 'english') {
        if (state.difficulty === 'advanced') {
            name = entry.char || entry.label;
        } else {
            name = entry.char ? '字母' + entry.char[0] : (entry.label || '');
        }
    } else if (state.topic === 'pinyin' && state.difficulty === 'advanced') {
        name = entry.char || entry.label;
    } else {
        const raw = entry.audio || entry.label || entry.char;
        name = pinyinToSpokenChar(raw) || raw;
    }
    speak.text(name + '，' + dotParts.join(' '));
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
            if (state.difficulty === 'advanced') {
                labelText = entry.char || entry.label;
            } else {
                labelText = entry.char ? entry.char[0] : (entry.label || '');
            }
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
    if (hasInput && SETTINGS.debounceSpeech) {
        if (state.topic === 'number') {
            speak.braille(oneHot, undefined, { forceNumber: true });
        } else if (state.topic === 'pinyin') {
            speak.braille(oneHot);
        } else if (speechText) {
            speak.text(speechText);
        }
    }
}

// ── 检查是否匹配 ──
function getInputOneHot() {
    return state.inputCells.map(c => c.join('')).join('+');
}

function isMatch() {
    return state.currentQuestion && getInputOneHot() === state.currentQuestion.oneHot;
}

function isCurrentCellMatch() {
    const cur = getCurrentInput().join('');
    const qoh = getCurrentQuestionOH();
    return cur !== '000000' && cur === qoh;
}

// ── 组合盲文逐格反馈 ──
// ── 获取当前格的名称（用于逐格反馈播报）──
function _cellName(oneHot) {
    if (state.topic === 'number') {
        const obj = ONEHOT_MAPPINGS.number?.[oneHot];
        if (!obj) return '';
        if (obj.char === '数号') return '数号';
        if (obj.char === '.') return '小数点';
        return '数字' + obj.label;
    }
    if (state.topic === 'english') {
        const obj = ONEHOT_MAPPINGS.letter?.[oneHot];
        if (!obj) return '';
        if (!obj.char) return obj.label; // 大小写符号
        return '字母' + obj.char[0];
    }
    const entry = _lookupBraille(oneHot);
    if (!entry) return '';
    // 拼音/标点：声母韵母直接用label，声调转中文
    if (oneHot === '100000') return '1声';
    if (oneHot === '010000') return '2声';
    if (oneHot === '001000') return '3声';
    if (oneHot === '011000') return '4声';
    return entry.label || entry.char;
}

function onCellCorrect() {
    clearTimeout(state._debounceTimer);
    // 简短成功蜂鸣
    playBeep(1047, 60);
    setTimeout(() => playBeep(1319, 80), 60);

    const idx = state.currentCell;
    const oh = state.inputCells[idx].join('');
    const name = _cellName(oh);
    // 立即切到下一方，语音后台播报，不阻塞输入
    nextCell();
    speak.practice('第' + (idx + 1) + '方，' + (name || '') + '，正确');
}

// ── 匹配成功 ──
function onCorrect() {
    clearTimeout(state._debounceTimer);
    state.score++;
    state.total++;

    // 成功蜂鸣：大三和弦上行琶音
    playBeep(880, 80);
    setTimeout(() => playBeep(1109, 80), 80);
    setTimeout(() => playBeep(1319, 120), 160);

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
        if (state.difficulty === 'advanced') {
            name = entry.char || entry.label;
        } else {
            name = entry.char ? '字母' + entry.char[0] : (entry.label || '');
        }
    } else if (state.topic === 'pinyin' && state.difficulty === 'advanced') {
        name = entry.char || entry.label;
    } else {
        const raw = entry.audio || entry.label || entry.char;
        name = pinyinToSpokenChar(raw) || raw;
    }
    state._correctPending = true;
    state._speechTimer = setTimeout(() => {
        state._speechTimer = null;
        speak.practice('正确！' + name + '，' + dotParts.join(' '), null, {
            onend: () => { state._correctPending = false; nextQuestion(); }
        });
    }, 300);
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
    } else if (state.questionCells.length > 1 && isCurrentCellMatch()) {
        onCellCorrect();
    }
}

// ── 切换到下一格（多格题目用）──
function nextCell() {
    if (state.currentCell < state.questionCells.length - 1) {
        clearTimeout(state._speechTimer);
        state._speechTimer = null;
        state.currentCell++;
        renderTarget();
        renderInput();
        playBeep(660, 50);
    }
}

// ── 切换到上一格 ──
function prevCell() {
    if (state.currentCell > 0) {
        clearTimeout(state._speechTimer);
        state._speechTimer = null;
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
    const litCount = getCurrentInput().reduce((s, d) => s + d, 0);
    state.inputCells[state.currentCell] = [0, 0, 0, 0, 0, 0];
    renderInput();
    for (let i = 0; i < litCount; i++) {
        setTimeout(() => playBeep(440, 40), i * 50);
    }
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

// ── 难度切换 ──
const DIFF_FORCED_BASIC = { punc: true };

function _syncDiffBar() {
    const forced = DIFF_FORCED_BASIC[state.topic];
    if (forced && state.difficulty === 'advanced') {
        state.difficulty = 'basic';
    }
    const tabs = document.querySelectorAll('.practice-diff-tab');
    tabs.forEach(t => {
        const isActive = t.dataset.diff === state.difficulty;
        t.classList.toggle('active', isActive);
        t.disabled = forced;
    });
}

// 模式切换后延迟加载题目：停止切换 1s 后才出题，保证切换丝滑
function _scheduleNextQuestion() {
    clearTimeout(state._modeTimer);
    clearTimeout(state._speechTimer);
    clearTimeout(state._debounceTimer);
    state._correctPending = false;
    state._modeTimer = setTimeout(() => {
        state._modeTimer = null;
        nextQuestion();
    }, 1000);
}

function switchDifficulty(diff) {
    if (state.difficulty === diff) return;
    const forced = DIFF_FORCED_BASIC[state.topic];
    if (forced && diff === 'advanced') return;
    state.difficulty = diff;
    state.score = 0;
    state.total = 0;
    _syncDiffBar();
    const name = TOPIC_DIFF_NAMES[state.topic + '-' + diff] || diff;
    speak.immediate(name);
    _scheduleNextQuestion();
}

// ── 打开/关闭 ──
function openPractice() {
    buildQuestionBanks();
    _ensureAdvancedMaps();
    state._active = true;
    state.score = 0;
    state.total = 0;
    state.topic = 'number';
    state.difficulty = 'basic';
    // 同步 topic / diff bar 激活状态
    const tabs = document.querySelectorAll('.practice-topic-tab');
    tabs.forEach(t => t.classList.toggle('active', t.dataset.topic === state.topic));
    _syncDiffBar();
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    nextQuestion();
}

// Tab 深度优先轮转：数字初级→数字高级→英文初级→英文高级→拼音初级→拼音高级→标点初级
const CYCLE_ORDER = [
    { topic: 'number', diff: 'basic' },
    { topic: 'number', diff: 'advanced' },
    { topic: 'english', diff: 'basic' },
    { topic: 'english', diff: 'advanced' },
    { topic: 'pinyin', diff: 'basic' },
    { topic: 'pinyin', diff: 'advanced' },
    { topic: 'punc', diff: 'basic' },
];

const TOPIC_DIFF_NAMES = {
    'number-basic': '数字初级', 'number-advanced': '数字高级',
    'english-basic': '英文初级', 'english-advanced': '英文高级',
    'pinyin-basic': '拼音初级', 'pinyin-advanced': '拼音高级',
    'punc-basic': '标点初级',
};

function cycleTopic() {
    const curIdx = CYCLE_ORDER.findIndex(
        x => x.topic === state.topic && x.diff === state.difficulty
    );
    const next = CYCLE_ORDER[(curIdx + 1) % CYCLE_ORDER.length];
    state.topic = next.topic;
    state.difficulty = next.diff;
    state.score = 0;
    state.total = 0;
    _syncDiffBar();
    document.querySelectorAll('.practice-topic-tab').forEach(t => {
        t.classList.toggle('active', t.dataset.topic === next.topic);
    });
    const name = TOPIC_DIFF_NAMES[next.topic + '-' + next.diff] || next.topic;
    speak.immediate(name);
    _scheduleNextQuestion();
}

function switchTopic(topic) {
    if (state.topic === topic) return;
    state.topic = topic;
    state.score = 0;
    state.total = 0;
    const forced = DIFF_FORCED_BASIC[topic];
    if (forced) state.difficulty = 'basic';
    _syncDiffBar();
    speak.immediate(TOPIC_NAMES[topic] || topic);
    _scheduleNextQuestion();
}

const TOPIC_NAMES = { number: '数字', english: '英文', pinyin: '拼音', punc: '标点' };

function closePractice() {
    state._active = false;
    stopPracticeSpeech();
    clearTimeout(state._debounceTimer);
    clearTimeout(state._speechTimer);
    clearTimeout(state._modeTimer);
    state._correctPending = false;
    state._speechTimer = null;
    state._modeTimer = null;
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
export function initPractice() {
    // Header practice button
    const btnPractice = document.getElementById('btnPractice');
    if (btnPractice) {
        btnPractice.addEventListener('click', () => togglePractice());
        btnPractice.addEventListener('mouseenter', () => speak.immediate('打开练习面板'));
    }

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

    // 难度切换 tab
    document.querySelectorAll('.practice-diff-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const diff = tab.dataset.diff;
            if (!diff || tab.disabled) return;
            switchDifficulty(diff);
        });
    });

    // 更新键位标签
    updatePracticeKeyLabels();
    document.addEventListener('bindings-changed', updatePracticeKeyLabels);
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

    // Ctrl+R 播报答案
    if (e.ctrlKey && e.code === 'KeyR') {
        _speakAnswer();
        return true;
    }

    // Ctrl/Meta 组合键放行（浏览器快捷键如 Ctrl+Shift+C 等）
    if (e.ctrlKey || e.metaKey) return false;

    // 点位键
    if (e.code in KEY_TO_DOT) {
        const dotIdx = KEY_TO_DOT[e.code];
        toggleInputDot(dotIdx);
        return true;
    }

    // R 跳过播报；Space 仅在最终答对后跳过（_correctPending），避免与逐格反馈冲突
    if (e.code === 'KeyR' && (isPracticeSpeechActive() || state._correctPending)) {
        if (isPracticeSpeechActive()) stopPracticeSpeech();
        clearTimeout(state._speechTimer);
        state._speechTimer = null;
        nextQuestion();
        return true;
    }
    if (state._correctPending && (e.code === 'Space' || e.code === 'Numpad0')) {
        if (isPracticeSpeechActive()) stopPracticeSpeech();
        clearTimeout(state._speechTimer);
        state._speechTimer = null;
        nextQuestion();
        return true;
    }

    // 清除输入
    if (e.code === 'Space' || e.code === 'Numpad0') {
        clearInput();
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

    // 左右方向键切换盲文格（多格组合用）
    if (e.code === 'ArrowLeft') {
        prevCell();
        return true;
    }
    if (e.code === 'ArrowRight') {
        nextCell();
        return true;
    }

    // 其他点位/动作键拦截，防止触发 dotInput
    if (e.code in KEY_ACTIONS) return true;
    if (e.code === 'KeyG' || e.code === 'KeyH') return true;

    return false;
}

export { openPractice, closePractice };
