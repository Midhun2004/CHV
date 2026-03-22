"""
CHV-Guard v6 — blockchain.py
SHA-256 Proof-of-Work blockchain (difficulty 4 leading zeros).
Blocks are stored in SQLite — one block per committed file.
"""

import hashlib
import json
import time
import sqlite3

from database import DB_PATH

TARGET = '0000'


# ─────────────────────────────────────────────
# HASHING
# ─────────────────────────────────────────────

def _bhash(idx, ts, owner, proof, prev, fname, fsize, ftype, fhash):
    return hashlib.sha256(json.dumps(
        dict(idx=idx, ts=ts, owner=owner, proof=proof, prev=prev,
             fname=fname, fsize=fsize, ftype=ftype, fhash=fhash),
        sort_keys=True
    ).encode()).hexdigest()


# ─────────────────────────────────────────────
# MINING
# ─────────────────────────────────────────────

def mine_block(owner, prev_hash, prev_idx, fname, fsize, ftype, content_bytes):
    idx   = prev_idx + 1
    ts    = time.time()
    fh    = hashlib.sha256(content_bytes).hexdigest()
    proof = 0
    while True:
        h = _bhash(idx, ts, owner, proof, prev_hash, fname, fsize, ftype, fh)
        if h.startswith(TARGET):
            return dict(
                idx=idx, timestamp=ts, owner=owner, proof=proof,
                prev_hash=prev_hash, file_name=fname, file_size=fsize,
                file_type=ftype, file_hash=fh, block_hash=h
            )
        proof += 1


# ─────────────────────────────────────────────
# CHAIN QUERIES
# ─────────────────────────────────────────────

def get_chain_db():
    db   = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    rows = db.execute('SELECT * FROM blockchain ORDER BY idx').fetchall()
    db.close()
    return [dict(r) for r in rows]


def last_block_db():
    db  = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    row = db.execute('SELECT * FROM blockchain ORDER BY idx DESC LIMIT 1').fetchone()
    db.close()
    return dict(row) if row else {'idx': 0, 'block_hash': '0' * 64}


def is_chain_valid():
    chain = get_chain_db()
    for i in range(1, len(chain)):
        b = chain[i]
        if b['prev_hash'] != chain[i - 1]['block_hash']:
            return False
        if _bhash(b['idx'], b['timestamp'], b['owner'], b['proof'], b['prev_hash'],
                  b['file_name'], b['file_size'], b['file_type'], b['file_hash']) != b['block_hash']:
            return False
        if not b['block_hash'].startswith(TARGET):
            return False
    return True


def ensure_genesis(app):
    with app.app_context():
        db = sqlite3.connect(DB_PATH)
        if db.execute('SELECT COUNT(*) FROM blockchain').fetchone()[0] == 0:
            h = _bhash(0, 0, 'system', 0, '0' * 64, 'genesis', 0, 'genesis', '0' * 64)
            db.execute(
                'INSERT INTO blockchain VALUES(?,?,?,?,?,?,?,?,?,?)',
                (0, 0, 'system', 0, '0' * 64, 'genesis', 0, 'genesis', '0' * 64, h)
            )
            db.commit()
        db.close()
