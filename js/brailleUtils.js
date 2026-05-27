// brailleUtils.js - 盲文编码纯工具函数

// dotState / oneHot 编码顺序：按列从上到下（国标）→ dot1 dot2 dot3 dot4 dot5 dot6
// 盲文点位布局:  
//                  1 4
//                  2 5
//                  3 6
//
// dotState数组（内部0-based）:  [0]=dot1, [1]=dot2, [2]=dot3, [3]=dot4, [4]=dot5, [5]=dot6


/**
 * @description: 将6位点阵数组转换为Unicode盲文字符 (U+2800~U+283F)
 * @param {number[]} dots 6位数字数组，按国标列序 [dot1,dot2,dot3,dot4,dot5,dot6]
 * @return {string} Unicode盲文字符
 */
function dotsToBrailleChar(dots) {
    let code = 0;
    if (dots[0]) code |= 1;    // dot1 → Unicode bit0
    if (dots[1]) code |= 2;    // dot2 → Unicode bit1
    if (dots[2]) code |= 4;    // dot3 → Unicode bit2
    if (dots[3]) code |= 8;    // dot4 → Unicode bit3
    if (dots[4]) code |= 16;   // dot5 → Unicode bit4
    if (dots[5]) code |= 32;   // dot6 → Unicode bit5
    return String.fromCodePoint(0x2800 + code);
}

/**
 * @description: 将oneHot编码转为盲文字符串，支持组合编码（用+连接两个6位码）
 * @param {string} oneHot 6位二进制字符串，或 "000010+011000" 形式的组合编码
 * @return {string} Unicode盲文字符（组合编码返回两个盲文字符）
 */
function oneHotToBrailleChar(oneHot) {
    if (!oneHot || !oneHot.includes('+')) {
        const dots = oneHot.split('').map(Number);
        return dotsToBrailleChar(dots);
    }
    return oneHot.split('+').map(part => {
        const dots = part.split('').map(Number);
        return dotsToBrailleChar(dots);
    }).join('');
}

/**
 * @description: 将位置编码转为oneHot格式（6位二进制字符串如"110000"）
 *   支持两种输入：已为oneHot则直接返回；位置编码如"12"表示dot1+dot2激活
 * @param {string|*} input oneHot编码或位置编码
 * @return {string} oneHot编码
 */
function indexToOnehot(input) {
    if (typeof input !== 'string') return input;
    if (input.length === 6 && /^[01]{6}$/.test(input)) return input;
    const bits = ['0', '0', '0', '0', '0', '0'];
    for (const ch of input) {
        const idx = parseInt(ch, 10);
        if (idx >= 1 && idx <= 6) bits[idx - 1] = '1';
    }
    return bits.join('');
}


function onehotToIndex(oneHot) {
    let index = '';
    for (let i = 0; i < 6; i++) {
        if (oneHot[i] === '1') {
            index += (i + 1).toString();
            index += ' ';
        }
    }
    return index;
}