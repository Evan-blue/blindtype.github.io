// tutorial.js - 新手教程文案（面向视障用户，用于语音播报）

import {
    speakText,
    speakTutorialText,
    stopTutorialSpeech,
    stopSpeech,
    isMainSpeechActive,
} from './brailleSpeech.js';
import { SETTINGS, saveSettings } from './config.js';

// ── 按键标识 → 中文名称 ──
export function _keyLabel(code) {
    if (!code) return '未设置';
    const MAP = {
        'Comma': '逗号', 'Period': '句号', 'Semicolon': '分号', 'Quote': '引号',
        'Backspace': '退格键', 'Space': '空格键', 'Delete': 'Delete键',
        'ArrowLeft': '左方向键', 'ArrowRight': '右方向键',
        'ArrowUp': '上方向键', 'ArrowDown': '下方向键',
        'NumpadDivide': '小键盘除号', 'NumpadMultiply': '小键盘乘号',
        'NumpadAdd': '小键盘加号', 'NumpadSubtract': '小键盘减号',
        'NumpadDecimal': '小键盘点号', 'NumpadEnter': '小键盘回车',
    };
    if (MAP[code]) return MAP[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Numpad')) return '小键盘' + code.slice(6);
    if (code.startsWith('Digit')) return code.slice(5);
    return code;
}

// ── 生成动态文案（每次播报时调用，确保键位与当前设置一致）──
function _buildSections() {
    const kb = SETTINGS.keyBindings.keyboard || {};
    const nkb = SETTINGS.keyBindings.numpad || {};
    const clearInput = _keyLabel(SETTINGS.actionKeyBindings.clearInput);
    const clearOutput = _keyLabel(SETTINGS.actionKeyBindings.clearOutput);

    return [
        {
            title: '欢迎',
            text: '欢迎使用盲文输入工具。接下来，我将用约两分钟带你熟悉核心操作。教程播放期间，你可以按 G 键回到上一节，按 H 键跳到下一节。随时按 Escape 键暂停或继续，Shift+Escape 退出教程。按 Control+Shift+H 可以随时虫听本教程。',
        },
        {
            title: '1、手在键盘上的位置',
            text: '把双手放在键盘上，像打字一样，两手食指找放在键盘上有突出点位的按键上，'
                + '此时左手食指、中指、无名指分别在F,D,S键，右手食指、中指、无名指分别在在J、K、L键。'
                + '左手食指和右手食指内侧的两个键就是G和H，可以随时切换本教程的章节。'
                + '如果有小键盘，也可以选择把右手放在小键盘，中指放在小键盘上有突出点位的按键（数字5）上。',
        },
        {
            title: '2、盲文点位简介',
            text: '盲文由六个点位组成，分左右两列，每列三个点。左列从上到下是1、2、3号点，右列从上到下是4、5、6号点。在键盘上，你可以用六个键分别控制这六个点位的亮灭。',
        },
        {
            title: '3、盲文点位的按键',
            text: '本工具在主键盘和小键盘各有一套与盲文6个点对应的6个键位。'
                + `当前你的主键盘点位键1到6分别为：`
                + [1, 2, 3, 4, 5, 6].map(d => _keyLabel(kb[d])).join('、')
                + `。小键盘点位键1到6分别对应数字键：`
                + [1, 2, 3, 4, 5, 6].map(d => _keyLabel(nkb[d]).replace('小键盘', '')).join('、')
                + '两套键位同时生效，你可以任选其一使用。每个按键控制一个点位的亮灭，按下时该点位在亮和灭之间切换。如果想更换键位，可以按 Control+Shift+K 自定义一套自己的键位，后面会详细介绍。',
        },
        {
            title: '4、输入流程',
            text: '不论右手是摆在主键盘还是小键盘，输入操作是一样的。'
                + '输入一个盲文字符分两步。'
                + '第一步，按下对应点位的键，点亮需要的点。每按一次，对应点位在亮和灭之间切换，你会听到高音表示点亮、低音表示关闭。'
                + '第二步，按空格键确认，小键盘的数字0也可以确认，当前盲文就会输入到界面上。系统会自动识别你输入的内容，并通过语音播报出来。'
                + `如果想在确认前放弃当前的点位输入，按 ${clearInput} 键清除所有激活点位，重新开始输入。`
                + '例如，"你"由"呢"、"一"、和"第三声"三个盲文组合而成。所以输入流程是 1 3 4 5、空格、2 4、空格、3、空格。'
                + '另外当输入区没有内容的时候，按空格键或小键盘数字0会输入一个空格（也叫空方），用于盲文的分割。'
        },
        {
            title: '5、键位设置',
            text: '除了当前默认的键位之外，你还可以设置自己喜欢的键位，通过按 Control+Shift+K 激活键位设置面板，依次按下六个键盘的键，即可设置新的键位。例如，我们可以把六个键位设置成横向的：Control键在键盘左下角，Shift键在Control键上面，按键K在右手中指，通过快捷键 Control+Shift+K 激活键位设置面板后，依次按下右手无名指上方的O键、中指上方的I键，食指上方的U键、无名指所在的L键、中指所在的K键和食指所在的突起的J键。设置完毕后，这六个按键就是新的盲文点位一到六的键位了。主键盘和小键盘的键位可以分别设置。注意设置的时候不必等待语音播报完整，熟练后可以迅速依次按下六个按键。',
        },
        {
            title: '6、光标与编辑',
            text: '输出区显示你已确认的盲文字符。用左右方向键移动光标，语音会播报光标前的内容。用上下方向键在句子之间快速跳转。按退格键或小键盘的乘号键（星键）可以删除光标前一个字符。Delete键删除光标后一个字符。按 Control+Z 撤销，Control+Shift+Z 或 Control+Y 重做。按 ' + clearOutput + ' 键清空整个输出区。按 G 键和 H 键可以上下翻页。',
        },
        {
            title: '7、数字与英文',
            text: '输入数字前，先输入数号，然后依次输入数字点位，系统会自动将它们组合。输入英文字母前，先输入大写符号或小写符号，然后输入字母。输入空方即可退出数字或英文模式回到拼音模式。',
        },
        {
            title: '8、朗读内容',
            text: '按 R 键，可以朗读输出区全部内容。朗读过程中再按一次可随时停止。按 Ctrl+上方向键或下方向键可以随时调整语音播报速度。',
        },
        {
            title: '9、保存与打开',
            text: '按 Control+S 保存输出内容为文本文件。按 Control+O 打开中文文本文件并渲染到输出区。',
        },
        {
            title: '10、设置面板',
            text: '按 左手中指上方的 E 打开或关闭设置面板，在这里可以自定义键位、调节语速和字体大小。键位自定义也可以用 Control+Shift+K 快捷键直接激活。',
        },
        {
            title: '11、键盘和设置',
            text: '按 左手无名指上方的 W 打开或关闭键盘和设置面板。在这里可以查看当前键位、调整语速和字体大小。',
        },
        {
            title: '12、对照表面板',
            text: '按 左手小拇指上方的 Q 打开或关闭盲文对照表面板，可以查看所有声母、韵母、标点、数字和英文字母的盲文编码。点击任意条目，系统会播报该字符的读音和对应键位。',
        },
        {
            title: '结束语',
            text: '教程到此结束。日常使用中，记住三个最关键的操作：用点位键输入，用空格确认，用方向键移动光标。遇到问题时，按 W 查看键盘和设置，或按 Control+Shift+H 虫听本教程。祝你使用愉快，欢迎在GitHub提issue反馈建议！',
        },
    ];
}

const welcomeText = '欢迎使用盲文输入工具。这是一个面向视障人士的盲文输入工具，支持拼音、数字、英文的盲文输入，并提供语音播报反馈。是否需要开始新手教程？';
const welcomeSkipText = '祝你使用愉快！快捷键 Control+Shift+H 随时打开新手教程。';
const tutorialEndText = '教程已结束，快捷键 Control+Shift+H 随时虫听本教程。';

let _tutorialActive = false;
let _tutorialPaused = false;
let _tutorialIdx = 0;

export function playTutorial() {
    if (_tutorialActive && !_tutorialPaused) {
        _tutorialPaused = true;
        stopTutorialSpeech(true);
        return;
    }
    if (_tutorialPaused) {
        _tutorialPaused = false;
        _speakTutorialSection();
        return;
    }
    _tutorialActive = true;
    _tutorialPaused = false;
    _tutorialIdx = 0;
    _speakTutorialSection();
}

function _speakTutorialSection() {
    if (!_tutorialActive || _tutorialPaused) return;
    const sections = _buildSections();
    if (_tutorialIdx >= sections.length) {
        _tutorialActive = false;
        _tutorialIdx = 0;
        return;
    }
    const sec = sections[_tutorialIdx];
    const text = sec.title + '。' + sec.text;
    const rate = SETTINGS.speechRate || 0.9;

    speakTutorialText(text, rate, () => {
        if (!_tutorialActive || _tutorialPaused) return;
        _tutorialIdx++;
        _speakTutorialSection();
    });
}

export function handleTutorialNavigation(keyId) {
    if (!_tutorialActive) return false;
    const sections = _buildSections();
    if (keyId === 'KeyH') {
        if (_tutorialIdx < sections.length - 1) {
            _tutorialIdx++;
            stopTutorialSpeech(true);
            if (_tutorialPaused) _tutorialPaused = false;
            _speakTutorialSection();
            return true;
        }
        speakText('已是最后一节');
        return true;
    }
    if (keyId === 'KeyG') {
        if (_tutorialIdx > 0) {
            _tutorialIdx--;
            stopTutorialSpeech(true);
            if (_tutorialPaused) _tutorialPaused = false;
            _speakTutorialSection();
            return true;
        }
        speakText('已是第一节');
        return true;
    }
    return false;
}

export function handleTutorialEscape() {
    if (!_tutorialActive) return false;
    if (_tutorialPaused) {
        _tutorialPaused = false;
        _speakTutorialSection();
    } else {
        _tutorialPaused = true;
        stopTutorialSpeech(true);
    }
    return true;
}

export function stopTutorial() {
    if (!_tutorialActive) return false;
    _tutorialActive = false;
    _tutorialPaused = false;
    _tutorialIdx = 0;
    stopTutorialSpeech(true);
    speakText(tutorialEndText);
    return true;
}

// ── 首次访问欢迎遮罩 ──

const WELCOME_KEY = 'braille-welcome-shown';
const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const welcomeMask = document.getElementById('welcomeMask');
const welcomeBtnYes = document.getElementById('welcomeBtnYes');
const welcomeBtnNo = document.getElementById('welcomeBtnNo');

let _welcomeInterval = null;
export let _welcomeActive = false;

function _isForceWelcomeActive() {
    return SETTINGS.forceWelcome === true;
}

function _markWelcomed() {
    localStorage.setItem(WELCOME_KEY, String(Date.now()));
}

function _stopWelcomeLoop() {
    if (_welcomeInterval) {
        clearInterval(_welcomeInterval);
        _welcomeInterval = null;
    }
}

function _shouldShowWelcome() {
    if (_isForceWelcomeActive()) return true;
    const raw = localStorage.getItem(WELCOME_KEY);
    if (!raw) return true;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return true;
    if (Date.now() - ts > COOLDOWN_MS) return true;
    _markWelcomed();
    return false;
}

export function welcomeConfirm() {
    _welcomeActive = false;
    welcomeMask.classList.remove('active');
    _markWelcomed();
    _stopWelcomeLoop();
    stopSpeech();
    playTutorial();
}

export function welcomeSkip() {
    _welcomeActive = false;
    welcomeMask.classList.remove('active');
    _markWelcomed();
    _stopWelcomeLoop();
    stopSpeech();
    speakText(welcomeSkipText);
}

export function initWelcome() {
    if (!_shouldShowWelcome()) return;
    if (!welcomeMask) return;

    _welcomeActive = true;
    welcomeMask.classList.add('active');
    welcomeBtnYes.focus();

    speakText(welcomeText);
    _welcomeInterval = setInterval(() => {
        if (isMainSpeechActive()) return;
        speakText(welcomeText);
    }, 3000);

    welcomeBtnYes.addEventListener('click', welcomeConfirm);
    welcomeBtnNo.addEventListener('click', welcomeSkip);
}

export function initForceWelcomeToggle() {
    const checkbox = document.getElementById('forceWelcome');
    if (!checkbox) return;
    checkbox.checked = SETTINGS.forceWelcome;
    checkbox.addEventListener('change', () => {
        SETTINGS.forceWelcome = checkbox.checked;
        saveSettings();
    });
}
