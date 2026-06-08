// loadModule.js - 多CDN fallback加载外部模块

let _pinyinPro = null;
let _pinyinProPromise = null;

const PINYIN_PRO_URLS = [
    'https://esm.sh/pinyin-pro@3.28.1/es2022/pinyin-pro.mjs',
    'https://s4.zstatic.net/npm/pinyin-pro@3.24.0/index.mjs',
    'https://unpkg.com/pinyin-pro@3.18.2/dist/index.mjs',
];

const PINYIN_DICT_URLS = [
    'https://esm.sh/@pinyin-pro/data@1.3.0/complete',
    'https://cdn.jsdelivr.net/npm/@pinyin-pro/data@1.3.0/dist/complete.mjs',
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
    console.log('正在加载 pinyin-pro配置...');
    const mod = await loadPinyinPro();
    for (const url of PINYIN_DICT_URLS) {
        try {
            const dict = await import(url);
            mod.addDict(dict.default);
            const testStr = '小明硕士毕业于哈尔滨佛学院，后在加里敦大学深造';
            const testResult = mod.segment(testStr, { toneType: 'num', format: mod.OutputFormat.AllString });
            console.log(testResult);
            console.log(`pinyin-pro 完整字典从 ${url} 加载成功`);
            return;
        } catch (e) {
            console.warn(`pinyin-pro 完整字典从 ${url} 加载失败:`, e.message);
        }
    }
}
