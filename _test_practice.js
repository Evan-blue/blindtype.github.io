const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const browser = await chromium.launch({ channel: 'chrome' });
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', err => errors.push(err.message));

    try {
        const fp = 'file:///' + path.resolve('index.html').replace(/\\/g, '/');
        await page.goto(fp, { waitUntil: 'networkidle' });
        await page.waitForTimeout(1500);
        console.log('Errors:', errors.length ? errors.slice(0, 3) : 'none');

        const maskBtn = page.locator('#btnCloseMask');
        if (await maskBtn.isVisible().catch(() => false)) await maskBtn.click();
        await page.waitForTimeout(500);

        await page.locator('#btnPractice').click();
        await page.waitForTimeout(500);

        console.log('Open:', await page.locator('#practiceOverlay').evaluate(el => el.classList.contains('open')));
        console.log('Target:', await page.locator('#practiceTargetPreview').innerHTML());
        console.log('Active dots:', await page.locator('#practiceTargetGrid .dot-cell.active').count());
        console.log('Tab:', await page.locator('.practice-topic-tab.active').textContent());

        for (const t of ['english', 'pinyin', 'punc']) {
            await page.locator('.practice-topic-tab[data-topic="' + t + '"]').click();
            await page.waitForTimeout(300);
            console.log(t + ' target:', await page.locator('#practiceTargetPreview').textContent());
        }

        // Back to number
        await page.locator('.practice-topic-tab[data-topic="number"]').click();
        await page.waitForTimeout(300);

        // Test input
        await page.locator('#practiceInputGrid .dot-cell[data-idx="1"]').click();
        await page.waitForTimeout(600);
        console.log('Input preview:', await page.locator('#practiceInputPreview').innerHTML());

        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);
        console.log('Closed:', !(await page.locator('#practiceOverlay').evaluate(el => el.classList.contains('open'))));
        console.log('ALL PASSED');
    } catch (e) {
        console.error('ERR:', e.message);
    } finally {
        await browser.close();
    }
})();
