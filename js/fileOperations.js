// fileOperations.js - 文件打开与保存

import { outputItems, SETTINGS } from './state.js';
import { _batchInputOneHot, clearOutput } from './brailleInput.js';
import { toOneHot, extractBrailleOneHotList } from './utils-braille.js';
import { speak } from './brailleSpeech.js';

/**
 * @description: 读取文件内容并渲染到输出区
 * @param {File} file 用户选择的文件
 * @return {void}
 */
function _loadFileContent(file) {
    const reader = new FileReader();
    reader.onload = async () => {
        const rawText = reader.result;
        if (!rawText) { speak.text('文件内容为空'); return; }

        // 盲文 oneHot 文件：按转换规则直接转成拼音/字符
        const oneHotList = extractBrailleOneHotList(rawText);
        if (oneHotList && oneHotList.length > 0) {
            clearOutput();
            await _batchInputOneHot(oneHotList);
            speak.text(`已加载${oneHotList.length}个盲文字符`);
            return;
        }

        if (!rawText.trim()) { speak.text('文件内容为空'); return; }

        const hasNewlines = /[\r\n]/.test(rawText);
        if (hasNewlines) {
            let text = rawText.replace(/\r\n/g, '\n');
            if (SETTINGS.mergeNewlines) text = text.replace(/(\s*\n)+\s*/g, '\n');
            text = text.replace(/\n/g, '  ');
            const result = toOneHot.mixed(text);
            if (result && result.length > 0) {
                clearOutput();
                await _batchInputOneHot(result);
                speak.text('已加载文本');
            } else {
                speak.text('文件中未检测到有效内容');
            }
        } else {
            const result = toOneHot.mixed(rawText.trim());
            if (result && result.length > 0) {
                clearOutput();
                await _batchInputOneHot(result);
                speak.text('已加载文本');
            } else {
                speak.text('文件中未检测到有效内容');
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
        speak.alert('当前没有可保存的内容');
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

/**
 * @description: 将输出区盲文内容复制到剪贴板（优先 Clipboard API，降级为 execCommand）
 * @return {void}
 */
export async function handleCopyContent() {
    if (outputItems.length === 0) {
        speak.alert('当前没有可复制的内容');
        return;
    }

    const brailleText = outputItems.map(item => item.braille).join('');

    try {
        if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(brailleText);
        } else {
            copyWithExecCommand(brailleText);
        }
        speak.text('已复制' + outputItems.length + '个盲文字符');
    } catch (e) {
        console.error('复制失败:', e);
        speak.alert('复制失败，请重试');
    }
}

function copyWithExecCommand(content) {
    const textarea = document.createElement('textarea');
    textarea.value = content;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

export function initFileOperations() {
    document.getElementById('btnOpenFile').addEventListener('click', handleOpenFile);
    document.getElementById('btnSaveContent').addEventListener('click', handleSaveContent);
    document.getElementById('btnCopyContent').addEventListener('click', handleCopyContent);

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const file = e.dataTransfer?.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.txt')) {
            speak.text('仅支持txt文件');
            return;
        }
        _loadFileContent(file);
    });
}
