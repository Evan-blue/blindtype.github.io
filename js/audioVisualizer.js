// audioVisualizer.js - 语音播报状态指示（极简角标脉冲）

import { SETTINGS } from './state.js';

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

// const SPEAKER_ICON = '🔊';
const SPEAKER_ICON = '播报中...';

function _showText() {
    return SETTINGS.speechIndicatorMode !== 'breath';
}

export function visualizerStart(text) {
    _ensureElements();
    if (_dot) _dot.classList.add('active');
    if (_label) {
        if (_showText()) {
            _label.textContent = _formatLabel(text);
        } else {
            _label.textContent = SPEAKER_ICON;
        }
        _label.classList.add('active');
    }
}

export function updateSpeechLabel(text) {
    _ensureElements();
    if (_label && _showText()) _label.textContent = _formatLabel(text);
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
    const indicator = document.getElementById('speechIndicator');
    if (!indicator) return;
    if (SETTINGS.showVisualizer === false) {
        indicator.style.display = 'none';
        return;
    }
    _ensureElements();
    window.addEventListener('speech-visualizer-start', (e) => visualizerStart(e.detail));
    window.addEventListener('speech-visualizer-stop', visualizerStop);
    window.addEventListener('speech-visualizer-update', (e) => updateSpeechLabel(e.detail));
}
