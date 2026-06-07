// fileOperations.js - 文件打开与保存

import { outputItems, setRenderSuppressed } from './brailleState.js';
import { inputOneHot, mixedToBraille } from './brailleInput.js';
import { speakText } from './brailleSpeech.js';
import { SETTINGS } from './config.js';
import { clearOutput } from './panelSettings.js';
import { invalidatePageCache, renderOutput } from './brailleOutput.js';

/**
 * @description: 分批插入oneHot编码，每批20个，批次间让出主线程避免UI卡死
 * @param {string[]} list oneHot编码数组
 * @param {number} [chunkSize=20] 每批数量
 * @return {Promise<void>}
 */
export async function _batchInputOneHot(list, chunkSize = 20) {
    setRenderSuppressed(true);
    try {
        for (let i = 0; i < list.length; i += chunkSize) {
            const chunk = list.slice(i, i + chunkSize);
            for (const oh of chunk) {
                inputOneHot(oh);
            }
            setRenderSuppressed(false);
            invalidatePageCache();
            renderOutput();
            await new Promise(r => setTimeout(r, 0));
            setRenderSuppressed(true);
        }
    } finally {
        setRenderSuppressed(false);
    }
    invalidatePageCache();
    renderOutput();
}

/**
 * @description: 读取文件内容并渲染到输出区
 * @param {File} file 用户选择的文件
 * @return {void}
 */
function _loadFileContent(file) {
    const reader = new FileReader();
    reader.onload = async () => {
        const rawText = reader.result;
        if (!rawText) { speakText('文件内容为空'); return; }

        const textNoNewline = rawText.replace(/[\r\n]/g, ' ');
        const isOneHotFile = /\b[01]{6}\b/.test(textNoNewline);
        const hasNewlines = /[\r\n]/.test(rawText);

        if (isOneHotFile) {
            let text = rawText;
            if (hasNewlines) {
                text = text.replace(/\r\n/g, '\n');
                if (SETTINGS.mergeNewlines) text = text.replace(/(\s*\n)+\s*/g, '\n');
                text = text.replace(/\n/g, ' 000000 000000 ');
                text = '000000 000000 ' + text;
            }
            const oneHotList = text.match(/\b[01]{6}\b/g);
            if (oneHotList && oneHotList.length > 0) {
                clearOutput();
                await _batchInputOneHot(oneHotList);
                speakText(`已加载${oneHotList.length}个盲文字符`);
            }
            return;
        }

        if (!rawText.trim()) { speakText('文件内容为空'); return; }

        if (hasNewlines) {
            let text = rawText.replace(/\r\n/g, '\n');
            if (SETTINGS.mergeNewlines) text = text.replace(/(\s*\n)+\s*/g, '\n');
            text = text.replace(/\n/g, '  ');
            const result = mixedToBraille(text);
            if (result && result.length > 0) {
                clearOutput();
                await _batchInputOneHot(result);
                speakText('已加载文本');
            } else {
                speakText('文件中未检测到有效内容');
            }
        } else {
            const result = mixedToBraille(rawText.trim());
            if (result && result.length > 0) {
                clearOutput();
                await _batchInputOneHot(result);
                speakText('已加载文本');
            } else {
                speakText('文件中未检测到有效内容');
            }
        }
    };
    reader.readAsText(file, 'UTF-8');
}

/**
 * @description: 通过文件选择器打开txt文件
 * @return {void}
 */
export function handleOpenFile() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.txt,text/plain';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        _loadFileContent(file);
        input.remove();
    });
    input.click();
}

/**
 * @description: 将输出区内容保存为文本文件（优先使用 File System Access API，降级为下载方式）
 * @return {void}
 */
export function handleSaveContent() {
    if (outputItems.length === 0) {
        speakText('当前没有可保存的内容', 1.5);
        return;
    }

    const brailleText = outputItems.map(item => item.braille).join('');

    if (window.showSaveFilePicker) {
        saveWithFSAccess(brailleText);
    } else {
        saveWithDownload(brailleText);
    }
}

async function saveWithFSAccess(content) {
    try {
        const handle = await window.showSaveFilePicker({
            suggestedName: 'braille_output.txt',
            types: [{
                description: '文本文件',
                accept: { 'text/plain': ['.txt'] }
            }]
        });
        const writable = await handle.createWritable();
        await writable.write(content);
        await writable.close();
        alert('保存成功！');
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.error('保存失败:', e);
            alert('保存失败，请重试');
        }
    }
}

function saveWithDownload(content) {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'braille_output.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

export function initFileOperations() {
    document.getElementById('btnOpenFile').addEventListener('click', handleOpenFile);
    document.getElementById('btnSaveContent').addEventListener('click', handleSaveContent);

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.txt')) {
            speakText('仅支持txt文件');
            return;
        }
        _loadFileContent(file);
    });
}
