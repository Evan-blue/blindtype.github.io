// brailleOutput.js - 输出区渲染与状态

import {
    outputItems,
    cursor,
    getRenderSuppressed,
    pages,
    computeItemMeta,
    SETTINGS,
} from './state.js';
import { speak } from './brailleSpeech.js';

export const outputArea = document.getElementById('outputArea');
cursor.dom = document.getElementById('cursor');

const PRE_RENDER_ADJACENT = 1;

// ── 选择拖拽状态 ──
let _selStart = -1;
let _selLastIdx = -1;
let _selActive = false;
let _wasDragging = false;

/**
 * @description: 清除所有选中状态
 * @return {void}
 */
export function clearSelection() {
    cursor.clearSelection();
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
/**
 * @description: 重新渲染输出区域，生成所有已确认的盲文字符单元
 *   支持分页：内容溢出时自动激活分页，只渲染当前页
 * @return {void}
 */
export function renderOutput() {
    if (getRenderSuppressed()) return;

    const wasAtBottom = outputArea.scrollTop + outputArea.clientHeight >= outputArea.scrollHeight - 4;
    outputArea.innerHTML = '';

    if (outputItems.length === 0) {
        outputArea.classList.add('is-empty');
        outputArea.appendChild(cursor.dom);
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
    const target = cursor.idx < outputItems.length ? itemToChild[cursor.idx] : childCount;
    if (target !== undefined && target >= 0 && target < children.length) {
        outputArea.insertBefore(cursor.dom, children[target]);
    } else {
        outputArea.appendChild(cursor.dom);
    }
    if (wasAtBottom) {
        outputArea.scrollTop = outputArea.scrollHeight;
    }

    // 分页检测（批量加载期间跳过）
    if (outputArea.scrollHeight > outputArea.clientHeight + 2) {
        detectPageBreaks();
        if (pages.isActive) {
            pages.idx = getPageForCursor(cursor.idx);
            renderCurrentPage();
            schedulePreRender();
            return;
        }
    }

    updatePageNav();
}

// ── 分页渲染 ──

/**
 * @description: 分页是否处于激活状态
 * @return {boolean}
 */
export function isPaginationActive() {
    return pages.isActive;
}

/**
 * @description: 使分页缓存失效，下次 renderOutput 时重新检测
 * @return {void}
 */
export function invalidatePageCache() {
    pages.breaks.length = 0;
    pages.setActive(false);
    pages.preRendered.clear();
}

/**
 * @description: 根据光标索引查找所在页码
 * @param {number} idx 光标位置（0..outputItems.length）
 * @return {number} 页码（0-based）
 */
export function getPageForCursor(idx) {
    for (let p = 0; p < pages.breaks.length; p++) {
        if (idx < pages.breaks[p].endIdx) return p;
    }
    return pages.breaks.length - 1;
}

/**
 * @description: 全量渲染后，遍历 DOM 测量分页边界
 *   前提：outputArea 中已有全量渲染结果
 * @return {void}
 */
function detectPageBreaks() {
    pages.breaks.length = 0;
    pages.setActive(false);
    pages.preRendered.clear();

    const containerHeight = outputArea.clientHeight;
    if (containerHeight <= 0) return;

    // 收集所有顶级子元素（braille-unit 或 braille-group），跳过 cursor
    const children = [];
    for (const child of outputArea.children) {
        if (child === cursor.dom) continue;
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
            pages.breaks.push(_buildPageRange(rows, pageStart, r));
            pageStart = r;
            pageTop = rows[r].top;
        }
    }
    // 最后一页
    pages.breaks.push(_buildPageRange(rows, pageStart, rows.length));

    pages.setActive(pages.breaks.length > 1);
    pages.idx = Math.min(pages.idx, pages.breaks.length - 1);
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
export function renderPageRange(startIdx, endIdx, container) {
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
                if (cursor.selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
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
                if (cursor.selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
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
                if (cursor.selectedIndices.has(j)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
                if (itemMeta[j].isFirst) unit.classList.add('merged-first');
                if (itemMeta[j].isLast) unit.classList.add('merged-last');
                unit.dataset.idx = j;
                unit.innerHTML = `<span class="bu-dots">${outputItems[j].braille}</span>`;
                dotsRow.appendChild(unit);
                itemToChild[j] = childIdx;
            }

            const pinyinLabel = document.createElement('span');
            pinyinLabel.className = 'bu-group-pinyin';
            pinyinLabel.textContent = (SETTINGS.textConversionDisplay === 'char' && meta.sourceChar) ? meta.sourceChar : meta.merged;
            group.appendChild(dotsRow);
            group.appendChild(pinyinLabel);
            container.appendChild(group);

            while (i + 1 < endIdx && itemMeta[i + 1] && !itemMeta[i + 1].isFirst) i++;
            childIdx++;
        } else if (!meta) {
            const unit = document.createElement('span');
            unit.className = 'braille-unit';
            if (cursor.selectedIndices.has(i)) { unit.classList.add('selected'); unit.setAttribute('aria-selected', 'true'); }
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
export function renderCurrentPage() {
    if (!pages.isActive || pages.breaks.length === 0) return;

    outputArea.innerHTML = '';
    outputArea.classList.remove('is-empty');
    if (outputItems.length === 0) {
        outputArea.classList.add('is-empty');
        outputArea.appendChild(cursor.dom);
        updatePageNav();
        return;
    }

    const page = pages.breaks[pages.idx];
    const fragment = document.createDocumentFragment();
    const { itemToChild, childCount } = renderPageRange(page.startIdx, page.endIdx, fragment);

    outputArea.appendChild(fragment);

    // 光标定位
    const children = outputArea.children;
    const isLastPage = pages.idx === pages.breaks.length - 1;
    const cursorOnThisPage = cursor.idx >= page.startIdx &&
        (cursor.idx < page.endIdx || (isLastPage && cursor.idx === page.endIdx));
    if (cursorOnThisPage) {
        const target = cursor.idx < page.endIdx ? itemToChild[cursor.idx] : childCount;
        if (target !== undefined && target >= 0 && target < children.length) {
            outputArea.insertBefore(cursor.dom, children[target]);
        } else {
            outputArea.appendChild(cursor.dom);
        }
    } else {
        outputArea.appendChild(cursor.dom);
    }

    updatePageNav();
}

/**
 * @description: 切换到指定页面，重定位光标并播报
 * @param {number} pageNum 目标页码（0-based）
 * @return {void}
 */
export function switchToPage(pageNum) {
    if (pageNum < 0 || pageNum >= pages.breaks.length) return;
    if (pageNum === pages.idx) return;

    const oldPage = pages.idx;
    pages.idx = pageNum;
    const page = pages.breaks[pages.idx];

    // 重定位光标到目标页（endIdx 是半开区间，endIdx-1 才是本页最后一项）
    if (pageNum > oldPage) {
        cursor.idx = page.startIdx;
    } else {
        cursor.idx = Math.max(page.startIdx, page.endIdx - 1);
    }
    const meta = computeItemMeta();
    cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, pageNum > oldPage ? 1 : -1);

    renderCurrentPage();
    schedulePreRender();
    speak.text(`第${pages.idx + 1}页，共${pages.breaks.length}页`);
}

/**
 * @description: 确保光标在当前页可见，不在则自动翻页
 * @return {void}
 */
export function ensureCursorVisible() {
    if (!pages.isActive || getRenderSuppressed()) return;
    const targetPage = getPageForCursor(cursor.idx);
    if (targetPage !== pages.idx) {
        pages.idx = targetPage;
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
        const p = pages.idx + delta;
        if (p >= 0 && p < pages.breaks.length && !pages.preRendered.has(p)) {
            pagesToRender.push(p);
        }
    }
    if (pagesToRender.length === 0) return;

    requestIdleCallback(() => {
        for (const p of pagesToRender) {
            if (pages.preRendered.has(p)) continue;
            const page = pages.breaks[p];
            if (!page) continue;
            const fragment = document.createDocumentFragment();
            renderPageRange(page.startIdx, page.endIdx, fragment);
            pages.preRendered.set(p, fragment);
        }
    });
}

/**
 * @description: 更新分页导航 UI
 * @return {void}
 */
export function updatePageNav() {
    const nav = document.getElementById('pageNav');
    if (!nav) return;
    if (!pages.isActive || pages.breaks.length <= 1) {
        nav.style.display = 'none';
        outputArea.setAttribute('aria-label', '输出内容区');
        return;
    }
    nav.style.display = 'flex';
    const indicator = document.getElementById('pageIndicator');
    if (indicator) indicator.textContent = `${pages.idx + 1}/${pages.breaks.length}`;
    const prevBtn = document.getElementById('btnPrevPage');
    const nextBtn = document.getElementById('btnNextPage');
    if (prevBtn) {
        prevBtn.disabled = pages.idx === 0;
        prevBtn.setAttribute('aria-label', `上一页，当前第${pages.idx + 1}页，共${pages.breaks.length}页`);
    }
    if (nextBtn) {
        nextBtn.disabled = pages.idx >= pages.breaks.length - 1;
        nextBtn.setAttribute('aria-label', `下一页，当前第${pages.idx + 1}页，共${pages.breaks.length}页`);
    }
    outputArea.setAttribute('aria-label', `输出内容区，第${pages.idx + 1}页，共${pages.breaks.length}页`);
}

// ── 鼠标拖拽选择（init 函数绑定）──

export function initBrailleOutput() {
    outputArea.addEventListener('mousedown', (e) => {
        const unit = e.target.closest('.braille-unit');
        if (!unit) { clearSelection(); renderOutput(); return; }
        _selStart = +unit.dataset.idx;
        if (SETTINGS.multiSelect) {
            cursor.selAnchor = _selStart;
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
        const from = Math.min(cursor.selAnchor, idx);
        const to = Math.max(cursor.selAnchor, idx);
        cursor.selectedIndices.clear();
        for (let i = from; i <= to; i++) cursor.selectedIndices.add(i);
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
            cursor.idx = _selStart + 1;
            const meta = computeItemMeta();
            cursor.idx = cursor.snapToBoundary(cursor.idx, outputItems.length, meta, 1);
            renderOutput();
        }
        _selStart = -1;
    });
}
