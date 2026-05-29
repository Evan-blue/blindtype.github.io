// tutorial.js - 新手教程文案（面向视障用户，用于语音播报）

const TUTORIAL_SECTIONS = [
    {
        title: '欢迎',
        text: '欢迎使用盲文输入工具。接下来，我将用约两分钟带你熟悉核心操作。教程播放期间，你可以按 G 键回到上一节，按 H 键跳到下一节。随时按 右上角Escape 键退出。按 Control+Shift+H 可以随时虫听本教程。',
    },
    {
        title: '1、手的位置',
        text: '把双手放在键盘上，像打字一样，两手食指找放在键盘上有突出点位的按键上。如果有小键盘，也可以右手放在小键盘，把食指指放在小键盘上有突出点位的按键（数字5）上。',
    },
    {
        title: '2、盲文点位',
        text: '盲文由六个点位组成，分左右两列，每列三个点。左列从上到下是1、2、3号点，右列从上到下是4、5、6号点。在键盘上，你可以用六个键分别控制这六个点位的亮灭。',
    },
    {
        title: '3、输入流程',
        text: '你的右手是输入的主力，食指从上到下是1、2、3号点位，中指从上到下是4、5、6号点位。不论右手是摆在主键盘还是小键盘，输入操作是一样的。输入一个盲文字符分两步。第一步，按下对应点位的键，点亮需要的点。每按一次，对应点位在亮和灭之间切换，你会听到高音表示点亮、低音表示关闭。第二步，按空格键确认，小键盘的数字0也可以确认，当前盲文就会输入到界面上。系统会自动识别你输入的声母或韵母，并通过语音播报出来。如果想在确认前放弃当前的点位输入，按 左手食指的F 键清除所有激活点位，重新开始输入。例如，"你"由"呢"、"一"、和"第三声"三个盲文组合而成，所以输入流程是 1 3 4 5、空格、2 4、空格、2 3、空格，另外当输入区没有内容的时候，按空格键或小键盘数字0会输入一个空格（也叫空方）用于盲文的分割。',
    },
    {
        title: '4、键位设置',
        text: '除了当前默认的键位之外，你还可以设置自己喜欢的键位，通过按 control+shift+K 激活键位设置面板，依次按下六个键盘的键，即可设置新的键位。例如，我们可以把六个键位设置成横向的: control键在键盘左下角，shift键在control键上面，按键K在右手中指，通过快捷键 control+shift+K 激活键位设置面板后，依次按下右手无名指上方的O键、中指上方的I键，食指上方的U键、无名指所在的L键、中指所在的K键和食指所在的突起的J键。设置完毕后，这六个按键就是新的盲文点位一到六的键位了。本应用一共有两套键位，分别是主键盘和小键盘的盲文键位，两套同时生效、可以分别设置。注意设置的时候不必等待语音播报完整，熟练后可以迅速依次按下六个按键。',
    },
    {
        title: '5、光标与编辑',
        text: '输出区显示你已确认的盲文字符。用左右方向键移动光标，语音会播报光标前的内容。用上下方向键在句子之间快速跳转。按 D 键，或者小键盘的乘号键（星键），可以删除光标前一个字符，按退格键效果相同。按 Control+Z 撤销，按 Control+shift+Z 或Control+Y重做。另外，键盘上的退格键和DEL键也可以删除光标前后的字符。如果你想清空整个输出区，则可以按食指下方的 C 键。',
    },
    {
        title: '6、数字与英文',
        text: '输入数字前，先输入数号，然后依次输入数字点位，系统会自动将它们组合。输入英文字母前，先输入大写符号或小写符号，然后输入字母点位。退出数字或英文模式时，输入空方即可回到拼音模式。',
    },
    {
        title: '7、朗读内容',
        text: '按 R 键，可以朗读输出区全部内容。朗读过程中再按一次可随时停止。',
    },
    {
        title: '8、保存与打开',
        text: '按 Control+S 保存输出内容为文本文件。按 Control+O 打开中文文本文件并渲染到输出区。',
    },
    {
        title: '设置面板',
        text: '按 E 打开或关闭设置面板，在这里可以自定义键位、调节语速和字体大小。键位自定义可以用 Control+Shift+K 快捷键直接激活。',
    },
    {
        title: '键位帮助面板',
        text: '按 W 打开或关闭键位帮助面板。在这里可以查看当前设置的键位对应关系。',
    },
    {
        title: '对照表面板',
        text: ' Q 可以打开或关闭盲文对照表按钮，可以查看所有声母、韵母、标点、数字和英文字母的盲文编码。点击任意条目，系统会播报该字符的读音和对应键位。',
    },
    {
        title: '结束语',
        text: '教程到此结束。日常使用中，记住三个最关键的操作：用点位键输入，用空格确认，用方向键移动光标。遇到问题时，按 W 查看键位帮助，或按 Control+Shift+H 虫听本教程。祝你使用愉快，欢迎issue提建议！',
    },
];

let _tutorialActive = false;
let _tutorialPaused = false;
let _tutorialIdx = 0;

/**
 * @description: 播报教程（可暂停/恢复/停止）
 * @return {void}
 */
function playTutorial() {
    if (_tutorialActive && !_tutorialPaused) {
        _tutorialPaused = true;
        stopTutorialSpeech();
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

/**
 * @description: 停止教程播报
 * @return {void}
 */
function stopTutorial() {
    _tutorialActive = false;
    _tutorialPaused = false;
    _tutorialIdx = 0;
    stopTutorialSpeech();
}

/**
 * @description: 播报当前小节，播完后自动进入下一节
 * @return {void}
 */
function _speakTutorialSection() {
    if (!_tutorialActive || _tutorialPaused) return;
    if (_tutorialIdx >= TUTORIAL_SECTIONS.length) {
        _tutorialActive = false;
        _tutorialIdx = 0;
        return;
    }
    const sec = TUTORIAL_SECTIONS[_tutorialIdx];
    const text = sec.title + '。' + sec.text;
    const rate = SETTINGS.speechRate || 0.9;

    speakTutorialText(text, rate, () => {
        if (!_tutorialActive || _tutorialPaused) return;
        _tutorialIdx++;
        _speakTutorialSection();
    });
}

/**
 * @description: 教程播放期间按 G/H 切换章节
 * @param {string} keyId 按键标识 (e.code)
 * @return {boolean} 是否已消费该按键
 */
function handleTutorialNavigation(keyId) {
    if (!_tutorialActive) return false;
    if (keyId === 'KeyH') {
        if (_tutorialIdx < TUTORIAL_SECTIONS.length - 1) {
            _tutorialIdx++;
            stopTutorialSpeech();
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
            stopTutorialSpeech();
            if (_tutorialPaused) _tutorialPaused = false;
            _speakTutorialSection();
            return true;
        }
        speakText('已是第一节');
        return true;
    }
    return false;
}

/**
 * @description: 处理教程播放期间的 Escape 键
 * @return {boolean} 是否已消费该按键
 */
function handleTutorialEscape() {
    if (!_tutorialActive) return false;
    if (_tutorialPaused) {
        _tutorialPaused = false;
        _speakTutorialSection();
    } else {
        _tutorialPaused = true;
        stopTutorialSpeech();
    }
    return true;
}
