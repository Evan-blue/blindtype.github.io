// dev.js — 聚合所有模块导出，方便浏览器终端调试
// 用法：在控制台输入 dev = await import('./js/dev.js')
//       然后 dev.speakText('hello'); dev.renderOutput(); 等

import * as state from './state.js';
import * as config from './config.js';
import * as brailleInput from './brailleInput.js';
import * as brailleOutput from './brailleOutput.js';
import * as brailleSpeech from './brailleSpeech.js';
import * as history from './history.js';
import * as fileOperations from './fileOperations.js';
import * as tutorial from './tutorial.js';
import * as panelMapping from './panelMapping.js';
import * as helpTooltip from './helpTooltip.js';
import * as loadMappings from './loadMappings.js';
import * as loadModule from './loadModule.js';
import * as settings from './settings.js';
import * as devPanel from './devPanel.js';
import * as audioVisualizer from './audioVisualizer.js';
import * as utilsBraille from './utils-braille.js';
import * as utilsPinyin from './utils-pinyin.js';

export const modules = {
    state,
    config,
    brailleInput,
    brailleOutput,
    brailleSpeech,
    history,
    fileOperations,
    tutorial,
    panelMapping,
    helpTooltip,
    loadMappings,
    loadModule,
    settings,
    devPanel,
    audioVisualizer,
    utilsBraille,
    utilsPinyin,
};

// 扁平化：把所有导出合并到一个顶层对象
export const api = {};
for (const [modName, mod] of Object.entries(modules)) {
    for (const [key, value] of Object.entries(mod)) {
        if (api[key] !== undefined) {
            console.warn(`[dev] 命名冲突: ${key} (${modName})，后者覆盖前者`);
        }
        api[key] = value;
    }
}

// 挂到 window 上，控制台可直接 dev.xxx
window.dev = api;

export default api;
