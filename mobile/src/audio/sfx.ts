import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

/**
 * SFX built by scripts/gen_sfx.py (see assets/sfx/CREDITS.md): the hiss and nozzle press are cut
 * from a public-domain aerosol recording, the shakes are synthesised.
 *  hiss: seamless loop, volume+rate driven by spray strength ("distance" proxy)
 *  rattle / emptyRattle: one-shots; click: nozzle press.
 */
class Sfx {
  private hiss?: AudioPlayer;
  private rattleP?: AudioPlayer;
  private emptyP?: AudioPlayer;
  private clickP?: AudioPlayer;
  private ready = false;
  enabled = true;
  private hissing = false;
  private fade?: ReturnType<typeof setTimeout>;

  async init() {
    if (this.ready) return;
    try {
      await setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers', shouldPlayInBackground: false });
    } catch {}
    this.hiss = createAudioPlayer(require('../../assets/sfx/hiss.wav'));
    this.hiss.loop = true;
    this.hiss.volume = 0;
    this.rattleP = createAudioPlayer(require('../../assets/sfx/rattle.wav'));
    this.emptyP = createAudioPlayer(require('../../assets/sfx/empty_rattle.wav'));
    this.clickP = createAudioPlayer(require('../../assets/sfx/click.wav'));
    this.ready = true;
  }

  private oneShot(p?: AudioPlayer, volume = 1, rate = 1) {
    if (!p || !this.enabled) return;
    try {
      p.volume = volume;
      p.setPlaybackRate(rate, 'low');
      // a finished one-shot won't restart until the seek has landed
      p.seekTo(0).then(() => p.play()).catch(() => { try { p.play(); } catch {} });
    } catch {}
  }

  click() { this.oneShot(this.clickP, 0.6, 0.9 + Math.random() * 0.2); }
  rattle(strength = 1) { this.oneShot(this.rattleP, 0.5 + 0.5 * strength, 0.9 + 0.3 * Math.random()); }
  emptyRattle() { this.oneShot(this.emptyP, 0.9, 1); }

  /** strength 0..1 (can charge × paint), near 0..1 (aim pitch proxy for distance to surface). */
  setHiss(on: boolean, strength: number, near: number) {
    const p = this.hiss;
    if (!p) return;
    if (this.fade) { clearTimeout(this.fade); this.fade = undefined; }
    if (!on || !this.enabled) {
      // let the nozzle breathe out instead of cutting it dead on release
      if (this.hissing) {
        this.hissing = false;
        try { p.volume = p.volume * 0.45; } catch {}
        this.fade = setTimeout(() => { try { p.volume = 0; p.pause(); } catch {} }, 90);
      }
      return;
    }
    try {
      if (!this.hissing) { p.play(); this.hissing = true; }
      p.volume = Math.min(1, 0.25 + 0.65 * strength);
      p.setPlaybackRate(0.85 + 0.3 * strength + 0.2 * near, 'low');
    } catch {}
  }
}

export const sfx = new Sfx();
