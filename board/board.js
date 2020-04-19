class BackgammonObj {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;

        this.el = document.getElementById(this.id);

        this.w = this.el.firstChild.width;
        this.h = this.el.firstChild.height;

        this.el.style.position = "absolute";
        this.el.style.cursor = "move";
        this.el.style.userSelect = "none";

        this.el.hidden = false;
        this.el.draggable = false;
    }
}

class Board extends BackgammonObj {
    constructor(id, x, y) {
        super(id, x, y);

        this.area_w = 324;
        this.aria_h = 684;

        this.point_w = this.area_w / 6;
        this.point_h = this.area_h / 2;

        this.x[0] = 108;
        this.y[0] = 27;
        this.x[1] = 540;
        this.y[1] = this.y[0];

        for (let i = 1; i < 6; i++) {
            
        }
    }

    static xy2point(x, y) {
        point = undefined;
        
        return point;
    }
}

class Checker extends BackgammonObj {
    constructor(id, x, y) {
        super(id, x, y);

        this.el.hidden = true;

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ondragstart = this.on_drag_start.bind(this);

        this.moving = false;

        this.move(this.x,this.y);
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
    
    move(x, y) {
        console.log("move(" + x + "," + y +")");
        this.x = x;
        this.y = y;
        this.el.style.left = (this.x - this.w / 2) + "px";
        this.el.style.top = (this.y - this.h / 2) + "px";
    }

    on_mouse_down(e) {
        console.log("on_mouse_down");
        this.moving = true;
        console.log("zIndex=" + this.el.style.zIndex);
        this.el.style.zIndex = 1000;
    }

    on_mouse_up(e) {
        console.log("on_mouse_up");
        this.moving = false;
        this.el.style.zIndex = 0;
        this.off();
    }

    on_mouse_move(e) {
        console.log("on_mouse_move:" + this.moving);
        if (this.moving) {
        //if (e.buttons> 0) {
            this.move(e.clientX, e.clientY);
        }
    }

    on_drag_start(e) {
        console.log("on_drag_start");
        return false;
    }

}

window.onload = function () {
    let move_flg = undefined;
    let move_start_x = 0;
    let move_start_y = 0;

    let board = new Board("board", 0, 0);
    let c1 = new Checker("c1", 100, 100);
    let c2 = new Checker("c2", 200, 100);

    let el_t = document.getElementById("t");

    el_t.onmousedown = function(e) {
        move_flg = true;
        move_start_x = e.clientX - parseInt(document.getElementById("t").style.left.replace("px",""));
        move_start_y = e.clientY - parseInt(document.getElementById("t").style.top.replace("px",""));

        c1.on();
        c2.on();
    };
};
