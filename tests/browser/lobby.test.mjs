//
// (c) 2026 Yoichi Tanibayashi
//
// lobby の一覧ページ (TODO-063)。
//
//   node --test tests/browser/lobby.test.mjs
//
// lobby を実プロセスで起動し (ボード 2 面も子として起動される)、
// 一覧ページの iframe の URL、大きく出すボードの切り替え、
// 停止・起動のボタンを見る。
//
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';

import {
    REPO_ROOT, free_port, launch_browser, wait_board, wait_for,
} from './helper.mjs';

/**
 * lobby を起動する。helper.mjs の start_server() と同じく detached で
 * 起動し、止まらなければプロセスグループごと SIGKILL する。
 * prefix を渡すと lobby 自身を --prefix で起動し、返す url にも付ける。
 */
async function start_lobby(boards, prefix = '') {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'ytbg-lobby-test-'));
    const cfg = path.join(dir, 'ytbg.toml');
    await writeFile(cfg, boards.map(b => [
        '[[board]]',
        `server_id = "${b.server_id}"`,
        `port = ${b.port}`,
        'image_dir = "images1a"',
        ...(b.prefix ? [`prefix = "${b.prefix}"`] : []),
        '',
    ].join('\n')).join('\n'));

    const port = await free_port();
    const child = spawn(
        'uv', ['run', 'ytbg', 'lobby', '-c', cfg, '-p', String(port),
               ...(prefix ? ['--prefix', prefix] : [])],
        {
            cwd: REPO_ROOT,
            env: { ...process.env, YTBG_DATA_DIR: dir },
            stdio: ['ignore', 'pipe', 'pipe'],
            detached: true,
        });
    let log = '';
    child.stdout.on('data', d => { log += d; });
    child.stderr.on('data', d => { log += d; });
    const exited = new Promise(resolve => child.on('exit', resolve));

    const url = `http://127.0.0.1:${port}${prefix}`;
    const stop = async () => {
        try {
            // uv が lobby へ渡す。ボードは lobby が止める
            process.kill(child.pid, 'SIGTERM');
        } catch {
            // すでに落ちている
        }
        // 待ちのタイマーは unref() する (残ると node が終わるまで待つ)
        const done = await Promise.race([
            exited.then(() => true),
            new Promise(resolve => setTimeout(resolve, 10000).unref())
                .then(() => false)]);
        if (!done) {
            try {
                process.kill(-child.pid, 'SIGKILL');
            } catch {
                // すでに落ちている
            }
            await exited;
        }
        await rm(dir, { recursive: true, force: true });
    };

    try {
        await wait_for(async () => {
            try {
                return (await fetch(`${url}/api/boards`)).ok;
            } catch {
                return false;
            }
        }, ok => ok, { timeout: 30000, msg: `lobby did not start:\n${log}` });
    } catch (e) {
        await stop();
        throw e;
    }
    return { url, stop };
}

describe('lobby の一覧ページ', () => {
    let lobby = undefined;
    let browser = undefined;
    let page = undefined;
    let ports = undefined;

    const card = id => `.board[data-server-id="${id}"]`;
    const status = id => page.textContent(`${card(id)} .status`);
    const frame_of = async id =>
        (await page.$(`${card(id)} iframe`)).contentFrame();
    /**
     * iframe の中にボードのページが読めているか。印 (window.ytbg_mark) の
     * 付いたページは、読み直す前のページとして数えない
     */
    const board_loaded = async id => {
        const frame = await frame_of(id);
        try {
            return await frame.evaluate(
                () => document.querySelector('#board') !== null
                    && window.ytbg_mark === undefined);
        } catch {
            return false;  // 読み込みの途中
        }
    };
    const is_main = id => page.$eval(
        card(id), el => el.classList.contains('main'));

    before(async () => {
        ports = [await free_port(), await free_port()];
        lobby = await start_lobby([
            { server_id: 'b1', port: ports[0] },
            { server_id: 'b2', port: ports[1] },
        ]);
        browser = await launch_browser();
        page = await browser.newPage();
        await page.goto(`${lobby.url}/`);
        await page.waitForSelector(card('b2'));
        await wait_for(() => status('b1'), s => s === '動作中',
                       { timeout: 15000 });
        await wait_for(() => status('b2'), s => s === '動作中',
                       { timeout: 15000 });
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (lobby !== undefined) {
            await lobby.stop();
        }
    });

    it('iframe の src は、開いたホスト名とボードのポート', async () => {
        // 音を出すのは大きいボード (最初は先頭) だけ (TODO-072)
        assert.equal(
            await page.getAttribute(`${card('b1')} iframe`, 'src'),
            `http://127.0.0.1:${ports[0]}/`);
        assert.equal(
            await page.getAttribute(`${card('b2')} iframe`, 'src'),
            `http://127.0.0.1:${ports[1]}/?sound=off`);
        // ボード名は音ありで別タブに開く
        assert.equal(
            await page.getAttribute(`${card('b1')} a`, 'href'),
            `http://127.0.0.1:${ports[0]}/`);
        assert.equal(
            await page.getAttribute(`${card('b1')} a`, 'target'), '_blank');
        // 音を出させるには autoplay の許可が要る (iframe は別のオリジン)
        assert.equal(
            await page.getAttribute(`${card('b1')} iframe`, 'allow'),
            'autoplay');
    });

    it('選んだボードが大きい枠になり、開き直しても残る', async () => {
        assert.equal(await is_main('b1'), true);
        assert.equal(await is_main('b2'), false);

        await page.click(`${card('b2')} .select`);
        assert.equal(await is_main('b1'), false);
        assert.equal(await is_main('b2'), true);
        // 切り替わった 2 面を、音の有無を入れ替えて読み込み直す (TODO-072)
        assert.equal(
            await page.getAttribute(`${card('b1')} iframe`, 'src'),
            `http://127.0.0.1:${ports[0]}/?sound=off`);
        assert.equal(
            await page.getAttribute(`${card('b2')} iframe`, 'src'),
            `http://127.0.0.1:${ports[1]}/`);
        await wait_for(async () => (await frame_of('b2')).url(),
                       u => u === `http://127.0.0.1:${ports[1]}/`,
                       { timeout: 15000 });

        await page.reload();
        await page.waitForSelector(card('b2'));
        assert.equal(await is_main('b2'), true);
        assert.equal(await is_main('b1'), false);
        // 開き直したときも、覚えていた大きいボードだけ音あり
        await wait_for(
            () => page.getAttribute(`${card('b1')} iframe`, 'src'),
            src => src === `http://127.0.0.1:${ports[0]}/?sound=off`,
            { timeout: 15000 });
        assert.equal(
            await page.getAttribute(`${card('b2')} iframe`, 'src'),
            `http://127.0.0.1:${ports[1]}/`);

        // 最初の読み込みで lobby に届かなくても、覚えていた選択は消えない
        await page.route('**/api/boards', route => route.abort());
        await page.reload();
        await page.waitForTimeout(500);
        assert.equal(await page.$(card('b1')), null);
        assert.equal(
            await page.evaluate(() => localStorage.getItem('ytbg_lobby_main')),
            'b2');
        await page.unroute('**/api/boards');
        await page.waitForSelector(card('b2'), { timeout: 15000 });
        assert.equal(await is_main('b2'), true);
        assert.equal(await is_main('b1'), false);
    });

    it('停止・起動のボタンで状態の表示が変わり、起動後に iframe を読み直す', async () => {
        await wait_for(() => status('b1'), s => s === '動作中',
                       { timeout: 15000 });
        await wait_for(() => board_loaded('b1'), ok => ok,
                       { timeout: 15000 });
        // 読み直したことが分かるように、今のページに印を付ける
        await (await frame_of('b1')).evaluate(() => { window.ytbg_mark = 1; });

        await page.click(`${card('b1')} .stop`);
        await wait_for(() => status('b1'), s => s === '停止中',
                       { timeout: 15000 });
        assert.equal(await status('b2'), '動作中');
        const boards = await (await fetch(`${lobby.url}/api/boards`)).json();
        assert.equal(boards.find(b => b.server_id === 'b1').running, false);

        await page.click(`${card('b1')} .start`);
        // プロセスはあるが、まだ listen していない
        const s = await wait_for(() => status('b1'), s => s !== '停止中',
                                 { timeout: 15000 });
        assert.equal(s, '起動中');
        await wait_for(() => status('b1'), s => s === '動作中',
                       { timeout: 15000 });
        await wait_for(() => board_loaded('b1'), ok => ok,
                       { timeout: 15000 });
        // 前のテストで b2 を大きく出したので、b1 は音なしで読み直す
        assert.equal((await frame_of('b1')).url(),
                     `http://127.0.0.1:${ports[0]}/?sound=off`);
    });

    it('大きいボードはウィンドウの幅と高さに収まる最大の大きさ (TODO-071)', async () => {
        /** 一番上までスクロールした状態の、カードと枠とウィンドウの大きさ */
        const measure = () => page.evaluate(() => {
            window.scrollTo(0, 0);
            const rect = el => el.getBoundingClientRect();
            const main = document.querySelector('.board.main');
            const small = document.querySelector('.board:not(.main) .frame');
            return {
                win_w: document.documentElement.clientWidth,
                win_h: document.documentElement.clientHeight,
                card: rect(main).toJSON(),
                frame: rect(main.querySelector('.frame')).toJSON(),
                iframe: rect(main.querySelector('iframe')).toJSON(),
                small: rect(small).toJSON(),
            };
        });

        // 高さで決まる大きさと、幅で決まる大きさ。resize で計算し直す
        for (const [width, height, tight] of [
            [1600, 700, 'h'], [700, 1000, 'w'], [1280, 720, 'h']]) {
            await page.setViewportSize({ width, height });
            // はみ出さず、決め手の側はウィンドウの端から数 px 以内 (余白を
            // 残さない)。前の大きさのままでは両方を満たさないので、計算し
            // 直すまで待つことになる
            const m = await wait_for(measure, m => {
                // カードは幅いっぱいに伸びるので、幅は枠の右端で見る
                const gap = tight === 'h'
                    ? m.win_h - m.card.bottom : m.card.right - m.frame.right;
                return m.card.right <= m.win_w && m.card.bottom <= m.win_h
                    && gap < 16;
            }, { msg: `${width}x${height}` });
            assert.ok(m.card.left >= 0 && m.card.top >= 0, JSON.stringify(m));
            // 縮小した iframe が枠と揃う (枠の外は overflow で隠れる)
            assert.ok(Math.abs(m.iframe.right - m.frame.right) <= 1
                      && Math.abs(m.iframe.bottom - m.frame.bottom) <= 1,
                      JSON.stringify(m));
        }

        // 開き直した直後 (resize は起きない) も、ウィンドウに合わせる
        await page.reload();
        await page.waitForSelector('.board.main');
        const m = await measure();
        assert.ok(m.card.bottom <= m.win_h && m.win_h - m.card.bottom < 16,
                  JSON.stringify(m));

        // 大きく出すボードを替えても、小さいボードの大きさは変わらず、
        // 大きいボードの下に並ぶ
        const before = await measure();
        const other = await page.$eval('.board:not(.main)',
                                       el => el.dataset.serverId);
        await page.click(`${card(other)} .select`);
        const after = await measure();
        assert.equal(await is_main(other), true);
        assert.deepEqual(
            [after.small.width, after.small.height],
            [before.small.width, before.small.height]);
        assert.deepEqual(
            [after.frame.width, after.frame.height],
            [before.frame.width, before.frame.height]);
        assert.ok(after.small.top >= after.card.bottom, JSON.stringify(after));
    });
});

describe('URL のプレフィクス付きの lobby とボード (TODO-064)', () => {
    let lobby = undefined;
    let browser = undefined;
    let page = undefined;
    let port = undefined;
    let p2_port = undefined;

    const card = id => `.board[data-server-id="${id}"]`;

    before(async () => {
        port = await free_port();
        p2_port = await free_port();
        lobby = await start_lobby([
            { server_id: 'p1', port, prefix: 'board1/' },
            { server_id: 'p2', port: p2_port },
        ], '/lobby');
        browser = await launch_browser();
        page = await browser.newPage();
        await page.goto(`${lobby.url}/`);
        await wait_for(() => page.textContent(`${card('p1')} .status`),
                       s => s === '動作中', { timeout: 15000 });
    });

    after(async () => {
        if (browser !== undefined) {
            await browser.close();
        }
        if (lobby !== undefined) {
            await lobby.stop();
        }
    });

    it('一覧が出て、iframe の URL にボードのプレフィクスが付き、ボードが開く', async () => {
        // iframe の src は、リダイレクト前の一覧ページと同じオリジンのパス。
        // p1 は大きいボードなので ?sound=off は付かない (TODO-072)
        assert.equal(
            await page.getAttribute(`${card('p1')} iframe`, 'src'),
            `${new URL(lobby.url).origin}/board1/`);
        // ボード名は音ありで別タブに開く。prefix のあるボードも
        // 一覧ページと同じオリジンのパス (iframe の src と同じ組み立て)
        assert.equal(
            await page.getAttribute(`${card('p1')} a`, 'href'),
            `${new URL(lobby.url).origin}/board1/`);
        // prefix の無いボードは、今までどおり開いたホスト名とポート
        assert.equal(
            await page.getAttribute(`${card('p2')} a`, 'href'),
            `http://127.0.0.1:${p2_port}/`);

        const frame = await (await page.$(`${card('p1')} iframe`)).contentFrame();
        // gameinfo が届くまで待つ (WebSocket が /board1/ws につながる)
        await wait_board(frame);
        // lobby がリダイレクトを返し、最終的にはボード自身のポートへ届く
        assert.equal(frame.url(),
                     `http://127.0.0.1:${port}/board1/`);
    });
});
