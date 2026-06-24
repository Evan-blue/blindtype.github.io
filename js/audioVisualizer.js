// audioVisualizer.js - 语音播报状态指示（极简角标脉冲）

const DOT_ID = 'speechDot';
const LABEL_ID = 'speechLabel';
const MAX_LABEL = 18;

let _dot = null;
let _label = null;

function _ensureElements() {
    if (!_dot) _dot = document.getElementById(DOT_ID);
    if (!_label) _label = document.getElementById(LABEL_ID);
}

function _formatLabel(text) {
    if (!text) return '播报中...';
    const clean = text.replace(/^[,，]/, '').trim();
    if (!clean) return '播报中...';
    const display = clean.length > MAX_LABEL ? clean.substring(0, MAX_LABEL) + '…' : clean;
    return '播报中：' + display;
}

export function visualizerStart(text) {
    _ensureElements();
    if (_dot) _dot.classList.add('active');
    if (_label) {
        _label.textContent = _formatLabel(text);
        _label.classList.add('active');
    }
}

export function updateSpeechLabel(text) {
    _ensureElements();
    if (_label) _label.textContent = _formatLabel(text);
}

export function visualizerStop() {
    _ensureElements();
    if (_dot) _dot.classList.remove('active');
    if (_label) {
        _label.classList.remove('active');
        _label.textContent = '播报中...';
    }
}

export function initAudioVisualizer() {
    _ensureElements();
}
