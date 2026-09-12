//
// (c) Yoichi Tanibayashi
//
// ?sound のクエリで音が止まることの確認 (TODO-039)。
//
//   node --test tests/browser/
//
// settings.js の get_sound_query() を手書きのパーサから
// URLSearchParams に置き換えたので、クエリの読み取りを押さえる。
// 判定そのものは sound.js の GlobalSoundSwitch === undefined で、
// undefined のときだけ鳴る。
//
// ytbg.html が組み立てるのは ?sound=off と ?board=N&sound=off の
// 2 つなので、その 2 つと、値の無い ?sound を見る。
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import { launch_browser, open_board, start_server } from './helper.mjs';

/** ページを開いて GlobalSoundSwitch を読む */
async function sound_switch(browser, url) {
    const page = await open_board(browser, url);
    const v = await page.evaluate(
        async () => (await import('/static/js/sound.js')).GlobalSoundSwitch);
    await page.close();
    return v;
}

describe('?sound のクエリ', () => {
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

    it('クエリが無ければ undefined (鳴る)', async () => {
        assert.equal(await sound_switch(browser, server.url), undefined);
    });

    it('?sound=off なら "off" (鳴らない)', async () => {
        assert.equal(
            await sound_switch(browser, `${server.url}/?sound=off`), 'off');
    });

    it('他のクエリと並んでいても読める', async () => {
        assert.equal(
            await sound_switch(browser, `${server.url}/?board=2&sound=off`),
            'off');
    });

    it('値の無い ?sound は無視する (鳴る)', async () => {
        assert.equal(
            await sound_switch(browser, `${server.url}/?sound`), undefined);
    });
});
