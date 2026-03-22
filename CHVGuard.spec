# -*- mode: python ; coding: utf-8 -*-
# CHV-Guard v6 — CHVGuard.spec
# PyInstaller spec file — use instead of build_exe.py for fine-grained control.
#
# Usage:
#   pyinstaller CHVGuard.spec

import sys
from pathlib import Path

sep = ';' if sys.platform == 'win32' else ':'

a = Analysis(
    ['app.py'],
    pathex=[str(Path('.').resolve())],
    binaries=[],
    datas=[
        ('templates', 'templates'),
        ('static',    'static'),
    ],
    hiddenimports=[
        'flask',
        'cv2',
        'numpy',
        'sqlite3',
        'biometrics',
        'blockchain',
        'database',
        'routes',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='CHVGuard',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,   # Set False to hide terminal window on Windows
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    # icon='icon.ico',  # Uncomment and set path for custom icon
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='CHVGuard',
)
