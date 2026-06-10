// panelMapping.js - 盲文对照表面板

import { createSlidePanel } from './panelManager.js';
import { speakText, speakBraille } from './brailleSpeech.js';
import { oneHotToBrailleChar, onehotToIndex } from './utils-braille.js';
import { ONEHOT_MAPPINGS } from './loadMappings.js';

function _oneHotToDots(oneHot) {
    if (oneHot.includes('+')) {
        return oneHot.split('+').map(part => part.split('').map(Number));
    }
    return oneHot.split('').map(Number);
}

function _dotsLabel(dots) {
    return dots.map((d, i) => d ? (i + 1) : '').filter(Boolean).join(' ');
}

let _readingMode = true;

function _mirrorOneHot(oneHot) {
    const mirrorSegment = (seg) => {
        const arr = seg.split('');
        [arr[0], arr[3]] = [arr[3], arr[0]];
        [arr[1], arr[4]] = [arr[4], arr[1]];
        [arr[2], arr[5]] = [arr[5], arr[2]];
        return arr.join('');
    };
    if (oneHot.includes('+')) {
        return oneHot.split('+').map(mirrorSegment).join('+');
    }
    return mirrorSegment(oneHot);
}

export function renderMappingTable() {
    const sections = document.querySelectorAll('.mapping-body .category[data-cat]');
    if (!sections.length) return;

    const catMap = {};
    for (const cat of ONEHOT_MAPPINGS.categories) catMap[cat.name] = cat;

    sections.forEach(section => {
        const catName = section.dataset.cat;
        const cat = catMap[catName];
        const grid = section.querySelector('.mapping-grid');
        if (!grid) return;
        grid.innerHTML = '';

        if (!cat) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';

        cat.entries.forEach(entry => {
            if (entry.hidden) return;
            const displayOneHot = _readingMode ? entry.oneHot : _mirrorOneHot(entry.oneHot);
            const braille = oneHotToBrailleChar(displayOneHot);
            const dotsData = _oneHotToDots(entry.oneHot);
            const isCombined = Array.isArray(dotsData[0]);
            const dotsStr = isCombined
                ? dotsData.map(d => _dotsLabel(d)).join(' + ')
                : _dotsLabel(dotsData);

            const card = document.createElement('div');
            card.className = 'mapping-card';
            if (isCombined) card.classList.add('combined');
            card.innerHTML =
                '<span class="mc-braille">' + braille + '</span>' +
                '<span class="mc-dots">' + dotsStr + '</span>' +
                '<span class="mc-label">' + entry.label + '</span>';
            const forceNum = catName === '数字';
            card.addEventListener('click', () => {
                if (entry.audio) {
                    speakText(entry.audio + ', 键位' + onehotToIndex(entry.oneHot));
                } else {
                    speakBraille(entry.oneHot, 1, { forceNumber: forceNum });
                    speakText('键位' + onehotToIndex(entry.oneHot));
                }
            });
            grid.appendChild(card);
        });
    });
}

export const mappingPanel = createSlidePanel({
    slideId: 'mappingSlide',
    overlayId: 'mappingOverlay',
    btnId: 'btnMapping',
    closeBtnId: 'mappingSlideClose',
    pinId: 'pinToggle',
    openSpeak: '打开盲文对照表',
    closeSpeak: '关闭盲文对照表',
});

export let toggleMapping = mappingPanel.toggle;

(function _setupMappingToggle() {
    const container = document.getElementById('mappingModeToggle');
    if (!container) return;
    container.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        const mode = btn.dataset.mode;
        _readingMode = (mode === 'reading');
        container.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderMappingTable();
        speakText(_readingMode ? '阅读时' : '书写时');
    });
})();

// ── 拖动改变面板宽度 ──
(function _setupResize() {
    const slide = document.getElementById('mappingSlide');
    const handle = slide && slide.querySelector('.mapping-resize-handle');
    if (!handle) return;

    let _dragging = false;
    let _startX = 0;
    let _startW = 0;

    handle.addEventListener('mousedown', (e) => {
        _dragging = true;
        _startX = e.clientX;
        _startW = slide.offsetWidth;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!_dragging) return;
        const w = Math.min(810, Math.max(420, _startW + e.clientX - _startX));
        slide.style.width = w + 'px';
        slide.style.maxWidth = 'none';
    });

    document.addEventListener('mouseup', () => {
        _dragging = false;
    });
})();
