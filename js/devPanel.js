// devPanel.js - 可拖动开发者面板

/**
 * @description: 模拟盲文键盘逐键输入（走 toggleDot → confirmInput 流程，可视化反馈）
 * @param {string[]} oneHotList 一组6位oneHot编码
 * @param {number}   charDelay  字符间延迟(ms)，默认400
 * @return {Promise<void>}
 */
async function simulateKeyInput(oneHotList, charDelay = 400) {
    for (let i = 0; i < oneHotList.length; i++) {
        const dots = oneHotList[i].split('').map(Number);

        clearTimeout(debounceTimer); // 防止上一轮的防抖定时器干扰
        // 逐一点亮/关闭对应点位（toggleDot 使用1-based索引）
        for (let d = 0; d < 6; d++) {
            if (dotState[d] !== dots[d]) {
                toggleDot(d + 1);
                await sleep(100);
            }
        }
        // 关闭不需要的点位
        for (let d = 0; d < 6; d++) {
            if (dotState[d] && !dots[d]) {
                toggleDot(d + 1);
                await sleep(80);
            }
        }

        await sleep(120);
        confirmInput();
        await sleep(charDelay);
    }
}

/**
 * @description: Promise化的setTimeout
 * @param {number} ms 毫秒
 * @return {Promise<void>}
 */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * @description: 批量随机插入盲文字符（走 inputOneHot，快速填充）
 * @param {number} n        数量
 * @param {number} interval 字符间隔(ms)，默认60
 * @return {void}
 */
function generateRandomChars(n, interval = 60) {
    const allKeys = [...Object.keys(PINYIN_MAPPING), ...Object.keys(PUNC_MAPPING)];
    for (let i = 0; i < n; i++) {
        setTimeout(() => {
            const key = allKeys[Math.floor(Math.random() * allKeys.length)];
            inputOneHot(key);
        }, i * interval);
    }
}

/**
 * @description: 随机模拟键盘键入盲文字符（走 simulateKeyInput，可视化逐键过程）
 * @param {number} n 数量
 * @return {Promise<void>}
 */
async function typeRandomChars(n) {
    const allKeys = [...Object.keys(PINYIN_MAPPING), ...Object.keys(PUNC_MAPPING)];
    const list = [];
    for (let i = 0; i < n; i++) {
        list.push(allKeys[Math.floor(Math.random() * allKeys.length)]);
    }
    simulateKeyInput(list, 60);
}

// ── 汉字→盲文转换 ──

let _charToOneHot = null;
let _reverseSoloMap = null;
const _TONE_NUM_TO_SYM = { '1': '¯', '2': '´', '3': 'ˇ', '4': '`' };

function _buildBrailleReverseMaps() {
    if (_charToOneHot) return;
    _charToOneHot = {};
    for (const cat of MAPPING_CATEGORIES) {
        for (const entry of cat.entries) {
            for (const ch of entry.char.split('/')) {
                _charToOneHot[ch] = entry.oneHot;
            }
        }
    }
    // 反向 solo final 映射: "yi"→"i", "wo"→"uo", ...
    if (_soloFinalMap) {
        _reverseSoloMap = {};
        for (const [k, v] of Object.entries(_soloFinalMap)) {
            _reverseSoloMap[v] = k;
        }
    }
}

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
    const actualBase = (_reverseSoloMap && _reverseSoloMap[base]) ? _reverseSoloMap[base] : base;

    // 拆分声母+韵母
    let initial = '';
    let fin = actualBase;
    if (!_validFinals || !_validFinals.has(actualBase)) {
        for (let split = 1; split < actualBase.length; split++) {
            const init = actualBase.slice(0, split);
            const f = actualBase.slice(split);
            if (_validFinals && _validFinals.has(f) && _validInitials && _validInitials.has(init)) {
                initial = init;
                fin = f;
                break;
            }
        }
    }

    if (initial) {
        const oh = _charToOneHot[initial];
        if (oh) result.push(oh);
    }
    if (fin) {
        const oh = _charToOneHot[fin];
        if (oh) result.push(oh);
    }
    if (tone) {
        const sym = _TONE_NUM_TO_SYM[tone];
        if (sym) {
            const oh = _charToOneHot[sym];
            if (oh) result.push(oh);
        }
    }
    return result;
}

/**
 * @description: 将汉字文本转为盲文 oneHot 序列并渲染到输出区
 *   开启分词时：先分词，词与词之间（不与标点相邻处）插入空方(000000)
 * @param {string} chineseText 汉字文本
 * @return {string[]} oneHot数组
 */
function chineseToBraille(chineseText) {
    _buildBrailleReverseMaps();

    // 未开启分词时，直接按字符转换
    if (!SETTINGS.wordSegmentation) {
        const pinyinArr = pinyin(chineseText, { toneType: 'num', type: 'array' });
        const oneHotList = [];
        for (const py of pinyinArr) {
            oneHotList.push(..._pinyinToOneHot(py));
        }
        return oneHotList;
    }

    const segments = splitText(chineseText, 'zh-CN', 'word');
    const oneHotList = [];

    const PUNCT_RE = /^[\s，。！？；：""''（）【】《》、…—～,\.!\?;:'"()\[\]{}]+$/;

    for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isPunct = PUNCT_RE.test(seg);

        // 标点同样转盲文，不能跳过
        const pinyinArr = pinyin(seg, { toneType: 'num', type: 'array' });
        for (const py of pinyinArr) {
            oneHotList.push(..._pinyinToOneHot(py));
        }

        // 词与词之间（不与标点相邻）插入空方，避免连续空方
        if (i + 1 < segments.length) {
            const nextIsPunct = PUNCT_RE.test(segments[i + 1]);
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

/**
 * @description: 初始化开发者面板（绑定拖动逻辑和测试按钮事件）
 * @return {void}
 */
function initDevPanel() {
    const panel = document.getElementById('devPanel');
    const header = panel.querySelector('.dev-header');

    // ── 按钮不触发拖动 ──
    document.getElementById('devClose').addEventListener('mousedown', e => e.stopPropagation());

    // ── 关闭按钮 ──
    document.getElementById('devClose').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // ── 键盘输入 "devpanel" 重新显示面板 ──
    (function() {
        const SECRET = 'devpanel';
        let buf = '';
        document.addEventListener('keydown', (e) => {
            if (panel.style.display !== 'none') return;
            // 忽略功能键和组合键
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key.length === 1) {
                buf += e.key.toLowerCase();
                if (buf.length > SECRET.length) buf = buf.slice(-SECRET.length);
                if (buf === SECRET) {
                    panel.style.display = '';
                    buf = '';
                }
            }
        });
    })();

    // ── hover 展开，离开收起（pin 时保持展开）──
    const pinBtn = document.getElementById('devPin');
    let devPinned = false;

    panel.addEventListener('mouseenter', () => {
        panel.classList.remove('collapsed');
        updateDevFlip();
    });

    panel.addEventListener('mouseleave', () => {
        if (!devPinned) {
            panel.classList.add('collapsed');
        }
    });

    header.addEventListener('click', (e) => {
        if (dragMoved) return;
        if (e.target.closest('#devClose') || e.target.closest('#devPin')) return;
        // 点击 header 等同于切换 pin
        pinBtn.click();
    });

    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        devPinned = !devPinned;
        pinBtn.classList.toggle('pinned', devPinned);
        pinBtn.setAttribute('aria-pressed', devPinned);
        panel.classList.toggle('pinned', devPinned);
        if (devPinned) {
            panel.classList.remove('collapsed');
            updateDevFlip();
        }
    });

    // ── 根据屏幕位置切换上下展开方向 ──
    function updateDevFlip() {
        const rect = header.getBoundingClientRect();
        panel.classList.toggle('flip', rect.top + rect.height / 2 < window.innerHeight / 2);
    }

    // ── 拖动逻辑 ──
    let dragging = false, dragMoved = false, startX, startY, origLeft, origTop;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('#devClose') || e.target.closest('#devPin')) return;
        dragging = true;
        dragMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) {
            dragMoved = true;
        }
        let left = origLeft + e.clientX - startX;
        let top = origTop + e.clientY - startY;
        left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (dragging && dragMoved) updateDevFlip();
        dragging = false;
    });

    // ── 汉字输入转盲文 ──
    // ── 输入/键入模式 ──
    let devMode = 'input';
    const devModeBtns = panel.querySelectorAll('.dev-mode-btn');
    devModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            devMode = btn.dataset.mode;
            devModeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === devMode));
        });
    });

    function execMode(oneHotList) {
        if (devMode === 'type') {
            simulateKeyInput(oneHotList, 80);
        } else {
            oneHotList.forEach(oh => inputOneHot(oh));
        }
    }

    // ── 汉字输入转盲文 ──
    document.getElementById('devChineseInput').addEventListener('click', () => {
        const input = prompt('请输入汉字内容');
        if (!input || !input.trim()) return;
        execMode(chineseToBraille(input.trim()));
    });

    // ── 我爱你 ──
    document.getElementById('devLove').addEventListener('click', () => {
        const cells = [
            '101010', '001000',
            '010101', '011000',
            '101110', '010100', '001000',
        ];
        execMode(cells);
    });

    // ── 静夜思 ──
    document.getElementById('devJingYeSi').addEventListener('click', () => {
        execMode(chineseToBraille('床前明月光，疑是地上霜。举头望明月，低头思故乡。'));
    });

    // ── 老鼠爱大米 ──
    document.getElementById('devMouseLoveRice').addEventListener('click', () => {
        execMode(chineseToBraille('我爱你，爱着你，就像老鼠爱大米。'));
    });

    // ── 随机若干字符 ──
    document.getElementById('devRandom').addEventListener('click', () => {
        const input = prompt('请输入随机字符数量', '100');
        const n = parseInt(input, 10);
        if (!n || n < 1 || n > 500) return;
        const allKeys = [...Object.keys(PINYIN_MAPPING), ...Object.keys(PUNC_MAPPING)];
        const list = [];
        for (let i = 0; i < n; i++) {
            list.push(allKeys[Math.floor(Math.random() * allKeys.length)]);
        }
        execMode(list);
    });

    // 初始位于右上角，需要立即确定展开方向
    updateDevFlip();
}
