"""
CHV-Guard v6 — routes.py
All Flask route definitions. Imports helpers from other modules.
"""

import base64
import hashlib
import io
import json
import sqlite3
import time

import requests as _req
from flask import Blueprint, jsonify, render_template, request

from biometrics import compare_faces, crop_face_b64, decode_frame, verify_voice
from blockchain  import (ensure_genesis, get_chain_db, is_chain_valid,
                          last_block_db, mine_block)
from database    import DB_PATH, get_db, get_file_row

bp = Blueprint('main', __name__)


# ─────────────────────────────────────────────
# PAGE ROUTES
# ─────────────────────────────────────────────

@bp.route('/')
def login_page():
    return render_template('login.html')


@bp.route('/register')
def register_page():
    return render_template('register.html')


@bp.route('/vault')
def vault_page():
    return render_template('vault.html')


# ─────────────────────────────────────────────
# USER LIST
# ─────────────────────────────────────────────

@bp.route('/api/users')
def list_users():
    rows = get_db().execute('SELECT username FROM users ORDER BY username').fetchall()
    return jsonify({'users': [r['username'] for r in rows]})


# ─────────────────────────────────────────────
# REGISTRATION
# ─────────────────────────────────────────────

@bp.route('/api/reg_init', methods=['POST'])
def reg_init():
    d = request.get_json()
    u = d.get('user', '').strip()
    if not u:
        return jsonify({'status': 'error'}), 400
    db = get_db()
    if db.execute('SELECT 1 FROM users WHERE username=?', (u,)).fetchone():
        return jsonify({'status': 'exists'})
    db.execute(
        'INSERT INTO users(username,pwd_hash) VALUES(?,?)',
        (u, hashlib.sha256(d.get('pwd', '').encode()).hexdigest())
    )
    db.commit()
    return jsonify({'status': 'ok'})


@bp.route('/api/reg_face', methods=['POST'])
def reg_face():
    d = request.get_json()
    u = d.get('user', '')
    _, gray = decode_frame(d['image'])
    if gray is None:
        return jsonify({'status': 'error'})
    b64 = crop_face_b64(gray)
    if b64:
        get_db().execute('UPDATE users SET face_base=? WHERE username=?', (b64, u))
        get_db().commit()
        return jsonify({'status': 'found'})
    return jsonify({'status': 'not_found'})


@bp.route('/api/reg_mouse', methods=['POST'])
def reg_mouse():
    d = request.get_json()
    u = d.get('user', '')
    get_db().execute(
        'UPDATE users SET mouse_json=? WHERE username=?',
        (json.dumps(d.get('baseline', {})), u)
    )
    get_db().commit()
    return jsonify({'status': 'ok'})


@bp.route('/api/reg_voice', methods=['POST'])
def reg_voice():
    d = request.get_json()
    u = d.get('user', '')
    phrase = d.get('phrase', '').strip().lower()
    vp     = json.dumps(d.get('voiceprint', []))
    get_db().execute(
        'UPDATE users SET phrase=?, voiceprint=? WHERE username=?',
        (phrase, vp, u)
    )
    get_db().commit()
    return jsonify({'status': 'ok'})


# ─────────────────────────────────────────────
# VOICE VERIFY  (dual: voiceprint + phrase)
# ─────────────────────────────────────────────

@bp.route('/api/verify_voice_full', methods=['POST'])
def verify_voice_full():
    d          = request.get_json()
    u          = d.get('user', '')
    heard_list = [h.strip().lower() for h in d.get('heard', [])]
    live_vp    = d.get('voiceprint', [])

    row = get_db().execute(
        'SELECT phrase, voiceprint FROM users WHERE username=?', (u,)
    ).fetchone()

    if not row or not row['phrase'] or not row['voiceprint']:
        return jsonify({'status': 'fail', 'reason': 'no_enrollment'})

    result = verify_voice(
        heard_list, live_vp,
        row['phrase'].strip().lower(),
        json.loads(row['voiceprint'])
    )
    return jsonify(result)


# ─────────────────────────────────────────────
# FACE VERIFY  (login + live vault CHV)
# ─────────────────────────────────────────────

@bp.route('/api/log_face', methods=['POST'])
@bp.route('/api/verify',   methods=['POST'])
def verify_face():
    d   = request.get_json()
    u   = d.get('user', '')
    row = get_db().execute(
        'SELECT face_base FROM users WHERE username=?', (u,)
    ).fetchone()
    if not row or not row['face_base']:
        return jsonify({'status': 'error'})

    _, gray = decode_frame(d['image'])
    if gray is None:
        return jsonify({'status': 'error'})

    status, score = compare_faces(gray, row['face_base'])
    return jsonify({'status': status, 'score': score})


# ─────────────────────────────────────────────
# MOUSE BASELINE
# ─────────────────────────────────────────────

@bp.route('/api/get_mouse_baseline', methods=['POST'])
def get_mouse_baseline():
    u   = request.get_json().get('user', '')
    row = get_db().execute(
        'SELECT mouse_json FROM users WHERE username=?', (u,)
    ).fetchone()
    bl = json.loads(row['mouse_json']) if row and row['mouse_json'] else None
    return jsonify({'baseline': bl})


# ─────────────────────────────────────────────
# FILE VAULT
# ─────────────────────────────────────────────

@bp.route('/api/upload', methods=['POST'])
def upload_file():
    d = request.get_json()
    get_db().execute(
        'INSERT INTO plain_files(owner,name,size,ftype,content,created_at) VALUES(?,?,?,?,?,?)',
        (d['user'], d['name'], d['size'], d['ftype'], d['content'], time.time())
    )
    get_db().commit()
    return jsonify({'status': 'ok'})


@bp.route('/api/files')
def list_files():
    u    = request.args.get('user', '')
    rows = get_db().execute(
        'SELECT id,name,size,ftype,content,created_at FROM plain_files '
        'WHERE owner=? ORDER BY id DESC', (u,)
    ).fetchall()
    return jsonify({'files': [dict(r) for r in rows]})


@bp.route('/api/delete_file', methods=['POST'])
def delete_file():
    d  = request.get_json()
    db = get_db()
    row = get_db().execute(
        'SELECT idx FROM blockchain '
        'WHERE file_name=(SELECT name FROM plain_files WHERE id=?) AND owner=?',
        (d['id'], d['user'])
    ).fetchone()
    if row:
        return jsonify({'status': 'error', 'msg': 'File is immutable on blockchain'})
    db.execute('DELETE FROM plain_files WHERE id=? AND owner=?', (d['id'], d['user']))
    db.commit()
    return jsonify({'status': 'ok'})


# ─────────────────────────────────────────────
# BLOCKCHAIN
# ─────────────────────────────────────────────

@bp.route('/api/mine', methods=['POST'])
def mine():
    d   = request.get_json()
    u   = d.get('user', '')
    fid = d.get('file_id')
    if not fid:
        return jsonify({'status': 'error', 'msg': 'No file_id'}), 400

    f = get_file_row(fid, u)
    if not f:
        return jsonify({'status': 'error', 'msg': 'File not found'}), 404

    db2 = sqlite3.connect(DB_PATH)
    if db2.execute(
        'SELECT idx FROM blockchain WHERE file_name=? AND owner=?', (f['name'], u)
    ).fetchone():
        db2.close()
        return jsonify({'status': 'error', 'msg': 'Already on blockchain'})

    last = last_block_db()
    raw  = (base64.b64decode(f['content'].split(',')[1])
            if ',' in f['content'] else f['content'].encode())
    block = mine_block(u, last['block_hash'], last['idx'],
                       f['name'], f['size'], f['ftype'], raw)
    db2.execute(
        'INSERT INTO blockchain(idx,timestamp,owner,proof,prev_hash,'
        'file_name,file_size,file_type,file_hash,block_hash) VALUES(?,?,?,?,?,?,?,?,?,?)',
        (block['idx'], block['timestamp'], block['owner'], block['proof'],
         block['prev_hash'], block['file_name'], block['file_size'],
         block['file_type'], block['file_hash'], block['block_hash'])
    )
    db2.commit()
    db2.close()
    return jsonify({'status': 'ok', 'block': block})


@bp.route('/api/chain')
def get_chain():
    return jsonify({'chain': get_chain_db(), 'valid': is_chain_valid()})


# ─────────────────────────────────────────────
# IPFS  — Local + Public (Pinata)
# ─────────────────────────────────────────────

IPFS_LOCAL_API = 'http://127.0.0.1:5001/api/v0'

def _raw_bytes(content: str) -> bytes:
    if ',' in content:
        return base64.b64decode(content.split(',', 1)[1])
    return base64.b64decode(content)

def _save_cid(fid, owner, cid):
    try:
        db = get_db()
        db.execute('UPDATE plain_files SET ipfs_cid=? WHERE id=? AND owner=?', (cid, fid, owner))
        db.commit()
    except Exception:
        pass


# ── LOCAL NODE (IPFS Desktop / kubo on port 5001) ──
@bp.route('/api/ipfs/upload_local', methods=['POST'])
def ipfs_upload_local():
    d   = request.get_json()
    u   = d.get('user', '')
    fid = d.get('file_id')
    f   = get_file_row(fid, u)
    if not f:
        return jsonify({'status': 'error', 'msg': 'File not found'}), 404
    try:
        raw  = _raw_bytes(f['content'])
        resp = _req.post(f'{IPFS_LOCAL_API}/add?pin=true',
                         files={'file': (f['name'], io.BytesIO(raw))}, timeout=30)
        resp.raise_for_status()
        cid = resp.json().get('Hash', '')
    except _req.exceptions.ConnectionError:
        return jsonify({'status': 'error',
                        'msg': 'Cannot reach IPFS Desktop — make sure it is running (port 5001).'}), 503
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)}), 500
    _save_cid(fid, u, cid)
    return jsonify({'status': 'ok', 'cid': cid,
                    'local_url': f'http://localhost:8080/ipfs/{cid}',
                    'public_url': f'https://ipfs.io/ipfs/{cid}'})


# ── PUBLIC — PINATA (API Key + Secret  OR  JWT) ──
@bp.route('/api/ipfs/upload_public', methods=['POST'])
def ipfs_upload_public():
    d          = request.get_json()
    u          = d.get('user', '')
    fid        = d.get('file_id')
    api_key    = d.get('api_key', '').strip()
    api_secret = d.get('api_secret', '').strip()
    jwt        = d.get('jwt', '').strip()

    # Must supply either JWT  OR  API Key + Secret
    if not jwt and not (api_key and api_secret):
        return jsonify({'status': 'error',
                        'msg': 'Provide either a JWT token, or both API Key and API Secret.'}), 400

    f = get_file_row(fid, u)
    if not f:
        return jsonify({'status': 'error', 'msg': 'File not found'}), 404

    try:
        raw = _raw_bytes(f['content'])
    except Exception as e:
        return jsonify({'status': 'error', 'msg': f'Decode error: {e}'}), 400

    # Build auth headers
    if jwt:
        headers = {'Authorization': f'Bearer {jwt}'}
    else:
        headers = {'pinata_api_key': api_key, 'pinata_secret_api_key': api_secret}

    try:
        resp = _req.post('https://api.pinata.cloud/pinning/pinFileToIPFS',
                         headers=headers,
                         files={'file': (f['name'], io.BytesIO(raw))},
                         timeout=60)
        resp.raise_for_status()
        cid = resp.json().get('IpfsHash', '')
    except _req.exceptions.HTTPError as e:
        code = e.response.status_code
        try:
            detail = e.response.json()
        except Exception:
            detail = e.response.text
        if code == 401:
            return jsonify({'status': 'error',
                            'msg': 'Pinata auth failed — check your API Key / Secret / JWT.'}), 401
        return jsonify({'status': 'error', 'msg': f'Pinata HTTP {code}: {detail}'}), 502
    except Exception as e:
        return jsonify({'status': 'error', 'msg': str(e)}), 500

    _save_cid(fid, u, cid)
    return jsonify({
        'status':      'ok',
        'cid':         cid,
        'gateway_url': f'https://gateway.pinata.cloud/ipfs/{cid}',
        'ipfs_io':     f'https://ipfs.io/ipfs/{cid}',
    })
