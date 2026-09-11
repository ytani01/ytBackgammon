//
// (c) Yoichi Tanibayashi
//
// docs/Player.md 用のスクリーンショットを撮る。
//
//   node tools/make-shots.mjs
//
// サーバを実プロセスとして起動し、chromium でページを開いて撮る。
// 番号バッジと矢印は、撮る直前にページへ DOM で重ねる。画像編集ツールは
// 使わないので、盤面を変えたらこれを走らせ直せば作り直せる。
//
// 保存先は docs/images/。サーバの保存先は一時ディレクトリへ逃がすので、
// 自分のボードのファイル (~/ytbg-*) は読み書きしない。
//
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

import {
    REPO_ROOT, launch_browser, open_board, sleep, start_server,
} from '../tests/browser/helper.mjs';

const OUT_DIR = path.join(REPO_ROOT, 'docs', 'images');

/** 盤面が画面に収まる大きさ */
const VIEWPORT = { width: 1500, height: 1000 };

/**
 * 重ねたバッジと矢印を全部消す。
 *
 * @param {import('playwright').Page} page
 */
function clear_marks(page) {
    return page.evaluate(() => {
        document.getElementById('ytbg-marks')?.remove();
    });
}

/**
 * 番号バッジと矢印を重ねる。
 *
 * @param {import('playwright').Page} page
 * @param {{badges?: {sel: string, n: number, dx?: number, dy?: number}[],
 *          arrows?: {from: string, to: string}[]}} marks
 */
function add_marks(page, marks) {
    return page.evaluate(({ badges = [], arrows = [] }) => {
        document.getElementById('ytbg-marks')?.remove();

        const layer = document.createElement('div');
        layer.id = 'ytbg-marks';
        Object.assign(layer.style, {
            position: 'absolute', left: '0', top: '0',
            width: '100%', height: '100%',
            pointerEvents: 'none', zIndex: '10000',
        });
        document.body.appendChild(layer);

        const center = sel => {
            const el = document.querySelector(sel);
            if (el === null) {
                throw new Error(`no such element: ${sel}`);
            }
            const r = el.getBoundingClientRect();
            return {
                x: r.x + r.width / 2 + window.scrollX,
                y: r.y + r.height / 2 + window.scrollY,
            };
        };

        // 矢印はバッジの下になるように先に描く
        if (arrows.length > 0) {
            const svg = document.createElementNS(
                'http://www.w3.org/2000/svg', 'svg');
            Object.assign(svg.style, {
                position: 'absolute', left: '0', top: '0',
                width: '100%', height: '100%', overflow: 'visible',
            });
            svg.innerHTML = `
              <defs>
                <marker id="ytbg-arrowhead" markerWidth="6" markerHeight="6"
                        refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 z" fill="#e5322d"/>
                </marker>
              </defs>`;
            for (const a of arrows) {
                const p0 = center(a.from);
                const p1 = center(a.to);
                const line = document.createElementNS(
                    'http://www.w3.org/2000/svg', 'line');
                line.setAttribute('x1', p0.x);
                line.setAttribute('y1', p0.y);
                line.setAttribute('x2', p1.x);
                line.setAttribute('y2', p1.y);
                line.setAttribute('stroke', '#e5322d');
                line.setAttribute('stroke-width', '6');
                line.setAttribute('marker-end', 'url(#ytbg-arrowhead)');
                svg.appendChild(line);
            }
            layer.appendChild(svg);
        }

        for (const b of badges) {
            const p = center(b.sel);
            const el = document.createElement('div');
            el.textContent = String(b.n);
            Object.assign(el.style, {
                position: 'absolute',
                left: `${p.x + (b.dx || 0) - 21}px`,
                top: `${p.y + (b.dy || 0) - 21}px`,
                width: '42px', height: '42px',
                lineHeight: '42px', textAlign: 'center',
                borderRadius: '50%',
                background: '#e5322d', color: '#fff',
                border: '3px solid #fff',
                font: 'bold 26px/42px sans-serif',
                boxShadow: '0 2px 6px rgba(0,0,0,.5)',
            });
            layer.appendChild(el);
        }
    }, marks);
}

/**
 * 撮って docs/images/ に置く。
 *
 * @param {import('playwright').Page} page
 * @param {string} name - 拡張子なしのファイル名
 * @param {{clip?: {x: number, y: number, width: number, height: number}}} [opts]
 */
async function shot(page, name, opts = {}) {
    const file = path.join(OUT_DIR, `${name}.png`);
    await page.screenshot({ path: file, clip: opts.clip });
    console.log(`  ${path.relative(REPO_ROOT, file)}`);
}

/** ヘッダの位置と大きさ */
function header_box(page) {
    return page.evaluate(() => {
        const r = document.querySelector('header').getBoundingClientRect();
        return { x: 0, y: 0, width: window.innerWidth, height: r.height + 8 };
    });
}

/**
 * ある要素のまわりを切り取る範囲。近づけて見せたいときに使う。
 *
 * @param {import('playwright').Page} page
 * @param {string} sel
 * @param {number} margin - 要素の外側に足す余白
 */
function around(page, sel, margin) {
    return page.evaluate(({ sel, margin }) => {
        const r = document.querySelector(sel).getBoundingClientRect();
        const x = Math.max(0, Math.floor(r.x) - margin);
        const y = Math.max(0, Math.floor(r.y) - margin);
        return {
            x, y,
            width: Math.min(Math.ceil(r.width) + margin * 2,
                            window.innerWidth - x),
            height: Math.min(Math.ceil(r.height) + margin * 2,
                             window.innerHeight - y),
        };
    }, { sel, margin });
}

/**
 * ヘッダ・盤面・ボタンが収まる範囲。余白を切り落とすために使う。
 *
 * @param {import('playwright').Page} page
 */
function content_box(page) {
    return page.evaluate(() => {
        const sels = ['header', '#board', '#buttons'];
        let right = 0;
        let bottom = 0;
        for (const sel of sels) {
            const r = document.querySelector(sel).getBoundingClientRect();
            right = Math.max(right, r.right);
            bottom = Math.max(bottom, r.bottom);
        }
        return {
            x: 0, y: 0,
            width: Math.min(Math.ceil(right) + 16, window.innerWidth),
            height: Math.min(Math.ceil(bottom) + 16, window.innerHeight),
        };
    });
}

async function main() {
    await mkdir(OUT_DIR, { recursive: true });

    const server = await start_server({ server_id: 'docshot' });
    const browser = await launch_browser();
    let page = undefined;

    try {
        page = await open_board(browser, server.url);
        await page.setViewportSize(VIEWPORT);
        await sleep(500);

        console.log('撮ったもの:');

        // PIP を出しておく (数字が出ていないと指し示せない)
        await page.locator('#disp-pip').click();
        await sleep(500);

        const content = await content_box(page);

        // 1. 全体
        await add_marks(page, {
            badges: [
                { sel: '#nav-open', n: 1, dy: 40 },
                { sel: '#free-move', n: 2, dy: 34 },
                { sel: '#clock_sw', n: 3, dy: 34 },
                { sel: '#rollbutton0', n: 4 },
                { sel: '#cube', n: 5, dx: -44 },
                { sel: '#p0pip', n: 6, dx: -44 },
                { sel: '#p0score', n: 7, dx: 44 },
                { sel: '#button-resign', n: 8, dx: -52 },
            ],
        });
        await shot(page, 'overview', { clip: content });

        // 2. ヘッダ
        await add_marks(page, {
            badges: [
                { sel: '#nav-open', n: 1, dy: 40 },
                { sel: '#sound-switch', n: 2, dy: 34 },
                { sel: '#free-move', n: 3, dy: 34 },
                { sel: '#disp-pip', n: 4, dy: 34 },
                { sel: '#clock_sw', n: 5, dy: 34 },
                { sel: '#clock_limit0', n: 6, dy: 34 },
            ],
        });
        await shot(page, 'header', { clip: await header_box(page) });

        // 3. メニュー
        await clear_marks(page);
        await page.locator('#nav-open').click();
        await sleep(700);
        await shot(page, 'menu', { clip: content });
        await page.locator('#nav-input').evaluate(el => { el.checked = false; });
        await sleep(500);

        // 4. チェッカーの動かし方 (矢印だけ。盤面は動かさない)
        await add_marks(page, {
            arrows: [{ from: '#p012', to: '#p005' }],
            badges: [{ sel: '#p012', n: 1, dx: -46 },
                     { sel: '#p005', n: 2, dx: -46 }],
        });
        await shot(page, 'move', { clip: content });

        // 5. ダイスカップ (押すと振れる。振ると消えるので、振る前に撮る)
        await clear_marks(page);
        await shot(page, 'dicecup',
                   { clip: await around(page, '#rollbutton0', 40) });

        // 6. オープニングロール (両方が 1 個ずつ振ったところ)
        //
        // 振ったあとはダイスカップが消え、ダイスも動くので、
        // バッジは重ねない (位置がずれた所に付いてしまう)
        await clear_marks(page);
        await page.locator('#rollbutton0').click();
        await sleep(1200);
        await page.locator('#rollbutton1').click();
        await sleep(1500);
        await shot(page, 'roll', { clip: content });

        const errors = page.ytbg_errors.filter(
            e => !/fontawesome/.test(e.url || ''));
        if (errors.length > 0) {
            console.error('コンソールエラー:', errors);
            process.exitCode = 1;
        }
    } finally {
        if (browser !== undefined) {
            await browser.close();
        }
        await server.stop();
    }
}

await main();
