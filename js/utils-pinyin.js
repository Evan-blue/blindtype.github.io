// utils-pinyin.js - 拼音转换工具（封装 pinyin-pro）

import { pinyin, segment, addDict } from '../node_modules/pinyin-pro/dist/index.mjs';
import CompleteDict from '../node_modules/@pinyin-pro/data/dist/complete.mjs';
addDict(CompleteDict);
import {
    ONEHOT_MAPPINGS,
    REVERSE_ONEHOT_MAPPINGS,
    PINYIN_MAPPINGS,
    _validInitials,
    _validFinals,
    _buildValidComponents,
} from './loadMappings.js';

/**
 * @description: 将中文文本转为拼音数组(调用了pinyin-pro)
 * @param {string} text 中文文本
 * @param {object} [opts] 选项
 * @param {string} [opts.toneType='num'] 声调格式: 'num' | 'none' | 'symbol'
 * @param {string} [opts.type='array'] 返回类型: 'array' | 'string'
 * @param {string} [opts.separator=' '] type为'string'时的分隔符
 * @return {string[]|string} 拼音数组或字符串
 */
export function chineseToPinyin(text, opts = {}) {
    if (!text || typeof text !== 'string') return opts.type === 'string' ? '' : [];
    return pinyin(text, {
        toneType: opts.toneType || 'num',
        type: opts.type || 'array',
        separator: opts.separator || ' ',
    });
}

/**
 * @description: 将拼音字符串转为对应汉字用于播报（优先通过 pinyin_char 映射查找）
 *   若已是中文/英文/数字则直接返回；否则尝试补声调1~5查找
 * @param {string} str 拼音字符串（可能带或不带声调数字）
 * @return {string} 对应汉字，未命中时返回原串
 */
export function pinyinToSpokenChar(str) {
    if (!str || !PINYIN_MAPPINGS.toChar) return str;
    // 已是汉字
    if (/[一-鿿]/.test(str)) return str;
    const trimmed = str.trim();
    // 纯数字（含空格和点），非拼音，直接返回
    if (/^[\d\s.]+$/.test(trimmed)) return trimmed;

    // 先修正单独韵母（如 uo→wo, i→yi）
    const resolved = resolveSoloFinal(trimmed);

    // 已带声调：精确查找，命中返回汉字，否则回退原串
    if (/\d$/.test(resolved)) {
        return PINYIN_MAPPINGS.toChar[resolved] || str;
    }

    // 无声调：按1~5声依次查找，默认第一声
    for (let t = 1; t <= 5; t++) {
        const key = resolved + t;
        if (PINYIN_MAPPINGS.toChar[key]) return PINYIN_MAPPINGS.toChar[key];
    }
    return str;
}

/**
 * @description: 若拼音为单独韵母（自成音节），替换为正确的拼写形式
 *   如 i→yi, u→wu, ie→ye, üan→yuan 等
 * @param {string} str 拼音字符串
 * @return {string} 修正后的拼音，未命中时返回原串
 */
export function resolveSoloFinal(str) {
    if (!str || !PINYIN_MAPPINGS.soloFinals) return str;
    // 分离尾部声调数字，如 "uo3" → base="uo", tone="3"
    const m = str.match(/^(.+?)(\d)$/);
    const base = m ? m[1] : str;
    const tone = m ? m[2] : '';
    // 先查韵母自成音节，再查声母自成音节
    const corrected = (PINYIN_MAPPINGS.soloFinals.solo_finals && PINYIN_MAPPINGS.soloFinals.solo_finals[base])
        || (PINYIN_MAPPINGS.soloFinals.solo_initials && PINYIN_MAPPINGS.soloFinals.solo_initials[base]);
    return corrected ? corrected + tone : str;
}

// ── 文本分割 ──

export function splitText(text, locales = 'zh-CN', granularity = 'word') {
    const segObj = new Intl.Segmenter(locales, { granularity });
    return Array.from(segObj.segment(text)).map(seg => seg.segment);
}

// ── 拼音音节拆分 ──

/**
 * @description: 贪心拆分拼音基串为声母+韵母（不含声调数字）
 * @param {string} base 拼音基串，如 'zhong'、'an'、'n'
 * @return {{ initial: string, fin: string } | null} 拆分结果；无法拆分时返回 null
 */
export function _splitPinyinBase(base) {
    if (!_validInitials || !_validFinals || !base) return null;
    for (let split = 1; split < base.length; split++) {
        const init = base.slice(0, split);
        const fin = base.slice(split);
        if (_validInitials.has(init) && _validFinals.has(fin)) {
            return { initial: init, fin };
        }
    }
    return null;
}

/**
 * @description: 根据标调省写规则，推断省写声调数字
 *   若 merged 已有声调则直接返回 null；否则按声母→韵母自成音节两层规则查找
 * @param {string} merged 拼音音节（可带声调），如 'ba'、'zhi'、'yi'、'an'
 * @return {string|null} 省写的声调数字 '1'~'4'；无法推断返回 null
 */
export function _resolveOmittedTone(merged) {
    if (!PINYIN_MAPPINGS.omitRule || /\d$/.test(merged)) return null;

    // 1. 声母+韵母 → 查 initials 表
    const split = _splitPinyinBase(merged);
    if (split) {
        return PINYIN_MAPPINGS.omitRule.initials[split.initial] || null;
    }

    // 2. 韵母自成音节 → 查 solo 表
    const solo = PINYIN_MAPPINGS.omitRule.solo;
    if (!solo) return null;

    // 反向解析：如 "yi" → "i", "wo" → "uo"
    const base = (REVERSE_ONEHOT_MAPPINGS.solo && REVERSE_ONEHOT_MAPPINGS.solo[merged])
        || merged;

    // 查例外表
    if (solo.exceptions && base in solo.exceptions) {
        const val = solo.exceptions[base];
        return val === 'none' ? null : val;
    }

    // 确认为有效韵母则返回默认值
    if (_validFinals && _validFinals.has(base)) {
        return solo.default;
    }

    return null;
}

/**
 * @description: 检查字符串是否为合法拼音音节
 *   支持五种组合：声母+韵母+声调、韵母+声调、声母+声调、声母单独、声母+韵母
 * @param {string} str 拼音字符串，如 'ni3'、'hao'、'n'、'zhong1'
 * @return {boolean}
 */
export function isPinyinSyllable(str) {
    if (!str) return false;

    // 提取声调
    let tone = '';
    let base = str;
    if (/\d$/.test(str)) { tone = str.slice(-1); base = str.slice(0, -1); }

    // 1. 查 pinyin_char_map（覆盖所有标准完整音节）
    if (PINYIN_MAPPINGS.toChar) {
        if (tone && PINYIN_MAPPINGS.toChar[str]) return true;
        if (!tone) {
            for (const t of ['1', '2', '3', '4', '5']) {
                if (PINYIN_MAPPINGS.toChar[base + t]) return true;
            }
        }
    }

    // 2. 组件结构验证（基于盲文映射的声母/韵母分类，覆盖如 uo+声调 等非完整音节组合）
    if (!_validInitials) _buildValidComponents(ONEHOT_MAPPINGS.categories);
    if (!_validInitials || !_validFinals) return false;

    // 韵母单独 + 可选声调
    if (_validFinals.has(base)) return true;

    // 声母单独 + 可选声调
    if (_validInitials.has(base)) return true;

    // 声母+韵母 + 可选声调（贪心：先试最长声母）
    if (_splitPinyinBase(base)) return true;

    return false;
}

/**
 * @description: 将拼音组件字符数组拆分为合法拼音音节（贪心最长匹配）
 *   声调归属前部原则：有声调则声调及之前最长合法串为一组
 * @param {string[]} chars 拼音组件字符，如 ['n','i','h','ao','3']
 * @return {{ count: number, merged: string }[] | null} 音节数组；chars < 2 时返回 null
 */
export function splitPinyinChars(chars) {
    if (!chars || chars.length < 2) return null;
    const syllables = [];
    let i = 0;
    while (i < chars.length) {
        // 当前字符已是完整韵母且下一字符非声调数字时，独立成音节，防止韵母间误合并（如 e+n→en）
        if (_validFinals && _validFinals.has(chars[i])) {
            const next = i + 1 < chars.length ? chars[i + 1] : '';
            if (!/^[1-5]$/.test(next)) {
                syllables.push({ count: 1, merged: resolveSoloFinal(chars[i]) });
                i++;
                continue;
            }
        }
        let bestLen = 0;
        let bestStr = '';
        for (let len = 1; len <= 5 && i + len <= chars.length; len++) {
            const sub = chars.slice(i, i + len).join('');
            if (isPinyinSyllable(sub)) {
                bestLen = len;
                bestStr = sub;
                // 当前匹配以声调结尾，音节已完整，停止扩展
                if (/\d$/.test(sub)) break;
                // 下一字符是声母则停止（如 zhe+n→zhen）
                const nextCh = i + len < chars.length ? chars[i + len] : '';
                if (nextCh && _validInitials && _validInitials.has(nextCh)) break;
                // 当前匹配以韵母结尾且下一字符也是韵母则停止（如 le+i→lei）
                const lastCh = sub.slice(-1);
                if (nextCh && _validFinals && _validFinals.has(lastCh) && _validFinals.has(nextCh)) break;
            }
        }
        if (bestLen > 0) {
            syllables.push({ count: bestLen, merged: resolveSoloFinal(bestStr) });
            i += bestLen;
        } else {
            syllables.push({ count: 1, merged: resolveSoloFinal(chars[i]) });
            i++;
        }
    }
    return syllables;
}
