"""
Masters the generated notification sounds into app-ready files.

    python scripts/master-sounds.py

Sources are the raw ElevenLabs downloads in assets/sounds/source/ (never modified); output
goes to assets/sounds/ under the same names, which Android accepts for res/raw (lowercase,
underscores, no spaces). To swap a sound, replace its source file and run this again.

Per file: mono -> DC removed -> leading silence trimmed -> cut where the sound has actually
decayed (capped per role) -> short fades so nothing clicks -> gated-RMS levelling so the set
plays at one volume -> soft limiter to a -1 dBFS ceiling.
"""

import os
import numpy as np
from scipy.io import wavfile

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'sounds')

SOURCE = os.path.join(OUT, 'source')

# name (source and output), max seconds, fade-out seconds, target RMS dB
SOUNDS = [
    ('rest_over', 1.2, 0.08, -16.0),
    ('reminder', 1.2, 0.08, -16.0),
    ('water', 1.0, 0.06, -16.0),
    ('achievement', 1.4, 0.10, -16.0),
    ('milestone', 1.6, 0.10, -16.0),
    # Plays on every ticked set, so it sits 4 dB under the rest.
    ('set_complete', 0.35, 0.025, -20.0),
]

CEILING_DB = -1.0


def db(x: float) -> float:
    return 20 * np.log10(max(x, 1e-12))


def load(path: str):
    sr, x = wavfile.read(path)
    scale = {np.dtype('int16'): 32768.0, np.dtype('int32'): 2.0 ** 31}.get(x.dtype, 1.0)
    x = x.astype(np.float64) / scale
    if x.ndim > 1:
        x = x.mean(axis=1)
    return sr, x - np.mean(x)


def short_rms(x: np.ndarray, win: int) -> np.ndarray:
    pad = np.pad(x ** 2, (win // 2, win - win // 2 - 1))
    return np.sqrt(np.convolve(pad, np.ones(win) / win, mode='valid'))


def master(sr, x, max_s, fade_s, target_db):
    peak = np.max(np.abs(x))
    win = int(sr * 0.01)
    level = short_rms(x, win)

    # Start: first moment the sound is within 45 dB of its peak, with 3 ms of pre-roll.
    start = max(0, int(np.argmax(np.abs(x) > peak * 10 ** (-45 / 20))) - int(sr * 0.003))
    # End: last moment the 10 ms level is within 50 dB of the peak, plus a little air.
    alive = np.where(level > peak * 10 ** (-50 / 20))[0]
    end = min(len(x), (alive[-1] if len(alive) else len(x)) + int(sr * 0.02))
    end = min(end, start + int(sr * max_s))
    y = x[start:end].copy()

    # Fades: 2 ms in (kills any click at the cut), raised-cosine out.
    fi = max(1, int(sr * 0.002))
    y[:fi] *= np.linspace(0, 1, fi)
    fo = min(len(y), max(1, int(sr * fade_s)))
    y[-fo:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fo)))

    # Gated RMS: loudness of the part that is actually sounding, so a long quiet tail does
    # not make a short sound come out too loud.
    lvl = short_rms(y, int(sr * 0.05))
    gate = lvl > np.max(lvl) * 10 ** (-20 / 20)
    rms = np.sqrt(np.mean(y[gate] ** 2)) if gate.any() else np.sqrt(np.mean(y ** 2))
    y *= 10 ** (target_db / 20) / rms

    # Soft limiter: transparent below -4 dBFS, smoothly compressing into the ceiling above.
    ceiling = 10 ** (CEILING_DB / 20)
    knee = 10 ** (-4 / 20)
    mag = np.abs(y)
    over = mag > knee
    headroom = ceiling - knee
    mag[over] = knee + headroom * np.tanh((mag[over] - knee) / headroom)
    return np.sign(y) * mag


os.makedirs(OUT, exist_ok=True)
print(f"{'file':14s} {'len':>6s} {'peak':>6s} {'rms':>6s}")
for name, max_s, fade_s, target in SOUNDS:
    sr, x = load(os.path.join(SOURCE, f'{name}.wav'))
    y = master(sr, x, max_s, fade_s, target)
    wavfile.write(os.path.join(OUT, f'{name}.wav'), sr, (y * 32767).astype(np.int16))
    print(f"{name:14s} {len(y) / sr:5.2f}s {db(np.max(np.abs(y))):6.1f} {db(np.sqrt(np.mean(y ** 2))):6.1f}")
