// loadMappings.js - 各类映射数据的定义与集中加载

// ── 盲文字符映射 ──
const PINYIN_MAPPING = {};
const PUNC_MAPPING = {};
const NUMBER_MAPPING = {};
const LETTER_MAPPING = {};
let MAPPING_CATEGORIES = [];
const NUMBER_SIGN = '001111';
const CAPITAL_SIGN = '000001';
const LOWERCASE_SIGN = '000011';

// ── 拼音→汉字映射 ──
let _pinyinCharMap = null;

// ── 单独韵母映射（自成音节时修正拼写，如 i→yi, u→wu, ü→yu）──
let _soloFinalMap = null;

/**
 * @description: 加载单独韵母→完整拼音的映射数据
 * @param {string} jsonPath JSON文件路径
 * @return {Promise<void>}
 */
async function loadSoloPinyinMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    _soloFinalMap = await resp.json();
}

/**
 * @description: 从 JSON 文件加载拼音→汉字的映射数据
 * @param {string} jsonPath JSON文件路径
 * @return {Promise<void>}jqx
 */
async function loadPinyinCharMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    _pinyinCharMap = await resp.json();
}

/**
 * @description: 从 JSON 加载盲文字符映射数据，分别填充 PINYIN_MAPPING / PUNC_MAPPING / NUMBER_MAPPING / LETTER_MAPPING
 *   数字分类的条目（除数号外）只加入 NUMBER_MAPPING
 *   英文字母分类的条目（除大小写符号外）只加入 LETTER_MAPPING
 * @param {string} jsonPath JSON文件路径
 * @return {Promise<void>}
 */
async function loadBrailleCharMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    const data = await resp.json();
    MAPPING_CATEGORIES = data.categories;
    data.categories.forEach(cat => {
        cat.entries.forEach(e => {
            if (cat.name === '数字') {
                NUMBER_MAPPING[e.oneHot] = { char: e.char, label: e.label, audio: e.audio || '' };
                return; // 数字分类不加入PINYIN_MAPPING，避免数号覆盖韵母eng
            }
            if (cat.name === '英文字母') {
                LETTER_MAPPING[e.oneHot] = { char: e.char, label: e.label, audio: e.audio || '' };
                return; // 英文字母分类同理，避免大小写符号覆盖其他映射
            }
            if (cat.name === '标点') {
                PUNC_MAPPING[e.oneHot] = { char: e.char, label: e.label, audio: e.audio || '' };
            } else {
                PINYIN_MAPPING[e.oneHot] = { char: e.char, label: e.label, audio: e.audio || '' };
            }
        });
    });
    // 加载完盲文映射后立即构建拼音组件集合
    _buildValidComponents(MAPPING_CATEGORIES);
}

/**
 * @description: 在 PINYIN_MAPPING 和 PUNC_MAPPING 中查找盲文条目
 * @param {string} oneHot 6位oneHot编码
 * @return {object|undefined}
 */
function _lookupBraille(oneHot) {
    return PINYIN_MAPPING[oneHot] || PUNC_MAPPING[oneHot];
}

/**
 * @description: 加载所有映射数据
 * @return {Promise<void>}
 */
async function loadAllMappings() {
    await loadBrailleCharMapping('./data/braille_character_mapping.json');
    await loadPinyinCharMapping('./data/pinyin_char_mapping.json');
    await loadSoloPinyinMapping('./data/braille_solo_pinyin_mapping.json');
}
