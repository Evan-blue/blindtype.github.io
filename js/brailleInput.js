// brailleInput.js - 输入逻辑函数

/**
 * @description: 将激活的点位索引格式化为空格分隔的编号字符串
 * @param {number[]} dotState 6位点阵数组
 * @return {string} 如 "1 4"
 */
function activeDotsLabel(dotState) {
    return dotState.map((d, i) => d ? (i + 1) : '').filter(Boolean).join(' ');
}

/**
 * @description: 重置预览区域为空状态
 * @return {void}
 */
function resetPreview() {
    previewBox.classList.add('empty');
    previewChar.textContent = '⠀';
    previewDots.textContent = '';
    previewPinyin.textContent = '—';
}

/**
 * @description: 切换指定点位的开关状态，并重置防抖计时器
 * @param {number} idx 点位索引 (1-6)
 * @return {void}
 */
function toggleDot(idx) {
    const i = idx - 1; // 1-based → 0-based array index
    const turningOn = !dotState[i];
    dotState[i] = dotState[i] ? 0 : 1;
    renderDots();
    playBeep(turningOn ? 880 : 440, 50);

    // Reset debounce
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        renderPreview();
        if (dotState.some(d => d) && SETTINGS.debounceSpeech) {
            speakBraille(dotState.join(''));
        }
    }, DEBOUNCE_MS || 500);

    // Immediate partial preview (dimmed)
    const braille = dotsToBrailleChar(dotState);
    if (dotState.some(d => d)) {
        previewBox.classList.remove('empty');
        previewChar.textContent = braille;
        previewDots.textContent = activeDotsLabel(dotState);
        previewPinyin.textContent = '…';
    } else {
        resetPreview();
    }
}

// ── 标点符号空方规则 ──

// 不空方的标点
const PUNCT_NONE = new Set([
    '000010+011000',    // 。
    '000011+010000',    // ！
    '000010+001000',    // ？
    '000001+001001',    // ——
    '000001+001000',    // ·
]);

// 后空一方的标点（单码）
const PUNCT_AFTER = new Set([
    '000010',           // ，
    '000100',           // 、
    '000011',           // ；
    '001001',           // ：
    '000010+000010+000010', // ……
]);

// 左标点（前空一方）- 编码可区分方向
const PUNCT_OPEN = new Set([
    '000011+001000',    // （
    '000010+001001',    // 《
]);

// 右标点（后空一方）- 编码可区分方向
const PUNCT_CLOSE = new Set([
    '000001+011000',    // ）
    '001001+010000',    // 》
]);

// ── gkh/jqx 声母歧义 ──
const AMBIG_INITIALS = {
    '110110': { gkh: 'g', jqx: 'j', gkhAudio: '哥', jqxAudio: '基' },
    '101000': { gkh: 'k', jqx: 'q', gkhAudio: '科', jqxAudio: '七' },
    '110010': { gkh: 'h', jqx: 'x', gkhAudio: '喝', jqxAudio: '西' },
};
// i/ü 开头的韵母 oneHot（触发 jqx 判定）
const I_U_FINAL_ONEHOTS = new Set([
    '010100',  // i
    '110101',  // ia
    '100010',  // ie
    '001110',  // iao
    '110011',  // iu
    '100101',  // ian
    '110001',  // in
    '101101',  // iang
    '100001',  // ing
    '100111',  // iong
    '001101',  // ü
    '011111',  // üe
    '111101',  // üan
    '000111',  // ün
]);

// 成对标点（左右同码，通过对输出区中同码数量判断开/闭方向）
const PUNCT_PAIRED = new Set([
    '000110',           // ""
    '000110+000110',    // ''
    '000011+011000',    // ［］
]);

/**
 * @description: 判断某个 oneHot 是否为组合字符的前缀（即存在以它开头的更长的组合编码）
 * @param {string} oneHot
 * @return {boolean}
 */
function _isPunctPrefix(oneHot) {
    for (const key of Object.keys(PINYIN_MAPPING)) {
        if (key.includes('+') && key.startsWith(oneHot + '+')) return true;
    }
    for (const key of Object.keys(PUNC_MAPPING)) {
        if (key.includes('+') && key.startsWith(oneHot + '+')) return true;
    }
    return false;
}

/**
 * @description: 获取标点符号的空方规则
 * @param {string} oneHot
 * @return {string|null} 'open'|'close'|'after'|'none'|null
 */
function _getPunctRule(oneHot) {
    if (PUNCT_NONE.has(oneHot)) return 'none';
    if (PUNCT_AFTER.has(oneHot)) return 'after';
    if (PUNCT_OPEN.has(oneHot)) return 'open';
    if (PUNCT_CLOSE.has(oneHot)) return 'close';
    if (PUNCT_PAIRED.has(oneHot)) {
        let count = 0;
        for (const item of outputItems) {
            if (item.oneHot === oneHot) count++;
        }
        return count % 2 === 1 ? 'open' : 'close';
    }
    return null;
}

/**
 * @description: 处理上一项延迟的空方（在新输入与上一项不会合并时应用）
 * @param {string} newKey 新输入的oneHot
 * @return {number} cursor偏移量
 */
function _resolveDeferredPunct(newKey) {
    if (cursorIdx === 0) return 0;
    const prev = outputItems[cursorIdx - 1];
    if (!prev._punctPending) return 0;

    const combinedKey = prev.oneHot + '+' + newKey;
    if (_lookupBraille(combinedKey)) return 0; // 会合并，暂不处理

    delete prev._punctPending;
    if (!SETTINGS.punctAutoSpacing) return 0;
    const rule = _getPunctRule(prev.oneHot);
    let shift = 0;

    if (rule === 'open') {
        if (cursorIdx - 1 === 0 || outputItems[cursorIdx - 2].oneHot !== '000000') {
            outputItems.splice(cursorIdx - 1, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursorIdx++;
            shift++;
        }
    } else if (rule === 'close' || rule === 'after') {
        if (cursorIdx >= outputItems.length || outputItems[cursorIdx].oneHot !== '000000') {
            outputItems.splice(cursorIdx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursorIdx++;
            shift++;
        }
    }
    return shift;
}

/**
 * @description: 解析 分号/小写符号 歧义：000011 可由后续输入决定含义
 *   后续空方 → 分号；后续字母 → 小写符号；其他 → 分号（默认）
 * @param {string} nextKey 下一个输入的oneHot（null表示空格键输入的空方）
 * @return {void}
 */
/**
 * @description: 解析 gkh/jqx 声母歧义：后续韵母以 i/ü 开头→jqx，否则→gkh
 * @param {string} nextKey 下一个输入的oneHot
 * @return {void}
 */
function _resolveAmbigInitial(nextKey) {
    if (cursorIdx === 0) return;
    const prev = outputItems[cursorIdx - 1];
    if (!prev._ambigInitial) return;

    delete prev._ambigInitial;
    const info = AMBIG_INITIALS[prev.oneHot];
    if (!info) return;

    if (I_U_FINAL_ONEHOTS.has(nextKey)) {
        prev.char = info.jqx;
        prev.label = info.jqx;
        prev.audio = info.jqxAudio;
    } else {
        prev.char = info.gkh;
        prev.label = info.gkh;
        prev.audio = info.gkhAudio;
    }
}

/**
 * @description: 获取光标前一个非空方、非特殊项的char值，用于上下文消歧
 * @param {number} insertIdx 插入位置(cursorIdx)
 * @return {string} 前一个有效char，无则返回空串
 */
function _getPrevChar(insertIdx) {
    for (let i = insertIdx - 1; i >= 0; i--) {
        const item = outputItems[i];
        if (item.oneHot === '000000') continue;
        if (item.isNumber || item.isEnglish) continue;
        return (item.char || '').trim();
    }
    return '';
}

/**
 * @description: 解析 e/o 韵母歧义（oneHot 010001）：b/p/f 后为 o，m 后两者皆可，其余为 e
 * @param {string} oneHot 当前输入的oneHot
 * @param {number} insertIdx 插入位置(cursorIdx)
 * @return {string|null} 解析后的char，非010001时返回null
 */
function _resolveEo(oneHot, insertIdx) {
    if (oneHot !== '010001') return null;
    const prevChar = _getPrevChar(insertIdx);
    if (prevChar === 'b' || prevChar === 'p' || prevChar === 'f') return 'o';
    if (prevChar === 'm') return 'e/o';
    return 'e';
}

/**
 * @description: 标点插入后，立即插入空方或标记为延迟处理
 * @param {string} oneHot 标点oneHot
 * @param {number} idx   标点在outputItems中的位置
 * @return {number} cursor偏移量
 */
function _applyPunctSpacing(oneHot, idx) {
    const rule = _getPunctRule(oneHot);
    if (!rule || rule === 'none') return 0;

    // 是组合字符前缀 → 延迟处理（等下一码确认后再决定）
    if (_isPunctPrefix(oneHot)) {
        outputItems[idx]._punctPending = true;
        return 0;
    }

    // 未开启标点空方自动补全 → 只标记延迟用于合并判断，不实际插空方
    if (!SETTINGS.punctAutoSpacing) return 0;

    if (rule === 'open') {
        if (idx === 0 || outputItems[idx - 1].oneHot !== '000000') {
            outputItems.splice(idx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            return 1;
        }
    } else if (rule === 'close' || rule === 'after') {
        const afterPos = idx + 1;
        if (afterPos >= outputItems.length || outputItems[afterPos].oneHot !== '000000') {
            outputItems.splice(afterPos, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            return 1;
        }
    }
    return 0;
}

/**
 * @description: 确认当前输入，将盲文字符插入输出区光标位置
 *   支持数字模式：输入数号(001111)后，后续点位按数字解读
 * @return {void}
 */
function confirmInput() {
    if (!dotState.some(d => d)) return;
    pushUndo();
    invalidatePageCache();

    clearTimeout(debounceTimer);

    const braille = dotsToBrailleChar(dotState);
    const key = dotState.join('');

    // ── 解析上一项延迟的标点空方 ──
    _resolveDeferredPunct(key);

    // ── 解析 gkh/jqx 声母歧义（后续韵母决定读音）──
    _resolveAmbigInitial(key);

    // ── 输入数号（001111同时也是韵母eng，前面有声母则为eng）──
    if (key === NUMBER_SIGN) {
        const prevChar = _getPrevChar(cursorIdx);
        if (!prevChar || !_validInitials || !_validInitials.has(prevChar)) {
            const signEntry = NUMBER_MAPPING[key];
            outputItems.splice(cursorIdx, 0, {
                braille, pinyin: '', char: signEntry.char, audio: signEntry.audio,
                oneHot: key, isNumber: true
            });
            cursorIdx++;
            dotState.fill(0); renderDots(); resetPreview();
            speakText(signEntry.audio);
            renderOutput();
            return;
        }
        // 前面有声母，按韵母eng处理，继续往下走普通拼音输入
    }

    // ── 数字模式下追加数字位 ──
    if (isInNumberContext()) {
        const digit = NUMBER_MAPPING[key];
        if (digit) {
            const numItem = outputItems[getNumberStartIdx()];
            numItem.oneHot += '+' + key;
            numItem.braille += braille;
            numItem.char += digit.char;
            numItem.audio = numItem.char;
            dotState.fill(0); renderDots(); resetPreview();
            speakText(digit.audio);
            renderOutput();
            return;
        }
        // 非数字点位 → 退出数字模式，按普通字符处理
    }

    // ── 输入大写字母符号 ──
    if (key === CAPITAL_SIGN) {
        const signEntry = LETTER_MAPPING[key];
        if (isInEnglishContext()) {
            const engItem = outputItems[getEnglishStartIdx()];
            if (engItem.letterCase === 'upper') {
                // 连续两个大写符号 → 全大写模式
                engItem.allCaps = true;
                engItem.oneHot += '+' + key;
                engItem.braille += braille;
                dotState.fill(0); renderDots(); resetPreview();
                speakText('全大写');
                renderOutput();
                return;
            }
        }
        outputItems.splice(cursorIdx, 0, {
            braille, pinyin: '', char: '', audio: signEntry.audio,
            oneHot: key, isEnglish: true, letterCase: 'upper', singleUpper: true
        });
        cursorIdx++;
        dotState.fill(0); renderDots(); resetPreview();
        speakText(signEntry.audio);
        renderOutput();
        return;
    }

    // ── 输入小写字母符号/分号（前方空方→小写符号；否则→分号）──
    if (key === LOWERCASE_SIGN) {
        const signEntry = LETTER_MAPPING[key];
        if (cursorIdx > 0 && outputItems[cursorIdx - 1].oneHot === '000000') {
            outputItems.splice(cursorIdx, 0, {
                braille, pinyin: '', char: '', audio: signEntry.audio,
                oneHot: key, isEnglish: true, letterCase: 'lower'
            });
            cursorIdx++;
            dotState.fill(0); renderDots(); resetPreview();
            speakText(signEntry.audio);
            renderOutput();
            return;
        }
        // 否则为分号（000011），插入后空一方
        outputItems.splice(cursorIdx, 0, {
            braille, pinyin: '；(分号)', char: '；', audio: '分号',
            oneHot: key
        });
        cursorIdx++;
        if (SETTINGS.punctAutoSpacing && (cursorIdx >= outputItems.length || outputItems[cursorIdx].oneHot !== '000000')) {
            outputItems.splice(cursorIdx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursorIdx++;
        }
        dotState.fill(0); renderDots(); resetPreview();
        playBeep();
        renderOutput();
        return;
    }

    // ── 英文模式下追加字母 ──
    if (isInEnglishContext()) {
        const letter = LETTER_MAPPING[key];
        if (letter && letter.char) {
            const engItem = outputItems[getEnglishStartIdx()];
            const isUpper = engItem.letterCase === 'upper';
            const ch = letter.char; // "Aa" 格式
            const audioParts = (letter.audio || '').split(' ');
            const letterChar = isUpper ? (ch[0] || '') : (ch[1] || '');
            const letterAudio = isUpper ? (audioParts[0] || letterChar) : (audioParts[1] || letterChar);
            engItem.oneHot += '+' + key;
            engItem.braille += braille;
            engItem.char += letterChar;
            engItem.audio = engItem.char;
            // 单大写符号（非全大写）：首字母大写后自动切为小写
            if (engItem.singleUpper && !engItem.allCaps && engItem.char.length === 1) {
                engItem.letterCase = 'lower';
            }
            dotState.fill(0); renderDots(); resetPreview();
            speakText(letterAudio);
            renderOutput();
            return;
        }
        // 非字母点位 → 退出英文模式
    }

    // ── 普通拼音输入 ──
    const entry = _lookupBraille(key);
    const pinyin = entry ? entry.label : '';
    const audio = entry ? entry.audio : '';
    const char = entry ? (_resolveEo(key, cursorIdx) || entry.char) : '';

    const item = { braille, pinyin, char, audio, oneHot: key };
    if (AMBIG_INITIALS[key]) item._ambigInitial = true;
    outputItems.splice(cursorIdx, 0, item);
    cursorIdx++;

    // Auto-merge combined characters
    let merged = false;
    if (cursorIdx >= 2) {
        const prev = outputItems[cursorIdx - 2];
        const curr = outputItems[cursorIdx - 1];
        // 数字项和英文项不参与拼音合并
        if (!prev.isNumber && !prev.isEnglish && !curr.isNumber && !curr.isEnglish) {
            const combinedKey = prev.oneHot + '+' + curr.oneHot;
            const combinedEntry = _lookupBraille(combinedKey);
            if (combinedEntry) {
                const combinedBraille = oneHotToBrailleChar(combinedKey);
                outputItems.splice(cursorIdx - 2, 2, {
                    braille: combinedBraille,
                    pinyin: combinedEntry.label,
                    char: combinedEntry.char,
                    audio: combinedEntry.audio,
                    oneHot: combinedKey
                });
                cursorIdx--;
                merged = true;
            }
        }
    }

    // ── 标点空方处理 ──
    cursorIdx += _applyPunctSpacing(outputItems[cursorIdx - 1].oneHot, cursorIdx - 1);

    dotState.fill(0); renderDots(); resetPreview();

    if (merged) {
        speakBraille(outputItems[cursorIdx - 1].oneHot);
    } else {
        speakBraille(key);
    }
    renderOutput();
}

/**
 * @description: 插入一个空方（无点位的空白盲文字符）
 * @return {void}
 */
function inputSpace() {
    pushUndo();
    invalidatePageCache();
    outputItems.splice(cursorIdx, 0, { braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000' });
    cursorIdx++;
    speakText('空方');
    renderOutput();
}

/**
 * @description: 清空当前未确认的点位输入
 * @return {void}
 */
function clearInput() {
    const litCount = dotState.filter(d => d).length;
    dotState.fill(0);
    renderDots();
    resetPreview();
    for (let i = 0; i < litCount; i++) {
        setTimeout(() => playBeep(440, 40), i * 50);
    }
}

/**
 * @description: 删除光标前一个输出字符（Backspace行为），删除后确保光标在合法group边界
 *   数字项逐位删除：先删末位数字，再删数号
 * @return {void}
 */
function deleteLast() {
    if (cursorIdx === 0) return;
    pushUndo();
    invalidatePageCache();

    const target = outputItems[cursorIdx - 1];

    // ── 数字项逐位退格 ──
    if (target.isNumber) {
        const parts = target.oneHot.split('+');
        if (parts.length > 1) {
            // 删除最后一位数字
            const removedDigit = target.char.slice(-1);
            parts.pop();
            target.oneHot = parts.join('+');
            target.braille = Array.from(target.braille).slice(0, -1).join('');
            target.char = target.char.slice(0, -1);
            target.audio = target.char || '数号';
            stopSpeech();
            speakText('删除' + (removedDigit || '数号'));
            renderOutput();
            return;
        }
        // 只剩数号，整项删除
        outputItems.splice(cursorIdx - 1, 1);
        cursorIdx--;
        const meta = computeItemMeta();
        cursorIdx = snapToGroupBoundary(cursorIdx, meta, -1);
        stopSpeech();
        speakText('删除数号');
        renderOutput();
        return;
    }

    // ── 英文项逐位退格 ──
    if (target.isEnglish) {
        const parts = target.oneHot.split('+');
        if (parts.length > 1) {
            // 删除最后一位字母
            const removedChar = target.char.slice(-1);
            parts.pop();
            target.oneHot = parts.join('+');
            target.braille = Array.from(target.braille).slice(0, -1).join('');
            target.char = target.char.slice(0, -1);
            target.audio = target.char;
            // 如果删到只剩符号，恢复为符号的 audio
            if (parts.length === 1) {
                const signEntry = LETTER_MAPPING[parts[0]];
                target.audio = signEntry ? signEntry.audio : '';
                if (target.letterCase === 'upper' && target.singleUpper) {
                    target.letterCase = 'upper';
                }
            }
            stopSpeech();
            speakText('删除' + (removedChar || '字母符号'));
            renderOutput();
            return;
        }
        // 只剩字母符号，整项删除
        outputItems.splice(cursorIdx - 1, 1);
        cursorIdx--;
        const meta = computeItemMeta();
        cursorIdx = snapToGroupBoundary(cursorIdx, meta, -1);
        stopSpeech();
        speakText('删除字母符号');
        renderOutput();
        return;
    }

    // ── 普通删除 ──
    const deleted = outputItems[cursorIdx - 1];
    outputItems.splice(cursorIdx - 1, 1);
    cursorIdx--;

    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(cursorIdx, meta, -1);

    stopSpeech();
    speakText('删除' + (deleted.audio || deleted.pinyin.trim() || '空方'));
    renderOutput();
}

/**
 * @description: 删除光标后一个输出字符（Delete键行为），删除后确保光标在合法group边界
 * @return {void}
 */
function deleteForward() {
    if (cursorIdx < outputItems.length) {
        pushUndo();
        invalidatePageCache();
        const deleted = outputItems[cursorIdx];
        outputItems.splice(cursorIdx, 1);

        const meta = computeItemMeta();
        cursorIdx = snapToGroupBoundary(cursorIdx, meta, 1);

        stopSpeech();
        speakText('删除' + (deleted.audio || deleted.pinyin.trim() || '空方'));
        renderOutput();
    }
}

/**
 * @description: 删除所有选中的输出项，播报"批量选定删除"
 * @return {void}
 */
function deleteSelected() {
    if (selectedIndices.size === 0) return;
    pushUndo();
    invalidatePageCache();
    const sorted = [...selectedIndices].sort((a, b) => b - a); // 从后往前删
    for (const idx of sorted) {
        outputItems.splice(idx, 1);
    }
    const minIdx = Math.min(...selectedIndices);
    cursorIdx = Math.min(cursorIdx, minIdx);
    if (cursorIdx > outputItems.length) cursorIdx = outputItems.length;
    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(cursorIdx, meta, -1);
    selectedIndices.clear();
    _selAnchor = -1;
    stopSpeech();
    speakText('批量选定删除');
    renderOutput();
}

/**
 * @description: Shift+方向键扩展/收缩选择范围
 *   以锚点（首次按下时的光标位置）为固定端，光标为移动端
 *   选中范围为锚点与光标之间的所有项，支持双向收缩
 * @param {number} delta 扩展方向，-1向左，+1向右
 * @return {void}
 */
function selectExtend(delta) {
    if (!SETTINGS.multiSelect || outputItems.length === 0) return;

    const meta = computeItemMeta();

    // 首次选择：以当前光标位置为锚点
    if (selectedIndices.size === 0) {
        _selAnchor = cursorIdx;
    }

    // 移动光标（移动端）
    let newIdx = cursorIdx + delta;
    if (newIdx < 0) newIdx = 0;
    if (newIdx > outputItems.length) newIdx = outputItems.length;
    cursorIdx = snapToGroupBoundary(newIdx, meta, delta);

    // 以锚点和光标之间的区间重建选择
    selectedIndices.clear();
    const from = Math.min(_selAnchor, cursorIdx);
    const to = Math.max(_selAnchor, cursorIdx);
    for (let i = from; i < to; i++) {
        selectedIndices.add(i);
    }

    renderOutput();
    ensureCursorVisible();
    speakText(selectedIndices.size > 0 ? `已选${selectedIndices.size}项` : '取消选择');
}

/**
 * @description: 移动光标位置（以 braille-group 为单位跳转，跳过组内部），防抖后播报光标前的内容
 * @param {number} delta 移动方向，-1左移，+1右移
 * @return {void}
 */
function moveCursor(delta) {
    // 非Shift移动光标时清除选择
    if (selectedIndices.size > 0) {
        selectedIndices.clear();
        _selAnchor = -1;
    }
    let newIdx = cursorIdx + delta;
    if (newIdx < 0 || newIdx > outputItems.length) return;
    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(newIdx, meta, delta);
    renderOutput();
    ensureCursorVisible();
    // 光标移动防抖：停止连续按键时不播报，停下后再播报
    clearTimeout(cursorDebounceTimer);
    cursorDebounceTimer = setTimeout(() => {
        if (outputItems.length === 0) return;
        // 重新计算 meta，避免闭包中 stale 数据导致索引错位
        const curMeta = computeItemMeta();

        if (cursorIdx === 0) {
            speakText('开头');
            return;
        }
        // 光标在末尾
        if (cursorIdx >= outputItems.length) {
            const lastMeta = curMeta[outputItems.length - 1];
            if (lastMeta && lastMeta.merged) {
                speakText(pinyinToHanzi(lastMeta.merged));
            } else {
                const last = outputItems[outputItems.length - 1];
                speakText(pinyinToHanzi(last.audio || last.pinyin.trim()) || '空方');
            }
            return;
        }
        const item = outputItems[cursorIdx - 1];  // 获取光标前一项
        const itemMeta = curMeta[cursorIdx - 1];  // 获取光标前项的 meta
        if (item.oneHot === '000000') {
            speakText('空方');
        } else if (itemMeta && itemMeta.merged) {
            speakText(pinyinToHanzi(itemMeta.merged));
        } else {
            speakText(pinyinToHanzi(item.audio.replace("数号", "") || item.pinyin.trim()) || '空方');
            // speakText(item.audio || item.pinyin.trim() || '空方');
        }
    }, CURSOR_DEBOUNCE_MS);
}

// 句子结束标点的 oneHot 编码集合
const SENTENCE_END_ONEHOTS = new Set([
    '000010+011000', // 。
    '000011+010000', // ！
    '000010+001000', // ？
    '000010+000010+000010', // ……
]);

/**
 * @description: 判断某个输出项是否为当前跳转模式的分隔符
 * @param {number} idx 输出项索引
 * @return {boolean}
 */
function _isJumpBoundary(idx) {
    const item = outputItems[idx];
    if (!item) return false;
    const mode = SETTINGS.cursorJumpMode || 'emptyCell';
    switch (mode) {
        case 'emptyCell':
            return item.oneHot === '000000';
        case 'newline':
            // 换行存储为两个连续空方，检测当前项为空方且下一项也是空方
            return item.oneHot === '000000'
                && idx + 1 < outputItems.length
                && outputItems[idx + 1].oneHot === '000000';
        case 'sentenceEnd':
            return SENTENCE_END_ONEHOTS.has(item.oneHot);
        default:
            return item.oneHot === '000000';
    }
}

/**
 * @description: 向上移动光标——根据跳转模式跳到上一个分隔处（或开头）
 * @return {void}
 */
function moveCursorUp() {
    if (outputItems.length === 0) return;
    if (selectedIndices.size > 0) {
        selectedIndices.clear();
        _selAnchor = -1;
    }
    let target = cursorIdx - 1;
    while (target > 0 && !_isJumpBoundary(target)) target--;
    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(target, meta, -1);
    renderOutput();
    ensureCursorVisible();

    clearTimeout(cursorDebounceTimer);
    cursorDebounceTimer = setTimeout(() => {
        if (cursorIdx === 0) { speakText('开头'); return; }
        const curMeta = computeItemMeta();
        const item = outputItems[cursorIdx - 1];
        const itemMeta = curMeta[cursorIdx - 1];
        if (item.oneHot === '000000') speakText('空方');
        else if (itemMeta && itemMeta.merged) speakText(pinyinToHanzi(itemMeta.merged));
        else speakText(pinyinToHanzi(item.audio || item.pinyin.trim()) || '空方');
    }, CURSOR_DEBOUNCE_MS);
}

/**
 * @description: 向下移动光标——根据跳转模式跳到下一个分隔处（或末尾）
 * @return {void}
 */
function moveCursorDown() {
    if (outputItems.length === 0) return;
    if (selectedIndices.size > 0) {
        selectedIndices.clear();
        _selAnchor = -1;
    }
    let target = cursorIdx;
    // 若光标正对分隔符，先越过它
    if (target < outputItems.length && _isJumpBoundary(target)) target++;
    while (target < outputItems.length && !_isJumpBoundary(target)) target++;
    const meta = computeItemMeta();
    cursorIdx = snapToGroupBoundary(Math.min(target, outputItems.length), meta, 1);
    renderOutput();
    ensureCursorVisible();

    clearTimeout(cursorDebounceTimer);
    cursorDebounceTimer = setTimeout(() => {
        if (cursorIdx >= outputItems.length) { speakText('末尾'); return; }
        const curMeta = computeItemMeta();
        const item = outputItems[cursorIdx - 1];
        const itemMeta = curMeta[cursorIdx - 1];
        if (item.oneHot === '000000') speakText('空方');
        else if (itemMeta && itemMeta.merged) speakText(pinyinToHanzi(itemMeta.merged));
        else speakText(pinyinToHanzi(item.audio || item.pinyin.trim()) || '空方');
    }, CURSOR_DEBOUNCE_MS);
}

/**
 * @description: 直接通过 oneHot 编码插入盲文字符（支持数字模式）
 * @param {string} oneHot 6位二进制字符串如 "110000"
 * @return {void}
 */
function inputOneHot(oneHot) {
    pushUndo();
    if (!_renderSuppressed) invalidatePageCache();

    const braille = oneHotToBrailleChar(oneHot);

    // ── 解析上一项延迟的标点空方 ──
    _resolveDeferredPunct(oneHot);

    // ── 解析 gkh/jqx 声母歧义 ──
    _resolveAmbigInitial(oneHot);

    // ── 输入数号（001111同时也是韵母eng，前面有声母则为eng）──
    if (oneHot === NUMBER_SIGN) {
        const prevChar = _getPrevChar(cursorIdx);
        if (!prevChar || !_validInitials || !_validInitials.has(prevChar)) {
            const signEntry = NUMBER_MAPPING[oneHot];
            outputItems.splice(cursorIdx, 0, {
                braille, pinyin: '', char: signEntry.char, audio: signEntry.audio,
                oneHot, isNumber: true
            });
            cursorIdx++;
            renderOutput();
            return;
        }
        // 前面有声母，按韵母eng处理，继续往下
    }

    // ── 数字模式下追加数字位 ──
    if (isInNumberContext()) {
        const digit = NUMBER_MAPPING[oneHot];
        if (digit) {
            const numItem = outputItems[getNumberStartIdx()];
            numItem.oneHot += '+' + oneHot;
            numItem.braille += braille;
            numItem.char += digit.char;
            numItem.audio = numItem.char;
            renderOutput();
            return;
        }
    }

    // ── 输入大写字母符号 ──
    if (oneHot === CAPITAL_SIGN) {
        const signEntry = LETTER_MAPPING[oneHot];
        if (isInEnglishContext()) {
            const engItem = outputItems[getEnglishStartIdx()];
            if (engItem.letterCase === 'upper') {
                engItem.allCaps = true;
                engItem.oneHot += '+' + oneHot;
                engItem.braille += braille;
                renderOutput();
                return;
            }
        }
        outputItems.splice(cursorIdx, 0, {
            braille, pinyin: '', char: '', audio: signEntry.audio,
            oneHot, isEnglish: true, letterCase: 'upper', singleUpper: true
        });
        cursorIdx++;
        renderOutput();
        return;
    }

    // ── 输入小写字母符号/分号（前方空方→小写符号；否则→分号）──
    if (oneHot === LOWERCASE_SIGN) {
        const signEntry = LETTER_MAPPING[oneHot];
        if (cursorIdx > 0 && outputItems[cursorIdx - 1].oneHot === '000000') {
            outputItems.splice(cursorIdx, 0, {
                braille, pinyin: '', char: '', audio: signEntry.audio,
                oneHot, isEnglish: true, letterCase: 'lower'
            });
            cursorIdx++;
            renderOutput();
            return;
        }
        outputItems.splice(cursorIdx, 0, {
            braille, pinyin: '；(分号)', char: '；', audio: '分号',
            oneHot
        });
        cursorIdx++;
        if (SETTINGS.punctAutoSpacing && (cursorIdx >= outputItems.length || outputItems[cursorIdx].oneHot !== '000000')) {
            outputItems.splice(cursorIdx, 0, {
                braille: '⠀', pinyin: ' ', char: '', audio: '空方', oneHot: '000000'
            });
            cursorIdx++;
        }
        renderOutput();
        return;
    }

    // ── 英文模式下追加字母 ──
    if (isInEnglishContext()) {
        const letter = LETTER_MAPPING[oneHot];
        if (letter && letter.char) {
            const engItem = outputItems[getEnglishStartIdx()];
            const isUpper = engItem.letterCase === 'upper';
            const ch = letter.char;
            const letterChar = isUpper ? (ch[0] || '') : (ch[1] || '');
            engItem.oneHot += '+' + oneHot;
            engItem.braille += braille;
            engItem.char += letterChar;
            engItem.audio = engItem.char;
            if (engItem.singleUpper && !engItem.allCaps && engItem.char.length === 1) {
                engItem.letterCase = 'lower';
            }
            renderOutput();
            return;
        }
    }

    // ── 普通拼音输入 ──
    const entry = _lookupBraille(oneHot);
    const pinyin = entry ? entry.label : '';
    const audio = entry ? entry.audio : '';
    const char = entry ? (_resolveEo(oneHot, cursorIdx) || entry.char) : '';

    const item = { braille, pinyin, char, audio, oneHot };
    if (AMBIG_INITIALS[oneHot]) item._ambigInitial = true;
    outputItems.splice(cursorIdx, 0, item);
    cursorIdx++;

    // Auto-merge if last two items form a combined character
    if (cursorIdx >= 2) {
        const prev = outputItems[cursorIdx - 2];
        const curr = outputItems[cursorIdx - 1];
        if (!prev.isNumber && !prev.isEnglish && !curr.isNumber && !curr.isEnglish) {
            const combinedKey = prev.oneHot + '+' + curr.oneHot;
            const combinedEntry = _lookupBraille(combinedKey);
            if (combinedEntry) {
                const combinedBraille = oneHotToBrailleChar(combinedKey);
                outputItems.splice(cursorIdx - 2, 2, {
                    braille: combinedBraille,
                    pinyin: combinedEntry.label,
                    char: combinedEntry.char,
                    audio: combinedEntry.audio,
                    oneHot: combinedKey
                });
                cursorIdx--;
            }
        }
    }

    // ── 标点空方处理 ──
    cursorIdx += _applyPunctSpacing(outputItems[cursorIdx - 1].oneHot, cursorIdx - 1);

    renderOutput();
}
