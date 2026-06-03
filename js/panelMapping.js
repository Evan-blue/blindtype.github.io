// panelMapping.js - 盲文对照表面板

function _oneHotToDots(oneHot) {
    if (oneHot.includes('+')) {
        return oneHot.split('+').map(part => part.split('').map(Number));
    }
    return oneHot.split('').map(Number);
}

function _dotsLabel(dots) {
    return dots.map((d, i) => d ? (i + 1) : '').filter(Boolean).join(' ');
}

function renderMappingTable() {
    const container = document.getElementById('mappingContainer');
    if (!container) return;
    container.innerHTML = '';

    MAPPING_CATEGORIES.forEach(cat => {
        const section = document.createElement('section');
        section.className = 'category';

        const title = document.createElement('h2');
        title.textContent = cat.name;
        section.appendChild(title);

        const grid = document.createElement('div');
        grid.className = 'mapping-grid';

        cat.entries.forEach(entry => {
            if (entry.hidden) return;
            const braille = oneHotToBrailleChar(entry.oneHot);
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
            const forceNum = cat.name === '数字';
            card.addEventListener('click', () => {
                speakBraille(entry.oneHot, 1, { forceNumber: forceNum });
                speakText('键位' + onehotToIndex(entry.oneHot), 2);
            });
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}

const mappingPanel = createSlidePanel({
    slideId: 'mappingSlide',
    overlayId: 'mappingOverlay',
    btnId: 'btnMapping',
    closeBtnId: 'mappingSlideClose',
    pinId: 'pinToggle',
    openSpeak: '打开盲文对照表',
    closeSpeak: '关闭盲文对照表',
});

toggleMapping = mappingPanel.toggle;
