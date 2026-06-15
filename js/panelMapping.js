// panelMapping.js - 盲文对照表面板

import { speakText, speakImmediate } from './brailleSpeech.js';
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
            const speakText = (entry.audio || entry.label) + ', 键位' + onehotToIndex(entry.oneHot)
            card.addEventListener('click', () => { speakImmediate(speakText) });
            card.addEventListener('mouseenter', () => { _readingMode && speakImmediate(speakText) });
            grid.appendChild(card);
        });
    });
}

const _mappingSlide = document.getElementById('mappingSlide');
const _mappingOverlay = document.getElementById('mappingOverlay');
const _mappingBtn = document.getElementById('btnMapping');
const _mappingCloseBtn = document.getElementById('mappingSlideClose');

export const mappingPanel = {
    slide: _mappingSlide,
    overlay: _mappingOverlay,
    btn: _mappingBtn,
    closeBtn: _mappingCloseBtn,
    pinToggle: null,
    pinLit: false,

    open() {
        _mappingSlide.classList.add('open');
        _mappingSlide.removeAttribute('inert');
        _mappingOverlay.classList.add('open');
        if (_mappingBtn) _mappingBtn.setAttribute('aria-expanded', 'true');
        _mappingCloseBtn.focus();
        speakText('打开盲文对照表', 1.5);
    },

    close() {
        _mappingSlide.classList.remove('open');
        _mappingSlide.setAttribute('inert', '');
        _mappingOverlay.classList.remove('open');
        if (_mappingBtn) _mappingBtn.setAttribute('aria-expanded', 'false');
        if (_mappingBtn) _mappingBtn.focus();
        speakText('关闭盲文对照表', 1.5);
    },

    toggle() {
        if (_mappingSlide.classList.contains('open')) mappingPanel.close();
        else mappingPanel.open();
    },
};

export let toggleMapping = mappingPanel.toggle;

// ── 面板事件绑定 ──
const _pinToggle = document.getElementById('pinToggle');
if (_pinToggle) {
    mappingPanel.pinToggle = _pinToggle;
    _pinToggle.addEventListener('click', () => {
        mappingPanel.pinLit = !mappingPanel.pinLit;
        _pinToggle.classList.toggle('lit', mappingPanel.pinLit);
        _pinToggle.setAttribute('aria-pressed', String(mappingPanel.pinLit));
        _pinToggle.title = mappingPanel.pinLit ? '已锁定（仅可通过✕关闭）' : '锁定面板';
    });
}
if (_mappingBtn) {
    _mappingBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        mappingPanel.open();
    });
}
_mappingOverlay.addEventListener('click', () => {
    if (mappingPanel.pinLit) return;
    mappingPanel.close();
});
_mappingCloseBtn.addEventListener('click', () => mappingPanel.close());
_mappingSlide.addEventListener('click', (e) => { e.stopPropagation(); });

// ── 阅读/书写模式切换 ──
const _modeContainer = document.getElementById('mappingModeToggle');
if (_modeContainer) {
    _modeContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('button[data-mode]');
        if (!btn) return;
        _readingMode = (btn.dataset.mode === 'reading');
        _modeContainer.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
        renderMappingTable();
        speakText(_readingMode ? '阅读时' : '书写时');
    });
}

// ── 拖动改变面板宽度 ──
const _resizeHandle = _mappingSlide && _mappingSlide.querySelector('.mapping-resize-handle');
if (_resizeHandle) {
    let _dragging = false, _startX = 0, _startW = 0;
    _resizeHandle.addEventListener('mousedown', (e) => {
        _dragging = true;
        _startX = e.clientX;
        _startW = _mappingSlide.offsetWidth;
        e.preventDefault();
    });
    document.addEventListener('mousemove', (e) => {
        if (!_dragging) return;
        const w = Math.min(810, Math.max(420, _startW + _startX - e.clientX));
        _mappingSlide.style.width = w + 'px';
        _mappingSlide.style.maxWidth = 'none';
    });
    document.addEventListener('mouseup', () => { _dragging = false; });
}
