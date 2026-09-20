"""Builds the spray-can SFX as 44.1kHz mono WAVs.

The hiss and the nozzle press come from a real aerosol recording ("Can of compressed air" by
stilgar, Wikimedia Commons, public domain — mobile/assets/sfx/src/), looped and EQ'd; the shakes
are synthesised (see rattle). Needs ffmpeg on PATH to decode the .ogg.

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


def load_ogg(path):
    """Decode with ffmpeg to 44.1k mono float."""
    import subprocess
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '1', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, '<i2').astype(np.float64) / 32768


AIR = load_ogg(os.path.join(OUT, 'src', 'can_of_compressed_air.ogg'))


def biquad_peak(x, f0, q, gain_db):
    """RBJ peaking EQ, for a nozzle resonance."""
    A = 10 ** (gain_db / 40); w0 = 2 * np.pi * f0 / SR; al = np.sin(w0) / (2 * q)
    b0, b1, b2 = 1 + al * A, -2 * np.cos(w0), 1 - al * A
    a0, a1, a2 = 1 + al / A, -2 * np.cos(w0), 1 - al / A
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = np.zeros_like(x); x1 = x2 = y1 = y2 = 0.0
    for i in range(len(x)):
        y[i] = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, x[i], y1, y[i]
    return y


def hiss():
    """Spray paint, not compressed air: a dense jet with the atomiser's flutter. White noise is
    band-limited to the jet (1.2–6.5 kHz), given a nozzle resonance around 3.6 kHz, then amplitude-
    fluttered by slow random noise (the paint breaking up), with a low pressurised body underneath
    and a touch of soft clipping for grit. 1.2 s equal-power loop."""
    n = int(1.2 * SR)
    w = rng.standard_normal(n)
    jet = band(w, 1200, 6500, poles=2)
    jet = biquad_peak(jet, 3600, 1.1, 5.0)
    jet = biquad_peak(jet, 1900, 1.4, 2.5)
    flutter = lowpass(rng.standard_normal(n), 45, poles=2)
    flutter = 1 + 0.35 * flutter / (np.std(flutter) + 1e-9)
    body = lowpass(rng.standard_normal(n), 380, poles=2)
    body = body / (np.std(body) + 1e-9) * 0.12
    x = jet / (np.std(jet) + 1e-9) * flutter + body
    x = np.tanh(x * 0.9) / 0.9
    tt = np.arange(n) / SR
    x *= 1 + 0.05 * np.sin(2 * np.pi * 2.3 * tt) + 0.03 * np.sin(2 * np.pi * 5.1 * tt + 0.7)
    f = int(0.1 * SR)
    a = np.sqrt(np.linspace(0, 1, f)); b = np.sqrt(np.linspace(1, 0, f))
    x[:f] = x[:f] * a + x[-f:] * b
    x = x[:-f]
    return level(x, rms=0.15, peak=0.7)


def click():
    """The nozzle going down: the recording's own attack (the first 90ms of the burst), tucked
    into a short tail so it reads as a press, not a spray."""
    x = AIR[int(0.27 * SR):int(0.40 * SR)].copy()
    n = len(x); t = np.arange(n) / SR
    x = lowpass(x, 6500) * env(n, 0.004, 0.035)
    x += 0.25 * np.sin(2 * np.pi * 1300 * t) * np.exp(-t / 0.008)  # the plastic cap
    return level(x, rms=0.12, peak=0.55)


def impact(modes, amp=1.0, chiff=0.35, bright=4000):
    """One ball-on-metal hit: a band-limited chiff plus damped modes. The 1.5ms attack ramp is
    what stops it reading as a click."""
    n = int(SR * 0.25); t = np.arange(n) / SR
    x = band(rng.standard_normal(n), 700, bright, poles=2) * np.exp(-t / 0.007) * chiff
    for f, g, ring in modes:
        x += g * np.sin(2 * np.pi * f * t + rng.uniform(0, 6.28)) * np.exp(-t / ring)
    return x * np.minimum(t / 0.0015, 1) * amp


def rattle():
    """One shake of a full can: the steel pea hits one end then the other (a sharp tick with a
    thin-tin ring), and the paint sloshes behind it. Short, because it retriggers on every shake."""
    dur = 0.30; n = int(SR * dur); out = np.zeros(n)
    t = 0.010
    for k in range(2):
        modes = [
            (rng.uniform(880, 1080), 0.40, 0.045),    # the can's cylinder ring
            (rng.uniform(1900, 2300), 0.30, 0.020),
            (rng.uniform(3300, 3900), 0.16, 0.011),
            (rng.uniform(5200, 6400), 0.10, 0.005),   # the pea's own tick
        ]
        c = impact(modes, amp=rng.uniform(0.8, 1.0) * (1.0 - 0.2 * k), chiff=0.45, bright=6500)
        i = int(t * SR); m = min(len(c), n - i)
        if m > 0: out[i:i + m] += c[:m]
        # paint slosh right after the hit: a soft, low, wet burst
        sl = int(0.07 * SR); ts = np.arange(sl) / SR
        slosh = band(rng.standard_normal(sl), 250, 900, poles=2) * np.exp(-ts / 0.03) * 0.55
        j = i + int(0.012 * SR); m2 = min(sl, n - j)
        if m2 > 0: out[j:j + m2] += slosh[:m2]
        t += rng.uniform(0.09, 0.12)
    tt = np.arange(n) / SR
    out += 0.08 * np.sin(2 * np.pi * 410 * tt) * np.exp(-tt / 0.09)
    out *= env(n, 0.002, 0.16)
    return level(out, rms=0.17, peak=0.75)


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
