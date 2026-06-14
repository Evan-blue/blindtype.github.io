// brailleState.js - 共享状态与上下文函数
// 所有模块通过 import 引用同一份状态，消除循环依赖

import { splitPinyinChars, _resolveOmittedTone } from './utils-pinyin.js';
import { SETTINGS } from './config.js';

// ── 光标对象（封装光标状态与纯索引操作）──
export const cursor = {
    _idx: 0,
    _selAnchor: -1,  // selection anchor; -1 表示无选区
    _DEBOUNCE_MS: 300,
    _debounceTimer: null,
    _SENTENCE_END: new Set([
        '000010+011000', // 。
        '000011+010000', // ！
        '000010+001000', // ？
        '000010+000010+000010', // ……
    ]),
    dom: null,
    selectedIndices: new Set(),

    // ── 基本读写 ──
    set idx(n) { this._idx = n; },
    get idx() { return this._idx; },
    set selAnchor(n) { this._selAnchor = n; },
    get selAnchor() { return this._selAnchor; },

    // ── 选择操作 ──
    clearAnchor() { this.selAnchor = -1; },

    clearSelection() { this.selectedIndices.clear(); this.clearAnchor(); },
    /** 首次选择时以当前位置为锚点 */
    ensureAnchor() {
        if (this.selectedIndices.size === 0) this.selAnchor = this.idx;
    },
    /** 以锚点和当前位置之间的区间重建选择 */
    rebuildSelection() {
        this.selectedIndices.clear();
        const from = Math.min(this.selAnchor, this.idx);
        const to = Math.max(this.selAnchor, this.idx);
        for (let i = from; i < to; i++) this.selectedIndices.add(i);
    },

    // ── 索引吸附（依赖 meta，由外部传入）──
    /** 判断 idx 是否处于 braille-group 内部（非合法光标停靠点） */
    isInsideGroup(idx, itemCount, meta) {
        if (idx <= 0 || idx >= itemCount) return false;
        const left = meta[idx - 1], right = meta[idx];
        return !!(left && right && !left.isLast);
    },
    /** 将索引吸附到最近 braille-group 边界 */
    snapToBoundary(idx, itemCount, meta, direction) {
        if (idx <= 0) return 0;
        if (idx >= itemCount) return itemCount;
        let result = idx;
        if (direction < 0) {
            while (this.isInsideGroup(result, itemCount, meta)) result--;
        } else {
            while (this.isInsideGroup(result, itemCount, meta)) result++;
        }
        return result;
    },

    // ── 跳转分隔符判断（依赖 outputItems 和 jumpMode，由外部传入）──
    /**
     * @param {number} idx 输出项索引
     * @param {object[]} outputItems
     * @param {string} jumpMode 'emptyCell' | 'newline' | 'sentenceEnd'
     */
    isJumpBoundary(idx, outputItems, jumpMode) {
        const item = outputItems[idx];
        if (!item) return false;
        switch (jumpMode) {
            case 'emptyCell': return item.oneHot === '000000';
            case 'sentenceEnd': return cursor._SENTENCE_END.has(item.oneHot);
            case 'newline':
                return idx + 1 < outputItems.length
                    && item.oneHot === '000000'
                    && outputItems[idx + 1].oneHot === '000000';
            default: return item.oneHot === '000000';
        }
    },

};


// ── 输出区状态 ──
export const outputItems = []; // { braille, pinyin, char, audio, oneHot }
let _renderSuppressed = false;  // 批量加载期间抑制逐项渲染

// ── 分页状态对象（提供 setter 以跨模块修改）──
export const pages = {
    _idx: 0,
    breaks: [], // [{ startIdx, endIdx }, ...]
    isActive: false,
    preRendered: new Map(), // pageNum -> DocumentFragment

    set idx(n) { this._idx = n; },
    get idx() { return this._idx; },
    setBreaks(breaks) { this.breaks = breaks; },
    setActive(v) { this.isActive = v; },
}

export function setRenderSuppressed(v) { _renderSuppressed = v; }
export function getRenderSuppressed() { return _renderSuppressed; }

// ── 数字/英文上下文判断 ──

export function isInNumberContext() {
    if (cursor.idx === 0) return false;
    const prev = outputItems[cursor.idx - 1];
    return !!(prev && prev.isNumber);
}

export function getNumberStartIdx() {
    if (!isInNumberContext()) return -1;
    let idx = cursor.idx - 1;
    while (idx >= 0 && outputItems[idx].isNumber) idx--;
    return idx + 1;
}

export function isInEnglishContext() {
    if (cursor.idx === 0) return false;
    const prev = outputItems[cursor.idx - 1];
    return !!(prev && prev.isEnglish);
}

export function getEnglishStartIdx() {
    if (!isInEnglishContext()) return -1;
    let idx = cursor.idx - 1;
    while (idx >= 0 && outputItems[idx].isEnglish) idx--;
    return idx + 1;
}

export function getEnglishCase() {
    if (!isInEnglishContext()) return null;
    const item = outputItems[getEnglishStartIdx()];
    return item.letterCase || null;
}

// ── 输出项元数据计算（原在 brailleOutput.js，提取到共享层以解除循环依赖）──

/**
 * @description: 计算 outputItems 中每个拼音分组的元数据（merged 拼音、首尾标记）
 *   以空方(000000)为分隔符，按段计算拼音分组信息
 *   返回值: itemMeta 数组，每项为 null（非分组项）或 { merged, isFirst, isLast }
 * @return {object[]}
 */
export function computeItemMeta() {
    const emptyIndices = [];
    outputItems.forEach((item, i) => {
        if (item.oneHot === '000000') emptyIndices.push(i);
    });

    const meta = new Array(outputItems.length).fill(null);
    for (let g = 0; g <= emptyIndices.length; g++) {
        const start = g === 0 ? 0 : emptyIndices[g - 1] + 1;
        const end = g < emptyIndices.length ? emptyIndices[g] : outputItems.length;
        if (outputItems.slice(start, end).some(it => it.isNumber || it.isEnglish)) continue;
        if (end - start >= 2) {
            const TONE_SYM_TO_NUM = { '¯': '1', '´': '2', 'ˇ': '3', '`': '4' };
            const chars = outputItems.slice(start, end).map((it, ci, arr) => {
                const ch = TONE_SYM_TO_NUM[it.char] || it.char || '';
                if (ch !== 'e/o') return ch;
                const prevCh = ci > 0 ? (TONE_SYM_TO_NUM[arr[ci - 1].char] || arr[ci - 1].char || '') : '';
                if (prevCh === 'b' || prevCh === 'p' || prevCh === 'f') return 'o';
                if (prevCh === 'm') return 'o';
                return 'e';
            });
            const syllables = splitPinyinChars(chars);
            if (syllables) {
                let pos = start;
                for (const syl of syllables) {
                    let merged = syl.merged;
                    if (SETTINGS.omitToneMapping !== false && !/\d$/.test(merged)) {
                        const tone = _resolveOmittedTone(merged);
                        if (tone) merged += tone;
                    }
                    for (let k = 0; k < syl.count; k++) {
                        meta[pos + k] = { merged, isFirst: k === 0, isLast: k === syl.count - 1 };
                    }
                    pos += syl.count;
                }
            }
        }
    }
    return meta;
}
