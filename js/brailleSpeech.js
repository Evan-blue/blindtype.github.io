// brailleSpeech.js - 语音播报功能

// ── 双通道语音调度器 ──
// 主通道（操作反馈/朗读）与教程通道各自维护独立队列，互不阻塞。
// speechSynthesis 底层仍有串行限制，但两通道在 JS 层面完全解耦：
// - 主通道 stopSpeech() 不影响教程队列
// - 教程通道 stopTutorialSpeech() 默认不调 cancel()；forceStop=true 时立即打断

// ── 主通道队列 ──
const _speechQueue = []; // { text, rate, onend? }
let _speechPlaying = false;
let _speechGen = 0;

// ── 教程通道队列（独立，不与主通道互斥）──
const _tutorialQueue = []; // { text, rate, onend? }
let _tutorialPlaying = false;
let _tutorialGen = 0;

// 记录当前 speechSynthesis 中正在播放的是哪个通道，用于 cancel() 前检查避免误伤
let _activeChannel = null; // 'main' | 'tutorial' | null

function _setReadAloudLabel(text) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    const tn = btn.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = text;
}

function _playNext() {
    if (_speechPlaying || _speechQueue.length === 0) {
        if (!_speechPlaying && _speechQueue.length === 0) _setReadAloudLabel('朗读');
        return;
    }
    _speechPlaying = true;
    const gen = ++_speechGen;
    const item = _speechQueue.shift();
    if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
    }
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'zh-CN';
    u.rate = item.rate;
    u.onend = () => {
        if (gen !== _speechGen) return;
        _speechPlaying = false;
        _activeChannel = null;
        if (item.onend) item.onend();
        _playNext();
    };
    u.onerror = () => {
        if (gen !== _speechGen) return;
        _speechPlaying = false;
        _activeChannel = null;
        _playNext();
    };
    _activeChannel = 'main';
    window.speechSynthesis.speak(u);
}

function _playTutorialNext() {
    if (_tutorialPlaying || _tutorialQueue.length === 0) return;
    _tutorialPlaying = true;
    const gen = ++_tutorialGen;
    const item = _tutorialQueue.shift();
    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'zh-CN';
    u.rate = item.rate;
    u.onend = () => {
        if (gen !== _tutorialGen) return;
        _tutorialPlaying = false;
        _activeChannel = null;
        if (item.onend) item.onend();
        _playTutorialNext();
    };
    u.onerror = () => {
        if (gen !== _tutorialGen) return;
        _tutorialPlaying = false;
        _activeChannel = null;
        _playTutorialNext();
    };
    _activeChannel = 'tutorial';
    window.speechSynthesis.speak(u);
}

/**
 * @description: 主通道播报（操作反馈、朗读等），新请求替换排队中的旧请求
 * @param {string} text  播报内容
 * @param {number} rate  播报速度
 * @return {boolean}
 */
function speakText(text, rate) {
    if (!SETTINGS.allowSpeech) return false;
    if (rate === undefined) rate = SETTINGS.speechRate || 0.9;
    if (!window.speechSynthesis) return false;
    _speechQueue.length = 0; // 新主通道请求替换旧请求
    _speechQueue.push({ text, rate });
    _playNext();
    return true;
}

/**
 * @description: 停止主通道语音（不影响教程通道）
 * @return {void}
 */
function stopSpeech() {
    _speechQueue.length = 0;
    if (_speechPlaying) {
        _speechPlaying = false;
        // 仅当当前播放的是主通道时才 cancel，避免误杀教程语音
        if (_activeChannel === 'main' || !_activeChannel) {
            window.speechSynthesis.cancel();
        }
        _playNext();
    }
}

/**
 * @description: 教程通道播报
 * @param {string} text
 * @param {number} rate
 * @param {function} onend 播报自然结束时回调（被取消时不回调）
 * @return {boolean}
 */
function speakTutorialText(text, rate, onend) {
    if (!SETTINGS.allowSpeech) { if (onend) onend(); return false; }
    if (!window.speechSynthesis) return false;
    _tutorialQueue.push({ text, rate, onend });
    _playTutorialNext();
    return true;
}

/**
 * @description: 停止教程通道语音（不影响主通道）
 * @return {void}
 */
/**
 * @description: 停止教程通道语音（不影响主通道）
 * @param {boolean} [forceStop=false] 传 true 时调用 speechSynthesis.cancel() 立即打断当前语音
 * @return {void}
 */
function stopTutorialSpeech(forceStop = false) {
    _tutorialQueue.length = 0;
    _tutorialGen++;
    _tutorialPlaying = false;
    if (forceStop) {
        // 仅当当前播放的是教程通道时才 cancel，避免误杀主通道语音
        if (_activeChannel === 'tutorial' || !_activeChannel) {
            window.speechSynthesis.cancel();
        }
    }
}

/**
 * @description: 停止全部语音（双通道）
 * @return {void}
 */
function cancelAllSpeech() {
    _speechQueue.length = 0;
    _tutorialQueue.length = 0;
    _speechPlaying = false;
    _tutorialPlaying = false;
    _speechGen++;
    _tutorialGen++;
    _activeChannel = null;
    window.speechSynthesis.cancel();
}

/**
 * @description: 判断主通道是否有活跃语音
 * @return {boolean}
 */
function isMainSpeechActive() {
    return _speechPlaying || _speechQueue.length > 0;
}

// ── 盲文字符播报 ──

/**
 * @description: 播报盲文字符。数字上下文中自动切换为数字读法。
 * @param {string} input       盲文的onehot编码
 * @param {number} [rate]      播报速度
 * @param {object} [opts]      选项
 * @param {boolean} [opts.forceNumber] 强制按数字映射播报
 * @return {boolean}
 */
function speakBraille(input, rate, opts = {}) {
    if (typeof rate === 'object') { opts = rate; rate = undefined; }
    if (rate === undefined) rate = (SETTINGS.speechRate || 0.9) + 0.3;
    let oneHot;
    if (typeof input === 'string' && input.includes('+')) {
        oneHot = input;
    } else {
        oneHot = indexToOnehot(input);
    }

    if (isInNumberContext() || opts.forceNumber) {
        const digit = NUMBER_MAPPING[oneHot];
        if (digit) {
            return speakText(digit.audio || digit.label, rate);
        }
    }
    if (isInEnglishContext()) {
        const letter = LETTER_MAPPING[oneHot];
        if (letter && letter.char) {
            const engItem = outputItems[getEnglishStartIdx()];
            const isUpper = engItem.letterCase === 'upper';
            const audioParts = (letter.audio || '').split(' ');
            return speakText(isUpper ? (audioParts[0] || letter.char[0]) : (audioParts[1] || letter.char[1]), rate);
        }
    }
    if (oneHot === NUMBER_SIGN && NUMBER_MAPPING[oneHot]) {
        return speakText(NUMBER_MAPPING[oneHot].audio, rate);
    }

    const entry = _lookupBraille(oneHot);
    if (!entry) return false;

    const raw = entry.audio || entry.label;
    if (!raw || !window.speechSynthesis) return false;

    return speakText(pinyinToHanzi(raw), rate);
}


// ── 按键音效 ──

let _audioCtx = null;

function playBeep(freq = 880, duration = 50) {
    try {
        if (!_audioCtx) _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + duration / 1000);
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + duration / 1000);
    } catch (_) { /* 静默失败，不影响功能 */ }
}

// ── 全文朗读 ──

function readAloud() {
    if (isMainSpeechActive()) {
        stopSpeech();
        _setReadAloudLabel('朗读');
        return;
    }
    if (outputItems.length === 0) {
        speakText('输出区为空');
        return;
    }

    const meta = typeof computeItemMeta === 'function' ? computeItemMeta() : null;
    const TONE_SYM_TO_NUM = { '¯': '1', '´': '2', 'ˇ': '3', '`': '4' };
    const pinyinList = [];
    let emptyRun = 0;

    function flushEmptyRun() {
        if (emptyRun >= 2) {
            pinyinList.push('，'); // 连续空方 → 插入逗号制造停顿
        } else if (emptyRun === 1) {
            if (SETTINGS.announceEmptyCell) pinyinList.push('空方');
        }
        emptyRun = 0;
    }

    for (let i = 0; i < outputItems.length; i++) {
        const item = outputItems[i];
        if (item.oneHot === '000000') {
            emptyRun++;
            continue;
        }
        flushEmptyRun();

        if (item.isNumber) { pinyinList.push((item.audio || item.char || '').replace('数号', '')); continue; }
        if (item.isEnglish) { pinyinList.push(item.audio || item.char || ''); continue; }
        if (PUNC_MAPPING[item.oneHot]) { pinyinList.push(item.char || ''); continue; }

        const m = meta && meta[i];
        if (m && m.isFirst) {
            pinyinList.push(m.merged);
            while (i + 1 < outputItems.length && meta && meta[i + 1] && !meta[i + 1].isFirst) i++;
            continue;
        }

        if (item.char && TONE_SYM_TO_NUM[item.char]) {
            const toneNum = TONE_SYM_TO_NUM[item.char];
            if (pinyinList.length > 0) {
                const prevItem = outputItems[i - 1] || {};
                const base = (prevItem.audio || prevItem.pinyin || pinyinList.pop() || '').trim();
                const combined = (base + toneNum).trim();
                pinyinList.push(combined);
            } else {
                pinyinList.push(item.audio || item.char);
            }
            continue;
        }

        let py = (item.audio || item.pinyin || '').trim();
        if (typeof resolveSoloFinal === 'function') py = resolveSoloFinal(py);
        pinyinList.push(py || (SETTINGS.announceEmptyCell ? '空方' : ''));
    }
    flushEmptyRun(); // 尾部的连续空方

    let text = '';
    for (let py of pinyinList) {
        if (!py) continue;
        if (py === '空方') { text += '空方'; continue; }
        text += pinyinToHanzi(py) || py;
        text += ' ';
    }
    speakText(text, SETTINGS.speechRate || 0.85);
    _setReadAloudLabel('停止');
}
