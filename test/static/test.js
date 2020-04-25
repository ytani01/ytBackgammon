class BackgammonObj {
    constructor(id, x, y, ws) {
        this.id = id;
        [this.x, this.y] = [x, y];
        this.ws = ws;

        this.el = document.getElementById(this.id);

        this.w = this.el.firstChild.width;
        this.h = this.el.firstChild.height;

        this.el.style.position = "absolute";
        this.el.style.cursor = "default";
        this.el.style.userSelect = "none";

        this.el.hidden = false;
        this.el.draggable = false;

        this.move(this.x, this.y, false);

        this.moving = false;
    }

    move(x, y, center=false, force=false) {
        if ( ! this.moving && ! force ) {
            return;
        }
        [this.x, this.y] = [x, y];

        this.el.style.left = this.x + "px";
        this.el.style.top = this.y + "px";
        if ( center ) {
            this.el.style.left = (this.x - this.w / 2) + "px";
            this.el.style.top = (this.y - this.h / 2) + "px";
        }
    }
} // class BackgammonObj

class Checker extends BackgammonObj {
    constructor(id, ws) {
        super(id, 0, 0, ws);

        this.el.onmousedown = this.on_mouse_down.bind(this);
        this.el.ontouchstart = this.on_mouse_down.bind(this);

        this.el.onmouseup = this.on_mouse_up.bind(this);
        this.el.ontouchend = this.on_mouse_up.bind(this);

        this.el.onmousemove = this.on_mouse_move.bind(this);
        this.el.ontouchmove = this.on_mouse_move.bind(this);

        this.el.ondragstart = this.on_drag_start.bind(this);
    }

    on_mouse_down(e) {
        this.moving = true;
        this.move(e.clientX, e.clientY, true);
    }

    on_mouse_up(e) {
        this.moving = false;
        this.ws.emit('c', {event: 'up', id: this.id, x: this.x, y: this.y});
    }

    on_mouse_move(e) {
        this.move(e.clientX, e.clientY, true);        
    }

    on_drag_start(e) {
        return false;
    }
}

window.onload = function () {
    let url = "http://" + document.domain + ":" + location.port + "/test";
    let ws = io.connect(url);

    let ch = new Checker("a", ws);

    ws.on('connect', function() {
        msg = {event: 'hello!'};
        console.log('send:' + JSON.stringify(msg));
        ws.emit('c', msg);
    });

    ws.on('disconnect', function() {
        console.log('disconnect');
    });

    ws.on('c', function(msg) {
        console.log('c> ' + msg.data);
    });

    ws.on('s', function(msg) {
        console.log('s> ' + JSON.stringify(msg));
        console.log(msg.event);
        if ( msg.event == 'up' ) {
            ch.move(msg.x, msg.y, true, force=true);
        }
    });
};
