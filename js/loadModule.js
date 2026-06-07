// loadModule.js - 多CDN fallback加载外部模块

let _pinyinPro = null;
let _pinyinProPromise = null;

const PINYIN_PRO_URLS = [
    'https://esm.sh/pinyin-pro@3.28.1/es2022/pinyin-pro.mjs',
    'https://s4.zstatic.net/npm/pinyin-pro@3.24.0/index.mjs',
    'https://unpkg.com/pinyin-pro@3.18.2/dist/index.mjs',
];

export async function loadPinyinPro() {
    if (_pinyinPro) return _pinyinPro;
    if (_pinyinProPromise) return _pinyinProPromise;

    _pinyinProPromise = (async () => {
        for (const url of PINYIN_PRO_URLS) {
            try {
                _pinyinPro = await import(url);
                console.log(`pinyin-pro 从 ${url} 加载成功`);
                return _pinyinPro;
            } catch (e) {
                console.warn(`pinyin-pro 从 ${url} 加载失败:`, e.message);
            }
        }
        throw new Error('pinyin-pro 所有 CDN 加载失败: ' + PINYIN_PRO_URLS.join(', '));
    })();

    return _pinyinProPromise;
}

export function getPinyinPro() {
    return _pinyinPro;
}
