"""
CHV-Guard v6 — biometrics.py
Face detection/comparison and voice phrase matching utilities.
All face operations use OpenCV Haar cascades.
All voice matching uses Levenshtein distance on transcribed text.
"""

import base64
import cv2
import numpy as np


# ─────────────────────────────────────────────
# FACE
# ─────────────────────────────────────────────

face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'
)


def decode_frame(b64_data_url: str):
    """Decode a base64 data-URL image → (BGR frame, grayscale frame)."""
    data  = base64.b64decode(b64_data_url.split(",")[1])
    arr   = np.frombuffer(data, np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return None, None
    return frame, cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)


def detect_faces(gray):
    """Return list of (x, y, w, h) face rectangles."""
    return face_cascade.detectMultiScale(gray, 1.1, 4, minSize=(55, 55))


def compare_faces(gray_frame, stored_b64: str):
    """
    Compare the largest face in gray_frame against stored_b64 baseline.

    Returns:
        'match'        — score ≥ 0.58  (owner confirmed)
        'mismatch'     — 0.28 ≤ score < 0.58  (uncertain)
        'wrong_person' — score < 0.28  (clearly different face)
        'no_face'      — no face detected in frame
        'error'        — decoding failure
    """
    faces = detect_faces(gray_frame)
    if not len(faces):
        return 'no_face', 0.0

    x, y, w, h = faces[0]
    cur  = cv2.resize(gray_frame[y:y + h, x:x + w], (100, 100))
    base = cv2.imdecode(
        np.frombuffer(base64.b64decode(stored_b64), np.uint8),
        cv2.IMREAD_GRAYSCALE
    )
    if base is None:
        return 'error', 0.0

    score = float(np.max(cv2.matchTemplate(cur, base, cv2.TM_CCOEFF_NORMED)))

    if score >= 0.58:
        return 'match', round(score, 3)
    if score >= 0.28:
        return 'mismatch', round(score, 3)
    return 'wrong_person', round(score, 3)


def crop_face_b64(gray_frame) -> str | None:
    """
    Detect a face and return a 100×100 JPEG base64 string for enrollment,
    or None if no face found.
    """
    faces = detect_faces(gray_frame)
    if not len(faces):
        return None
    x, y, w, h = faces[0]
    resized = cv2.resize(gray_frame[y:y + h, x:x + w], (100, 100))
    return base64.b64encode(cv2.imencode('.jpg', resized)[1]).decode()


# ─────────────────────────────────────────────
# VOICE — Levenshtein distance
# ─────────────────────────────────────────────

def levenshtein(a: str, b: str) -> int:
    a, b = a.strip().lower(), b.strip().lower()
    if a == b:
        return 0
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, ca in enumerate(a):
        cur = [i + 1]
        for j, cb in enumerate(b):
            cur.append(min(prev[j + 1] + 1, cur[j] + 1, prev[j] + (ca != cb)))
        prev = cur
    return prev[-1]


def verify_voice(
    heard_list: list[str],
    live_vp: list[float],
    stored_phrase: str,
    stored_vp: list[float]
) -> dict:
    """
    Dual voice check:
      1. Phrase text  — Levenshtein ≤ 1 edit
      2. Voiceprint   — cosine similarity ≥ 0.82

    Both must pass.  Returns {'status': 'ok'} or {'status': 'fail', 'reason': ...}
    """
    # ── Check 1: phrase text ──
    best_dist = 999
    for h in heard_list:
        d = levenshtein(h, stored_phrase)
        if d < best_dist:
            best_dist = d
    phrase_ok = (best_dist <= 1)

    # ── Check 2: voiceprint cosine similarity ──
    vp_ok = False
    if live_vp and stored_vp and len(live_vp) == len(stored_vp):
        dot = sum(a * b for a, b in zip(live_vp, stored_vp))
        na  = sum(a * a for a in live_vp) ** 0.5
        nb  = sum(b * b for b in stored_vp) ** 0.5
        sim = dot / (na * nb) if na * nb > 0 else 0.0
        vp_ok = (sim >= 0.82)

    if phrase_ok and vp_ok:
        return {'status': 'ok'}
    if not phrase_ok and not vp_ok:
        return {'status': 'fail', 'reason': 'both_failed'}
    if not phrase_ok:
        return {'status': 'fail', 'reason': 'phrase_failed'}
    return {'status': 'fail', 'reason': 'voice_failed'}
