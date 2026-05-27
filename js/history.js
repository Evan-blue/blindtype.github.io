// history.js - 撤销/重做

let _undoStack = [];
let _redoStack = [];

/**
 * @description: 捕获当前 outputItems 和 cursorIdx 的快照，供撤销/重做使用
 * @return {{ items: object[], cursor: number }} 状态快照
 */
function _snapshot() {
    return {
        items: outputItems.map(it => ({ ...it })),
        cursor: cursorIdx,
    };
}

/**
 * @description: 从快照恢复 outputItems 和 cursorIdx
 * @param {{ items: object[], cursor: number }} snap 状态快照
 * @return {void}
 */
function _restore(snap) {
    outputItems.length = 0;
    snap.items.forEach(it => outputItems.push(it));
    cursorIdx = snap.cursor;
    selectedIndices.clear();
    _selAnchor = -1;
    invalidatePageCache();
    renderOutput();
}

/**
 * @description: 将当前状态推入撤销栈，并清空重做栈
 * @return {void}
 */
function pushUndo() {
    const max = SETTINGS.maxUndoHistory || 10;
    _undoStack.push(_snapshot());
    if (_undoStack.length > max) _undoStack.shift();
    _redoStack.length = 0;
}

/**
 * @description: 撤销上一步操作，播报"撤销"
 * @return {void}
 */
function undo() {
    if (_undoStack.length === 0) return;
    _redoStack.push(_snapshot());
    _restore(_undoStack.pop());
    speakText('撤销');
}

/**
 * @description: 重做上一步撤销的操作，播报"重做"
 * @return {void}
 */
function redo() {
    if (_redoStack.length === 0) return;
    _undoStack.push(_snapshot());
    _restore(_redoStack.pop());
    speakText('重做');
}
