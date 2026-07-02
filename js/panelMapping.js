// panelMapping.js - 盲文对照表面板

import { speak } from './brailleSpeech.js';
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
        [arr[0], arr[1], arr[2], arr[3], arr[4], arr[5]]
            = [arr[3], arr[4], arr[5], arr[0], arr[1], arr[2]];
        return arr.join('');
    };
    if (oneHot.includes('+')) {
        return oneHot.split('+').map(mirrorSegment).reverse().join('+');
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
            card.setAttribute('aria-hidden', 'true');
            if (isCombined) card.classList.add('combined');
            card.innerHTML =
                '<span class="mc-braille">' + braille + '</span>' +
                '<span class="mc-dots">' + dotsStr + '</span>' +
                '<span class="mc-label">' + entry.label + '</span>';
            const speakText = (entry.audio || entry.label) + ', 点位' + onehotToIndex(entry.oneHot)
            card.addEventListener('click', () => { speak.immediate(speakText, undefined, false) });
            card.addEventListener('mouseenter', () => { _readingMode && speak.immediate(speakText, undefined, false) });
            grid.appendChild(card);
        });
    });
}

export const mappingPanel = {
    slide: document.getElementById('mappingSlide'),
    overlay: document.getElementById('mappingOverlay'),
    btn: document.getElementById('btnMapping'),
    closeBtn: document.getElementById('mappingSlideClose'),
    pinToggle: null,
    pinLit: false,

    open() {
        this.slide.classList.add('open');
        this.slide.removeAttribute('inert');
        this.overlay.classList.add('open');
        if (this.btn) this.btn.setAttribute('aria-expanded', 'true');
        this.closeBtn.focus();
        speak.alert('打开盲文对照表');
    },

    close() {
        this.slide.classList.remove('open');
        this.slide.setAttribute('inert', '');
        this.overlay.classList.remove('open');
        if (this.btn) this.btn.setAttribute('aria-expanded', 'false');
        if (this.btn) this.btn.focus();
        speak.alert('关闭盲文对照表');
    },

    toggle() {
        if (this.slide.classList.contains('open')) this.close();
        else this.open();
    },

    init() {
        const pt = document.getElementById('pinToggle');
        if (pt) {
            this.pinToggle = pt;
            pt.addEventListener('click', () => {
                this.pinLit = !this.pinLit;
                pt.classList.toggle('lit', this.pinLit);
                pt.setAttribute('aria-pressed', String(this.pinLit));
                pt.title = this.pinLit ? '已锁定（仅可通过✕关闭）' : '锁定面板';
            });
        }
        if (this.btn) {
            this.btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.open();
            });
        }
        this.overlay.addEventListener('click', () => {
            if (this.pinLit) return;
            this.close();
        });
        this.closeBtn.addEventListener('click', () => this.close());
        this.slide.addEventListener('click', (e) => { e.stopPropagation(); });

        // 阅读/书写模式切换
        const modeContainer = document.getElementById('mappingModeToggle');
        if (modeContainer) {
            modeContainer.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-mode]');
                if (!btn) return;
                _readingMode = (btn.dataset.mode === 'reading');
                modeContainer.querySelectorAll('.mode-toggle-btn').forEach(b => b.classList.toggle('active', b === btn));
                renderMappingTable();
                speak.text(_readingMode ? '阅读时' : '书写时');
            });
        }

        // 拖动改变面板宽度
        const handle = this.slide.querySelector('.mapping-resize-handle');
        if (handle) {
            let dragging = false, startX = 0, startW = 0;
            handle.addEventListener('mousedown', (e) => {
                dragging = true;
                startX = e.clientX;
                startW = this.slide.offsetWidth;
                e.preventDefault();
            });
            document.addEventListener('mousemove', (e) => {
                if (!dragging) return;
                const w = Math.min(810, Math.max(420, startW + startX - e.clientX));
                this.slide.style.width = w + 'px';
                this.slide.style.maxWidth = 'none';
            });
            document.addEventListener('mouseup', () => { dragging = false; });
        }
    },
};

export let toggleMapping = () => mappingPanel.toggle();
