"""Procedural audio for the AMS shorts: phonk-style music + SFX, all synthesized (royalty-free).

usage: python3 audio/synth.py out/v001_pt_cues.json out/v001_pt_audio.wav
The cue file comes from export_cues.mjs, i.e. from the same timeline the video renders,
so every hit / break / pop lands on the exact frame it is drawn.
"""
import json
import sys

import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
RNG = np.random.default_rng(7)


# ---------------------------------------------------------------- helpers
def t_axis(dur):
    return np.arange(int(dur * SR)) / SR


def env_ad(n, attack=0.002, decay=0.2, curve=1.0):
    t = np.arange(n) / SR
    a = np.clip(t / max(attack, 1e-4), 0, 1)
    d = np.exp(-np.maximum(t - attack, 0) / max(decay, 1e-4) * curve)
    return a * d


def sweep(f0, f1, dur, shape='exp'):
    t = t_axis(dur)
    k = t / dur
    f = f0 * (f1 / f0) ** k if shape == 'exp' else f0 + (f1 - f0) * k
    return np.sin(2 * np.pi * np.cumsum(f) / SR)


def filt(x, kind, f, order=2):
    if kind == 'band':
        sos = butter(order, [max(20, f[0]), min(SR / 2 - 100, f[1])], btype='band', fs=SR, output='sos')
    else:
        sos = butter(order, min(SR / 2 - 100, max(20, f)), btype=kind, fs=SR, output='sos')
    return sosfilt(sos, x)


def sweep_filter(x, kind, f0, f1, blocks=64):
    """Time-varying filter by block processing with overlap (good enough for sweeps)."""
    n = len(x)
    out = np.zeros(n)
    edges = np.linspace(0, n, blocks + 1).astype(int)
    for i in range(blocks):
        a, b = edges[i], edges[i + 1]
        f = f0 * (f1 / f0) ** (i / max(1, blocks - 1))
        pad = min(a, 2048)
        seg = filt(x[a - pad:b], kind, f)[pad:]
        out[a:b] = seg
    return out


def noise(dur, seed=None):
    r = np.random.default_rng(seed) if seed is not None else RNG
    return r.standard_normal(int(dur * SR))


def norm(x, peak=1.0):
    m = np.max(np.abs(x)) + 1e-9
    return x / m * peak


def bell(freq, dur, decay=0.3, partials=((1, 1), (2.76, 0.4), (5.4, 0.2), (8.9, 0.08))):
    t = t_axis(dur)
    x = sum(a * np.sin(2 * np.pi * freq * p * t) * np.exp(-t / (decay / (1 + p * 0.3))) for p, a in partials)
    return x * env_ad(len(t), 0.001, 10)


def stereo(x, pan=0.0, width=0.0, seed=1):
    l = x * np.sqrt(0.5 * (1 - pan))
    r = x * np.sqrt(0.5 * (1 + pan))
    if width > 0:  # Haas-style decorrelation
        d = int(0.012 * SR * width)
        r = np.concatenate([np.zeros(d), r])[: len(x)]
    return np.stack([l, r], 1)


_IR = {}


def reverb(x, length=1.6, mix=0.25, bright=6000):
    key = (length, bright)
    if key not in _IR:
        n = int(length * SR)
        t = np.arange(n) / SR
        irs = []
        for s in (11, 12):
            ir = np.random.default_rng(s).standard_normal(n) * np.exp(-t / (length / 6.0))
            irs.append(filt(ir, 'low', bright))
        _IR[key] = [ir / np.sqrt(np.sum(ir ** 2)) for ir in irs]
    if x.ndim == 1:
        x = stereo(x)
    wet = np.stack([fftconvolve(x[:, c], _IR[key][c])[: len(x)] for c in range(2)], 1)
    return x * (1 - mix) + wet * mix * 2.2


def pad_to(x, n):
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x),) + x.shape[1:])])


# ---------------------------------------------------------------- SFX
def sfx_tink(o):
    d = 0.18
    x = bell(3100, d, 0.05, ((1, 1), (1.42, 0.6), (2.1, 0.3))) * 0.5
    x[: int(0.004 * SR)] += noise(0.004, 3) * 0.4
    return stereo(norm(x, 0.35), 0.15)


def sfx_hit(o):
    p = float(o.get('power', 0.5))
    d = 0.6
    t = t_axis(d)
    click = filt(noise(d, 21), 'band', (1500, 7000)) * env_ad(len(t), 0.0005, 0.012)
    ring = sum(a * np.sin(2 * np.pi * f * (1 + p * 0.3) * t) * np.exp(-t / dec)
               for f, a, dec in ((820, 1, 0.12), (1290, 0.6, 0.09), (2140, 0.4, 0.06), (3300, 0.25, 0.04)))
    thump = sweep(150, 55, d) * env_ad(len(t), 0.001, 0.07 + 0.08 * p)
    crunch = filt(noise(d, 22), 'low', 2500) * env_ad(len(t), 0.001, 0.05 + 0.05 * p)
    crunch *= (np.random.default_rng(5).random(len(t)) > 0.6)
    x = click * 0.9 + ring * 0.35 * (1 - 0.3 * p) + thump * (0.6 + 0.8 * p) + crunch * 0.6
    x = np.tanh(x * (1.5 + p))
    return reverb(stereo(norm(x, 0.55 + 0.25 * p), 0, 0.3), 0.8, 0.12)


def sfx_break(o):
    s = float(o.get('size', 1.0))
    d = 0.9 + 0.4 * s
    t = t_axis(d)
    n = len(t)
    body = sweep_filter(noise(d, 31), 'low', 5000, 300) * env_ad(n, 0.001, 0.18 * (0.7 + s * 0.4))
    boom = sweep(90, 38, d) * env_ad(n, 0.002, 0.18 + 0.12 * s)
    grains = np.zeros(n)
    r = np.random.default_rng(32)
    for _ in range(int(40 * s)):
        st = int(r.exponential(0.12 * s) * SR)
        if st >= n - 600:
            continue
        g = filt(r.standard_normal(500), 'band', (r.uniform(800, 3500), 7000)) * np.exp(-np.arange(500) / 80)
        grains[st:st + 500] += g * r.uniform(0.2, 0.7)
    x = body * 0.8 + boom * (0.7 + 0.5 * s) + grains * 0.6
    x = np.tanh(x * 1.6)
    return reverb(stereo(norm(x, 0.7), 0, 0.6), 1.2, 0.18)


def sfx_break_big(o):
    base = sfx_break({'size': 1.6})
    d = 1.4
    n = int(d * SR)
    sh = np.zeros(n)
    r = np.random.default_rng(41)
    for _ in range(26):  # crystal shards
        st = int(r.uniform(0, 0.35) * SR)
        b = bell(r.uniform(2500, 7500), 0.5, r.uniform(0.05, 0.15)) * r.uniform(0.2, 0.6)
        sh[st:st + len(b)] += b[: n - st]
    x = pad_to(base, n) + reverb(stereo(norm(sh, 0.35), 0, 1), 1.6, 0.35)
    return x


def sfx_impact_huge(o):
    d = 2.2
    t = t_axis(d)
    n = len(t)
    sub = sweep(95, 28, d) * env_ad(n, 0.002, 0.55)
    hitn = filt(noise(d, 51), 'low', 3500) * env_ad(n, 0.0008, 0.09)
    mid = filt(noise(d, 52), 'band', (200, 1200)) * env_ad(n, 0.001, 0.25)
    x = np.tanh((sub * 1.3 + hitn * 0.9 + mid * 0.5) * 2.2)
    return reverb(stereo(norm(x, 0.95), 0, 0.5), 2.4, 0.3)


def sfx_sub_drop(o):
    d = 1.4
    x = sweep(62, 26, d) * env_ad(int(d * SR), 0.01, 0.6)
    return stereo(norm(np.tanh(x * 1.8), 0.7))


def sfx_crit(o):
    d = 0.9
    x = bell(1568, d, 0.25) * 0.6 + np.concatenate([np.zeros(int(0.05 * SR)), bell(2093, d - 0.05, 0.3)]) * 0.7
    return reverb(stereo(norm(x, 0.32), 0.2, 0.5), 1.2, 0.3)


def sfx_rewind(o):
    d = 0.32
    t = t_axis(d)
    n = len(t)
    chirp = sweep(2400, 180, d) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 34 * t)))
    tape = filt(noise(d, 61), 'band', (800, 6000))
    tape *= 0.5 + 0.5 * np.sin(2 * np.pi * 18 * t)
    x = (chirp * 0.5 + tape * 0.4) * env_ad(n, 0.01, 0.4)
    fade = np.ones(n)
    fade[-int(0.03 * SR):] = np.linspace(1, 0, int(0.03 * SR))
    return stereo(norm(np.tanh(x * 2) * fade, 0.45), 0, 0.4)


def sfx_whoosh(o, rising=False):
    d = 0.32
    n = int(d * SR)
    t = np.arange(n) / SR
    x = sweep_filter(noise(d, 71), 'low', 300 if rising else 600, 9000 if rising else 6000)
    x = filt(x, 'high', 250)
    shape = np.sin(np.pi * np.clip(t / d, 0, 1)) ** (2 if not rising else 3)
    if rising:
        shape = np.clip(t / d, 0, 1) ** 3
    x = x * shape
    return stereo(norm(x, 0.35 * float(o.get('gain', 1))), 0, 1)


def sfx_whoosh_in(o):
    return sfx_whoosh({'gain': 1.6 * float(o.get('gain', 1))}, rising=True)


def _arp(notes, step, decay, gain):
    n = int((len(notes) * step + 1.2) * SR)
    x = np.zeros(n)
    for i, f in enumerate(notes):
        b = bell(f, 1.0, decay)
        st = int(i * step * SR)
        x[st:st + len(b)] += b[: n - st] * (0.7 + 0.3 * i / len(notes))
    return norm(x, gain)


def sfx_equip(o):
    tier = o.get('tier', 'rare')
    scale = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0, 2637.0]
    count = {'rare': 4, 'epic': 5, 'legendary': 6, 'mythic': 8}.get(tier, 4)
    x = _arp(scale[:count], 0.035 if tier != 'mythic' else 0.03, 0.35, 0.4)
    sw = sfx_whoosh_in({'gain': 0.5})[:, 0]
    x = pad_to(x, max(len(x), len(sw))) + pad_to(sw, max(len(x), len(sw))) * 0.6
    if tier in ('legendary', 'mythic'):
        d = 1.2
        t = t_axis(d)
        chord = [261.6, 329.6, 392.0, 523.3] if tier == 'legendary' else [277.2, 349.2, 415.3, 554.4, 698.5]
        padx = sum(filt(np.sign(np.sin(2 * np.pi * f * t * (1 + dt))), 'low', 2400) for f in chord for dt in (-0.004, 0.004))
        padx = padx * env_ad(len(t), 0.02, 0.45)
        x = pad_to(x, max(len(x), len(padx))) + pad_to(norm(padx, 0.3), max(len(x), len(padx)))
    return reverb(stereo(norm(x, 0.55), 0, 0.8), 1.8, 0.35)


def sfx_count_up(o):
    d = 0.4
    n = int(d * SR)
    x = np.zeros(n)
    for i in range(12):
        st = int((i / 12) ** 0.8 * 0.33 * SR)
        b = bell(900 + i * 110, 0.06, 0.015, ((1, 1), (2, 0.3)))
        x[st:st + len(b)] += b[: n - st]
    return stereo(norm(x, 0.22), -0.1)


def sfx_riser(o):
    d = float(o.get('dur', 0.5))
    t = t_axis(d)
    n = len(t)
    x = sweep_filter(noise(d, 81), 'high', 300, 6000) * (t / d) ** 2
    tone = sweep(180, 1400, d) * (t / d) ** 2.5
    return stereo(norm(x * 0.7 + tone * 0.35, 0.5), 0, 1)


def sfx_charge(o):
    d = float(o.get('dur', 0.4))
    t = t_axis(d)
    f = 110 * (4 ** (t / d))
    saw = 2 * ((np.cumsum(f) / SR) % 1) - 1
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * (20 + 30 * t / d) * t)
    x = filt(saw, 'low', 3000) * trem * (0.3 + 0.7 * t / d)
    return stereo(norm(np.tanh(x * 2), 0.38), 0, 0.5)


def sfx_pop(o):
    d = 0.12
    x = sweep(520, 1250, d) * env_ad(int(d * SR), 0.001, 0.035)
    return stereo(norm(x, 0.3 * float(o.get('gain', 1))))


def sfx_stamp(o):
    d = 0.6
    t = t_axis(d)
    n = len(t)
    x = sweep(160, 50, d) * env_ad(n, 0.001, 0.09) + filt(noise(d, 91), 'band', (900, 4000)) * env_ad(n, 0.001, 0.03)
    return reverb(stereo(norm(np.tanh(x * 2), 0.6)), 0.8, 0.15)


def sfx_reward_flurry(o):
    d = float(o.get('dur', 1.0)) + 0.6
    n = int(d * SR)
    out = np.zeros((n, 2))
    r = np.random.default_rng(101)
    pent = [1046.5, 1174.7, 1318.5, 1568.0, 1760.0, 2093.0, 2349.3]
    for i in range(14):
        st = int((i * 0.06 + r.uniform(0, 0.03)) * SR)
        b = bell(pent[r.integers(len(pent))] * (1 + i * 0.01), 0.35, 0.08)
        bs = stereo(b, r.uniform(-0.7, 0.7))
        out[st:st + len(bs)] += bs[: n - st] * 0.5
    return reverb(norm(out, 0.32), 1.0, 0.25)


def sfx_logo_hit(o):
    d = 1.6
    t = t_axis(d)
    n = len(t)
    chord = [130.8, 155.6, 196.0, 261.6, 311.1, 392.0]
    st = sum(filt(2 * ((f * (1 + dt) * t) % 1) - 1, 'low', 3500) for f in chord for dt in (-0.006, 0.006))
    x = st * env_ad(n, 0.003, 0.22) * 0.5 + sweep(90, 35, d) * env_ad(n, 0.002, 0.3)
    return reverb(stereo(norm(np.tanh(x * 1.5), 0.6), 0, 0.6), 2.0, 0.3)


# extra cues for V002 / V006
def sfx_punch(o):
    d = 0.3
    t = t_axis(d)
    n = len(t)
    x = sweep(180, 70, d) * env_ad(n, 0.001, 0.05) + filt(noise(d, 111), 'band', (500, 3000)) * env_ad(n, 0.001, 0.02) * 0.8
    return stereo(norm(np.tanh(x * 2), 0.42 * float(o.get('gain', 1))), float(o.get('pan', 0)))


def sfx_beam(o):
    d = float(o.get('dur', 1.0))
    t = t_axis(d)
    n = len(t)
    buzz = sum(np.sin(2 * np.pi * f * t + 3 * np.sin(2 * np.pi * 7 * t)) for f in (110, 220.5, 331, 445))
    hiss = filt(noise(d, 121), 'band', (2000, 9000)) * 0.6
    x = (buzz * 0.4 + hiss) * np.clip(t / 0.05, 0, 1) * np.clip((d - t) / 0.12, 0, 1)
    x = filt(np.tanh(x * 1.5), 'low', 7000)
    return stereo(norm(x, 0.42 * float(o.get('gain', 1))), float(o.get('pan', 0)), 0.5)


def sfx_tick(o):
    d = 0.05
    x = bell(2600, d, 0.008, ((1, 1), (1.5, 0.4)))
    return stereo(norm(x, 0.16 * float(o.get('gain', 1))))


def sfx_heartbeat(o):
    d = 0.6
    t = t_axis(d)
    n = len(t)
    beat = lambda: sweep(70, 40, 0.18) * env_ad(int(0.18 * SR), 0.004, 0.05)
    x = np.zeros(n)
    b = beat()
    x[: len(b)] += b
    st = int(0.2 * SR)
    x[st:st + len(b)] += b * 0.7
    return stereo(norm(np.tanh(x * 2), 0.65 * float(o.get('gain', 1))))


def sfx_glitch(o):
    d = float(o.get('dur', 0.25))
    t = t_axis(d)
    n = len(t)
    x = np.sign(np.sin(2 * np.pi * 180 * t)) * (np.random.default_rng(131).random(n) > 0.4)
    x = filt(x, 'band', (300, 5000)) * (np.floor(t * 40) % 2)
    return stereo(norm(x, 0.25), 0, 0.5)


def sfx_vs(o):
    d = 1.0
    t = t_axis(d)
    n = len(t)
    x = sweep(120, 40, d) * env_ad(n, 0.001, 0.25) + filt(noise(d, 141), 'band', (1500, 8000)) * env_ad(n, 0.001, 0.08)
    zap = sweep(3000, 300, 0.25)
    x[: len(zap)] += zap * env_ad(len(zap), 0.001, 0.08) * 0.4
    return reverb(stereo(norm(np.tanh(x * 2), 0.7)), 1.4, 0.25)


def sfx_ding(o):
    x = bell(1760, 1.2, 0.5) + np.concatenate([np.zeros(int(0.09 * SR)), bell(2637, 1.11, 0.5)])
    return reverb(stereo(norm(x, 0.35)), 1.6, 0.3)


def sfx_shimmer(o):
    d = float(o.get('dur', 1.0))
    n = int((d + 1) * SR)
    x = np.zeros(n)
    r = np.random.default_rng(151)
    for i in range(int(d * 26)):
        st = int(r.uniform(0, d) * SR)
        b = bell(r.uniform(2000, 6000), 0.4, 0.06) * r.uniform(0.2, 0.5)
        x[st:st + len(b)] += b[: n - st]
    return reverb(stereo(norm(x, 0.22 * float(o.get('gain', 1))), 0, 1), 2.0, 0.45)


def sfx_drone(o):
    d = float(o.get('dur', 2.0))
    t = t_axis(d)
    x = sum(np.sin(2 * np.pi * f * t + np.sin(2 * np.pi * 0.3 * t)) for f in (55, 82.4, 110.3, 164.8))
    x = x * np.clip(t / 0.3, 0, 1) * np.clip((d - t) / 0.2, 0, 1)
    return reverb(stereo(norm(x, 0.25 * float(o.get('gain', 1))), 0, 1), 2.0, 0.4)


SFX = {k[4:]: v for k, v in globals().items() if k.startswith('sfx_')}
GAIN = {'hit': 0.9, 'break': 0.95, 'break_big': 1.0, 'impact_huge': 1.0, 'equip': 0.85, 'riser': 0.8}


# ---------------------------------------------------------------- music (phonk @ bpm)
NOTE = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def drum_kick(drive=1.0):
    d = 0.45
    t = t_axis(d)
    x = sweep(160, 48, d) * env_ad(len(t), 0.001, 0.16)
    x[: int(0.003 * SR)] += noise(0.003, 201) * 0.4
    return np.tanh(x * 2.2 * drive)


def drum_clap():
    d = 0.35
    t = t_axis(d)
    n = len(t)
    nz = filt(noise(d, 211), 'band', (900, 5500))
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        e += env_ad(n, 0.0005, 0.012) * (t >= off) * np.roll(np.ones(n), 0)
    e += env_ad(n, 0.0005, 0.12) * 0.6
    return nz * e * 0.8


def drum_hat(open_=False):
    d = 0.25 if open_ else 0.06
    x = filt(noise(d, 221), 'high', 7500) * env_ad(int(d * SR), 0.0005, 0.08 if open_ else 0.015)
    return x * 0.35


def cowbell(freq, d=0.22):
    t = t_axis(d)
    r = freq / 540.0
    x = np.sign(np.sin(2 * np.pi * 540 * r * t)) + np.sign(np.sin(2 * np.pi * 800 * r * t))
    x = filt(x, 'band', (400 * r, 6000)) * env_ad(len(t), 0.001, 0.08)
    return x * 0.5


def bass808(freq, d):
    t = t_axis(d)
    f = freq * (1 + 0.6 * np.exp(-t / 0.02))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_ad(len(t), 0.002, max(0.25, d * 0.6))
    return np.tanh(x * 2.5) * 0.6


def place(buf, x, t, gain=1.0, pan=0.0):
    st = int(round(t * SR))
    if st >= len(buf) or st + len(x) <= 0:
        return
    if x.ndim == 1:
        x = stereo(x, pan)
    if st < 0:
        x = x[-st:]
        st = 0
    end = min(len(buf), st + len(x))
    buf[st:end] += x[: end - st] * gain


# 2-bar phrases in C# minor. steps are 16ths.
MELODY = [61, None, 61, 64, None, 61, None, 56, None, 59, None, 61, 64, None, 66, 64,
          61, None, 61, 64, None, 61, None, 68, None, 66, None, 64, 61, None, 59, 56]
BASS = [37, 37, 33, 35]  # per bar (C#, C#, A, B)


def music_section(buf, sec, bpm):
    t0, t1, mode = sec['t0'], sec['t1'], sec['mode']
    step = 60.0 / bpm / 4
    nsteps = int(np.ceil((t1 - t0) / step))
    sub = np.zeros((int((t1 - t0 + 2.0) * SR), 2))
    kick, clap, hat, ohat = drum_kick(1.3 if mode == 'drop' else 1.0), drum_clap(), drum_hat(), drum_hat(True)
    kick_steps = {0, 7, 10} if mode != 'drop' else {0, 3, 7, 10, 14}
    for i in range(nsteps):
        s = i % 16
        bar = i // 16
        t = i * step
        if mode in ('tension',):
            if s in (0, 8):
                place(sub, drum_hat(True), t, 0.5)
            continue
        if s in kick_steps:
            place(sub, kick, t, 0.9)
            note = BASS[bar % 4] + (12 if mode == 'drop' and s == 14 else 0)
            place(sub, bass808(NOTE(note), step * (3 if s != 14 else 2)), t, 0.75 if mode != 'drop' else 0.95)
        if s in (4, 12):
            place(sub, clap, t, 0.75)
        if mode != 'drums_light':
            if s % 2 == 0 or (s >= 13 and mode in ('full', 'drop')):
                place(sub, hat, t, 0.6 + 0.2 * (s % 4 == 2), 0.25)
            if mode == 'drop' and s in (2, 10):
                place(sub, ohat, t, 0.5, -0.2)
        if mode in ('full', 'drop', 'outro', 'muffled'):
            m = MELODY[i % 32]
            if m is not None:
                place(sub, cowbell(NOTE(m + 12)), t, 0.55, -0.15 if s % 2 else 0.15)
    n = int((t1 - t0) * SR)
    sub = sub[: n + int(0.02 * SR)]
    if mode == 'muffled':
        sub = np.stack([filt(sub[:, c], 'low', 650, 4) for c in range(2)], 1) * 0.55
    if mode == 'outro':
        sub = np.stack([sweep_filter(sub[:, c], 'low', 9000, 500, 48) for c in range(2)], 1)
    # declick the edges
    f = int(0.006 * SR)
    sub[:f] *= np.linspace(0, 1, f)[:, None]
    sub[n - f:n] *= np.linspace(1, 0, f)[:, None]
    sub[n:] = 0
    place(buf, sub, t0)


# ---------------------------------------------------------------- mix
def limit(x, ceiling, look=0.004, release=0.08):
    """Look-ahead peak limiter: gain follows the upcoming peak, recovers exponentially."""
    peak = np.abs(x).max(1)
    la = int(look * SR)
    # max over the look-ahead window
    from scipy.ndimage import maximum_filter1d
    p = maximum_filter1d(peak, size=2 * la + 1, origin=0)
    need = np.minimum(1.0, ceiling / np.maximum(p, 1e-9))
    g = np.empty_like(need)
    a = np.exp(-1.0 / (release * SR))
    cur = 1.0
    for i in range(len(need)):  # attack instant (look-ahead covers it), release smooth
        cur = need[i] if need[i] < cur else need[i] + (cur - need[i]) * a
        g[i] = cur
    k = int(0.002 * SR)
    g = np.convolve(g, np.ones(k) / k, mode='same')
    g = np.minimum(g, need)
    return x * g[:, None]


def render(cues):
    dur = cues['duration']
    n = int((dur + 0.0) * SR)
    music = np.zeros((n + SR * 3, 2))
    fx = np.zeros((n + SR * 3, 2))
    for sec in cues['music']['sections']:
        music_section(music, sec, cues['music']['bpm'])
    for c in cues.get('clips', []):  # original game audio from real footage
        import wave
        with wave.open(c['file']) as w:
            a = np.frombuffer(w.readframes(w.getnframes()), '<i2').reshape(-1, w.getnchannels()) / 32768.0
        if a.shape[1] == 1:
            a = np.repeat(a, 2, 1)
        a = a[: int(c['dur'] * SR)]
        f = min(len(a), int(0.01 * SR))
        a[:f] *= np.linspace(0, 1, f)[:, None]; a[len(a) - f:] *= np.linspace(1, 0, f)[:, None]
        place(fx, a, c['t'], float(c.get('gain', 0.8)))
    for c in cues['sfx']:
        fn = SFX.get(c['name'])
        if fn is None:
            print('missing sfx', c['name'])
            continue
        x = fn(c)
        place(fx, x, c['t'], GAIN.get(c['name'], 0.85) * float(c.get('mix', 1.0)))
    # sidechain: duck music under loud SFX
    env = np.abs(fx).max(1)
    k = int(0.08 * SR)
    env = np.convolve(env, np.ones(k) / k, mode='same')
    duck = 1 - np.clip(env * 1.4, 0, 0.55)
    mix = music * 0.62 * duck[:, None] + fx
    mix = mix[:n]
    # master: tame fizz above 15k, set level, then a look-ahead peak limiter at -1 dBFS
    mix = np.stack([filt(filt(mix[:, c], 'low', 15000), 'high', 28) for c in range(2)], 1)
    rms = np.sqrt(np.mean(mix ** 2)) + 1e-9
    mix *= 10 ** (-13.5 / 20) / rms
    mix = limit(mix, 10 ** (-1 / 20))
    f = int(0.01 * SR)
    mix[-f:] *= np.linspace(1, 0, f)[:, None]
    return mix


def write_wav(path, x):
    import wave
    y = np.clip(x, -1, 1)
    pcm = (y * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(pcm.tobytes())


if __name__ == '__main__':
    cues = json.load(open(sys.argv[1]))
    write_wav(sys.argv[2], render(cues))
    print('wrote', sys.argv[2])
