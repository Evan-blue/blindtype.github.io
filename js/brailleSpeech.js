// brailleSpeech.js - 语音播报功能

// ── 双通道语音调度器 ──
// 主通道（操作反馈/朗读）与教程通道各自维护独立队列，互不阻塞。
// speechSynthesis 底层仍有串行限制，但两通道在 JS 层面完全解耦：
// - 主通道 stopSpeech() 不影响教程队列
// - 教程通道 stopTutorialSpeech() 默认不调 cancel()；forceStop=true 时立即打断

class SpeechQueue {
    constructor(stateobj) {
        this._queue = []; // { text, rate, onend? }
        this.playing = false;
        this.gen = 0; // 生成器，用于取消时使过期的回调失效
        stateobj ? (this.stateobj = stateobj) : void 0;
    }
    get length() { return this._queue.length; }
    set length(num) { this._queue.length = num; }
    shift() { return this._queue.shift(); }
    push(textObject) { this._queue.push(textObject); }
    play(boolVal) { this.playing = boolVal; }
    clear() {
        this._queue.length = 0;
        this.playing = false;
        this.gen++;
    }

}

const queues = {
    main: new SpeechQueue(),  // 主通道
    tutorial: new SpeechQueue()  // 教程通道
}


// 记录当前 speechSynthesis 中正在播放的是哪个通道，用于 cancel() 前检查避免误伤
let _activeChannel = null; // 'main' | 'tutorial' | null

// ── 教程中断/恢复状态 ──
// 当主通道在教程播放期间发起播报时，暂停教程并在主通道播完后自动恢复
let _tutorialInterruptState = null; // { text, rate, onend, charIndex } | null
let _currentTutorialItem = null;    // 当前正在播放的教程 utterance 信息
let _tutorialCharIndex = 0;
const TUTORIAL_RESUME_BACK = 5;     // 恢复时倒退的字符数

function _setReadAloudLabel(text) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    const tn = btn.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = text;
}

function _playNext(queueName = 'main') {
    const q = queues[queueName];
    if (q.playing || q.length === 0) {
        if (!q.playing && q.length === 0) {
            if (queueName === 'main') {
                _setReadAloudLabel('朗读');
                _resumeTutorialIfNeeded();
            }
        }
        return;
    }
    q.playing = true;
    const gen = ++q.gen;
    const item = q.shift();

    // 记录当前教程 utterance，供中断时保存状态
    if (queueName === 'tutorial') {
        _currentTutorialItem = item;
        _tutorialCharIndex = 0;
    }

    if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
    }

    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'zh-CN';
    u.rate = item.rate;

    // 跟踪教程播报的字符位置，用于中断后恢复
    if (queueName === 'tutorial') {
        u.onboundary = (e) => {
            if (e.charIndex !== undefined) {
                _tutorialCharIndex = e.charIndex;
            }
        };
    }

    u.onend = () => {
        if (gen !== q.gen) return;
        q.playing = false;
        _activeChannel = null;
        if (queueName === 'tutorial') _currentTutorialItem = null;
        if (item.onend) item.onend();
        _playNext(queueName);
    };
    u.onerror = () => {
        if (gen !== q.gen) return;
        q.playing = false;
        _activeChannel = null;
        if (queueName === 'tutorial') _currentTutorialItem = null;
        _playNext(queueName);
    };
    _activeChannel = queueName;
    window.speechSynthesis.speak(u);
}

/**
 * @description: 打断当前教程播报，保存进度供后续恢复
 * @return {void}
 */
function _interruptTutorial() {
    if (!_currentTutorialItem) return;
    _tutorialInterruptState = {
        text: _currentTutorialItem.text,
        charIndex: Math.max(0, _tutorialCharIndex - TUTORIAL_RESUME_BACK),
        rate: _currentTutorialItem.rate,
        onend: _currentTutorialItem.onend
    };
    _currentTutorialItem = null;
    window.speechSynthesis.cancel();
    queues.tutorial.gen++;
    queues.tutorial.playing = false;
    _activeChannel = null;
}

/**
 * @description: 主通道队列空闲时，检查是否需要恢复被中断的教程
 * @return {void}
 */
function _resumeTutorialIfNeeded() {
    if (!_tutorialInterruptState) return;
    // 确保主通道确实空闲
    if (queues.main.playing || queues.main.length > 0) return;
    const state = _tutorialInterruptState;
    _tutorialInterruptState = null;
    const resumeText = state.text.substring(state.charIndex);
    if (!resumeText) {
        if (state.onend) state.onend();
        return;
    }
    queues.tutorial.push({ text: resumeText, rate: state.rate, onend: state.onend });
    _playNext('tutorial');
}

/**
 * @description: 清除教程中断状态（外部主动停止教程时调用）
 * @return {void}
 */
function _clearTutorialInterruptState() {
    _tutorialInterruptState = null;
    _currentTutorialItem = null;
    _tutorialCharIndex = 0;
}

/**
 * @description: 主通道播报（操作反馈、朗读等），新请求替换排队中的旧请求。
 * 教程播放期间自动暂停教程，主通道播完后从断点恢复。
 * @param {string} text  播报内容
 * @param {number} rate  播报速度
 * @return {boolean}
 */
function speakText(text, rate) {
    if (!SETTINGS.allowSpeech) return false;
    if (!window.speechSynthesis) return false;
    rate ??= SETTINGS.speechRate;

    // 教程正在播放时，打断教程并保存恢复点
    if (_activeChannel === 'tutorial' && !_tutorialInterruptState) {
        _interruptTutorial();
    }

    queues.main.length = 0; // 新主通道请求替换旧请求
    queues.main.push({ 'text': ',' + text, 'rate': rate });
    _playNext();
    return true;
}

/**
 * @description: 停止主通道语音（不影响教程通道）
 * @return {void}
 */
function stopSpeech() {
    // 清除教程中断恢复状态——用户主动停止主通道意味着不需要恢复
    _clearTutorialInterruptState();
    queues.main.length = 0;
    if (queues.main.playing) {
        queues.main.playing = false;
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
    queues.tutorial.push({ text, rate, onend });
    _playNext('tutorial');
    return true;
}

/**
 * @description: 停止教程通道语音（不影响主通道）
 * @param {boolean} [forceStop=false] 传 true 时调用 speechSynthesis.cancel() 立即打断当前语音
 * @return {void}
 */
function stopTutorialSpeech(forceStop = false) {
    queues.tutorial.clear();
    _clearTutorialInterruptState();
    if (forceStop) {
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
    _clearTutorialInterruptState();
    queues.main.clear();
    queues.tutorial.clear();
    _activeChannel = null;
    window.speechSynthesis.cancel();
}

/**
 * @description: 判断主通道是否有活跃语音
 * @return {boolean}
 */
function isMainSpeechActive() {
    return queues.main.playing || queues.main.length > 0;
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

    // 生成拼音列表，同时处理数字、英文、标点和声调
    for (let i = 0; i < outputItems.length; i++) {
        const item = outputItems[i];
        if (item.oneHot === '000000') {
            emptyRun++;
            continue;
        }
        flushEmptyRun();

        // 处理数字、英文和标点
        if (item.isNumber) { pinyinList.push((item.audio || item.char || '').replace('数号', '')); continue; }
        if (item.isEnglish) { pinyinList.push(item.audio || item.char || ''); continue; }
        if (PUNC_MAPPING[item.oneHot]) { pinyinList.push(item.char || ''); continue; }
        // 处理拼音
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


    // 将拼音转换为播报用汉字，拼音之间用空格分隔以改善朗读效果
    let text = '';
    for (let py of pinyinList) {
        if (!py) continue;
        if (py === '空方') { text += '空方'; continue; }
        text += pinyinToHanzi(py) || py;
        text += ' ';
    }
    speakText(text, SETTINGS.speechRate);
    _setReadAloudLabel('停止');
}
