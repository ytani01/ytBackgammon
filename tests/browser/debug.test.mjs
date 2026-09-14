//
// (c) Yoichi Tanibayashi
//
// ?debug のクエリで log() の出力が切り替わることの確認 (TODO-048)。
//
//   node --test tests/browser/
//
// log.js の log() は、?debug を付けて開いたときだけ console.log へ出す。
// BoardView のコンストラクタは起動時に必ず log() を呼ぶので、ページを
// 開いて盤面ができるまでに console.log が 1 件でも出たかを見る。
//
// helper.mjs の open_board() も goto() の前に console をつなぐが、
// 貯めるのは error だけなので、ここでは log を数える形で開き直す。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { launch_browser, start_server, wait_board } from './helper.mjs';

/**
 * ページを開いて、盤面ができるまでに出た console.log の件数を返す
 *
 * @param {import('playwright').Browser} browser
 * @param {string} url
 * @return {Promise<number>}
 */
async function count_logs(browser, url) {
    const page = await browser.newPage();
    let n = 0;
    page.on('console', msg => {
        if (msg.type() === 'log') {
            n += 1;
        }
    });
    await page.goto(url);
    await wait_board(page);
    await page.close();
    return n;
}

describe('?debug のクエリ', () => {
    let server = undefined;
    let browser = undefined;

    before(async () => {
        server = await start_server();
        browser = await launch_browser();
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (server !== undefined) {
            await server.stop();
        }
    });

    it('クエリが無ければ log() は何も出さない', async () => {
        assert.equal(await count_logs(browser, server.url), 0);
    });

    it('?debug を付けると log() が出る', async () => {
        const n = await count_logs(browser, `${server.url}/?debug`);
        assert.ok(n > 0, `console.log が出ていない: ${n}`);
    });

    it('他のクエリと並んでいても読める', async () => {
        const n = await count_logs(browser,
                                   `${server.url}/?board=2&debug=1`);
        assert.ok(n > 0, `console.log が出ていない: ${n}`);
    });
});
