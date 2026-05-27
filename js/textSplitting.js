
/**
 * @description: 使用 Intl.Segmenter 对文本进行分割，支持多语言分割
 * @param {string} text
 * @param {string} locales
 * @return {Array} 分割后的文本数组
 */
function splitText(text, locales='zh-CN', granularity='word') {
    const segObj = new Intl.Segmenter(locales, { granularity });
    const segOutput = segObj.segment(text);
    return Array.from(segOutput).map(seg => seg.segment);
}


// var text = "这是一个测试文本，用于验证文本分割功能。";
// var segments = splitText(text);
// console.log(segments); // 输出分割后的文本数组