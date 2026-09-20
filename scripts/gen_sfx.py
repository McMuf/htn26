"""Procedurally generates the spray-can SFX as 44.1kHz mono WAVs (no external assets).

  rattle.wav        one shake of the can: two or three ball hits + the can ringing (~0.32s)
  hiss.wav          seamless atomiser loop (1.0s)
  pool.wav          wet pooling / drip (~0.7s, no longer played — paint doesn't run)
  empty_rattle.wav  hollow near-empty can (~0.7s)
  click.wav         short nozzle click when spray starts

Voicing notes, because the first pass was painful to listen to: white noise peaks where the ear is
most sensitive (4-10kHz), so a flat noise band reads as "sssss" rather than "spray". Everything
here is shaped low — a nozzle formant around 2kHz over a pressurised body, metal that rings
instead of clicking — and levelled by RMS rather than peak so nothing arrives at full scale.
`rattle` is deliberately short: it retriggers on every shake spike, so a long file would only ever
be heard as its first few clicks.

Levels are anchored to macOS system alerts (-11 to -16 dBFS RMS), which are tuned to be plainly
audible on a small speaker. Quieter than about -20 dBFS in-app and you can't hear it outdoors.

Run: python3 scripts/gen_sfx.py
"""
import numpy as np, wave, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'mobile', 'assets', 'sfx')
rng = np.random.default_rng(7)


def write(name, x):
    x = np.clip(x, -1, 1)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())


def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-np.maximum(t - a, 0) / d)


def lowpass(x, cutoff, poles=1):
    """One-pole lowpass, cascaded: 1 pole is a gentle tilt, 3 is an actual wall."""
    rc = 1 / (2 * np.pi * cutoff); dt = 1 / SR; alpha = dt / (rc + dt)
    y = x
    for _ in range(poles):
        out = np.zeros_like(y); acc = 0.0
        for i in range(len(y)):
            acc += alpha * (y[i] - acc); out[i] = acc
        y = out
    return y


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def band(x, lo, hi, poles=2):
    return lowpass(highpass(x, lo), hi, poles)


def level(x, rms=0.1, peak=0.6):
    """Level by RMS (what you hear) and only then cap the peak, so nothing lands at full scale."""
    x = x - np.mean(x)
    x = x * (rms / (np.sqrt(np.mean(x ** 2)) + 1e-9))
    p = np.max(np.abs(x))
    return x * (peak / p) if p > peak else x


def hiss():
    """An atomiser: a jet formant around 2kHz over pressurised air, with the sizzle rolled off."""
    n = SR  # 1s loop
    w = rng.standard_normal(n)
    # pink-ish base: summed lowpasses give the 1/f tilt white noise lacks
    pink = lowpass(w, 2500) * 0.6 + lowpass(w, 600) * 1.1 + w * 0.2
    jet = band(pink, 900, 2800, poles=3)          # the nozzle's voice
    body = lowpass(w, 450, poles=2) * 0.9         # pressure behind it
    air = band(rng.standard_normal(n), 2800, 5200, poles=2) * 0.11  # a little top, not a hiss
    x = jet + 0.35 * body + air  # a phone speaker can't reproduce much body, so don't spend level on it
    # slow breathing rather than a tremolo: three slow rates, none of them rhythmic
    tt = np.arange(n) / SR
    x *= 1 + 0.06 * np.sin(2 * np.pi * 3.1 * tt) + 0.04 * np.sin(2 * np.pi * 6.7 * tt + 1.1) + 0.03 * np.sin(2 * np.pi * 11.3 * tt + 2.3)
    # equal-power crossfade so the loop point doesn't dip
    f = int(0.06 * SR)
    a = np.sqrt(np.linspace(0, 1, f)); b = np.sqrt(np.linspace(1, 0, f))
    x[:f] = x[:f] * a + x[-f:] * b
    x = x[:-f]
    return level(x, rms=0.17, peak=0.72)


def impact(modes, amp=1.0, chiff=0.35, bright=4000):
    """One ball-on-metal hit: a band-limited chiff plus damped modes. The 1.5ms attack ramp is
    what stops it reading as a click."""
    n = int(SR * 0.25); t = np.arange(n) / SR
    x = band(rng.standard_normal(n), 700, bright, poles=2) * np.exp(-t / 0.007) * chiff
    for f, g, ring in modes:
        x += g * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / ring)
    return x * np.minimum(t / 0.0015, 1) * amp


def rattle():
    """One shake: the ball crossing the can and back, then the can itself ringing."""
    dur = 0.32; n = int(SR * dur); out = np.zeros(n)
    t = 0.012
    for k in range(3):
        modes = [
            (rng.uniform(1150, 1500), 0.42, 0.030),
            (rng.uniform(2000, 2500), 0.24, 0.016),
            (rng.uniform(3100, 3700), 0.10, 0.009),
        ]
        c = impact(modes, amp=rng.uniform(0.7, 1.0) * (1.0 - 0.15 * k), bright=3600)
        i = int(t * SR); m = min(len(c), n - i)
        if m > 0: out[i:i + m] += c[:m]
        t += rng.uniform(0.055, 0.085)
    tt = np.arange(n) / SR
    out += 0.10 * np.sin(2 * np.pi * 430 * tt) * np.exp(-tt / 0.10)  # the can body, briefly
    out *= env(n, 0.003, 0.18)
    return level(out, rms=0.20, peak=0.80)


def empty_rattle():
    """Same can with nothing in it: lower modes, longer ring, more body, fewer hits."""
    dur = 0.7; n = int(SR * dur); out = np.zeros(n)
    t = 0.015
    for k in range(4):
        modes = [
            (rng.uniform(620, 800), 0.46, 0.075),
            (rng.uniform(1100, 1400), 0.22, 0.040),
            (rng.uniform(1900, 2400), 0.08, 0.016),
        ]
        c = impact(modes, amp=rng.uniform(0.6, 0.95), chiff=0.22, bright=3000)
        i = int(t * SR); m = min(len(c), n - i)
        if m > 0: out[i:i + m] += c[:m]
        t += rng.uniform(0.10, 0.16)
    tt = np.arange(n) / SR
    out += 0.20 * np.sin(2 * np.pi * 300 * tt) * np.exp(-tt / 0.32)  # hollow = you hear the tin
    out += 0.06 * np.sin(2 * np.pi * 455 * tt) * np.exp(-tt / 0.22)
    out *= env(n, 0.004, 0.42)
    return level(out, rms=0.16, peak=0.72)


def pool():
    dur = 0.7; n = int(SR * dur)
    out = np.zeros(n)
    for k in range(4):
        s = int(rng.uniform(0, 0.4) * SR); m = int(0.12 * SR); t = np.arange(m) / SR
        f0 = rng.uniform(500, 900)
        blip = np.sin(2 * np.pi * (f0 * (1 - 0.6 * t / 0.12)) * t) * np.exp(-t / 0.03)
        out[s:s + m] += blip * 0.5
    out += lowpass(rng.standard_normal(n), 600) * 2.5 * env(n, 0.05, 0.3)
    out *= env(n, 0.01, 0.35)
    return level(out, rms=0.09, peak=0.55)


def click():
    """The nozzle going down: a soft tick, not a snare."""
    n = int(0.05 * SR); t = np.arange(n) / SR
    x = band(rng.standard_normal(n), 600, 3500, poles=2) * np.exp(-t / 0.006)
    x += 0.35 * np.sin(2 * np.pi * 1150 * t) * np.exp(-t / 0.010)
    x += 0.12 * np.sin(2 * np.pi * 2300 * t) * np.exp(-t / 0.005)
    return level(x * np.minimum(t / 0.001, 1), rms=0.13, peak=0.6)


os.makedirs(OUT, exist_ok=True)
write('rattle.wav', rattle())
write('empty_rattle.wav', empty_rattle())
write('hiss.wav', hiss())
write('pool.wav', pool())
write('click.wav', click())
print('wrote', sorted(os.listdir(OUT)))
