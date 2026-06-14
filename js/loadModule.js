// loadModule.js - 多CDN fallback加载外部模块

import { chineseToSegedPinyin_pyp, chineseToSegedPinyin_my } from './utils-pinyin.js';

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
            // 加载完成进行测试
            console.log(`pinyin-pro 完整字典从 ${url} 加载中...`);
            const dict = await import(url);
            mod.addDict(dict.default);
            const testStr = '小明硕士毕业于哈尔滨佛学院，后在加里敦大学深造';
            const testResult = mod.segment(testStr, { toneType: 'num', format: mod.OutputFormat.AllArray });
            console.log(testResult);
            console.log(`pinyin-pro 完整字典从 ${url} 加载成功`);

            // ── 临时测试：对比两种分词拼音方案 ──
            (function testTwoApproaches() {
                const text = '早上好';

                console.group('方案A - chineseToSegedPinyin_pyp');
                try {
                    const resultA = chineseToSegedPinyin_pyp(text);
                    console.log('output:', JSON.stringify(resultA));
                    console.log('type:', Array.isArray(resultA) ? `array[${resultA.length}]` : typeof resultA);
                } catch (e) { console.error('方案A 报错:', e); }
                console.groupEnd();

                console.group('方案B - chineseToSegedPinyin_my');
                try {
                    const resultB = chineseToSegedPinyin_my(text);
                    console.log('output:', JSON.stringify(resultB));
                } catch (e) { console.error('方案B 报错:', e); }
                console.groupEnd();
            })();
            if (el) el.remove();
            window.pinyinPro = mod;
            return;
        } catch (e) {
            console.warn(`pinyin-pro 完整字典从 ${url} 加载失败:`, e.message);
        }
    }
    if (el) el.remove();
}
