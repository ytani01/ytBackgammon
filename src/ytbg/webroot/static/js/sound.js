import { log } from "./log.js";

// このモジュールからの相対で組み立てる (URL のプレフィクスが付いても同じ)
const sound_url = (name) => new URL(`../sounds/${name}`, import.meta.url).pathname;

export const SOUND_ROLL = sound_url("roll1.mp3");
export const SOUND_PUT = sound_url("put1.mp3");
export const SOUND_HIT = sound_url("hit1.mp3");
export const SOUND_TURN_CHANGE = sound_url("turn_change1.mp3");

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
