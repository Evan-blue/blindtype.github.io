// devPanel.js - 可拖动开发者面板

/**
 * @description: 模拟盲文键盘逐键输入（走 toggleDot → confirmInput 流程，可视化反馈）
 * @param {string[]} oneHotList 一组6位oneHot编码
 * @param {number}   charDelay  字符间延迟(ms)，默认400
 * @return {Promise<void>}
 */
async function simulateKeyInput(oneHotList, charDelay = 400) {
    for (let i = 0; i < oneHotList.length; i++) {
        const dots = oneHotList[i].split('').map(Number);

        clearTimeout(debounceTimer); // 防止上一轮的防抖定时器干扰
        // 逐一点亮/关闭对应点位（toggleDot 使用1-based索引）
        for (let d = 0; d < 6; d++) {
            if (dotState[d] !== dots[d]) {
                toggleDot(d + 1);
                await sleep(100);
            }
        }
        // 关闭不需要的点位
        for (let d = 0; d < 6; d++) {
            if (dotState[d] && !dots[d]) {
                toggleDot(d + 1);
                await sleep(80);
            }
        }

        await sleep(120);
        confirmInput();
        await sleep(charDelay);
    }
}

/**
 * @description: Promise化的setTimeout
 * @param {number} ms 毫秒
 * @return {Promise<void>}
 */
function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

/**
 * @description: 初始化开发者面板（绑定拖动逻辑和测试按钮事件）
 * @return {void}
 */
function initDevPanel() {
    const panel = document.getElementById('devPanel');
    const header = panel.querySelector('.dev-header');

    // ── 按钮不触发拖动 ──
    document.getElementById('devClose').addEventListener('mousedown', e => e.stopPropagation());

    // ── 关闭按钮 ──
    document.getElementById('devClose').addEventListener('click', () => {
        panel.style.display = 'none';
    });

    // ── 键盘输入 "devpanel" 重新显示面板 ──
    (function() {
        const SECRET = 'devpanel';
        let buf = '';
        document.addEventListener('keydown', (e) => {
            if (panel.style.display !== 'none') return;
            // 忽略功能键和组合键
            if (e.ctrlKey || e.altKey || e.metaKey) return;
            if (e.key.length === 1) {
                buf += e.key.toLowerCase();
                if (buf.length > SECRET.length) buf = buf.slice(-SECRET.length);
                if (buf === SECRET) {
                    panel.style.display = '';
                    buf = '';
                }
            }
        });
    })();

    // ── hover 展开，离开收起（pin 时保持展开）──
    const pinBtn = document.getElementById('devPin');
    let devPinned = false;

    panel.addEventListener('mouseenter', () => {
        panel.classList.remove('collapsed');
        updateDevFlip();
    });

    panel.addEventListener('mouseleave', () => {
        if (!devPinned) {
            panel.classList.add('collapsed');
        }
    });

    header.addEventListener('click', (e) => {
        if (dragMoved) return;
        if (e.target.closest('#devClose') || e.target.closest('#devPin') || e.target.closest('.dev-tab')) return;
        // 点击 header 等同于切换 pin
        pinBtn.click();
    });

    pinBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        devPinned = !devPinned;
        pinBtn.classList.toggle('pinned', devPinned);
        pinBtn.setAttribute('aria-pressed', devPinned);
        panel.classList.toggle('pinned', devPinned);
        if (devPinned) {
            panel.classList.remove('collapsed');
            updateDevFlip();
        }
    });

    // ── 根据屏幕位置切换上下展开方向 ──
    function updateDevFlip() {
        const rect = header.getBoundingClientRect();
        panel.classList.toggle('flip', rect.top + rect.height / 2 < window.innerHeight / 2);
    }

    // ── 拖动逻辑 ──
    let dragging = false, dragMoved = false, startX, startY, origLeft, origTop;

    header.addEventListener('mousedown', (e) => {
        if (e.target.closest('#devClose') || e.target.closest('#devPin')) return;
        dragging = true;
        dragMoved = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = panel.getBoundingClientRect();
        origLeft = rect.left;
        origTop = rect.top;
        e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        if (Math.abs(e.clientX - startX) > 2 || Math.abs(e.clientY - startY) > 2) {
            dragMoved = true;
        }
        let left = origLeft + e.clientX - startX;
        let top = origTop + e.clientY - startY;
        left = Math.max(0, Math.min(left, window.innerWidth - panel.offsetWidth));
        top = Math.max(0, Math.min(top, window.innerHeight - panel.offsetHeight));
        panel.style.left = left + 'px';
        panel.style.top = top + 'px';
        panel.style.right = 'auto';
        panel.style.bottom = 'auto';
    });

    document.addEventListener('mouseup', () => {
        if (dragging && dragMoved) updateDevFlip();
        dragging = false;
    });

    // ── 汉字输入转盲文 ──
    // ── 输入/键入模式 ──
    let devMode = 'input';
    const devModeBtns = panel.querySelectorAll('.dev-mode-btn');
    devModeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            devMode = btn.dataset.mode;
            devModeBtns.forEach(b => b.classList.toggle('active', b.dataset.mode === devMode));
        });
    });

    function execMode(oneHotList) {
        if (devMode === 'type') {
            simulateKeyInput(oneHotList, 80);
        } else {
            oneHotList.forEach(oh => inputOneHot(oh));
        }
    }

    // ── 混合内容输入（中英数字）──
    document.getElementById('devMixedInput').addEventListener('click', () => {
        const input = prompt('请输入内容（支持中英数字混合）');
        if (!input || !input.trim()) return;
        execMode(mixedToBraille(input.trim()));
    });

    // ── 汉字输入转盲文 ──
    document.getElementById('devChineseInput').addEventListener('click', () => {
        const input = prompt('请输入汉字内容');
        if (!input || !input.trim()) return;
        execMode(chineseToBraille(input.trim()));
    });

    // ── 输入数字 ──
    document.getElementById('devNumberInput').addEventListener('click', () => {
        const input = prompt('请输入数字');
        if (!input || !input.trim()) return;
        execMode(numberToBraille(input.trim()));
    });

    // ── 输入英文 ──
    document.getElementById('devEnglishInput').addEventListener('click', () => {
        const input = prompt('请输入英文内容');
        if (!input || !input.trim()) return;
        execMode(englishToBraille(input.trim()));
    });

    // ── 我爱你 ──
    document.getElementById('devLove').addEventListener('click', () => {
        const cells = [
            '101010', '001000',
            '010101', '011000',
            '101110', '010100', '001000',
        ];
        execMode(cells);
    });

    // ── 静夜思 ──
    document.getElementById('devJingYeSi').addEventListener('click', () => {
        execMode(chineseToBraille('床前明月光，疑是地上霜。举头望明月，低头思故乡。'));
    });

    // ── 老鼠爱大米 ──
    document.getElementById('devMouseLoveRice').addEventListener('click', () => {
        execMode(chineseToBraille('我爱你，爱着你，就像老鼠爱大米。'));
    });

    // ── 123.456 ──
    document.getElementById('devNumber').addEventListener('click', () => {
        execMode(numberToBraille('123.456'));
    });

    // ── English sentence ──
    document.getElementById('devEnglish').addEventListener('click', () => {
        execMode(englishToBraille('Can you type without looking?'));
    });

    // ── 随机若干字符 ──
    document.getElementById('devRandom').addEventListener('click', () => {
        const input = prompt('请输入随机字符数量', '100');
        const n = parseInt(input, 10);
        if (!n || n < 1 || n > 500) return;
        const allKeys = [...Object.keys(PINYIN_MAPPING), ...Object.keys(PUNC_MAPPING)];
        const list = [];
        for (let i = 0; i < n; i++) {
            list.push(allKeys[Math.floor(Math.random() * allKeys.length)]);
        }
        execMode(list);
    });

    // ── 加载测试文件 ──
    document.getElementById('devLoadTestFile').addEventListener('click', async () => {
        try {
            const resp = await fetch('./test_files/test2.txt');
            if (!resp.ok) { speakText('加载测试文件失败'); return; }
            const rawText = await resp.text();
            if (!rawText || !rawText.trim()) { speakText('测试文件内容为空'); return; }

            const result = chineseToBraille(rawText.trim());
            if (result && result.length > 0) {
                clearOutput();
                await _batchInputOneHot(result);
                speakText('已加载测试文件');
            } else {
                speakText('测试文件中未检测到有效内容');
            }
        } catch (e) {
            speakText('加载测试文件出错');
        }
    });

    // ── Tab 切换：高级设置 / 模拟输入 ──
    const devTabs = panel.querySelectorAll('.dev-tab');
    const devSections = panel.querySelectorAll('.dev-section');
    devTabs.forEach(tab => {
        tab.addEventListener('mousedown', e => e.stopPropagation());
        tab.addEventListener('click', () => {
            const targetId = tab.dataset.target;
            devTabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            devSections.forEach(s => {
                s.style.display = s.id === targetId ? '' : 'none';
            });
        });
    });
    // 初始状态：只显示 active tab 对应的 section
    devSections.forEach(s => {
        const activeTab = panel.querySelector('.dev-tab.active');
        s.style.display = activeTab && s.id === activeTab.dataset.target ? '' : 'none';
    });

    // 初始位于右上角，需要立即确定展开方向
    updateDevFlip();
}
