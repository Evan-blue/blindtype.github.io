// brailleInput.js - 输入逻辑、点位状态与输入面板渲染

import {
    outputItems,
    cursor,
    computeItemMeta,
    getRenderSuppressed,
    isInNumberContext,
    getNumberStartIdx,
    isInEnglishContext,
    getEnglishStartIdx,
    getEnglishCase,
} from './brailleState.js';
import {
    ONEHOT_MAPPINGS,
    REVERSE_ONEHOT_MAPPINGS,
    NUMBER_SIGN,
    CAPITAL_SIGN,
    LOWERCASE_SIGN,
    _lookupBraille,
    _validInitials,
    _validFinals,
    _TONE_NUM_TO_SYM,
    _ensureBrailleReverseMaps,
    _ensureDigitToOneHot,
    _ensureLetterToOneHot,
} from './loadMappings.js';
import { dotsToBrailleChar, oneHotToBrailleChar } from './utils-braille.js';
import {
    chineseToPinyin,
    chineseToSegedPinyin_pyp,
    pinyinToSpokenChar,
    _splitPinyinBase,
} from './utils-pinyin.js';
import {
    speakText,
    speakBraille,
    playBeep,
    stopSpeech,
} from './brailleSpeech.js';
import {
    renderOutput,
    invalidatePageCache,
    ensureCursorVisible,
} from './brailleOutput.js';
import { SETTINGS } from './config.js';
import { setActiveKeyGroup } from './panelSettings.js';
import { splitText } from './utils-pinyin.js';
import { pushUndo } from './history.js';
import { _batchInputOneHot } from './fileOperations.js';

// dotInput.state按国标列序: [dot1, dot2, dot3, dot4, dot5, dot6]
export const dotInput = {
    state: [0, 0, 0, 0, 0, 0],
    debounceTimer: null,
    _INPUT_DEBOUNCE_MS: 500,

    // ── 衍生属性 ──
    get onehot() { return this.state.join(''); },
    get isLit() { return this.state.some(d => d); },
    get litCount() { return this.state.filter(d => d).length; },

    // ── 点位操作 ──
    reset() { this.state.fill(0); this.renderDots(); this._resetPreview(); },
    getDot(idx) { return this.state[idx - 1]; },
    setDot(idx, val) { this.state[idx - 1] = val; },

    // ── DOM 引用（ESM defer 保证 DOM 就绪）──
    _cells: document.querySelectorAll('.dot-cell'),
    _previewBox: document.getElementById('previewBox'),
    _previewDots: document.getElementById('previewDots'),
    _previewPinyin: document.getElementById('previewPinyin'),
    _previewWriting: document.querySelector('#previewChar .braille-writing'),
    _previewReading: document.querySelector('#previewChar .braille-reading'),

    // ── 渲染 ──
    _dotsLabel(dots) {
        return dots.map((d, i) => d ? (i + 1) : '').filter(Boolean).join(' ');
    },
    /** 书写时盲文：列序镜像（swap 1↔4, 2↔5, 3↔6） */
    _getWritingBraille() {
        const s = this.state;
        return dotsToBrailleChar([s[3], s[4], s[5], s[0], s[1], s[2]]);
    },
    renderDots() {
        this._cells.forEach(cell => {
            const idx = +cell.dataset.idx;
            cell.classList.toggle('active', !!this.state[idx - 1]);
        });
    },
    _renderPreview() {
        const key = this.onehot;
        const entry = _lookupBraille(key);
        if (this.isLit) {
            this._previewBox.classList.remove('empty');
            this._previewWriting.textContent = this._getWritingBraille();
            this._previewReading.textContent = dotsToBrailleChar(this.state);
            this._previewDots.textContent = this._dotsLabel(this.state);
            const ctx = _getContextPreview(key);
            this._previewPinyin.textContent = ctx ? ctx.label : (entry ? entry.label : '');
        } else {
            this._resetPreview();
        }
    },
    _resetPreview() {
        this._previewBox.classList.add('empty');
        this._previewWriting.textContent = '⠀';
        this._previewReading.textContent = '⠀';
        this._previewDots.textContent = '';
        this._previewPinyin.textContent = '⠀';
    },

    // ── 操作 ──
    toggle(idx) {
        const i = idx - 1;
        const turningOn = !this.state[i];
        this.state[i] = this.state[i] ? 0 : 1;
        this.renderDots();
        playBeep(turningOn ? 880 : 440, 50);

        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this._renderPreview();
            if (this.isLit && SETTINGS.debounceSpeech) {
                speakBraille(this.onehot);
            }
        }, this._INPUT_DEBOUNCE_MS);

        // Immediate partial preview (dimmed)
        if (this.isLit) {
            this._previewBox.classList.remove('empty');
            this._previewWriting.textContent = this._getWritingBraille();
            this._previewReading.textContent = dotsToBrailleChar(this.state);
            this._previewDots.textContent = this._dotsLabel(this.state);
            this._previewPinyin.textContent = '……';
        } else {
            this._resetPreview();
        }
    },
    confirm() {
        if (!this.isLit) return;
        pushUndo();
        invalidatePageCache();
        clearTimeout(this.debounceTimer);
        _commitOneHot(this.onehot, { silent: false, clearDots: true });
    },
    clear() {
        const litCount = this.litCount;
        this.reset();
        for (let i = 0; i < litCount; i++) {
            setTimeout(() => playBeep(440, 40), i * 50);
        }
    },
};

// Legacy exports — DOM refs used by init.js for event binding
export const dotCells = dotInput._cells;
export const previewBox = dotInput._previewBox;

function _getContextPreview(key) {
    if (isInNumberContext()) {
        const digit = ONEHOT_MAPPINGS.number[key];
        if (digit && digit.char !== '数号') return { char: digit.char, label: digit.label };
    }
    if (isInEnglishContext()) {
        const letter = ONEHOT_MAPPINGS.letter[key];
        if (letter && letter.char && letter.char.length >= 2) {
            const engCase = getEnglishCase();
            const ch = letter.char;
            return { char: engCase === 'upper' ? (ch[0] || '') : (ch[1] || ''), label: letter.label };
        }
    }
    return null;
}

const PUNCT_RULES = {
    'none': new Set([
        '000010+011000',    // 。
        '000011+010000',    // ！
        '000010+001000',    // ？
        '000001+001001',    // ——
        '000001+001000',    // ·
    ]),
    'after': new Set([
        '000010',           // ，
        '000100',           // 、
        '000011',           // ；
        '001001',           // ：
        '000010+000010+000010', // ……
    ]),
    'open': new Set([
        '000011+001000',    // （
        '000010+001001',    // 《
    ]),
    'close': new Set([
        '000001+011000',    // ）
        '001001+010000',    // 》
    ]),
    'paired': new Set([
        '000110',           // ""
        '000110+000110',    // ''
        '000011+011000',    // ［］
    ]),
};

// ── gkh/jqx 声母歧义 ──
const AMBIG_INITIALS = {
    '110110': { gkh: 'g', jqx: 'j', gkhAudio: '哥', jqxAudio: '基' },
    '101000': { gkh: 'k', jqx: 'q', gkhAudio: '科', jqxAudio: '七' },
    '110010': { gkh: 'h', jqx: 'x', gkhAudio: '喝', jqxAudio: '西' },
};
// i/ü 开头的韵母 oneHot（触发 jqx 判定）
const I_U_FINAL_ONEHOTS = new Set([
    '010100',  // i
    '110101',  // ia
    '100010',  // ie
    '001110',  // iao
    '110011',  // iu
    '100101',  // ian
    '110001',  // in
    '101101',  // iang
    '100001',  // ing
    '100111',  // iong
    '001101',  // ü
    '011111',  // üe
    '111101',  // üan
    '000111',  // ün
]);

/**
 * @description: 判断某个 oneHot 是否为组合字符的前缀（即存在以它开头的更长的组合编码）
 * @param {string} oneHot
 * @return {boolean}
 */
function _isPunctPrefix(oneHot) {
    for (const key of Object.keys(ONEHOT_MAPPINGS.pinyin)) {
        if (key.includes('+') && key.startsWith(oneHot + '+')) return true;
    }
    for (const key of Object.keys(ONEHOT_MAPPINGS.punc)) {
        if (key.includes('+') && key.startsWith(oneHot + '+')) return true;
    }
    return false;
}

/**
 * @description: 获取标点符号的空方规则
 * @param {string} oneHot
 * @return {string|null} 'open'|'close'|'after'|'none'|null
 */
function _getPunctRule(oneHot) {
    for (const [rule, set] of Object.entries(PUNCT_RULES)) {
        if (!set.has(oneHot)) continue;
        if (rule === 'paired') {
            let count = 0;
            for (const item of outputItems) {
                if (item.oneHot === oneHot) count++;
            }
            return count % 2 === 1 ? 'open' : 'close';
        }
        return rule;
    }
    return null;
}

/**
 * @description: 处理上一项延迟的空方（在新输入与上一项不会合并时应用）
 * @param {string} newKey 新输入的oneHot
 * @return {number} cursor偏移量
 */
function _resolveDeferredPunct(newKey) {
    if (cursor.idx === 0) return 0;
    const prev = outputItems[cursor.idx - 1];
    if (!prev._punctPending) return 0;

    const combinedKey = prev.oneHot + '+' + newKey;
    if (_lookupBraille(combinedKey)) return 0; // 会合并，暂不处理

    delete prev._punctPending;
    if (!SETTINGS.punctAutoSpacing) return 0;
    const rule = _getPunctRule(prev.oneHot);
    let shift = 0;

    if (rule === 'open') {
        if (cursor.idx - 1 === 0 || outputItems[cursor.idx - 2].oneHot !== '000000') {
            outputItems.splice(cursor.idx - 1, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursor.idx = cursor.idx + 1;
            shift++;
        }
    } else if (rule === 'close' || rule === 'after') {
        if (cursor.idx >= outputItems.length || outputItems[cursor.idx].oneHot !== '000000') {
            outputItems.splice(cursor.idx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursor.idx = cursor.idx + 1;
            shift++;
        }
    }
    return shift;
}

/**
 * @description: 解析 gkh/jqx 声母歧义：后续韵母以 i/ü 开头→jqx，否则→gkh
 * @param {string} nextKey 下一个输入的oneHot
 * @return {void}
 */
function _resolveAmbigInitial(nextKey) {
    if (cursor.idx === 0) return;
    const prev = outputItems[cursor.idx - 1];
    if (!prev._ambigInitial) return;

    delete prev._ambigInitial;
    const info = AMBIG_INITIALS[prev.oneHot];
    if (!info) return;

    if (I_U_FINAL_ONEHOTS.has(nextKey)) {
        prev.char = info.jqx;
        prev.label = info.jqx;
        prev.audio = info.jqxAudio;
    } else {
        prev.char = info.gkh;
        prev.label = info.gkh;
        prev.audio = info.gkhAudio;
    }
}

/**
 * @description: 获取光标前一个非空方、非特殊项的char值，用于上下文消歧
 * @param {number} insertIdx 插入位置(cursor.idx)
 * @return {string} 前一个有效char，无则返回空串
 */
function _getPrevChar(insertIdx) {
    for (let i = insertIdx - 1; i >= 0; i--) {
        const item = outputItems[i];
        if (item.oneHot === '000000') continue;
        if (item.isNumber || item.isEnglish) continue;
        return (item.char || '').trim();
    }
    return '';
}

/**
 * @description: 解析 e/o 韵母歧义（oneHot 010001）：b/p/f 后为 o，m 后两者皆可，其余为 e
 * @param {string} oneHot 当前输入的oneHot
 * @param {number} insertIdx 插入位置(cursor.idx)
 * @return {string|null} 解析后的char，非010001时返回null
 */
function _resolveEo(oneHot, insertIdx) {
    if (oneHot !== '010001') return null;
    const prevChar = _getPrevChar(insertIdx);
    if (prevChar === 'b' || prevChar === 'p' || prevChar === 'f') return 'o';
    if (prevChar === 'm') return 'e/o';
    return 'e';
}

/**
 * @description: 标点插入后，立即插入空方或标记为延迟处理
 * @param {string} oneHot 标点oneHot
 * @param {number} idx   标点在outputItems中的位置
 * @return {number} cursor偏移量
 */
function _applyPunctSpacing(oneHot, idx) {
    const rule = _getPunctRule(oneHot);
    if (!rule || rule === 'none') return 0;

    // 是组合字符前缀 → 延迟处理（等下一码确认后再决定）
    if (_isPunctPrefix(oneHot)) {
        outputItems[idx]._punctPending = true;
        return 0;
    }

    // 未开启标点空方自动补全 → 只标记延迟用于合并判断，不实际插空方
    if (!SETTINGS.punctAutoSpacing) return 0;

    if (rule === 'open') {
        if (idx === 0 || outputItems[idx - 1].oneHot !== '000000') {
            outputItems.splice(idx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            return 1;
        }
    } else if (rule === 'close' || rule === 'after') {
        const afterPos = idx + 1;
        if (afterPos >= outputItems.length || outputItems[afterPos].oneHot !== '000000') {
            outputItems.splice(afterPos, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            return 1;
        }
    }
    return 0;
}

function _resetDotInputIfNeeded(clearDots) {
    if (clearDots) dotInput.reset();
}

function _finalizeCommit(result, { silent = false, clearDots = false } = {}) {
    _resetDotInputIfNeeded(clearDots);
    if (!silent) {
        if (typeof result.playBeepFn === 'function') {
            result.playBeepFn();
        } else if (result.speakBrailleArg) {
            speakBraille(result.speakBrailleArg);
        } else if (typeof result.speakTextArg === 'string' && result.speakTextArg) {
            speakText(result.speakTextArg);
        }
    }
    renderOutput();
}

function _handleNumberSign(oneHot, braille) {
    if (oneHot !== NUMBER_SIGN) return null;
    const prevChar = _getPrevChar(cursor.idx);
    if (prevChar && _validInitials && _validInitials.has(prevChar)) return null;

    const signEntry = ONEHOT_MAPPINGS.number[oneHot];
    if (cursor.idx > 0 && outputItems[cursor.idx - 1].oneHot !== '000000') {
        outputItems.splice(cursor.idx, 0, {
            braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
        });
        cursor.idx = cursor.idx + 1;
    }
    outputItems.splice(cursor.idx, 0, {
        braille, pinyin: '', char: signEntry.char, audio: signEntry.audio,
        oneHot, isNumber: true
    });
    cursor.idx = cursor.idx + 1;
    return { speakTextArg: signEntry.audio };
}

function _handleNumberContext(oneHot, braille) {
    if (!isInNumberContext()) return null;
    const digit = ONEHOT_MAPPINGS.number[oneHot];
    if (digit) {
        const numItem = outputItems[getNumberStartIdx()];
        numItem.oneHot += '+' + oneHot;
        numItem.braille += braille;
        numItem.char += digit.char;
        numItem.audio = numItem.char;
        return { speakTextArg: digit.audio };
    }
    outputItems.splice(cursor.idx, 0, {
        braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
    });
    cursor.idx = cursor.idx + 1;
    return null;
}

function _handleCapitalSign(oneHot, braille) {
    if (oneHot !== CAPITAL_SIGN) return null;
    const signEntry = ONEHOT_MAPPINGS.letter[oneHot];
    if (isInEnglishContext()) {
        const engItem = outputItems[getEnglishStartIdx()];
        if (engItem.letterCase === 'upper') {
            engItem.allCaps = true;
            engItem.oneHot += '+' + oneHot;
            engItem.braille += braille;
            return { speakTextArg: '全大写' };
        }
    }
    outputItems.splice(cursor.idx, 0, {
        braille, pinyin: '', char: '', audio: signEntry.audio,
        oneHot, isEnglish: true, letterCase: 'upper', singleUpper: true
    });
    cursor.idx = cursor.idx + 1;
    return { speakTextArg: signEntry.audio };
}

function _handleLowercaseSign(oneHot, braille) {
    if (oneHot !== LOWERCASE_SIGN) return null;
    const signEntry = ONEHOT_MAPPINGS.letter[oneHot];
    if (cursor.idx === 0 || (cursor.idx > 0 && outputItems[cursor.idx - 1].oneHot === '000000')) {
        outputItems.splice(cursor.idx, 0, {
            braille, pinyin: '', char: '', audio: signEntry.audio,
            oneHot, isEnglish: true, letterCase: 'lower'
        });
        cursor.idx = cursor.idx + 1;
        return { speakTextArg: signEntry.audio };
    }
    outputItems.splice(cursor.idx, 0, {
        braille, pinyin: '；(分号)', char: '；', audio: '分号',
        oneHot
    });
    cursor.idx = cursor.idx + 1;
    if (SETTINGS.punctAutoSpacing && (cursor.idx >= outputItems.length || outputItems[cursor.idx].oneHot !== '000000')) {
        outputItems.splice(cursor.idx, 0, {
            braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
        });
        cursor.idx = cursor.idx + 1;
    }
    return { playBeepFn: () => playBeep() };
}

function _handleEnglishContext(oneHot, braille) {
    if (!isInEnglishContext()) return null;
    const letter = ONEHOT_MAPPINGS.letter[oneHot];
    if (letter && letter.char) {
        const engItem = outputItems[getEnglishStartIdx()];
        const isUpper = engItem.letterCase === 'upper';
        const ch = letter.char;
        const audioParts = (letter.audio || '').split(' ');
        const letterChar = isUpper ? (ch[0] || '') : (ch[1] || '');
        const letterAudio = isUpper ? (audioParts[0] || letterChar) : (audioParts[1] || letterChar);
        engItem.oneHot += '+' + oneHot;
        engItem.braille += braille;
        engItem.char += letterChar;
        engItem.audio = engItem.char;
        if (engItem.singleUpper && !engItem.allCaps && engItem.char.length === 1) {
            engItem.letterCase = 'lower';
        }
        return { speakTextArg: letterAudio };
    }
    outputItems.splice(cursor.idx, 0, {
        braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
    });
    cursor.idx = cursor.idx + 1;
    if (oneHot === '000000') {
        return { speakTextArg: '空方' };
    }
    return null;
}

function _handlePinyinInput(oneHot, braille) {
    const entry = _lookupBraille(oneHot);
    const pinyin = entry ? entry.label : '';
    const audio = entry ? entry.audio : '';
    const char = entry ? (_resolveEo(oneHot, cursor.idx) || entry.char) : '';

    const item = { braille, pinyin, char, audio, oneHot };
    if (AMBIG_INITIALS[oneHot]) item._ambigInitial = true;
    outputItems.splice(cursor.idx, 0, item);
    cursor.idx = cursor.idx + 1;

    let merged = false;
    if (cursor.idx >= 2) {
        const prev = outputItems[cursor.idx - 2];
        const curr = outputItems[cursor.idx - 1];
        if (!prev.isNumber && !prev.isEnglish && !curr.isNumber && !curr.isEnglish) {
            const combinedKey = prev.oneHot + '+' + curr.oneHot;
            const combinedEntry = _lookupBraille(combinedKey);
            if (combinedEntry) {
                const combinedBraille = oneHotToBrailleChar(combinedKey);
                outputItems.splice(cursor.idx - 2, 2, {
                    braille: combinedBraille,
                    pinyin: combinedEntry.label,
                    char: combinedEntry.char,
                    audio: combinedEntry.audio,
                    oneHot: combinedKey
                });
                cursor.idx = cursor.idx - 1;
                merged = true;
            }
        }
    }

    cursor.idx = cursor.idx + _applyPunctSpacing(outputItems[cursor.idx - 1].oneHot, cursor.idx - 1);
    return { speakBrailleArg: merged ? outputItems[cursor.idx - 1].oneHot : oneHot };
}

function _commitOneHot(oneHot, { silent = false, clearDots = false } = {}) {
    const braille = oneHotToBrailleChar(oneHot);

    _resolveDeferredPunct(oneHot);
    _resolveAmbigInitial(oneHot);

    const result = _handleNumberSign(oneHot, braille)
        || _handleNumberContext(oneHot, braille)
        || _handleCapitalSign(oneHot, braille)
        || _handleLowercaseSign(oneHot, braille)
        || _handleEnglishContext(oneHot, braille)
        || _handlePinyinInput(oneHot, braille);

    _finalizeCommit(result, { silent, clearDots });
}

/**
 * @description: 插入一个空方（无点位的空白盲文字符）
 * @return {void}
 */
export function inputSpace() {
    pushUndo();
    invalidatePageCache();
    outputItems.splice(cursor.idx, 0, { braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000' });
    cursor.idx = cursor.idx + 1;
    speakText('空方');
    renderOutput();
}

/**
 * @description: 删除光标前一个输出字符（Backspace行为），删除后确保光标在合法group边界
 *   数字项逐位删除：先删末位数字，再删数号
 * @return {void}
 */
export function deleteLast() {
    if (cursor.idx === 0) return;
    pushUndo();
    invalidatePageCache();

    const target = outputItems[cursor.idx - 1];

    // ── 数字项逐位退格 ──
    if (target.isNumber) {
        const parts = target.oneHot.split('+');
        if (parts.length > 1) {
            // 删除最后一位数字
            const removedDigit = target.char.slice(-1);
            parts.pop();
            target.oneHot = parts.join('+');
            target.braille = Array.from(target.braille).slice(0, -1).join('');
            target.char = target.char.slice(0, -1);
            target.audio = target.char || '数号';
            stopSpeech();
            speakText('删除' + (removedDigit || '数号'));
            renderOutput();
            return;
        }
        // 只剩数号，整项删除
        outputItems.splice(cursor.idx - 1, 1);
        cursor.idx = cursor.idx - 1;
        const meta = computeItemMeta();
        cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, -1);
        stopSpeech();
        speakText('删除数号');
        renderOutput();
        return;
    }

    // ── 英文项逐位退格 ──
    if (target.isEnglish) {
        const parts = target.oneHot.split('+');
        if (parts.length > 1) {
            // 删除最后一位字母
            const removedChar = target.char.slice(-1);
            parts.pop();
            target.oneHot = parts.join('+');
            target.braille = Array.from(target.braille).slice(0, -1).join('');
            target.char = target.char.slice(0, -1);
            target.audio = target.char;
            // 如果删到只剩符号，恢复为符号的 audio
            if (parts.length === 1) {
                const signEntry = ONEHOT_MAPPINGS.letter[parts[0]];
                target.audio = signEntry ? signEntry.audio : '';
                if (target.letterCase === 'upper' && target.singleUpper) {
                    target.letterCase = 'upper';
                }
            }
            stopSpeech();
            speakText('删除' + (removedChar || '字母符号'));
            renderOutput();
            return;
        }
        // 只剩字母符号，整项删除
        outputItems.splice(cursor.idx - 1, 1);
        cursor.idx = cursor.idx - 1;
        const meta = computeItemMeta();
        cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, -1);
        stopSpeech();
        speakText('删除字母符号');
        renderOutput();
        return;
    }

    // ── 普通删除 ──
    const deleted = outputItems[cursor.idx - 1];
    outputItems.splice(cursor.idx - 1, 1);
    cursor.idx = cursor.idx - 1;

    const meta = computeItemMeta();
    cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, -1);

    stopSpeech();
    speakText('删除' + (deleted.audio || deleted.pinyin.trim() || '空方'));
    renderOutput();
}

/**
 * @description: 删除光标后一个输出字符（Delete键行为），删除后确保光标在合法group边界
 * @return {void}
 */
export function deleteForward() {
    if (cursor.idx < outputItems.length) {
        pushUndo();
        invalidatePageCache();
        const deleted = outputItems[cursor.idx];
        outputItems.splice(cursor.idx, 1);

        const meta = computeItemMeta();
        cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, 1);

        stopSpeech();
        speakText('删除' + (deleted.audio || deleted.pinyin.trim() || '空方'));
        renderOutput();
    }
}

/**
 * @description: 删除所有选中的输出项，播报"批量选定删除"
 * @return {void}
 */
export function deleteSelected() {
    if (cursor.selectedIndices.size === 0) return;
    pushUndo();
    invalidatePageCache();
    const sorted = [...cursor.selectedIndices].sort((a, b) => b - a); // 从后往前删
    for (const idx of sorted) {
        outputItems.splice(idx, 1);
    }
    const minIdx = Math.min(...cursor.selectedIndices);
    cursor.idx = Math.min(cursor.idx, minIdx);
    if (cursor.idx > outputItems.length) cursor.idx = outputItems.length;
    const meta = computeItemMeta();
    cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, -1);
    cursor.clearSelection();
    stopSpeech();
    speakText('批量选定删除');
    renderOutput();
}

/**
 * @description: Shift+方向键扩展/收缩选择范围
 *   以锚点（首次按下时的光标位置）为固定端，光标为移动端
 *   选中范围为锚点与光标之间的所有项，支持双向收缩
 * @param {number} delta 扩展方向，-1向左，+1向右
 * @return {void}
 */
export function selectExtend(delta) {
    if (!SETTINGS.multiSelect || outputItems.length === 0) return;

    const meta = computeItemMeta();

    // 首次选择：以当前光标位置为锚点
    if (cursor.selectedIndices.size === 0) {
        cursor.selAnchor = cursor.idx;
    }

    // 移动光标（移动端）
    let newIdx = cursor.idx + delta;
    if (newIdx < 0) newIdx = 0;
    if (newIdx > outputItems.length) newIdx = outputItems.length;
    cursor.idx = cursor.snapToBoundary(newIdx, outputItems.length, meta, delta);

    // 以锚点和光标之间的区间重建选择
    cursor.selectedIndices.clear();
    const from = Math.min(cursor.selAnchor, cursor.idx);
    const to = Math.max(cursor.selAnchor, cursor.idx);
    for (let i = from; i < to; i++) {
        cursor.selectedIndices.add(i);
    }

    renderOutput();
    ensureCursorVisible();
    speakText(cursor.selectedIndices.size > 0 ? `已选${cursor.selectedIndices.size}项` : '取消选择');
}

/**
 * @description: 移动光标位置（以 braille-group 为单位跳转，跳过组内部），防抖后播报光标前的内容
 * @param {number} delta 移动方向，-1左移，+1右移
 * @return {void}
 */
export function moveCursor(delta) {
    // 非Shift移动光标时清除选择
    if (cursor.selectedIndices.size > 0) {
        cursor.clearSelection();
    }
    let newIdx = cursor.idx + delta;
    if (newIdx < 0 || newIdx > outputItems.length) return;
    const meta = computeItemMeta();
    cursor.idx = cursor.snapToBoundary(newIdx, outputItems.length, meta, delta);
    renderOutput();
    ensureCursorVisible();

    // 光标移动防抖：停止连续按键时不播报，停下后再播报
    clearTimeout(cursor._debounceTimer);
    cursor._debounceTimer = setTimeout(() => {
        if (outputItems.length === 0) return;
        // 重新计算 meta，避免闭包中 stale 数据导致索引错位
        const curMeta = computeItemMeta();

        if (cursor.idx === 0) {
            speakText('开头');
            return;
        }
        // 光标在末尾
        if (cursor.idx >= outputItems.length) {
            const lastMeta = curMeta[outputItems.length - 1];
            if (lastMeta && lastMeta.merged) {
                speakText(pinyinToSpokenChar(lastMeta.merged));
            } else {
                const last = outputItems[outputItems.length - 1];
                speakText(_getCursorSpeechText(last));
            }
            return;
        }
        const item = outputItems[cursor.idx - 1];  // 获取光标前一项
        const itemMeta = curMeta[cursor.idx - 1];  // 获取光标前项的 meta
        if (item.oneHot === '000000') { speakText('空方'); }
        else if (itemMeta && itemMeta.merged) { speakText(pinyinToSpokenChar(itemMeta.merged)); }
        else speakText(_getCursorSpeechText(item));
    }, cursor._DEBOUNCE_MS);
}


/**
 * @description: 垂直方向移动光标——根据跳转模式跳到上/下一个分隔处（或开头/末尾）
 * @param {number} direction -1 向上，+1 向下
 * @return {void}
 */
function _getCursorSpeechText(item) {
    const cleanedAudio = String(item.audio || '').replace(/数号/g, '').trim();
    const text = pinyinToSpokenChar(cleanedAudio || item.pinyin.trim());
    return text || '空方';
}

function _moveCursorVertical(direction) {
    if (outputItems.length === 0) return;
    if (cursor.selectedIndices.size > 0) {
        cursor.clearSelection();
    }

    // 查找目标分隔处
    let target;
    const edgeSpeech = direction < 0 ? '开头' : '末尾';
    if (direction < 0) {
        target = cursor.idx - 1;
        while (target > 0 && !cursor.isJumpBoundary(target, outputItems, SETTINGS.cursorJumpMode)) target--;
    } else {
        target = cursor.idx;
        if (target < outputItems.length && cursor.isJumpBoundary(target, outputItems, SETTINGS.cursorJumpMode)) target++;
        while (target < outputItems.length && !cursor.isJumpBoundary(target, outputItems, SETTINGS.cursorJumpMode)) target++;
        target = Math.min(target, outputItems.length);
    }

    const meta = computeItemMeta();
    cursor.idx = cursor.snapToBoundary(target, outputItems.length, meta, direction);
    renderOutput();
    ensureCursorVisible();

    clearTimeout(cursor._debounceTimer);
    cursor._debounceTimer = setTimeout(() => {
        if ((direction < 0 && cursor.idx === 0) || (direction > 0 && cursor.idx >= outputItems.length)) {
            speakText(edgeSpeech);
            return;
        }
        const curMeta = computeItemMeta();
        const item = outputItems[cursor.idx - 1];
        const itemMeta = curMeta[cursor.idx - 1];
        if (item.oneHot === '000000') speakText('空方');
        else if (itemMeta && itemMeta.merged) speakText(pinyinToSpokenChar(itemMeta.merged));
        else speakText(_getCursorSpeechText(item));
    }, cursor._DEBOUNCE_MS);
}

/**
 * @description: 向上移动光标——根据跳转模式跳到上一个分隔处（或开头）
 * @return {void}
 */
export function moveCursorUp() { _moveCursorVertical(-1); }

/**
 * @description: 向下移动光标——根据跳转模式跳到下一个分隔处（或末尾）
 * @return {void}
 */
export function moveCursorDown() { _moveCursorVertical(1); }

/**
 * @description: 直接通过 oneHot 编码插入盲文字符（支持数字模式）
 *   批量加载、dev panel、打字输入模式等路径调用此函数，委托 _commitOneHot 静默执行
 * @param {string} oneHot 6位二进制字符串如 "110000"
 * @return {void}
 */
export function inputOneHot(oneHot) {
    pushUndo();
    if (!getRenderSuppressed()) invalidatePageCache();
    _commitOneHot(oneHot, { silent: true, clearDots: false });
}

// ── 数字输入 ──

/**
 * @description: 构建数字盲文 oneHot 序列，自动补充数号。若已在数字上下文中先插入空方脱离。
 * @param {string|number} num 数字，如 "123.456" 或 42
 * @return {string[]} oneHot 数组
 */
export function numberToBraille(num) {
    _ensureDigitToOneHot();
    const oneHotList = [];
    if (isInNumberContext()) {
        oneHotList.push('000000');
    } else if (cursor.idx > 0 && outputItems[cursor.idx - 1].oneHot !== '000000') {
        // 不在数字上下文且不在开头/空方后，强制插入空方再进入数字上下文
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

// ── 英文输入 ──
const _EN_PUNCT_TO_ONEHOT = {
    '?': '000010+001000',
    '!': '000011+010000',
    '.': '000010+011000',
    ',': '000010',
};

/**
 * @description: 构建英文盲文 oneHot 序列，自动处理大小写符号和空格。若已在英文上下文中先脱离。
 * @param {string} text 英文文本，如 "Can you type without looking?"
 * @return {string[]} oneHot 数组
 */
export function englishToBraille(text, prevIsSpaceOverride = null) {
    _ensureLetterToOneHot();
    const oneHotList = [];
    let localInEng = false;
    let prevIsSpace = prevIsSpaceOverride != null ? prevIsSpaceOverride : (cursor.idx === 0 || outputItems[cursor.idx - 1].oneHot === '000000');
    if (isInEnglishContext()) {
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
                    // 后续仍为大写 → 全大写模式（两个连续大写符号）
                    oneHotList.push(CAPITAL_SIGN, CAPITAL_SIGN);
                } else {
                    // 仅当前字母大写 → 单大写符号
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

// ── 汉字→盲文转换 ──

/**
 * @description: 将单个拼音转为 oneHot 编码数组
 * @param {string} py 拼音字符串（可带声调数字）
 * @return {string[]} oneHot数组
 */
function _pinyinToOneHot(py) {
    const result = [];
    let base = py;
    let tone = '';
    if (/\d$/.test(py)) { tone = py.slice(-1); base = py.slice(0, -1); }

    // j/q/x 后紧接 u 时才是 ü（如 ju→jü, que→qüe）；jiu 中的 u 不是韵母开头，不替换
    if (/^[jqx]/.test(base) && base.charAt(1) === 'u') {
        base = base.charAt(0) + 'ü' + base.slice(2);
    }

    // 反向 solo final: "yi"→"i", "wo"→"uo" 等
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
 * @description: 将混合中英数字的文本转为盲文 oneHot 序列
 *   按字符类型分段：中文→拼音转盲文，英文→字母盲文，数字→数字盲文
 * @param {string} text 混合文本
 * @return {string[]} oneHot数组
 */
export function mixedToBraille(text) {
    _ensureBrailleReverseMaps();

    const oneHotList = [];
    let prevIsSpace = (cursor.idx === 0 || outputItems[cursor.idx - 1].oneHot === '000000');
    let i = 0;
    while (i < text.length) {
        const ch = text[i];

        // 空白字符 → 空方
        if (/\s/.test(ch)) {
            oneHotList.push('000000');
            prevIsSpace = true;
            i++;
            continue;
        }

        // 数字段：连续数字+小数点
        if (/[\d.]/.test(ch)) {
            let numStr = '';
            while (i < text.length && /[\d.]/.test(text[i])) {
                numStr += text[i];
                i++;
            }
            oneHotList.push(...numberToBraille(numStr));
            prevIsSpace = false;
            continue;
        }

        // 英文段：连续字母
        if (/[a-zA-Z]/.test(ch)) {
            let engStr = '';
            while (i < text.length && /[a-zA-Z]/.test(text[i])) {
                engStr += text[i];
                i++;
            }
            oneHotList.push(...englishToBraille(engStr, prevIsSpace));
            prevIsSpace = false;
            continue;
        }

        // 中文及标点 → 累积到下一个非中文/标点字符，整段走 chineseToBraille
        let cnStr = '';
        while (i < text.length && !/[\s\d.a-zA-Z]/.test(text[i])) {
            cnStr += text[i];
            i++;
        }
        if (cnStr) {
            oneHotList.push(...chineseToBraille(cnStr));
            prevIsSpace = false;
        }
    }

    return oneHotList;
}

/**
 * @description: 将汉字文本转为盲文 oneHot 序列
 *   开启分词时：先分词，词与词之间（不与标点相邻处）插入空方(000000)
 * @param {string} chineseText 汉字文本
 * @return {string[]} oneHot数组
 */
export function chineseToBraille(chineseText) {
    _ensureBrailleReverseMaps();

    // 不分词：逐字转拼音 → oneHot，直接返回
    if (!SETTINGS.wordSegmentation) {
        const pinyinArr = chineseToPinyin(chineseText, { toneType: 'num', type: 'array' });
        // 合并连续破折号 — → ——（盲文映射中 —— 是组合码）
        for (let i = 0; i < pinyinArr.length - 1; i++) {
            if (pinyinArr[i] === '—' && pinyinArr[i + 1] === '—') {
                pinyinArr.splice(i, 2, '——');
            }
        }
        const oneHotList = [];
        for (const py of pinyinArr) {
            oneHotList.push(..._pinyinToOneHot(py));
        }
        return oneHotList;
    }

    // 分词流程：基于 chineseToSegedPinyin_pyp 的分词+注音结果
    // 输出格式：[[{origin,result}], [{origin,result}], ...] 每个子数组是一个分词片段
    const segmentedPinyin = chineseToSegedPinyin_pyp(chineseText);

    // 合并连续破折号 — → ——（盲文映射中 —— 是组合码）
    for (let i = 0; i < segmentedPinyin.length - 1; i++) {
        const cur = segmentedPinyin[i];
        const nxt = segmentedPinyin[i + 1];
        if (cur.length === 1 && cur[0].origin === '—' &&
            nxt.length === 1 && nxt[0].origin === '—') {
            segmentedPinyin.splice(i, 2, [{ origin: '——', result: '——' }]);
        }
    }

    const oneHotList = [];
    const PUNCT_RE = /^[\s，。！？；：""''（）【】《》、…—～,\.!\?;:'"()\[\]{}]+$/;

    for (let i = 0; i < segmentedPinyin.length; i++) {
        const seg = segmentedPinyin[i];
        const head = seg[0];
        const isPunct = seg.length === 1 && PUNCT_RE.test(head.origin);

        if (isPunct) {
            const oh = REVERSE_ONEHOT_MAPPINGS.charToHot?.[head.origin];
            if (oh) oneHotList.push(oh);
        } else {
            for (const ch of seg) {
                oneHotList.push(..._pinyinToOneHot(ch.result));
            }
        }

        if (i + 1 < segmentedPinyin.length) {
            const nextHead = segmentedPinyin[i + 1][0];
            const nextIsPunct = segmentedPinyin[i + 1].length === 1 && PUNCT_RE.test(nextHead.origin);
            if (!isPunct && !nextIsPunct && oneHotList[oneHotList.length - 1] !== '000000') {
                oneHotList.push('000000');
            }
        }
    }

    // 去重连续空方
    const deduped = [];
    for (const oh of oneHotList) {
        if (oh === '000000' && deduped[deduped.length - 1] === '000000') continue;
        deduped.push(oh);
    }
    return deduped;
}

// ── 打字输入模式 ──

let _normalInputMode = false;

/**
 * @description: 设置输入模式
 * @param {string} mode 'braille' | 'normal'
 * @return {void}
 */
export function setInputMode(mode) {
    _normalInputMode = (mode === 'normal');
    const panel = document.querySelector('.input-panel');
    const wrap = document.getElementById('normalInputWrap');
    const textarea = document.getElementById('normalInputTextarea');
    const tabs = document.querySelectorAll('.mode-toggle-tab');

    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));

    if (_normalInputMode) {
        panel.classList.add('normal-mode');
        wrap.style.display = '';
        textarea.focus();
        speakText('打字输入模式');
    } else {
        panel.classList.remove('normal-mode');
        wrap.style.display = 'none';
        textarea.value = '';
        speakText('盲文输入模式');
    }
}

/**
 * @description: 打字输入模式下确认内容，转为盲文并渲染
 * @return {void}
 */
export async function normalInputConfirm() {
    const textarea = document.getElementById('normalInputTextarea');
    const text = textarea.value.trim();
    if (!text) { speakText('内容为空'); return; }

    const result = mixedToBraille(text);
    if (result && result.length > 0) {
        await _batchInputOneHot(result);
        speakText('已输入');
        textarea.value = '';
    } else {
        speakText('无法转换输入内容');
    }
}
