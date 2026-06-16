// audioVisualizer.js - 语音播报状态指示（极简角标脉冲）

const DOT_ID = 'speechDot';
const LABEL_ID = 'speechLabel';

let _dot = null;
let _label = null;

function _ensureElements() {
    if (!_dot) _dot = document.getElementById(DOT_ID);
    if (!_label) _label = document.getElementById(LABEL_ID);
}

export function visualizerStart() {
    _ensureElements();
    if (_dot) _dot.classList.add('active');
    if (_label) _label.classList.add('active');
}

export function visualizerStop() {
    _ensureElements();
    if (_dot) _dot.classList.remove('active');
    if (_label) _label.classList.remove('active');
}

export function initAudioVisualizer() {
    _ensureElements();
}
