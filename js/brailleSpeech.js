// brailleSpeech.js - 语音播报功能

import {
    outputItems,
    cursor,
    computeItemMeta,
    SETTINGS,
} from './state.js';
import {
    ONEHOT_MAPPINGS,
    NUMBER_SIGN,
    _lookupBraille,
} from './loadMappings.js';
import { ALERT_SPEECH_RATE } from './config.js';
import { pinyinToSpokenChar, resolveSoloFinal } from './utils-pinyin.js';
import { indexToOnehot } from './utils-braille.js';

// ── 双通道语音调度器 ──
// 主通道（操作反馈/朗读）与教程通道各自维护独立队列，互不阻塞。
// speechSynthesis 底层仍有串行限制，但两通道在 JS 层面完全解耦：
// - 主通道 stopSpeech() 不影响教程队列
// - 教程通道 stopTutorialSpeech() 默认不调 cancel()；forceStop=true 时立即打断

class SpeechItem {
    constructor(text, rate, { onend, resumable = true } = {}) {
        this.text = text;
        this.rate = rate;
        this.onend = onend;
        this.resumable = resumable;
    }
}

class SpeechQueue {
    static _activeChannel = null; // 'main' | 'tutorial' | null
    constructor(name, recordState = false) {
        this.name = name; // 'main' | 'tutorial'
        this._queue = [];
        this.isPlaying = false;
        this.gen = 0; // 生成器，用于取消时使过期的回调失效
        if (recordState) {
            this.state = {
                interruptState: null, // 播报中断状态 { text, rate, onend, charIndex }
                currentItem: null,    // 当前教程项 { text, rate, onend }
                charIndex: 0,         // 当前教程项的字符位置
                resume_back: 5,          // 恢复时倒退的字符数

            }
            // 中断/恢复 操作
            this.interrupt = function () {
                if (!this.state.currentItem) return;
                if (this.state.currentItem.resumable === false) return;
                this.state.interruptState = {
                    ...this.state.currentItem,
                    charIndex: Math.max(0, this.state.charIndex - this.state.resume_back),
                };
                this.state.currentItem = null;
                window.speechSynthesis.cancel();
                this.nextGen();
                this.play(false);
                SpeechQueue._activeChannel = null;
            }
            this.resumeIfNeeded = function () {
                if (!this.state.interruptState) return;

                // 确保主通道确实空闲(教程恢复时优先级低于主通道)
                if (queues.main.isPlaying || queues.main.length > 0) return;

                const state = this.state.interruptState;
                this.state.interruptState = null;
                const resumeText = state.text.substring(state.charIndex);
                if (!resumeText) { if (state.onend) state.onend(); return; }
                this.push(new SpeechItem(resumeText, state.rate, { onend: state.onend }));
                _playNext(this.name);
            }
            this.clearInterruptState = function () {
                this.state.interruptState = null;
                this.state.currentItem = null;
                this.state.charIndex = 0;
            }
        }
    }
    // 基本操作
    get length() { return this._queue.length; }
    set length(num) { this._queue.length = num; }
    shift() { return this._queue.shift(); }
    push(textObject) { this._queue.push(textObject); }
    play(boolVal) { this.isPlaying = boolVal; }
    clear() { this._queue.length = 0; this.isPlaying = false; this.nextGen(); }
    isActive() { return this.isPlaying || this.length > 0; }
    // 代际管理：每次清空或中断时升级 gen，使旧回调失效
    nextGen() { return ++this.gen; }
    isExpired(g) { return g !== this.gen; }
}

const queues = {
    main: new SpeechQueue('main', true),  // 主通道
    tutorial: new SpeechQueue('tutorial', true)  // 教程通道
}


// ── 声波可视化事件 ──
const notifyVisualizer = {
    start(text) {
        window.dispatchEvent(new CustomEvent('speech-visualizer-start', { detail: text }));
    },
    stop() {
        if (queues.main.isActive() || queues.tutorial.isActive()) return;
        window.dispatchEvent(new CustomEvent('speech-visualizer-stop'));
    },
    update(text) {
        window.dispatchEvent(new CustomEvent('speech-visualizer-update', { detail: text }));
    },
}

function _setReadAloudLabel(text) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    const tn = btn.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = text;
}

function _playNext(queueName) {
    const q = queues[queueName];
    if (q.isPlaying || q.length === 0) {
        if (!q.isPlaying && q.length === 0) {
            if (queueName === 'main') {
                _setReadAloudLabel('朗读');
                queues.main.resumeIfNeeded();
                queues.tutorial.resumeIfNeeded();
            }
        }
        return;
    }
    q.isPlaying = true;
    const gen = q.nextGen();
    const item = q.shift();
    const itemText = item.text;

    // 记录当前 utterance，供中断时保存状态
    q.state.currentItem = item;
    q.state.charIndex = 0;

    if (window.speechSynthesis.paused && typeof window.speechSynthesis.resume === 'function') {
        window.speechSynthesis.resume();
    }

    const u = new SpeechSynthesisUtterance(item.text);
    u.lang = 'zh-CN';
    u.rate = item.rate;

    u.onboundary = (e) => {
        if (queueName === 'main' && q.isExpired(gen)) return;
        if (e.charIndex !== undefined) {
            q.state.charIndex = e.charIndex;
            if (queueName === 'main') notifyVisualizer.update(itemText.substring(e.charIndex));
        }
    };

    u.onstart = () => { if (!q.isExpired(gen)) notifyVisualizer.start(itemText); };
    u.onend = () => {
        if (q.isExpired(gen)) return;
        q.isPlaying = false;
        SpeechQueue._activeChannel = null;
        q.state.currentItem = null;
        if (item.onend) item.onend();
        notifyVisualizer.stop();
        _playNext(queueName);
    };
    u.onerror = () => {
        if (q.isExpired(gen)) return;
        q.isPlaying = false;
        SpeechQueue._activeChannel = null;
        q.state.currentItem = null;
        notifyVisualizer.stop();
        _playNext(queueName);
    };
    SpeechQueue._activeChannel = queueName;
    window.speechSynthesis.speak(u);
}


export const speak = {
    braille: speakBraille,
    text: speakText,
    immediate: speakImmediate,
    alert: speakAlert,
    tutorial: speakTutorialText,
};

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

    if (outputItems.isInNumberContext(cursor.idx) || opts.forceNumber) {
        const digit = ONEHOT_MAPPINGS.number[oneHot];
        if (digit) {
            return speakText(digit.audio || digit.label, rate);
        }
    }
    if (outputItems.isInEnglishContext(cursor.idx)) {
        const letter = ONEHOT_MAPPINGS.letter[oneHot];
        if (letter && letter.char) {
            const engItem = outputItems[outputItems.getEnglishStartIdx(cursor.idx)];
            const isUpper = engItem.letterCase === 'upper';
            const audioParts = (letter.audio || '').split(' ');
            return speakText(isUpper ? (audioParts[0] || letter.char[0]) : (audioParts[1] || letter.char[1]), rate);
        }
    }
    if (oneHot === NUMBER_SIGN && ONEHOT_MAPPINGS.number[oneHot]) {
        return speakText(ONEHOT_MAPPINGS.number[oneHot].audio, rate);
    }

    const entry = _lookupBraille(oneHot);
    if (!entry) return false;

    const raw = entry.audio || entry.label;
    if (!raw || !window.speechSynthesis) return false;

    return speakText(pinyinToSpokenChar(raw), rate);
}

/**
 * @description: 主通道播报（操作反馈、朗读等），新请求替换排队中的旧请求。
 * 教程播放期间自动暂停教程，主通道播完后从断点恢复。
 * @param {string} text  播报内容
 * @param {number} rate  播报速度
 * @return {boolean}
 */
function speakText(text, rate, resumable_or_opts = true) {
    // 基础检查：用户设置和浏览器支持
    if (!SETTINGS.allowSpeech) return false;
    if (!window.speechSynthesis) return false;
    // TODO 参数归一化：把其他类型输入（index, oneHot）转为text
    rate = rate || SETTINGS.speechRate;

    let resumable, onend;
    if (typeof resumable_or_opts === 'object') {
        resumable = resumable_or_opts.resumable !== false;
        onend = resumable_or_opts.onend;
    } else {
        resumable = resumable_or_opts !== false;
        onend = null;
    }

    // 教程/朗读正在播放时，打断并保存恢复点（resumable=false 时不保存）
    if (resumable) {
        if (SpeechQueue._activeChannel === 'tutorial' && !queues.tutorial.state.interruptState) {
            queues.tutorial.interrupt();
        }
        if (SpeechQueue._activeChannel === 'main' && !queues.main.state.interruptState) {
            queues.main.interrupt();
        }
    }

    queues.main.length = 0; // 新主通道请求替换旧请求
    queues.main.push(new SpeechItem(',' + text, rate, { resumable, onend }));
    _playNext('main');
    return true;
}

/**
 * @description: 立即播报（打断当前语音，不排队，适合键盘 hover 等高频反馈）
 * @param {string} text 播报内容
 * @param {number} [rate] 播报速度
 * @return {void}
 */
function speakImmediate(text, rate, resumable = true) {
    if (!SETTINGS.allowSpeech || !window.speechSynthesis) return;
    rate = rate || SETTINGS.speechRate;

    // 教程正在播放时，保存断点后打断（resumable=false 时不保存）
    if (resumable !== false) {
        if (SpeechQueue._activeChannel === 'tutorial' && !queues.tutorial.state.interruptState) {
            queues.tutorial.interrupt();
        }
    }
    // 清空主通道队列，取消当前语音
    queues.main.clear();
    window.speechSynthesis.cancel();

    const utteranceText = ',' + text;
    const u = new SpeechSynthesisUtterance(utteranceText);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.onboundary = (e) => {
        if (e.charIndex !== undefined) {
            notifyVisualizer.update(utteranceText.substring(e.charIndex));
        }
    };
    u.onstart = () => notifyVisualizer.start(utteranceText);
    u.onend = () => {
        SpeechQueue._activeChannel = null;
        notifyVisualizer.stop();
        queues.tutorial.resumeIfNeeded();
    };
    u.onerror = () => {
        SpeechQueue._activeChannel = null;
        notifyVisualizer.stop();
        queues.tutorial.resumeIfNeeded();
    };
    SpeechQueue._activeChannel = 'main';
    window.speechSynthesis.speak(u);
}

/**
 * @description: 系统提示播报，使用固定 ALERT_SPEECH_RATE
 * @param {string} text 播报内容
 * @return {boolean}
 */
function speakAlert(text) {
    return speakText(text, ALERT_SPEECH_RATE);
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
    queues.tutorial.push(new SpeechItem(text, rate, { onend }));
    _playNext('tutorial');
    return true;
}

/**
 * @description: 停止主通道语音（不影响教程通道）
 * @return {void}
 */
export function stopSpeech() {
    // 清除教程中断恢复状态——用户主动停止主通道意味着不需要恢复
    queues.tutorial.clearInterruptState();
    queues.main.clearInterruptState();
    queues.main.clear();
    if (SpeechQueue._activeChannel === 'main' || !SpeechQueue._activeChannel) {
        window.speechSynthesis.cancel();
    }
    notifyVisualizer.stop();
    _playNext('main');
}

/**
 * @description: 停止教程通道语音（不影响主通道）
 * @param {boolean} [forceStop=false] 传 true 时调用 speechSynthesis.cancel() 立即打断当前语音
 * @return {void}
 */
export function stopTutorialSpeech(forceStop = false) {
    queues.tutorial.clearInterruptState();
    queues.tutorial.clear();
    if (forceStop) {
        if (SpeechQueue._activeChannel === 'tutorial' || !SpeechQueue._activeChannel) {
            window.speechSynthesis.cancel();
        }
    }
}

/**
 * @description: 停止全部语音（双通道）
 * @return {void}
 */
export function cancelAllSpeech() {
    for (const q of Object.values(queues)) {
        q.clearInterruptState?.();
        q.clear?.();
    }
    SpeechQueue._activeChannel = null;
    window.speechSynthesis.cancel();
    notifyVisualizer.stop();
}

/**
 * @description: 判断主通道是否有活跃语音
 * @return {boolean}
 */
export function isMainSpeechActive() {
    return queues.main.isActive();
}


// ── 按键音效 ──
let _audioCtx = null;
export function playBeep(freq = 880, duration = 50) {
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
export function readAloud() {
    if (isMainSpeechActive()) {
        stopSpeech();
        _setReadAloudLabel('朗读');
        return;
    }
    if (outputItems.length === 0) {
        speakText('输出区为空');
        return;
    }

    const meta = computeItemMeta();
    const TONE_SYM_TO_NUM = { '¯': '1', '´': '2', 'ˇ': '3', '`': '4' };
    const pinyinList = [];
    let emptyRun = 0;

    function flushEmptyRun() {
        if (emptyRun >= 2) {
            pinyinList.push('，'); // 连续空方 → 插入逗号制造停顿
        } else if (emptyRun === 1 && SETTINGS.announceEmptyCell) {
            pinyinList.push('空方');
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
        if (ONEHOT_MAPPINGS.punc[item.oneHot]) { pinyinList.push(item.char || ''); continue; }
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
        py = resolveSoloFinal(py);
        pinyinList.push(py || (SETTINGS.announceEmptyCell ? '空方' : ''));
    }
    flushEmptyRun(); // 尾部的连续空方


    // 将拼音转换为播报用汉字，拼音之间用空格分隔以改善朗读效果
    let text = '';
    for (let py of pinyinList) {
        if (!py) continue;
        if (py === '空方') { text += '空方'; continue; }
        text += pinyinToSpokenChar(py) || py;
        text += ' ';
    }
    speakText(text, SETTINGS.speechRate);
    _setReadAloudLabel('停止');
}
