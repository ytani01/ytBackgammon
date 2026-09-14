//
// (c) Yoichi Tanibayashi
//
// 画面ごとの設定 (settings.js の Settings) の動作確認 (TODO-053)。
//
//   node --test tests/browser/settings.test.mjs
//
// - Sound の ON/OFF を cookie に保存し、開き直しても残ること
// - PIP の最初の表示が、Pip のチェックボックスに合っていること
//
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';

import {
    launch_browser, open_board, settings, shown_parts, start_server,
    wait_board,
} from './helper.mjs';

/** PIP の表示 (opacity) を 2 人ぶん読む */
const pip_opacity = async page => (await shown_parts(page)).pip.map(
    p => p.opacity);

describe('Settings', () => {
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

    it('Sound を外すと cookie に保存し、開き直しても外れたまま', async () => {
        const page = await open_board(browser, server.url);
        assert.equal((await settings(page)).sound, true);

        await page.locator('#sound-switch').uncheck();
        assert.equal((await settings(page)).sound, false);

        // 同じコンテキストで開き直す (cookie は残る)
        await page.reload();
        await wait_board(page);
        assert.equal((await settings(page)).sound, false,
                     'cookie から読んだ音の設定が戻っていない');
        assert.equal(await page.locator('#sound-switch').isChecked(), false);
        await page.close();
    });

    it('Pip のチェックが外れていれば、PIP は最初は出ない', async () => {
        const page = await open_board(browser, server.url);
        assert.deepEqual(await pip_opacity(page), ['0', '0']);
        await page.close();
    });

    it('Pip にチェックが入っていれば、PIP は最初から出る', async () => {
        // ブラウザがチェックを復元した場面を作る。BoardView は window.onload で
        // 作るので、その前の DOMContentLoaded でチェックを入れる。
        // (page.route() で index.html を書き換えると、ページが local network
        // の外の扱いになり、/ws への接続が弾かれる)
        const page = await browser.newPage();
        await page.addInitScript(() => {
            document.addEventListener('DOMContentLoaded', () => {
                document.getElementById('disp-pip').checked = true;
            });
        });
        await page.goto(`${server.url}/`);
        await wait_board(page);

        assert.equal(await page.locator('#disp-pip').isChecked(), true,
                     'チェックを入れられていない');
        assert.deepEqual(await pip_opacity(page), ['1', '1']);
        await page.close();
    });
});
