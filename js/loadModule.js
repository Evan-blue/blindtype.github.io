// loadModule.js - 多CDN fallback加载外部模块

import { _setDictReady, chineseToSegedPinyin } from './utils-pinyin.js';

let _pinyinPro = null;
let _pinyinProPromise = null;

const PINYIN_PRO_URLS = [
    'https://esm.sh/pinyin-pro@3.28.1/es2022/pinyin-pro.mjs',
    'https://s4.zstatic.net/npm/pinyin-pro@3.24.0/index.mjs',
    'https://unpkg.com/pinyin-pro@3.18.2/dist/index.mjs',
];

const PINYIN_DICT_URLS = [
    'https://cdn.jsdelivr.net/npm/@pinyin-pro/data@1.3.0/dist/complete.mjs',
    'https://esm.sh/@pinyin-pro/data@1.3.0/complete',
];

async function myload(urls, moduleName) {
    for (const url of urls) {
        try {
            const mod = await import(url);
            console.log(`${moduleName} 从 ${url} 加载成功`);
            return mod;
        } catch (e) {
            console.warn(`${moduleName} 从 ${url} 加载失败:`, e.message);
        }
    }
    throw new Error('所有 CDN 加载失败: ' + urls.join(', '));
}

export async function loadPinyinPro() {
    if (_pinyinPro) return _pinyinPro;
    if (_pinyinProPromise) return _pinyinProPromise;

    const el = document.getElementById('dictLoading');
    el.innerHTML = '加载拼音库<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
    if (el) el.classList.add('visible');

    _pinyinProPromise = myload(PINYIN_PRO_URLS, 'pinyin-pro')
        .then(mod => { _pinyinPro = mod; return _pinyinPro; })
        .catch(e => { _pinyinProPromise = null; throw e; });

    return _pinyinProPromise;
}

export function getPinyinPro() {
    return _pinyinPro;
}

/**
 * @description: 加载 pinyin-pro 并注入完整字典（多 CDN fallback）
 * @return {Promise<void>}
 */
export async function _initPinyinPro() {
    const el = document.getElementById('dictLoading');
    if (el) el.classList.add('visible');
    el.innerHTML = '加载字典配置<span class="loading-dots"><span>.</span><span>.</span><span>.</span></span>';
    const mod = await loadPinyinPro();
    for (const url of PINYIN_DICT_URLS) {
        try {
            const dict = await import(url);
            mod.addDict(dict.default);
            window.pinyinPro = mod;
            _setDictReady(true);
            console.log('dict-ready:', JSON.stringify(chineseToSegedPinyin('小明硕士毕业于哈尔滨佛学院，后在加里敦大学深造')));
            if (el) el.remove();
            return;
        } catch (e) {
            console.warn(`pinyin-pro 完整字典从 ${url} 加载失败:`, e.message);
        }
    }
    if (el) el.remove();
}
