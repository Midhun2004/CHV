"""
CHV-Guard v6 — database.py
Handles SQLite setup, migrations, and per-request connection management.
"""

import sqlite3
import time
from flask import g

DB_PATH = 'chvguard.db'


# ─────────────────────────────────────────────
# PER-REQUEST CONNECTION
# ─────────────────────────────────────────────

def get_db():
    db = getattr(g, '_db', None)
    if db is None:
        db = g._db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
    return db


def close_db(exc):
    db = getattr(g, '_db', None)
    if db:
        db.close()


# ─────────────────────────────────────────────
# SCHEMA INIT
# ─────────────────────────────────────────────

def init_db(app):
    with app.app_context():
        db = sqlite3.connect(DB_PATH)
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            username   TEXT PRIMARY KEY,
            pwd_hash   TEXT NOT NULL,
            face_base  TEXT,
            phrase     TEXT,
            voiceprint TEXT,
            mouse_json TEXT
        );
        CREATE TABLE IF NOT EXISTS plain_files (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            owner      TEXT NOT NULL,
            name       TEXT NOT NULL,
            size       INTEGER NOT NULL,
            ftype      TEXT NOT NULL,
            content    TEXT NOT NULL,
            created_at REAL NOT NULL,
            ipfs_cid   TEXT
        );
        CREATE TABLE IF NOT EXISTS blockchain (
            idx        INTEGER PRIMARY KEY,
            timestamp  REAL NOT NULL,
            owner      TEXT NOT NULL,
            proof      INTEGER NOT NULL,
            prev_hash  TEXT NOT NULL,
            file_name  TEXT NOT NULL,
            file_size  INTEGER NOT NULL,
            file_type  TEXT NOT NULL,
            file_hash  TEXT NOT NULL,
            block_hash TEXT NOT NULL UNIQUE
        );
        """)
        db.commit()
        db.close()


def migrate_db():
    """Add columns that may be missing in older databases."""
    db = sqlite3.connect(DB_PATH)
    for sql in [
        'ALTER TABLE users ADD COLUMN voiceprint TEXT',
        'ALTER TABLE plain_files ADD COLUMN ipfs_cid TEXT',
    ]:
        try:
            db.execute(sql)
            db.commit()
        except Exception:
            pass  # Column already exists
    db.close()


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def get_file_row(fid, owner):
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    row = db.execute(
        'SELECT * FROM plain_files WHERE id=? AND owner=?', (fid, owner)
    ).fetchone()
    db.close()
    return dict(row) if row else None
