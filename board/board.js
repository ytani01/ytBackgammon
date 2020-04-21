class BackgammonObj {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;

        this.el = document.getElementById(this.id);

        this.w = this.el.firstChild.width;
        this.h = this.el.firstChild.height;

        this.el.style.position = "absolute";
        this.el.style.cursor = "default";
        this.el.style.userSelect = "none";

        this.el.hidden = false;
        this.el.draggable = false;

        this.move(this.x, this.y, false);
    }

    move(x, y, center=false) {
        this.x = x;
        this.y = y;

        this.el.style.left = this.x + "px";
        this.el.style.top = this.y + "px";
        if ( center ) {
            this.el.style.left = (this.x - this.w / 2) + "px";
            this.el.style.top = (this.y - this.h / 2) + "px";
        }
    }

    on() {
        console.log('on');
        this.el.hidden = false;

        this.move(this.x, this.y);
    }

    off() {
        console.log('off');
        this.el.hidden = true;
    }
}

class Checker extends BackgammonObj {
    constructor(id, x, y, board) {
        super(id, x, y);

        this.board = board;

        this.src_x = x;
        this.src_y = x;
        this.z = 0;
        
        this.el.hidden = false;
        this.el.style.cursor = "move";

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.on_drag_start.bind(this);

        this.moving = false;

        this.move(this.x, this.y, true);
        this.set_z(this.z);

        this.cur_point = undefined;
    }

    set_z(z) {
        console.log("set_z:z=" + z);
        this.z = z;
        this.el.style.zIndex = this.z;
    }

    calc_z() {
        let z = 0;
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 15; i++) {
                let ch = this.board.checker[p][i];
                if (ch !== this) {
                    let d = this.distance(ch);
                    if ( d < this.w ) {
                        let z1 = ch.z + 1;
                        z = Math.max(z, z1);
                        console.log("calc_z:d=" + d + ", z=" + z);
                    }
                }
            } // for (i)
        } // for (p)

        this.set_z(z);
    }

    distance(ch) {
        let dx = ch.x - this.x;
        let dy = ch.y - this.y;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    on_mouse_down(e) {
        if ( this.cur_point ) {
            let po = this.board.point[this.cur_point];
            let last_checker = po.checkers.slice(-1)[0];
            if ( last_checker !== this ) {
                return;
            }
        }

        this.moving = true;

        this.src_x = this.x;
        this.src_y = this.y;

        this.move(e.clientX, e.clientY, true);
        this.set_z(1000);

        this.board.moving_checker = this;
    }

    on_mouse_up(e) {
        this.move(e.clientX, e.clientY, true);

        let p = this.board.xy2point(this);
        if ( p >= 0 && p <= this.board.point.length) {
            this.board.put_checker(this, p);
        } else {
            this.move(this.src_x, this.src_y, true);
            this.moving = false;
            this.board.moving_checker = undefined;
            return;
        }
        this.calc_z();

        console.log("Checker.on_mouse_up: x=" + this.x);

        this.moving = false;
        this.board.moving_checker = undefined;
    }

    on_mouse_move(e) {
        console.log("Checker.on_mouse_move:" + this.moving);
        if (this.moving) {
            this.move(e.clientX, e.clientY, true);
        }
    }

    on_drag_start(e) {
        console.log("Checker.on_drag_start");
        return false;
    }

} // class Checker

class Board extends BackgammonObj {
    constructor(id, x, y) {
        super(id, x, y);

        // MEMO
        // area: (108, 27)-(,), (540, 27)-(,)

        // Checkers
        this.checker = [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
                       [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]];
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + String(p) + ("0" + i).slice(-2);
                console.log("c_id=" + c_id);
                this.checker[p][i] = new Checker(
                    c_id, 100 + p * 100, 100 + i * 10, this
                );
            }
        }

        this.moving_checker = undefined;

        // Points
        this.point = [0,
                      1, 2, 3, 4, 5, 6,
                      7, 8, 9, 10, 11, 12,
                      13, 14, 15, 16, 17, 18,
                      19, 20, 21, 22, 23, 24,
                      25
                     ];
        
        let cn = 5;
        let pw = 54;
        let ph = this.checker[0][0].h * cn;
        for ( let p=0; p < this.point.length; p++ ) {
            if ( p == 0 ) {
                let x0 = 891;
                let y0 = 441;
                this.point[p] = new BoardPoint(x0, y0, pw, ph, -1, cn, this);
            }
            if ( p >= 1 && p <= 6 ) {
                let x0 = 540;
                let y0 = 441;
                let xn = 6 - p;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph, -1, cn, this);
            }
            if ( p >= 7 && p <= 12 ) {
                let x0 = 108;
                let y0 = 441;
                let xn = 12 - p;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph, -1, cn, this);
            }
            if ( p >= 13 && p <= 18 ) {
                let x0 = 108;
                let y0 = 27;
                let xn = p - 13;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph, 1, cn, this);
            }
            if ( p >= 19 && p <= 24 ) {
                let x0 = 540;
                let y0 = 27;
                let xn = p - 19;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph, 1, cn, this);
            }
            if ( p == 25 ) {
                let x0 = 891;
                let y0 = 27;
                this.point[p] = new BoardPoint(x0, y0, pw, ph, 1, cn, this);
            }
        }

        // this.el.onmousedown = this.on_mouse_down.bind(this);
        // this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.on_drag_start.bind(this);

        // this.init();
        this.end();
    }

    init() {
        let init_point = [
            [
                24, 24,
                13, 13, 13, 13, 13,
                8, 8, 8,
                6, 6, 6, 6, 6
            ],
            [
                1, 1,
                12, 12, 12, 12, 12,
                17, 17, 17,
                19, 19, 19, 19, 19
            ],
        ];

        this.put_checkers(init_point);
    }

    end() {
        let end_point = [
            [
                0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
                0, 0, 0, 0, 0,
            ],
            [
                25, 25, 25, 25, 25,
                25, 25, 25, 25, 25,
                25, 25, 25, 25, 25,
            ],
        ];

        this.put_checkers(end_point);
    }

    put_checkers(points) {
        for (let p=0; p < 2; p++) {
            for (let i=0; i < 15; i++) {
                this.put_checker(this.checker[p][i], points[p][i]);
            }
        }
    }

    on_mouse_move(e) {
        if ( this.moving_checker === undefined ) {
            return;
        }

        // console.log("Board.on_mouse_move:" + this.moving_checker.id);
        this.moving_checker.move(e.clientX, e.clientY, true);
    }

    on_drag_start(e) {
        console.log("Board.on_drag_start");
        return false;
    }

    xy2point(ch) {
        let point = undefined;

        for ( let i=0; i < this.point.length; i++ ) {
            if ( this.point[i].in_this(ch) ) {
                console.log("xy2point: i=" + i);
                return i;
            }
        }
        return point;
    }

    put_checker(ch, p) {
        console.log("put_checker: ch.id=" + ch.id);
        let po = this.point[p];
        let nz = Math.floor(po.checkers.length / po.max_n);
        let n = po.checkers.length % po.max_n;
        let x = po.cx;
        let y = po.y0 + (ch.h / 2 + ch.h * n + ch.h / 10 * nz) * po.direction;
        console.log("y=" + y);

        console.log("ch.cur_point=" + ch.cur_point);
        if ( ch.cur_point ) {
            let prev_po = this.point[ch.cur_point];
            console.log("prev_po=" + prev_po);

            ch.move(ch.src_x, ch.src_y, true);

            ch = prev_po.checkers.pop();
            console.log("ch.id=" + ch.id);
            ch.set_z(1000);
        }

        ch.move(x, y, true);
        ch.calc_z();
        ch.cur_point = p;

        po.checkers.push(ch);
    }
}

class BoardPoint {
    constructor(x, y, w, h, direction, max_n, board) {
        this.x = x;
        this.y = y;
        this.w = w;
        this.h = h;
        this.direction = direction; // up: +1, down: -1
        this.max_n = max_n;
        this.baord = board;

        this.cx = this.x + this.w / 2;

        if ( this.direction > 0 ) {
            this.y0 = this.y;
        } else {
            this.y0 = this.y  + this.h;
        }

        this.checkers = [];
    }
    
    in_this(ch) {
        if ( ch.x >= this.x && ch.x < this.x + this.w &&
             ch.y >= this.y && ch.y < this.y + this.h ) {
            return true;
        }
        return false;
    }
}

window.onload = function () {
    let move_flg = undefined;
    let move_start_x = 0;
    let move_start_y = 0;

    let board = new Board("board", 0, 0);
};
