// welcome.js - 首次访问欢迎遮罩

const WELCOME_KEY = 'braille-welcome-shown';
const FORCE_WELCOME_KEY = 'braille-force-welcome';
const COOLDOWN_DAYS = 7;
const COOLDOWN_MS = COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
const welcomeMask = document.getElementById('welcomeMask');
const welcomeBtnYes = document.getElementById('welcomeBtnYes');
const welcomeBtnNo = document.getElementById('welcomeBtnNo');

let _welcomeInterval = null;
let _welcomeActive = false;

function _isForceWelcomeActive() {
    return localStorage.getItem(FORCE_WELCOME_KEY) === '1';
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
    // 强制模式下每次都显示
    if (_isForceWelcomeActive()) return true;
    const raw = localStorage.getItem(WELCOME_KEY);
    // 从未访问过
    if (!raw) return true;
    const ts = parseInt(raw, 10);
    if (isNaN(ts)) return true;
    // 超过冷却期，重新询问
    if (Date.now() - ts > COOLDOWN_MS) return true;
    // 冷却期内：刷新时间戳，不显示
    _markWelcomed();
    return false;
}

function welcomeConfirm() {
    _welcomeActive = false;
    welcomeMask.classList.remove('active');
    _markWelcomed();
    _stopWelcomeLoop();
    stopSpeech();
    playTutorial();
}

function welcomeSkip() {
    _welcomeActive = false;
    welcomeMask.classList.remove('active');
    _markWelcomed();
    _stopWelcomeLoop();
    stopSpeech();
    speakText('祝你使用愉快！快捷键 ctrl + shift + H 随时打开新手教程。');
}

function initWelcome() {
    if (!_shouldShowWelcome()) return;
    if (!welcomeMask) return;

    _welcomeActive = true;
    welcomeMask.classList.add('active');
    welcomeBtnYes.focus();

    const welcomeText = '欢迎使用盲文输入工具。这是一个面向视障人士的盲文输入工具，支持拼音、数字、英文盲文输入，并提供语音播报反馈。是否需要开始新手教程？';
    speakText(welcomeText);
    _welcomeInterval = setInterval(() => {
        speakText(welcomeText);
    }, 3000);

    welcomeBtnYes.addEventListener('click', welcomeConfirm);
    welcomeBtnNo.addEventListener('click', welcomeSkip);
}

// 强制欢迎询问复选框（dev panel，永久有效）
function initForceWelcomeToggle() {
    const checkbox = document.getElementById('forceWelcome');
    if (!checkbox) return;
    checkbox.checked = _isForceWelcomeActive();
    checkbox.addEventListener('change', () => {
        localStorage.setItem(FORCE_WELCOME_KEY, checkbox.checked ? '1' : '0');
    });
}
