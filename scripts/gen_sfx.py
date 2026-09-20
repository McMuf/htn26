"""Procedurally generates the spray-can SFX as 44.1kHz mono WAVs (no external assets).

  rattle.wav        ball rattle while shaking the can (one-shot, ~0.9s)
  hiss.wav          seamless spray hiss loop (1.0s)
  pool.wav          wet pooling / drip when you dwell on one spot (~0.7s)
  empty_rattle.wav  hollow near-empty can rattle (one-shot, ~0.9s)
  click.wav         short nozzle click when spray starts

Run: python3 scripts/gen_sfx.py
"""
import numpy as np, wave, os

SR = 44100
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sfx')
rng = np.random.default_rng(7)

def write(name, x):
    x = np.clip(x, -1, 1)
    with wave.open(os.path.join(OUT, name), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((x * 32767).astype('<i2').tobytes())

def env(n, a, d):
    t = np.arange(n) / SR
    return np.minimum(t / a, 1) * np.exp(-np.maximum(t - a, 0) / d)

def lowpass(x, cutoff):
    rc = 1 / (2 * np.pi * cutoff); dt = 1 / SR; alpha = dt / (rc + dt)
    y = np.zeros_like(x); acc = 0.0
    for i in range(len(x)):
        acc += alpha * (x[i] - acc); y[i] = acc
    return y

def highpass(x, cutoff):
    return x - lowpass(x, cutoff)

def ball_click(freq, dur=0.05, amp=1.0, ring=0.004):
    n = int(SR * dur); t = np.arange(n) / SR
    body = np.sin(2 * np.pi * freq * t) * np.exp(-t / ring)
    noise = rng.standard_normal(n) * np.exp(-t / 0.002) * 0.6
    return (body + noise) * amp

def rattle(hollow=False):
    dur = 0.9; n = int(SR * dur); out = np.zeros(n)
    t = 0.0
    while t < dur - 0.06:
        f = rng.uniform(1800, 3200) if not hollow else rng.uniform(900, 1600)
        c = ball_click(f, amp=rng.uniform(0.35, 0.9), ring=0.003 if not hollow else 0.012)
        i = int(t * SR); out[i:i + len(c)] += c[: n - i]
        t += rng.uniform(0.035, 0.09) if not hollow else rng.uniform(0.07, 0.16)
    if hollow:
        # metallic can resonance for the empty-can feel
        tt = np.arange(n) / SR
        out += 0.15 * np.sin(2 * np.pi * 420 * tt) * np.exp(-tt / 0.25) * (rng.standard_normal(n) * 0.2 + 1)
    out *= env(n, 0.01, 0.5)
    return out / (np.max(np.abs(out)) + 1e-6) * 0.9

def hiss():
    n = SR  # 1s loop
    x = rng.standard_normal(n)
    x = highpass(x, 1200); x = lowpass(x, 9000)
    # gentle amplitude flutter so it feels like a real nozzle
    tt = np.arange(n) / SR
    x *= 1 + 0.08 * np.sin(2 * np.pi * 7 * tt) + 0.05 * np.sin(2 * np.pi * 23 * tt)
    # crossfade tail into head for a seamless loop
    f = int(0.05 * SR); ramp = np.linspace(0, 1, f)
    x[:f] = x[:f] * ramp + x[-f:] * (1 - ramp)
    x = x[:-f]
    return x / (np.max(np.abs(x)) + 1e-6) * 0.7

def pool():
    dur = 0.7; n = int(SR * dur); tt = np.arange(n) / SR
    # bubbling: a few descending sine blips + wet low noise
    out = np.zeros(n)
    for k in range(4):
        s = int(rng.uniform(0, 0.4) * SR); m = int(0.12 * SR); t = np.arange(m) / SR
        f0 = rng.uniform(500, 900)
        blip = np.sin(2 * np.pi * (f0 * (1 - 0.6 * t / 0.12)) * t) * np.exp(-t / 0.03)
        out[s:s + m] += blip * 0.5
    wet = lowpass(rng.standard_normal(n), 600) * 2.5 * env(n, 0.05, 0.3)
    out += wet
    out *= env(n, 0.01, 0.35)
    return out / (np.max(np.abs(out)) + 1e-6) * 0.8

def click():
    n = int(0.04 * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n) * np.exp(-t / 0.004) + 0.5 * np.sin(2 * np.pi * 2400 * t) * np.exp(-t / 0.006)
    return x / (np.max(np.abs(x)) + 1e-6) * 0.6

os.makedirs(OUT, exist_ok=True)
write('rattle.wav', rattle())
write('empty_rattle.wav', rattle(hollow=True))
write('hiss.wav', hiss())
write('pool.wav', pool())
write('click.wav', click())
print('wrote', sorted(os.listdir(OUT)))
