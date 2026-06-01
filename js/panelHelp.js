// panelHelp.js - 键位帮助面板

function renderHelpPanel() {
    const tutorialBtn = document.getElementById('helpTutorialBtn');
    if (tutorialBtn && !tutorialBtn._bound) {
        tutorialBtn._bound = true;
        tutorialBtn.addEventListener('click', () => {
            playTutorial();
            helpPanel.close();
        });
    }

    const dotGridOrder = [1, 4, 2, 5, 3, 6];
    for (const d of dotGridOrder) {
        const kbdEl = document.getElementById('helpDot' + d + 'L');
        const npEl = document.getElementById('helpDot' + d + 'Np');
        if (kbdEl) kbdEl.textContent = _keyIdToLabel(DOT_TO_KEY[d] || '?');
        if (npEl) npEl.textContent = _keyIdToLabel(DOT_TO_KEY_NUMPAD[d] || '?');
    }

    const actionKeys = {};
    for (const [key, action] of Object.entries(KEY_ACTIONS)) {
        if (!actionKeys[action]) actionKeys[action] = [];
        actionKeys[action].push(key);
    }

    const tableMap = [
        { action: 'space', kbdId: 'htKbdSpace', npId: 'htNpSpace' },
        { action: 'clearInput', kbdId: 'htKbdClearInput', npId: 'htNpClearInput' },
        { action: 'delete', kbdId: 'htKbdDelete', npId: 'htNpDelete' },
    ];
    for (const { action, kbdId, npId } of tableMap) {
        const keys = (actionKeys[action] || []).filter(k => k !== 'Backspace');
        const kbdKeys = keys.filter(k => !_isNumpadKey(k));
        const npKeys = keys.filter(k => _isNumpadKey(k));
        const kbdEl = document.getElementById(kbdId);
        const npEl = document.getElementById(npId);
        if (kbdEl) kbdEl.textContent = kbdKeys.length ? kbdKeys.map(k => _keyIdToLabel(k)).join(' ') : '—';
        if (npEl) npEl.textContent = npKeys.length ? npKeys.map(k => _keyIdToLabel(k)).join(' ') : '—';
    }

    const setKbd = (id, keys) => {
        const el = document.getElementById(id);
        if (el && keys && keys.length) el.textContent = keys.map(k => _keyIdToLabel(k)).join(' / ');
    };
    setKbd('helpDeleteForward', actionKeys['deleteForward']);
    setKbd('helpClearOutput', actionKeys['clearOutput']);
    setKbd('helpReadAloud', actionKeys['readAloud']);
    setKbd('helpPageUp', actionKeys['pageUp']);
    setKbd('helpPageDown', actionKeys['pageDown']);

    const comboMap = {};
    for (const combo of KEY_COMBOS) {
        const parts = [];
        if (combo.ctrl) parts.push('Ctrl');
        if (combo.alt) parts.push('Alt');
        if (combo.shift) parts.push('Shift');
        parts.push(combo.key.length === 1 ? combo.key.toUpperCase() : combo.key);
        const comboStr = parts.join('+');
        if (!comboMap[combo.action]) comboMap[combo.action] = [];
        comboMap[combo.action].push(comboStr);
    }

    const comboIds = {
        undo: 'helpComboUndo', redo: 'helpComboRedo', selectAll: 'helpComboSelectAll',
        save: 'helpComboSave', openFile: 'helpComboOpenFile', toggleSettings: 'helpComboToggleSettings',
        toggleHelp: 'helpComboToggleHelp', resetKeyBindings: 'helpComboResetKeyBindings',
        toggleMapping: 'helpComboToggleMapping',
    };
    for (const [action, id] of Object.entries(comboIds)) {
        const el = document.getElementById(id);
        const combos = comboMap[action];
        if (el && combos && combos.length) el.textContent = combos.join(' / ');
    }

    const selectAllRow = document.getElementById('helpRowSelectAll');
    if (selectAllRow) selectAllRow.style.display = SETTINGS.multiSelect ? '' : 'none';
    const shiftSelectRow = document.getElementById('helpRowShiftSelect');
    if (shiftSelectRow) shiftSelectRow.style.display = SETTINGS.multiSelect ? '' : 'none';
}

const helpPanel = createSlidePanel({
    slideId: 'helpSlide',
    overlayId: 'helpOverlay',
    btnId: 'helpBtn',
    closeBtnId: 'helpSlideClose',
    onOpen: renderHelpPanel,
    openSpeak: '打开键位帮助',
    closeSpeak: '关闭键位帮助',
});

toggleHelp = helpPanel.toggle;
