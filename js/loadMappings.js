// loadMappings.js - 各类映射数据的定义与集中加载

// ── 正向映射（oneHot → 盲文条目）──
export const ONEHOT_MAPPINGS = {
    pinyin: {},
    punc: {},
    number: {},
    letter: {},
    categories: [],
};

// ── 反向映射（字符/数字/字母/拼音 → oneHot，惰性构建）──
export const REVERSE_ONEHOT_MAPPINGS = {
    charToHot: null,
    digitToHot: null,
    letterToHot: null,
    solo: null,
};

// ── 拼音映射与规则数据 ──
export const PINYIN_MAPPINGS = {
    toChar: null,  // 拼音音节 → 汉字(播报用)
    soloFinals: null,  // 自成音节的韵母和声母 → 标准拼音（如 "yi" → "i"）
    omitRule: null,  // 标调省写规则
}

// ── 拼音组件集合（从盲文映射分类中提取）──
export let _validInitials = null;
export let _validFinals = null;

// ── 特殊符号常量 ──
export const NUMBER_SIGN = '001111';
export const CAPITAL_SIGN = '000001';
export const LOWERCASE_SIGN = '000011';
export const _TONE_NUM_TO_SYM = { '1': '¯', '2': '´', '3': 'ˇ', '4': '`' };


// ── 反向映射构建函数 ──

export function _buildValidComponents(categories) {
    if (!categories || !categories.length) return;
    _validInitials = new Set();
    _validFinals = new Set();
    for (const cat of categories) {
        if (cat.name === '声母') {
            for (const entry of cat.entries) {
                for (const ch of entry.char.split('/')) _validInitials.add(ch);
            }
        } else if (cat.name === '韵母') {
            for (const entry of cat.entries) {
                for (const ch of entry.char.split('/')) _validFinals.add(ch);
            }
        }
    }
}

export function ensureReverseSoloMap() {
    if (REVERSE_ONEHOT_MAPPINGS.solo || !PINYIN_MAPPINGS.soloFinals) return;
    REVERSE_ONEHOT_MAPPINGS.solo = {};
    const allSolo = {
        ...(PINYIN_MAPPINGS.soloFinals.solo_finals || {}),
        ...(PINYIN_MAPPINGS.soloFinals.solo_initials || {})
    };
    for (const [k, v] of Object.entries(allSolo)) {
        REVERSE_ONEHOT_MAPPINGS.solo[v] = k;
    }
}

export function _ensureBrailleReverseMaps() {
    if (REVERSE_ONEHOT_MAPPINGS.charToHot) return;
    REVERSE_ONEHOT_MAPPINGS.charToHot = {};
    for (const cat of ONEHOT_MAPPINGS.categories) {
        for (const entry of cat.entries) {
            for (const ch of entry.char.split('/')) {
                REVERSE_ONEHOT_MAPPINGS.charToHot[ch] = entry.oneHot;
            }
        }
    }
    ensureReverseSoloMap();
}

export function _ensureDigitToOneHot() {
    if (REVERSE_ONEHOT_MAPPINGS.digitToHot) return;
    REVERSE_ONEHOT_MAPPINGS.digitToHot = {};
    for (const [oh, entry] of Object.entries(ONEHOT_MAPPINGS.number)) {
        if (entry.char && entry.char !== '数号') {
            REVERSE_ONEHOT_MAPPINGS.digitToHot[entry.char] = oh;
        }
    }
}

export function _ensureLetterToOneHot() {
    if (REVERSE_ONEHOT_MAPPINGS.letterToHot) return;
    REVERSE_ONEHOT_MAPPINGS.letterToHot = {};
    for (const [oh, entry] of Object.entries(ONEHOT_MAPPINGS.letter)) {
        if (entry.char && entry.char.length === 2) {
            REVERSE_ONEHOT_MAPPINGS.letterToHot[entry.char[1]] = oh; // 小写字母 → oneHot
        }
    }
}

// ── 数据加载函数 ──

export async function loadSoloPinyinMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    PINYIN_MAPPINGS.soloFinals = await resp.json();
}

export async function loadToneOmitRule(jsonPath) {
    const resp = await fetch(jsonPath);
    PINYIN_MAPPINGS.omitRule = await resp.json();
}

export async function loadPinyinCharMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    PINYIN_MAPPINGS.toChar = await resp.json();
}

export async function loadBrailleCharMapping(jsonPath) {
    const resp = await fetch(jsonPath);
    const data = await resp.json();
    ONEHOT_MAPPINGS.categories = data.categories;
    data.categories.forEach(cat => {
        cat.entries.forEach(e => {
            const oneHot = e.oneHot;
            const obj = { char: e.char, label: e.label, audio: e.audio || '' };
            if (cat.name === '数字') {
                ONEHOT_MAPPINGS.number[oneHot] = obj;
                return; // 数号不加入拼音映射，避免覆盖韵母eng
            }
            if (cat.name === '英文字母') {
                ONEHOT_MAPPINGS.letter[oneHot] = obj;
                return; // 大小写符号不加入拼音映射
            }
            if (cat.name === '标点') {
                ONEHOT_MAPPINGS.punc[oneHot] = obj;
                return;
            }
            ONEHOT_MAPPINGS.pinyin[oneHot] = obj;
        });
    });
    _buildValidComponents(ONEHOT_MAPPINGS.categories);
}

export function _lookupBraille(oneHot) {
    return ONEHOT_MAPPINGS.pinyin[oneHot] || ONEHOT_MAPPINGS.punc[oneHot];
}

export async function loadAllMappings() {
    await loadBrailleCharMapping('./data/braille_character_mapping.json');
    await loadPinyinCharMapping('./data/pinyin_char_mapping.json');
    await loadSoloPinyinMapping('./data/braille_solo_pinyin_mapping.json');
    await loadToneOmitRule('./data/pinyin_omit_rule.json');
    ensureReverseSoloMap();
}
