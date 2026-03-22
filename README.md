# CHV-Guard v6 — Secure Biometric Vault

Owner-only access control with face, voice, and mouse behavioural authentication.

---

## Project Structure

```
chvguard_v6/
├── app.py              ← Flask app factory + entry point (run this)
├── routes.py           ← All API and page route handlers
├── database.py         ← SQLite setup, migrations, connection helpers
├── blockchain.py       ← SHA-256 PoW blockchain (difficulty 4)
├── biometrics.py       ← Face detection/comparison + voice Levenshtein
│
├── templates/
│   ├── login.html      ← Login page (account picker → face scan → voice)
│   ├── register.html   ← Registration (credentials → face → mouse → voice)
│   └── vault.html      ← Main vault (files + live CHV trust scoring)
│
├── static/
│   ├── css/
│   │   └── shared.css  ← Shared design system styles
│   └── js/
│       ├── particles.js ← Animated background + toast notifications
│       ├── login.js     ← Login flow JS
│       ├── register.js  ← Registration flow JS
│       └── vault.js     ← Vault + trust score + CHV monitoring JS
│
├── requirements.txt    ← Python dependencies
├── build_exe.py        ← Script to build standalone EXE via PyInstaller
└── CHVGuard.spec       ← PyInstaller spec file (advanced build control)
```

---

## Running from Source

```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the server
python app.py

# 3. Open in Chrome (required for Web Speech API)
#    Login:    http://127.0.0.1:5000/
#    Register: http://127.0.0.1:5000/register
```

Optional flags:
```bash
python app.py --host 0.0.0.0 --port 8080 --no-debug
```

---

## Building the EXE

```bash
# Install PyInstaller
pip install pyinstaller

# Build (creates dist/CHVGuard/)
python build_exe.py

# Run the EXE
cd dist/CHVGuard
./CHVGuard          # macOS / Linux
CHVGuard.exe        # Windows
```

> The EXE bundles templates and static files automatically.  
> It will open at `http://127.0.0.1:5000` — use Chrome for voice auth.

---

## Security Model — Trust Score

The vault runs **continuous biometric verification (CHV)** in the background.

### Face scoring (every 3 seconds — independent)
| Event | Score |
|-------|-------|
| Owner face matched | **+15** |
| No face detected (owner absent) | **−5** |
| Wrong person / intruder | **−15** |
| 3× consecutive wrong person | **Instant lockout** |

### Mouse scoring (every 5 seconds — independent)
| Event | Score |
|-------|-------|
| Mouse idle ≥ 5s | **−2.5** |
| Mouse anomaly (pattern doesn't match owner baseline) | **−3** |
| Mouse idle + face absent/intruder (combo) | **−5** |
| Mouse anomaly + face not owner (combo) | **−6** |

### Login
- Wrong person detected during face scan → **immediate hard block**, returns to account picker
- Voice authentication requires both **voiceprint similarity ≥ 0.82** AND **phrase Levenshtein ≤ 1**
- 3 failed voice attempts → returns to login

### Vault lock
- Trust score below **40%** → vault locked, session cleared, redirected to login

---

## Database

SQLite file `chvguard.db` is created automatically on first run.

Tables: `users`, `plain_files`, `blockchain`
