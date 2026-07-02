// utils-braille.js — 盲文编码工具函数
// 编码层：oneHot ↔ dots ↔ Unicode盲文字符
// 语义层：中文/英文/数字/标点 → oneHot 编码序列，含分词、省写、大小写符号等规则

// dotState / oneHot 编码顺序：按列从上到下（国标）→ dot1 dot2 dot3 dot4 dot5 dot6
// 盲文点位布局:
//                  1 4
//                  2 5
//                  3 6
//
// dotState数组（内部0-based）:  [0]=dot1, [1]=dot2, [2]=dot3, [3]=dot4, [4]=dot5, [5]=dot6

import {
    outputItems,
    cursor,
    SETTINGS,
} from './state.js';
import {
    REVERSE_ONEHOT_MAPPINGS,
    NUMBER_SIGN,
    CAPITAL_SIGN,
    LOWERCASE_SIGN,
    _ensureBrailleReverseMaps,
    _ensureDigitToOneHot,
    _ensureLetterToOneHot,
    _validFinals,
    _TONE_NUM_TO_SYM,
} from './loadMappings.js';
import {
    chineseToPinyin,
    chineseToSegedPinyin,
    _splitPinyinBase,
    _shouldOmitTone,
    _isContextKeep,
} from './utils-pinyin.js';

// ═══════════════════════════════════════════════
// 编码层：oneHot ↔ dots ↔ Unicode盲文字符
// ═══════════════════════════════════════════════

/**
 * @description: 将6位点阵数组转换为Unicode盲文字符 (U+2800~U+283F)
 * @param {number[]} dots 6位数字数组，按国标列序 [dot1,dot2,dot3,dot4,dot5,dot6]
 * @return {string} Unicode盲文字符
 */
export function dotsToBrailleChar(dots) {
    let code = 0;
    if (dots[0]) code |= 1;    // dot1 → Unicode bit0
    if (dots[1]) code |= 2;    // dot2 → Unicode bit1
    if (dots[2]) code |= 4;    // dot3 → Unicode bit2
    if (dots[3]) code |= 8;    // dot4 → Unicode bit3
    if (dots[4]) code |= 16;   // dot5 → Unicode bit4
    if (dots[5]) code |= 32;   // dot6 → Unicode bit5
    return String.fromCodePoint(0x2800 + code);
}

/**
 * @description: 将oneHot编码转为盲文字符串，支持组合编码（用+连接两个6位码）
 * @param {string} oneHot 6位二进制字符串，或 "000010+011000" 形式的组合编码
 * @return {string} Unicode盲文字符（组合编码返回两个盲文字符）
 */
export function oneHotToBrailleChar(oneHot) {
    if (!oneHot || !oneHot.includes('+')) {
        const dots = oneHot.split('').map(Number);
        return dotsToBrailleChar(dots);
    }
    return oneHot.split('+').map(part => {
        const dots = part.split('').map(Number);
        return dotsToBrailleChar(dots);
    }).join('');
}

/**
 * @description: 将位置编码转为oneHot格式（6位二进制字符串如"110000"）
 *   支持两种输入：已为oneHot则直接返回；位置编码如"12"表示dot1+dot2激活
 * @param {string|*} input oneHot编码或位置编码
 * @return {string} oneHot编码
 */
export function indexToOnehot(input) {
    if (typeof input !== 'string') return input;
    if (input.length === 6 && /^[01]{6}$/.test(input)) return input;
    const bits = ['0', '0', '0', '0', '0', '0'];
    for (const ch of input) {
        const idx = parseInt(ch, 10);
        if (idx >= 1 && idx <= 6) bits[idx - 1] = '1';
    }
    return bits.join('');
}


export function onehotToIndex(oneHot) {
    let index = '';
    for (let i = 0; i < 6; i++) {
        if (oneHot[i] === '1') {
            index += (i + 1).toString();
            index += ' ';
        }
    }
    return index;
}

// ═══════════════════════════════════════════════
// 语义转换层：文本 → oneHot 盲文编码序列
// ═══════════════════════════════════════════════

export const toOneHot = {
    pinyin: _pinyinToOneHot,
    pinyinItems: _pinyinItemsToOneHot,
    number: numberToOneHot,
    english: englishToOneHot,
    chinese: chineseToOneHot,
    mixed: mixedToOneHot,
}


const _EN_PUNCT_TO_ONEHOT = {
    '?': '000010+001000',
    '!': '000011+010000',
    '.': '000010+011000',
    ',': '000010',
};


function _pinyinToOneHot(py, forceKeepTone) {
    const result = [];
    let base = py;
    let tone = '';
    if (/\d$/.test(py)) { tone = py.slice(-1); base = py.slice(0, -1); }

    if (SETTINGS.omitToneMapping && tone && !forceKeepTone && _shouldOmitTone(base, tone)) {
        tone = '';
    }

    if (/^[jqx]/.test(base) && base.charAt(1) === 'u') {
        base = base.charAt(0) + 'ü' + base.slice(2);
    }

    const actualBase = (REVERSE_ONEHOT_MAPPINGS.solo && REVERSE_ONEHOT_MAPPINGS.solo[base]) ? REVERSE_ONEHOT_MAPPINGS.solo[base] : base;

    let initial = '';
    let fin = actualBase;
    if (!_validFinals || !_validFinals.has(actualBase)) {
        const split = _splitPinyinBase(actualBase);
        if (split) { initial = split.initial; fin = split.fin; }
    }

    if (initial) {
        const oh = REVERSE_ONEHOT_MAPPINGS.charToHot[initial];
        if (oh) result.push(oh);
    }
    if (fin) {
        const oh = REVERSE_ONEHOT_MAPPINGS.charToHot[fin];
        if (oh) result.push(oh);
    }
    if (tone) {
        const sym = _TONE_NUM_TO_SYM[tone];
        if (sym) {
            const oh = REVERSE_ONEHOT_MAPPINGS.charToHot[sym];
            if (oh) result.push(oh);
        }
    }
    return result;
}

/**
 * @description: 将拼音项数组转为 oneHot 序列，并根据上下文决定是否保留声调
 * @param {Array<{py: string, src: string}>} pinyinItems 拼音项列表
 * @return {Array<{oneHot: string, sourceChar?: string}>}
 */
function _pinyinItemsToOneHot(pinyinItems) {
    const forceKeep = new Set();
    if (SETTINGS.omitToneMapping) {
        for (let i = 0; i < pinyinItems.length - 1; i++) {
            if (_isContextKeep(pinyinItems[i].py, pinyinItems[i + 1].py)) {
                forceKeep.add(i);
            }
        }
    }

    const result = [];
    for (let i = 0; i < pinyinItems.length; i++) {
        const items = _pinyinToOneHot(pinyinItems[i].py, forceKeep.has(i));
        for (let k = 0; k < items.length; k++) {
            result.push({ oneHot: items[k], sourceChar: k === 0 ? pinyinItems[i].src : undefined });
        }
    }
    return result;
}


/**
 * @description: 构建数字盲文 oneHot 序列，自动补充数号。若已在数字上下文中先插入空方脱离。
 * @param {string|number} num 数字，如 "123.456" 或 42
 * @return {string[]} oneHot 数组
 */
function numberToOneHot(num) {
    _ensureDigitToOneHot();
    const oneHotList = [];
    if (outputItems.isInNumberContext(cursor.idx)) {
        oneHotList.push('000000');
    } else if (cursor.idx > 0 && outputItems[cursor.idx - 1].oneHot !== '000000') {
        oneHotList.push('000000');
    }
    oneHotList.push(NUMBER_SIGN);
    const str = String(num);
    for (const ch of str) {
        const oh = REVERSE_ONEHOT_MAPPINGS.digitToHot[ch];
        if (oh) oneHotList.push(oh);
    }
    return oneHotList;
}

/**
 * @description: 构建英文盲文 oneHot 序列，自动处理大小写符号和空格。若已在英文上下文中先脱离。
 * @param {string} text 英文文本，如 "Can you type without looking?"
 * @return {string[]} oneHot 数组
 */
function englishToOneHot(text, prevIsSpaceOverride = null) {
    _ensureLetterToOneHot();
    const oneHotList = [];
    let localInEng = false;
    let prevIsSpace = prevIsSpaceOverride != null ? prevIsSpaceOverride : (cursor.idx === 0 || outputItems[cursor.idx - 1].oneHot === '000000');
    if (outputItems.isInEnglishContext(cursor.idx)) {
        oneHotList.push('000000');
        prevIsSpace = true;
    }

    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === ' ') {
            oneHotList.push('000000');
            localInEng = false;
            prevIsSpace = true;
            continue;
        }

        const punctOh = _EN_PUNCT_TO_ONEHOT[ch];
        if (punctOh) {
            oneHotList.push(punctOh);
            prevIsSpace = false;
            continue;
        }

        const lower = ch.toLowerCase();
        const oh = REVERSE_ONEHOT_MAPPINGS.letterToHot[lower];
        if (!oh) continue;

        const isUpper = ch >= 'A' && ch <= 'Z';
        const nextUpper = i + 1 < text.length && text[i + 1] >= 'A' && text[i + 1] <= 'Z';

        if (!localInEng) {
            if (isUpper) {
                if (nextUpper) {
                    oneHotList.push(CAPITAL_SIGN, CAPITAL_SIGN);
                } else {
                    oneHotList.push(CAPITAL_SIGN);
                }
            } else {
                if (!prevIsSpace) oneHotList.push('000000');
                oneHotList.push(LOWERCASE_SIGN);
            }
        }

        oneHotList.push(oh);
        localInEng = true;
        prevIsSpace = false;
    }
    return oneHotList;
}

/**
 * @description: 将汉字文本转为盲文 oneHot 序列（含源汉字追踪）
 *   返回 Array<{oneHot: string, sourceChar?: string}>，sourceChar 仅在每组第一个 oneHot 上有值
 * @param {string} chineseText 汉字文本
 * @return {Array<{oneHot: string, sourceChar?: string}>}
 */
function chineseToOneHot(chineseText) {
    _ensureBrailleReverseMaps();

    if (!SETTINGS.wordSegmentation) {
        const chars = Array.from(chineseText);
        const items = [];
        for (let i = 0; i < chars.length; i++) {
            const ch = chars[i];
            if (ch === '—' && i + 1 < chars.length && chars[i + 1] === '—') {
                items.push({ py: '——', src: '——' });
                i++;
            } else {
                const py = chineseToPinyin(ch, { toneType: 'num', type: 'string' });
                items.push({ py, src: ch });
            }
        }
        return _pinyinItemsToOneHot(items);
    }

    const segmentedPinyin = chineseToSegedPinyin(chineseText);

    for (let i = 0; i < segmentedPinyin.length - 1; i++) {
        const cur = segmentedPinyin[i];
        const nxt = segmentedPinyin[i + 1];
        if (cur.length === 1 && cur[0].origin === '—' &&
            nxt.length === 1 && nxt[0].origin === '—') {
            segmentedPinyin.splice(i, 2, [{ origin: '——', result: '——' }]);
        }
    }

    const result = [];
    const PUNCT_RE = /^[\s，。！？；：""''（）【】《》、…—～,\.!\?;:'"()\[\]{}]+$/;

    for (let i = 0; i < segmentedPinyin.length; i++) {
        const seg = segmentedPinyin[i];
        const head = seg[0];
        const isPunct = seg.length === 1 && PUNCT_RE.test(head.origin);

        if (isPunct) {
            const oh = REVERSE_ONEHOT_MAPPINGS.charToHot?.[head.origin];
            if (oh) result.push({ oneHot: oh });
        } else {
            const wordItems = seg.map(ch => ({ py: ch.result, src: ch.origin }));
            const brailleEntries = _pinyinItemsToOneHot(wordItems);
            result.push(...brailleEntries);
        }

        if (i + 1 < segmentedPinyin.length) {
            const nextHead = segmentedPinyin[i + 1][0];
            const nextIsPunct = segmentedPinyin[i + 1].length === 1 && PUNCT_RE.test(nextHead.origin);
            if (!isPunct && !nextIsPunct && result.length && result[result.length - 1].oneHot !== '000000') {
                result.push({ oneHot: '000000' });
            }
        }
    }

    const deduped = [];
    for (const entry of result) {
        if (entry.oneHot === '000000' && deduped.length && deduped[deduped.length - 1].oneHot === '000000') continue;
        deduped.push(entry);
    }
    return deduped;
}

/**
 * @description: 将混合中英数字的文本转为盲文 oneHot 序列
 *   按字符类型分段：中文→拼音转盲文，英文→字母盲文，数字→数字盲文
 * @param {string} text 混合文本
 * @return {Array<{oneHot: string, sourceChar?: string}>} oneHot数组
 */
function mixedToOneHot(text) {
    _ensureBrailleReverseMaps();

    const result = [];
    let prevIsSpace = (cursor.idx === 0 || outputItems[cursor.idx - 1].oneHot === '000000');
    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        if (/\s/.test(ch)) {
            result.push({ oneHot: '000000' });
            prevIsSpace = true;
            i++;
            continue;
        }

        if (/[\d.]/.test(ch)) {
            let numStr = '';
            while (i < text.length && /[\d.]/.test(text[i])) {
                numStr += text[i];
                i++;
            }
            if (!prevIsSpace && result.length > 0) result.push({ oneHot: '000000' });
            for (const oh of numberToOneHot(numStr)) result.push({ oneHot: oh });
            prevIsSpace = false;
            continue;
        }

        if (/[a-zA-Z]/.test(ch)) {
            let engStr = '';
            while (i < text.length && /[a-zA-Z]/.test(text[i])) {
                engStr += text[i];
                i++;
            }
            if (!prevIsSpace && result.length > 0) result.push({ oneHot: '000000' });
            for (const oh of englishToOneHot(engStr, true)) result.push({ oneHot: oh });
            prevIsSpace = false;
            continue;
        }

        let cnStr = '';
        while (i < text.length && !/[\s\d.a-zA-Z]/.test(text[i])) {
            cnStr += text[i];
            i++;
        }
        if (cnStr) {
            if (!prevIsSpace && result.length > 0) result.push({ oneHot: '000000' });
            result.push(...chineseToOneHot(cnStr));
            prevIsSpace = false;
        }
    }

    return result;
}
