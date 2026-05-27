// brailleRender.js - 渲染函数

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
                    for (let k = 0; k < syl.count; k++) {
                        meta[pos + k] = { merged: syl.merged, isFirst: k === 0, isLast: k === syl.count - 1 };
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
 * @description: 根据dotState更新点位DOM的高亮状态
 * @return {void}
 */
function renderDots() {
    dotCells.forEach(cell => {
        const idx = +cell.dataset.idx;
        cell.classList.toggle('active', !!dotState[idx - 1]);
    });
}

/**
 * @description: 渲染预览区域，显示当前点位对应的盲文字符和拼音
 * @return {void}
 */
function renderPreview() {
    const braille = dotsToBrailleChar(dotState);
    const key = dotState.join('');
    const entry = _lookupBraille(key);

    if (dotState.some(d => d)) {
        previewBox.classList.remove('empty');
        previewChar.textContent = braille;
        previewDots.textContent = activeDotsLabel(dotState);
        const ctx = _getContextPreview(key);
        previewPinyin.textContent = ctx ? ctx.label : (entry ? entry.label : '');
    } else {
        resetPreview();
    }
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

/**
 * @description: 将光标限制在合法范围内并重新渲染输出区
 * @return {void}
 */
function placeCursor() {
    cursorIdx = Math.min(cursorIdx, outputItems.length);
    renderOutput();
    ensureCursorVisible();
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
