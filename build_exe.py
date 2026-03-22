"""
CHV-Guard v6 — build_exe.py
Builds a standalone Windows/macOS/Linux EXE using PyInstaller.

Usage:
    python build_exe.py

Output:
    dist/CHVGuard/CHVGuard.exe   (Windows)
    dist/CHVGuard/CHVGuard       (macOS / Linux)

Requirements:
    pip install pyinstaller opencv-python flask numpy
"""

import os
import sys
import shutil
import subprocess

APP_NAME   = 'CHVGuard'
MAIN_ENTRY = 'app.py'
ICON_PATH  = None  # Set to 'icon.ico' if you have one (Windows .ico)

# Extra data to bundle: (source_path, dest_folder_inside_exe)
DATAS = [
    ('templates', 'templates'),
    ('static',    'static'),
]

# Hidden imports that PyInstaller may miss
HIDDEN_IMPORTS = [
    'flask',
    'cv2',
    'numpy',
    'sqlite3',
    'hashlib',
    'biometrics',
    'blockchain',
    'database',
    'routes',
]


def build():
    print('='*55)
    print('  CHV-Guard v6 — PyInstaller Build')
    print('='*55)

    # Clean previous build
    for d in ['build', f'dist/{APP_NAME}']:
        if os.path.exists(d):
            shutil.rmtree(d)
            print(f'  Cleaned: {d}')

    # Build --add-data arguments
    sep = ';' if sys.platform == 'win32' else ':'
    add_data_args = []
    for src, dst in DATAS:
        add_data_args += ['--add-data', f'{src}{sep}{dst}']

    # Build --hidden-import arguments
    hidden_args = []
    for h in HIDDEN_IMPORTS:
        hidden_args += ['--hidden-import', h]

    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--name', APP_NAME,
        '--onedir',          # folder bundle (faster startup than --onefile)
        '--noconfirm',
        '--clean',
        *add_data_args,
        *hidden_args,
    ]

    if ICON_PATH and os.path.exists(ICON_PATH):
        cmd += ['--icon', ICON_PATH]

    cmd.append(MAIN_ENTRY)

    print(f'\n  Running: {" ".join(cmd)}\n')
    result = subprocess.run(cmd, check=False)

    if result.returncode == 0:
        print('\n' + '='*55)
        print(f'  ✅  Build successful!')
        exe = 'CHVGuard.exe' if sys.platform == 'win32' else 'CHVGuard'
        print(f'  📦  Output: dist/{APP_NAME}/{exe}')
        print('='*55)
        print('\n  To run:')
        print(f'    cd dist/{APP_NAME} && ./{exe}')
        print(f'    Then open: http://127.0.0.1:5000\n')
    else:
        print('\n  ❌  Build failed. Check output above for errors.')
        sys.exit(1)


if __name__ == '__main__':
    build()
