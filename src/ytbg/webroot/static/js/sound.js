import { log } from "./log.js";

export const SOUND_ROLL = "/static/sounds/roll1.mp3";
export const SOUND_PUT = "/static/sounds/put1.mp3";
export const SOUND_HIT = "/static/sounds/hit1.mp3";
export const SOUND_TURN_CHANGE = "/static/sounds/turn_change1.mp3";

// QueryString の sound= が指定されていたら音を止める (undefined のときだけ鳴る)
export let GlobalSoundSwitch = undefined;

/**
 * @param {string|undefined} value
 */
export const set_global_sound_switch = (value) => {
    GlobalSoundSwitch = value;
};

/**
 *
 */
export class SoundBase {
    constructor(board, soundfile) {
        log("SoundBase("
                    + `board.svr_id=${board.svr_id},`
                    + `soundfile=${soundfile}`);
        this.board = board;
        this.soundfile = soundfile;
        this.audio = new Audio(this.soundfile);
    } // SoundBase.constructor()

    /**
     * 
     */
    play() {
        log(`SoundBase.play>`
                    + `GlobalSoundSwitch=${GlobalSoundSwitch}`);
        if ( this.board.sound && GlobalSoundSwitch === undefined ) {
            log(`soundfile=${this.soundfile}`);
            return this.audio.play();
        } else {
            return false;
        }
    } // SoundBase.play()
} // class SoundBase
