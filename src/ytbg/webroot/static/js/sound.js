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
    /**
     * @param {Settings} settings - 画面ごとの音の ON/OFF を読む
     * @param {string} soundfile
     */
    constructor(settings, soundfile) {
        log(`SoundBase(soundfile=${soundfile})`);
        this.settings = settings;
        this.soundfile = soundfile;
        this.audio = new Audio(this.soundfile);
    } // SoundBase.constructor()

    /**
     * 
     */
    play() {
        log(`SoundBase.play>`
                    + `GlobalSoundSwitch=${GlobalSoundSwitch}`);
        if ( this.settings.sound && GlobalSoundSwitch === undefined ) {
            log(`soundfile=${this.soundfile}`);
            return this.audio.play();
        } else {
            return false;
        }
    } // SoundBase.play()
} // class SoundBase
