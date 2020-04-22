/**
 *
 */
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
} // class BackgammonObj

/**
 *
 */
class Checker extends BackgammonObj {
    constructor(id, player, board) {
        super(id, 0, 0);
        this.player = player;
        this.board = board;

        this.src_x = this.x;
        this.src_y = this.y;
        this.z = 0;
        
        this.el.style.cursor = "move";

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);

        this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.ontouchend = this.on_mouse_up.bind(this);

        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ontouchmove = this.on_mouse_move.bind(this);

        this.el.ondragstart = this.on_drag_start.bind(this);

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
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        let [x, y] = this.board.get_xy(e);

        let ch = this;
        console.log("on_mouse_down: ch.id=" + ch.id
                    + ", (x,y)=(" + x + "," + y + ")");
        
        if ( ch.cur_point !== undefined ) {
            let point = ch.board.point[ch.cur_point];
            ch = point.checkers.slice(-1)[0];
            console.log("ch.id=" + ch.id);
        }
        ch.board.moving_checker = ch;

        ch.src_x = ch.x;
        ch.src_y = ch.y;

        ch.move(x, y, true);
        ch.set_z(1000);

    }

    on_mouse_up(e) {
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        let [x, y] = this.board.get_xy(e);

        let ch = this.board.moving_checker;
        console.log("on_mouse_up: ch.id=" + ch.id
                    + ", (x,y)=(" + x + "," + y + ")");

        ch.move(x, y, true);
        let p = ch.board.chpos2point(ch);
        console.log("on_mouse_up: p=" + p);

        let can_move = false;
        let hit_ch = undefined;
        let checkers = undefined;

        if ( p >= 0 && p <= ch.board.point.length) {
            checkers = ch.board.point[p].checkers;
            console.log("checkers.length=" + checkers.length);
            if ( p == 0 || p == 26 ) {
                if ( ch.player == 0 ) {
                    can_move = true;
                }
            } else if ( p == 25 || p == 27 ) {
                if ( ch.player == 1 ) {
                    can_move = true;
                }
            } else if ( checkers.length == 0 ) {
                can_move = true;
            } else if ( checkers[0].player == ch.player ) {
                can_move = true;
            } else if ( checkers.length == 1 ) {
                can_move = true;
                hit_ch = checkers[0];
                console.log("hit_ch.id=" + hit_ch.id);
            }
        }
            
        console.log("can_move=" + can_move);
        console.log("hit_ch=" + hit_ch);
        if ( ! can_move ) {
            ch.move(ch.src_x, ch.src_y, true);
            ch.board.moving_checker = undefined;
            return;
        }

        if ( hit_ch !== undefined ) {
            let bar_p = undefined;
            if ( hit_ch.player == 0 ) {
                bar_p = 26;
            } else {
                bar_p = 27;
            }
            ch.board.put_checker(hit_ch, bar_p);
            hit_ch.calc_z();
        }

        ch.board.put_checker(this, p);
        ch.calc_z();

        ch.board.moving_checker = undefined;
    }

    on_mouse_move(e) {
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        let [x, y] = this.board.get_xy(e);

        let ch = this.board.moving_checker;
        if ( ch === undefined ) {
            return;
        }
        console.log("on_mouse_move: ch.id=" + ch.id
                    + ", (x,y)=(" + x + "," + y + ")");
        
        ch.move(x, y, true);
    }

    on_drag_start(e) {
        return false;
    }

} // class Checker

/**
 *
 */
class Cube extends BackgammonObj {
    constructor(id, board) {
        super(id, 0, 0);
        this.board = board;

        this.value = 1;
        
        this.file_prefix = "images/cubeA-";
        this.file_suffix = ".png";

        this.el.style.cursor = "crosshair";

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);
        // this.el.onmouseup = this.on_mouse_up.bind(this);
        // this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.on_drag_start.bind(this);

        this.move((this.board.bx[0] + this.board.bx[1]) / 2,
                  this.board.h / 2,
                  true);
    }

    double() {
        this.value *= 2;

        let val = this.value;
        if ( this.value == 1 ) {
            val = 64;
        }
        if ( this.value > 64 ) {
            val = 64;
        }
        let filename =
            this.file_prefix + ("0" + val).slice(-2) + this.file_suffix;

        this.el.firstChild.src = filename;
    }

    on_mouse_down(e) {
        e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        this.double();
    }

    on_drag_start(e) {
        return false;
    }
    
} // class Cube

/**
 *
 *           bx[0]                  bx[3]                 bx[5]
 *           |   bx[1]              |   bx[4]             |bx[6]
 *           |   |bx[2]             |   |                 ||   bx[7]
 *           |   ||                 |   |                 ||   |
 *           v   vv                 v   v                 vv   v
 *         +-----------------------------------------------------+ 
 *         |       13 14 15 16 17 18     19 20 21 22 23 24       |
 * by[0] ->| +---++-----------------+---+-----------------++---+ |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 *         | |   ||p0          p1   |   |p1             p0||   | |
 *         | |   ||p0          p1   |27 |p1               ||25 | |
 *         | |   ||p0               |   |p1               ||   | |
 *         | |   ||p0               |   |p1               ||   | |
 *         | |   ||                 |   |                 ||   | |
 *         | |   ||                 |---|                 ||---| |
 *         | |   ||                 |   |                 ||   | |
 *         | |   ||p1               |   |p0               ||   | |
 *         | |   ||p1               |   |p0               ||   | |
 *         | |   ||p1          p0   |26 |p0               || 0 | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 *         | |   ||p1          p0   |   |p0             p1||   | |
 * by[1] ->| +----+-----------------+---+-----------------++---+ |
 *         |       12 11 10  9  8  7      6  5  4  3  2  1       |
 *         +-----------------------------------------------------+ 
 *
 */
class Board extends BackgammonObj {
    constructor(id, x, y) {
        super(id, x, y);

        this.bx = [27, 81, 108, 432, 540, 864, 891, 945];
        this.by = [27, 711];
        
        // Checkers
        this.checker = [Array(15), Array(15)];
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let c_id = "p" + player + ("0" + i).slice(-2);
                console.log("c_id=" + c_id);
                this.checker[player][i] = new Checker(c_id, player, this);
            }
        }

        this.moving_checker = undefined;
        this.inverted = false;

        // Cube
        this.cube = new Cube("cube", this);

        // Points
        this.point = Array(28);
        
        for ( let p=0; p < this.point.length; p++ ) {
            let cn = 5;
            let pw = this.checker[0][0].w;
            let ph = this.h / 2 - this.by[0];

            if ( p == 0 ) {
                let x0 = this.bx[6];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                this.point[p] = new BoardPoint(x0, y0, pw, ph,
                                               -1, cn, this);
            }
            if ( p >= 1 && p <= 6 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 6 - p;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph,
                                               -1, cn, this);
            }
            if ( p >= 7 && p <= 12 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let xn = 12 - p;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph,
                                               -1, cn, this);
            }
            if ( p >= 13 && p <= 18 ) {
                let x0 = this.bx[2];
                let y0 = this.by[0];
                let xn = p - 13;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph,
                                               1, cn, this);
            }
            if ( p >= 19 && p <= 24 ) {
                let x0 = this.bx[4];
                let y0 = this.by[0];
                let xn = p - 19;
                let x = x0 + pw * xn;
                this.point[p] = new BoardPoint(x, y0, pw, ph,
                                               1, cn, this);
            }
            if ( p == 25 ) {
                let x0 = this.bx[6];
                let y0 = this.by[0];
                this.point[p] = new BoardPoint(x0, y0, pw, ph,
                                               1, cn, this);
            }
            if ( p == 26 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0] + (this.by[1] - this.by[0]) / 2;
                let pw = this.bx[4] - this.bx[3];
                this.point[p] = new BoardPoint(x0, y0, pw, ph,
                                               1, cn, this);
            }
            if ( p == 27 ) {
                let x0 = this.bx[3];
                let y0 = this.by[0];
                let pw = this.bx[4] - this.bx[3];
                this.point[p] = new BoardPoint(x0, y0, pw, ph,
                                               -1, cn, this);
            }
        }

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);

        // this.el.onmouseup = this.on_mouse_up.bind(this);
        // this.el.ontouchend = this.on_mouse_up.bind(this);

        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ontouchmove = this.on_mouse_move.bind(this);

        this.el.ondragstart = this.on_drag_start.bind(this);

        this.end();  // for debug
        this.init();
        // this.inverse();
    }

    init() {
        let points = [
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

        this.put_checkers(points);
    }

    end() {
        let points = [
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

        this.put_checkers(points);
    }

    inverse() {
        if ( this.inverted ) {
            this.inverted = false;
        } else {
            this.inverted = true;
        }

        let e_all = document.getElementById("all");
        e_all.style.left = "0px";
        e_all.style.top = "0px";
        e_all.style.width = this.w + "px";
        e_all.style.height = this.h + "px";
        if ( this.inverted ) {
            e_all.style.transform = "rotate(180deg)";
        } else {
            e_all.style.transform = "rotate(0deg)";
        }
    }

    inverse_xy(e) {
        return [this.w - e.clientX, this.h - e.clientY];
    }
    
    get_xy(e) {
        let [x, y] = [e.clientX, e.clientY];
        if ( this.inverted ) {
            [x, y] = this.inverse_xy(e);
        }
        return [x, y];
    }

    on_mouse_down(e) {
        let orig_e = e;
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        if ( e.clientX < this.bx[0] || e.clientX > this.bx[7] ||
             e.clientY < this.by[0] || e.clientY > this.by[1] ) {
            this.inverse();
            console.log("Board.inverted=" + this.inverted);
            orig_e.preventDefault();
        }
    }

    on_mouse_move(e) {
        // e.preventDefault();
        if ( e.changedTouches ) {
            e = e.changedTouches[0];
        }
        if ( this.moving_checker === undefined ) {
            return;
        }

        let [x, y] = this.get_xy(e);

        this.moving_checker.move(x, y, true);
    }

    on_drag_start(e) {
        return false;
    }

    chpos2point(ch) {
        let point = undefined;

        for ( let i=0; i < this.point.length; i++ ) {
            if ( this.point[i].in_this(ch) ) {
                console.log("chpos2point: i=" + i);
                return i;
            }
        }
        return undefined;
    }

    put_checker(ch, p) {
        console.log("put_checker(" + ch.id + "," + p + ")");
        if ( ch.cur_point !== undefined ) {
            console.log("ch.cur_point=" + ch.cur_point);
            let prev_po = this.point[ch.cur_point];
            ch = prev_po.checkers.pop();
            console.log("ch.id=" + ch.id);
        }

        let po = this.point[p];
        let ch_n = po.checkers.length;
        let z = Math.floor(ch_n / po.max_n);
        let n = ch_n % po.max_n;
        let x = po.cx;
        let y = po.y0 + (ch.h / 2 + ch.h * n + ch.h / 5 * z) * po.direction;
        ch.move(x, y, true);
        ch.calc_z();
        ch.cur_point = p;

        po.checkers.push(ch);
    }

    put_checkers(points) {
        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let ch = this.checker[player][i];
                if ( ch.cur_point !== undefined ) {
                    let ch_dumy = this.point[ch.cur_point].checkers.pop();
                    ch.cur_point = undefined;
                }
                ch.move(this.w - ch.w / 2, this.h / 2, true);
            }
        }

        for (let player=0; player < 2; player++) {
            for (let i=0; i < 15; i++) {
                let point = points[player][i];
                if ( point < 0 ) continue;
                
                let ch = this.checker[player][i];
                this.put_checker(ch, point);
            }
        }
    }
}

/**
 *
 */
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

/**
 *
 */
window.onload = function () {
    let move_flg = undefined;
    let move_start_x = 0;
    let move_start_y = 0;

    let board = new Board("board", 0, 0);
};
