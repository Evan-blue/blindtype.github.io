// brailleSpeech.js - 语音播报功能

import {
    isInNumberContext,
    isInEnglishContext,
    getEnglishStartIdx,
    outputItems,
} from './brailleState.js';
import {
    ONEHOT_MAPPINGS,
    NUMBER_SIGN,
    _lookupBraille,
} from './loadMappings.js';
import { pinyinToSpokenChar, resolveSoloFinal } from './utils-pinyin.js';
import { indexToOnehot } from './utils-braille.js';
import { SETTINGS } from './config.js';
import { computeItemMeta } from './brailleOutput.js';

// ── 双通道语音调度器 ──
// 主通道（操作反馈/朗读）与教程通道各自维护独立队列，互不阻塞。
// speechSynthesis 底层仍有串行限制，但两通道在 JS 层面完全解耦：
// - 主通道 stopSpeech() 不影响教程队列
// - 教程通道 stopTutorialSpeech() 默认不调 cancel()；forceStop=true 时立即打断

class SpeechQueue {
    static _activeChannel = null; // 'main' | 'tutorial' | null
    constructor(name, recordState = false) {
        this.name = name; // 'main' | 'tutorial'
        this._queue = []; // { text, rate, onend? }
        this.isPlaying = false;
        this.gen = 0; // 生成器，用于取消时使过期的回调失效
        if (recordState) {
            this.state = {
                interruptState: null, // 教程中断状态 { text, rate, onend, charIndex }
                currentItem: null,    // 当前教程项 { text, rate, onend }
                charIndex: 0,         // 当前教程项的字符位置
                resume_back: 5,          // 恢复时倒退的字符数

            }
            // 中断/恢复 操作（暂时仅教程通道使用）
            this.interrupt = function () {
                if (!this.state.currentItem) return;
                this.state.interruptState = {
                    ...this.state.currentItem,
                    charIndex: Math.max(0, this.state.charIndex - this.state.resume_back),
                };
                this.state.currentItem = null;
                window.speechSynthesis.cancel();
                this.gen++;
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
                this.push({ text: resumeText, rate: state.rate, onend: state.onend });
                _playNext(this.name);
            }
            this.clearInterruptState = function () {
                this.state.interruptState = null; this.state.currentItem = null; this.state.charIndex = 0;
            }
        }
    }
    // 基本操作
    get length() { return this._queue.length; }
    set length(num) { this._queue.length = num; }
    shift() { return this._queue.shift(); }
    push(textObject) { this._queue.push(textObject); }
    play(boolVal) { this.isPlaying = boolVal; }
    clear() { this._queue.length = 0; this.isPlaying = false; this.gen++; }
    isActive() { return this.isPlaying || this.length > 0; }
}

const queues = {
    main: new SpeechQueue('main'),  // 主通道
    tutorial: new SpeechQueue('tutorial', true)  // 教程通道
}


function _setReadAloudLabel(text) {
    const btn = document.getElementById('btnReadAloud');
    if (!btn) return;
    const tn = btn.firstChild;
    if (tn && tn.nodeType === Node.TEXT_NODE) tn.textContent = text;
}

function _playNext(queueName = 'main') {
    const q = queues[queueName];
    if (q.isPlaying || q.length === 0) {
        if (!q.isPlaying && q.length === 0) {
            if (queueName === 'main') {
                _setReadAloudLabel('朗读');
                queues.tutorial.resumeIfNeeded();
            }
        }
        return;
    }
    q.isPlaying = true;
    const gen = ++q.gen;
    const item = q.shift();

    // 记录当前教程 utterance，供中断时保存状态
    if (queueName === 'tutorial') {
        q.state.currentItem = item;
        q.state.charIndex = 0;
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
            if (e.charIndex !== undefined) q.state.charIndex = e.charIndex;
        };
    }

    u.onend = () => {
        if (gen !== q.gen) return;
        q.isPlaying = false;
        SpeechQueue._activeChannel = null;
        if (queueName === 'tutorial') q.state.currentItem = null;
        if (item.onend) item.onend();
        _playNext(queueName);
    };
    u.onerror = () => {
        if (gen !== q.gen) return;
        q.isPlaying = false;
        SpeechQueue._activeChannel = null;
        if (queueName === 'tutorial') q.state.currentItem = null;
        _playNext(queueName);
    };
    SpeechQueue._activeChannel = queueName;
    window.speechSynthesis.speak(u);
}

/**
 * @description: 主通道播报（操作反馈、朗读等），新请求替换排队中的旧请求。
 * 教程播放期间自动暂停教程，主通道播完后从断点恢复。
 * @param {string} text  播报内容
 * @param {number} rate  播报速度
 * @return {boolean}
 */
export function speakText(text, rate) {
    // 基础检查：用户设置和浏览器支持
    if (!SETTINGS.allowSpeech) return false;
    if (!window.speechSynthesis) return false;
    // TODO 参数归一化：把其他类型输入（index, oneHot）转为text
    rate = rate || SETTINGS.speechRate;


    // 教程正在播放时，打断教程并保存恢复点
    if (SpeechQueue._activeChannel === 'tutorial' && !queues.tutorial.state.interruptState) {
        queues.tutorial.interrupt();
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
export function stopSpeech() {
    // 清除教程中断恢复状态——用户主动停止主通道意味着不需要恢复
    queues.tutorial.clearInterruptState();
    queues.main.length = 0;
    if (queues.main.isPlaying) {
        queues.main.isPlaying = false;
        if (SpeechQueue._activeChannel === 'main' || !SpeechQueue._activeChannel) {
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
export function speakTutorialText(text, rate, onend) {
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
export function stopTutorialSpeech(forceStop = false) {
    queues.tutorial.clear();
    queues.tutorial.clearInterruptState();
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
}

/**
 * @description: 判断主通道是否有活跃语音
 * @return {boolean}
 */
export function isMainSpeechActive() {
    return queues.main.isActive();
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
export function speakBraille(input, rate, opts = {}) {
    let oneHot;
    if (typeof input === 'string' && input.includes('+')) {
        oneHot = input;
    } else {
        oneHot = indexToOnehot(input);
    }

    if (isInNumberContext() || opts.forceNumber) {
        const digit = ONEHOT_MAPPINGS.number[oneHot];
        if (digit) {
            return speakText(digit.audio || digit.label, rate);
        }
    }
    if (isInEnglishContext()) {
        const letter = ONEHOT_MAPPINGS.letter[oneHot];
        if (letter && letter.char) {
            const engItem = outputItems[getEnglishStartIdx()];
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
