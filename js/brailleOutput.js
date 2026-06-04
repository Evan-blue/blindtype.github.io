// brailleOutput.js - 输出区渲染与状态

const outputItems = []; // { braille, pinyin, char, audio, oneHot }
let cursorIdx = 0; // position in outputItems
let selectedIndices = new Set(); // 被选中的输出项索引集合

const outputArea = document.getElementById('outputArea');
const cursorEl = document.getElementById('cursor');

// ── 分页状态 ──
let _currentPage = 0;
let _pageBreaks = [];           // [{ startIdx, endIdx }, ...]
let _isPaginationActive = false;
let _renderSuppressed = false;  // 批量加载期间抑制逐项渲染
let _preRenderedPages = new Map(); // pageNum -> DocumentFragment
const PRE_RENDER_ADJACENT = 1;

// ── 选择拖拽状态 ──
let _selStart = -1;
let _selLastIdx = -1;
let _selActive = false;
let _wasDragging = false;
let _selAnchor = -1;  // Shift+方向键选择的锚点

/**
 * @description: 清除所有选中状态
 * @return {void}
 */
function clearSelection() {
    selectedIndices.clear();
    _selAnchor = -1;
    outputArea.querySelectorAll('.braille-unit.selected').forEach(u => {
        u.classList.remove('selected');
        u.removeAttribute('aria-selected');
    });
}

/**
 * @description: 计算 outputItems 的分组元数据（与 renderOutput 使用相同逻辑）
 *   保存outputitems分组后的组合结果与其中每一项在分组中的位置
 *   返回值: itemMeta 数组，每项为 null（非分组项）或 { merged, isFirst, isLast }
 * @return {object[]}
 */
function computeItemMeta() {
    const emptyIndices = [];
    outputItems.forEach((item, i) => {
        if (item.oneHot === '000000') emptyIndices.push(i);
    });

    const meta = new Array(outputItems.length).fill(null);
    for (let g = 0; g <= emptyIndices.length; g++) {
        const start = g === 0 ? 0 : emptyIndices[g - 1] + 1;
        const end = g < emptyIndices.length ? emptyIndices[g] : outputItems.length;
        // 跳过数字项和英文项：不参与拼音分组
        if (outputItems.slice(start, end).some(it => it.isNumber || it.isEnglish)) continue;
        if (end - start >= 2) {
            const TONE_SYM_TO_NUM = { '¯': '1', '´': '2', 'ˇ': '3', '`': '4' };
            const chars = outputItems.slice(start, end).map((it, ci, arr) => {
                const ch = TONE_SYM_TO_NUM[it.char] || it.char || '';
                if (ch !== 'e/o') return ch;
                const prevCh = ci > 0 ? (TONE_SYM_TO_NUM[arr[ci - 1].char] || arr[ci - 1].char || '') : '';
                if (prevCh === 'b' || prevCh === 'p' || prevCh === 'f') return 'o';
                if (prevCh === 'm') return 'o';
                return 'e';
            });
            const syllables = splitPinyinChars(chars);
            if (syllables) {
                let pos = start;
                for (const syl of syllables) {
                    let merged = syl.merged;
                    // 若省写了声调（merged 无尾部数字），根据省写规则补充声调
                    if (!/\d$/.test(merged) && typeof _resolveOmittedTone === 'function') {
                        const tone = _resolveOmittedTone(merged);
                        if (tone) merged += tone;
                    }
                    for (let k = 0; k < syl.count; k++) {
                        meta[pos + k] = { merged, isFirst: k === 0, isLast: k === syl.count - 1 };
                    }
                    pos += syl.count;
                }
            }
        }
    }
    return meta;
}

/**
 * @description: 判断光标位置 idx 是否在 braille-group 内部（非合法停靠点）
 * @param {number} idx 光标位置（0..outputItems.length）
 * @param {object[]} meta computeItemMeta() 的返回值
 * @return {boolean}
 */
function isInsideGroup(idx, meta) {
    if (idx <= 0 || idx >= outputItems.length) return false;
    const left = meta[idx - 1];
    const right = meta[idx];
    return !!(left && right && !left.isLast);
}

/**
 * @description: 将光标位置吸附到最近的 braille-group 边界
 * @param {number} idx 原始光标位置
 * @param {object[]} meta computeItemMeta() 的返回值
 * @param {number} direction 移动方向：-1 左移到组起点，+1 右移到组终点
 * @return {number} 吸附后的合法光标位置
 */
function snapToGroupBoundary(idx, meta, direction) {
    if (idx <= 0) return 0;
    if (idx >= outputItems.length) return outputItems.length;
    let result = idx;
    if (direction < 0) {
        while (isInsideGroup(result, meta)) result--;
    } else {
        while (isInsideGroup(result, meta)) result++;
    }
    return result;
}

/**
 * @description: 重新渲染输出区域，生成所有已确认的盲文字符单元
 *   支持分页：内容溢出时自动激活分页，只渲染当前页
 * @return {void}
 */
function renderOutput() {
    if (_renderSuppressed) return;

    const wasAtBottom = outputArea.scrollTop + outputArea.clientHeight >= outputArea.scrollHeight - 4;
    outputArea.innerHTML = '';

    if (outputItems.length === 0) {
        outputArea.classList.add('is-empty');
        outputArea.appendChild(cursorEl);
        updatePageNav();
        return;
    }
    outputArea.classList.remove('is-empty');

    // 全量渲染到 fragment
    const fragment = document.createDocumentFragment();
    const { itemToChild, childCount } = renderPageRange(0, outputItems.length, fragment);
    outputArea.appendChild(fragment);

    // 光标定位
    const children = outputArea.children;
    const target = cursorIdx < outputItems.length ? itemToChild[cursorIdx] : childCount;
    if (target !== undefined && target >= 0 && target < children.length) {
        outputArea.insertBefore(cursorEl, children[target]);
    } else {
        outputArea.appendChild(cursorEl);
    }
    if (wasAtBottom) {
        outputArea.scrollTop = outputArea.scrollHeight;
    }

    // 分页检测（批量加载期间跳过）
    if (outputArea.scrollHeight > outputArea.clientHeight + 2) {
        detectPageBreaks();
        if (_isPaginationActive) {
            _currentPage = getPageForCursor(cursorIdx);
            renderCurrentPage();
            schedulePreRender();
            return;
        }
    }

    updatePageNav();
}

// ── 鼠标拖拽选择 ──
outputArea.addEventListener('mousedown', (e) => {
    const unit = e.target.closest('.braille-unit');
    if (!unit) { clearSelection(); renderOutput(); return; }
    _selStart = +unit.dataset.idx;
    if (SETTINGS.multiSelect) {
        _selAnchor = _selStart;
        _selLastIdx = _selStart;
        _selActive = true;
        _wasDragging = false;
    }
    e.preventDefault();
});

document.addEventListener('mousemove', (e) => {
    if (!_selActive || !SETTINGS.multiSelect) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const braUnit = el?.closest?.('.braille-unit');
    if (!braUnit || !outputArea.contains(braUnit)) return;
    const idx = +braUnit.dataset.idx;
    if (idx === _selLastIdx) return;
    _selLastIdx = idx;
    _wasDragging = true;
    const from = Math.min(_selAnchor, idx);
    const to = Math.max(_selAnchor, idx);
    selectedIndices.clear();
    for (let i = from; i <= to; i++) selectedIndices.add(i);
    const units = outputArea.querySelectorAll('.braille-unit');
    units.forEach(u => {
        const i = +u.dataset.idx;
        const inRange = i >= from && i <= to;
        u.classList.toggle('selected', inRange);
        u.setAttribute('aria-selected', inRange ? 'true' : 'false');
    });
});

document.addEventListener('mouseup', () => {
    if (!_selActive && _selStart < 0) return;
    _selActive = false;
    if (_selStart >= 0 && (!_wasDragging || !SETTINGS.multiSelect)) {
        clearSelection();
        cursorIdx = _selStart + 1;
        const meta = computeItemMeta();
        cursorIdx = snapToGroupBoundary(cursorIdx, meta, 1);
        renderOutput();
    }
    _selStart = -1;
});

// ── 分页渲染 ──

/**
 * @description: 分页是否处于激活状态
 * @return {boolean}
 */
function isPaginationActive() {
    return _isPaginationActive;
}

/**
 * @description: 使分页缓存失效，下次 renderOutput 时重新检测
 * @return {void}
 */
function invalidatePageCache() {
    _pageBreaks = [];
    _isPaginationActive = false;
    _preRenderedPages.clear();
}

/**
 * @description: 根据光标索引查找所在页码
 * @param {number} idx 光标位置（0..outputItems.length）
 * @return {number} 页码（0-based）
 */
function getPageForCursor(idx) {
    for (let p = 0; p < _pageBreaks.length; p++) {
        if (idx < _pageBreaks[p].endIdx) return p;
    }
    return _pageBreaks.length - 1;
}

/**
 * @description: 全量渲染后，遍历 DOM 测量分页边界
 *   前提：outputArea 中已有全量渲染结果
 * @return {void}
 */
function detectPageBreaks() {
    _pageBreaks = [];
    _isPaginationActive = false;
    _preRenderedPages.clear();

    const containerHeight = outputArea.clientHeight;
    if (containerHeight <= 0) return;

    // 收集所有顶级子元素（braille-unit 或 braille-group），跳过 cursor
    const children = [];
    for (const child of outputArea.children) {
        if (child === cursorEl) continue;
        children.push(child);
    }
    if (children.length === 0) return;

    // 按行分组：offsetTop 相同的元素属于同一行
    // 以行为最小分页单位，行不能被拆分
    const rows = [];
    let currentRow = { top: children[0].offsetTop, items: [children[0]] };
    for (let i = 1; i < children.length; i++) {
        const top = children[i].offsetTop;
        if (top === currentRow.top) {
            currentRow.items.push(children[i]);
        } else {
            rows.push(currentRow);
            currentRow = { top, items: [children[i]] };
        }
    }
    rows.push(currentRow);

    // 按容器高度切页
    let pageStart = 0; // 行索引
    let pageTop = rows[0].top;
    for (let r = 0; r < rows.length; r++) {
        const rowBottom = rows[r].top + rows[r].items[0].offsetHeight;
        if (rowBottom - pageTop > containerHeight && r > pageStart) {
            // 当前行超出当前页，在此切页
            _pageBreaks.push(_buildPageRange(rows, pageStart, r));
            pageStart = r;
            pageTop = rows[r].top;
        }
    }
    // 最后一页
    _pageBreaks.push(_buildPageRange(rows, pageStart, rows.length));

    _isPaginationActive = _pageBreaks.length > 1;
    _currentPage = Math.min(_currentPage, _pageBreaks.length - 1);
}

/**
 * @description: 从行范围构建页面的 { startIdx, endIdx }
 * @param {object[]} rows 行数组
 * @param {number} startRow 起始行索引
 * @param {number} endRow 结束行索引（不含）
 * @return {{ startIdx: number, endIdx: number }}
 */
function _buildPageRange(rows, startRow, endRow) {
    let minIdx = Infinity;
    let maxIdx = -1;
    for (let r = startRow; r < endRow; r++) {
        for (const el of rows[r].items) {
            // braille-unit 有 dataset.idx；braille-group 需要查找子元素
            const units = el.classList.contains('braille-unit')
                ? [el]
                : el.querySelectorAll('.braille-unit');
            for (const u of units) {
                const idx = u.dataset.idx !== undefined ? parseInt(u.dataset.idx, 10) : -1;
                if (idx >= 0) {
                    if (idx < minIdx) minIdx = idx;
                    if (idx > maxIdx) maxIdx = idx;
                }
            }
        }
    }
    return { startIdx: minIdx === Infinity ? 0 : minIdx, endIdx: maxIdx >= 0 ? maxIdx + 1 : 0 };
}

/**
 * @description: 将 outputItems[startIdx..endIdx-1] 渲染到指定容器
 * @param {number} startIdx 起始索引
 * @param {number} endIdx 结束索引（不含）
 * @param {HTMLElement|DocumentFragment} container 目标容器
 * @return {{ itemToChild: number[], childCount: number }} 渲染映射信息
 */
function renderPageRange(startIdx, endIdx, container) {
    const itemMeta = computeItemMeta();
    const itemToChild = new Array(outputItems.length).fill(-1);
    let childIdx = 0;

    for (let i = startIdx; i < endIdx; i++) {
        const item = outputItems[i];

        // ── 数字项 ──
        if (item.isNumber) {
            const group = document.createElement('span');
            group.className = 'braille-group number-group';
            const dotsRow = document.createElement('span');
            dotsRow.className = 'braille-group-row';
            const brailleChars = Array.from(item.braille);
            for (let k = 0; k < brailleChars.length; k++) {
                const unit = document.createElement('span');
                unit.className = 'braille-unit';
                if (selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
                if (k === 0) unit.classList.add('merged-first');
                if (k === brailleChars.length - 1) unit.classList.add('merged-last');
                unit.dataset.idx = i;
                unit.innerHTML = `<span class="bu-dots">${brailleChars[k]}</span>`;
                dotsRow.appendChild(unit);
            }
            const numLabel = document.createElement('span');
            numLabel.className = 'bu-group-pinyin';
            numLabel.textContent = item.char;
            group.appendChild(dotsRow);
            group.appendChild(numLabel);
            container.appendChild(group);
            itemToChild[i] = childIdx;
            childIdx++;
            continue;
        }

        // ── 英文项 ──
        if (item.isEnglish) {
            const group = document.createElement('span');
            group.className = 'braille-group number-group';
            const dotsRow = document.createElement('span');
            dotsRow.className = 'braille-group-row';
            const brailleChars = Array.from(item.braille);
            for (let k = 0; k < brailleChars.length; k++) {
                const unit = document.createElement('span');
                unit.className = 'braille-unit';
                if (selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
                if (k === 0) unit.classList.add('merged-first');
                if (k === brailleChars.length - 1) unit.classList.add('merged-last');
                unit.dataset.idx = i;
                unit.innerHTML = `<span class="bu-dots">${brailleChars[k]}</span>`;
                dotsRow.appendChild(unit);
            }
            const engLabel = document.createElement('span');
            engLabel.className = 'bu-group-pinyin';
            engLabel.textContent = item.char;
            group.appendChild(dotsRow);
            group.appendChild(engLabel);
            container.appendChild(group);
            itemToChild[i] = childIdx;
            childIdx++;
            continue;
        }

        const meta = itemMeta[i];
        if (meta && meta.isFirst) {
            const group = document.createElement('span');
            group.className = 'braille-group';
            const dotsRow = document.createElement('span');
            dotsRow.className = 'braille-group-row';

            for (let j = i; j < endIdx; j++) {
                if (!itemMeta[j]) break;
                if (j > i && itemMeta[j].isFirst) break;
                const unit = document.createElement('span');
                unit.className = 'braille-unit';
                if (selectedIndices.has(j)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
                if (itemMeta[j].isFirst) unit.classList.add('merged-first');
                if (itemMeta[j].isLast) unit.classList.add('merged-last');
                unit.dataset.idx = j;
                unit.innerHTML = `<span class="bu-dots">${outputItems[j].braille}</span>`;
                dotsRow.appendChild(unit);
                itemToChild[j] = childIdx;
            }

            const pinyinLabel = document.createElement('span');
            pinyinLabel.className = 'bu-group-pinyin';
            pinyinLabel.textContent = meta.merged;
            group.appendChild(dotsRow);
            group.appendChild(pinyinLabel);
            container.appendChild(group);

            while (i + 1 < endIdx && itemMeta[i + 1] && !itemMeta[i + 1].isFirst) i++;
            childIdx++;
        } else if (!meta) {
            const unit = document.createElement('span');
            unit.className = 'braille-unit';
            if (selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
            if (item.oneHot === '000000') unit.classList.add('empty-braille');
            unit.dataset.idx = i;
            if (item.oneHot === '000000') {
                unit.innerHTML = `<span class="bu-dots">&nbsp;</span><span class="bu-char">&nbsp;</span>`;
            } else {
                unit.innerHTML = `<span class="bu-dots">${item.braille}</span>${item.char ? `<span class="bu-char">${item.char}</span>` : ''}`;
            }
            container.appendChild(unit);
            itemToChild[i] = childIdx;
            childIdx++;
        }
    }

    return { itemToChild, childCount: childIdx };
}

/**
 * @description: 渲染当前页到 outputArea
 * @return {void}
 */
function renderCurrentPage() {
    if (!_isPaginationActive || _pageBreaks.length === 0) return;

    outputArea.innerHTML = '';
    outputArea.classList.remove('is-empty');
    if (outputItems.length === 0) {
        outputArea.classList.add('is-empty');
        outputArea.appendChild(cursorEl);
        updatePageNav();
        return;
    }

    const page = _pageBreaks[_currentPage];
    const fragment = document.createDocumentFragment();
    const { itemToChild, childCount } = renderPageRange(page.startIdx, page.endIdx, fragment);

    outputArea.appendChild(fragment);

    // 光标定位
    const children = outputArea.children;
    const isLastPage = _currentPage === _pageBreaks.length - 1;
    const cursorOnThisPage = cursorIdx >= page.startIdx &&
        (cursorIdx < page.endIdx || (isLastPage && cursorIdx === page.endIdx));
    if (cursorOnThisPage) {
        const target = cursorIdx < page.endIdx ? itemToChild[cursorIdx] : childCount;
        if (target !== undefined && target >= 0 && target < children.length) {
            outputArea.insertBefore(cursorEl, children[target]);
        } else {
            outputArea.appendChild(cursorEl);
        }
    } else {
        outputArea.appendChild(cursorEl);
    }

    updatePageNav();
}

/**
 * @description: 切换到指定页面，重定位光标并播报
 * @param {number} pageNum 目标页码（0-based）
 * @return {void}
 */
function switchToPage(pageNum) {
    if (pageNum < 0 || pageNum >= _pageBreaks.length) return;
    if (pageNum === _currentPage) return;

    const oldPage = _currentPage;
    _currentPage = pageNum;
    const page = _pageBreaks[_currentPage];

    // 重定位光标到目标页（endIdx 是半开区间，endIdx-1 才是本页最后一项）
    if (pageNum > oldPage) {
        cursorIdx = page.startIdx;
    } else {
        cursorIdx = Math.max(page.startIdx, page.endIdx - 1);
    }
    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(cursorIdx, meta, pageNum > oldPage ? 1 : -1);

    renderCurrentPage();
    schedulePreRender();
    speakText(`第${_currentPage + 1}页，共${_pageBreaks.length}页`);
}

/**
 * @description: 确保光标在当前页可见，不在则自动翻页
 * @return {void}
 */
function ensureCursorVisible() {
    if (!_isPaginationActive || _renderSuppressed) return;
    const targetPage = getPageForCursor(cursorIdx);
    if (targetPage !== _currentPage) {
        _currentPage = targetPage;
        renderCurrentPage();
        schedulePreRender();
    }
}

/**
 * @description: 预渲染前后页到 DocumentFragment 缓存
 * @return {void}
 */
function schedulePreRender() {
    const pagesToRender = [];
    for (let delta = -PRE_RENDER_ADJACENT; delta <= PRE_RENDER_ADJACENT; delta++) {
        const p = _currentPage + delta;
        if (p >= 0 && p < _pageBreaks.length && !_preRenderedPages.has(p)) {
            pagesToRender.push(p);
        }
    }
    if (pagesToRender.length === 0) return;

    requestIdleCallback(() => {
        for (const p of pagesToRender) {
            if (_preRenderedPages.has(p)) continue;
            const page = _pageBreaks[p];
            if (!page) continue;
            const fragment = document.createDocumentFragment();
            renderPageRange(page.startIdx, page.endIdx, fragment);
            _preRenderedPages.set(p, fragment);
        }
    });
}

/**
 * @description: 更新分页导航 UI
 * @return {void}
 */
function updatePageNav() {
    const nav = document.getElementById('pageNav');
    if (!nav) return;
    if (!_isPaginationActive || _pageBreaks.length <= 1) {
        nav.style.display = 'none';
        outputArea.setAttribute('aria-label', '输出内容区');
        return;
    }
    nav.style.display = 'flex';
    const indicator = document.getElementById('pageIndicator');
    if (indicator) indicator.textContent = `${_currentPage + 1}/${_pageBreaks.length}`;
    const prevBtn = document.getElementById('btnPrevPage');
    const nextBtn = document.getElementById('btnNextPage');
    if (prevBtn) {
        prevBtn.disabled = _currentPage === 0;
        prevBtn.setAttribute('aria-label', `上一页，当前第${_currentPage + 1}页，共${_pageBreaks.length}页`);
    }
    if (nextBtn) {
        nextBtn.disabled = _currentPage >= _pageBreaks.length - 1;
        nextBtn.setAttribute('aria-label', `下一页，当前第${_currentPage + 1}页，共${_pageBreaks.length}页`);
    }
    outputArea.setAttribute('aria-label', `输出内容区，第${_currentPage + 1}页，共${_pageBreaks.length}页`);
}
