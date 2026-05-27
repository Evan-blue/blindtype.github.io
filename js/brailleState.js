// brailleState.js - 全局状态与 DOM 引用

// dotState按国标列序: [dot1, dot2, dot3, dot4, dot5, dot6]
const dotState = [0, 0, 0, 0, 0, 0]; // 6 dots
let debounceTimer = null;
let cursorDebounceTimer = null;
const DEBOUNCE_MS = 500;
const CURSOR_DEBOUNCE_MS = 300;
const outputItems = []; // { braille, pinyin, char, audio, oneHot }
let cursorIdx = 0; // position in outputItems
let selectedIndices = new Set(); // 被选中的输出项索引集合

const dotCells = document.querySelectorAll('.dot-cell');
const previewBox = document.getElementById('previewBox');
const previewChar = document.getElementById('previewChar');
const previewDots = document.getElementById('previewDots');
const previewPinyin = document.getElementById('previewPinyin');
const outputArea = document.getElementById('outputArea');
const cursorEl = document.getElementById('cursor');

/**
 * @description: 判断光标左侧是否处于数字上下文（前一项是数号或数字）
 * @return {boolean}
 */
function isInNumberContext() {
    if (cursorIdx === 0) return false;
    const prev = outputItems[cursorIdx - 1];
    return !!(prev && prev.isNumber);
}

/**
 * @description: 获取数字上下文的起始索引（数号所在位置），不在数字上下文中返回 -1
 * @return {number}
 */
function getNumberStartIdx() {
    if (!isInNumberContext()) return -1;
    let idx = cursorIdx - 1;
    while (idx >= 0 && outputItems[idx].isNumber) idx--;
    return idx + 1;
}

/**
 * @description: 判断光标左侧是否处于英文上下文（前一项有英文字母符号）
 * @return {boolean}
 */
function isInEnglishContext() {
    if (cursorIdx === 0) return false;
    const prev = outputItems[cursorIdx - 1];
    return !!(prev && prev.isEnglish);
}

/**
 * @description: 获取英文上下文的起始索引（英文字母符号所在位置），不在英文上下文中返回 -1
 * @return {number}
 */
function getEnglishStartIdx() {
    if (!isInEnglishContext()) return -1;
    let idx = cursorIdx - 1;
    while (idx >= 0 && outputItems[idx].isEnglish) idx--;
    return idx + 1;
}

/**
 * @description: 获取当前英文上下文的字母大小写状态（'upper' | 'lower' | null）
 * @return {string|null}
 */
function getEnglishCase() {
    if (!isInEnglishContext()) return null;
    const item = outputItems[getEnglishStartIdx()];
    return item.letterCase || null;
}
