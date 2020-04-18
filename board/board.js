class Checker {
    constructor(id, w, h, x, y, image) {
        this.id = id;
        this.w = w;
        this.h = w;
        this.x = x;
        this.y = y;
        this.image = image;
        this.moving = false;

        this.el = document.getElementById(this.id);
        this.el.hidden = true;
        this.el.draggable = true;
    }

    on(x, y) {
        this.el.hidden = false;
        this.x = x;
        this.y = y;
    }

    off() {
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
        // this.move(e.clientX, e.clientY);
    }

    on_mouse_up(e) {
        console.log("on_mouse_up");
        this.moving = false;
    }

    on_mouse_move(e) {
        console.log("on_mouse_move:" + this.moving);
        // if (this.moving) {
        if (e.buttons> 0) {
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

    let c1 = new Checker("c1", 100, 100, 100, 100, "images/checkerA.png");
    let c2 = new Checker("c2", 200, 100, 100, 100, "images/checkerB.png");

    let el_c1 = document.getElementById("c1");
    el_c1.onmousedown = function(e) {
        c1.on_mouse_down(e);
    };
    el_c1.onmouseup = function(e) {
        c1.on_mouse_up(e);
    };
    el_c1.onmousemove = function(e) {
        c1.on_mouse_move(e);
    };

    let el_t = document.getElementById("t");
    el_t.onmousedown = function(e) {
        move_flg = true;
        move_start_x = e.clientX - parseInt(document.getElementById("t").style.left.replace("px",""));
        move_start_y = e.clientY - parseInt(document.getElementById("t").style.top.replace("px",""));

        c1.on(e.clientX, e.clientY);
    };

    el_t.onmouseup = function(e) {
        move_flg = false;
    };

    el_t.onmousemove = function(e) {
        if(move_flg) {
            console.log("a");
            document.getElementById("t").style.left = (e.clientX - move_start_x) + "px";
            document.getElementById("t").style.top = (e.clientY - move_start_y) + "px";    
        }
    };
};
