"""
CHV-Guard v6 — app.py
Flask application factory. Import and run this file to start the server.

Usage:
    python app.py
    python app.py --host 0.0.0.0 --port 8080

    Or via the built EXE:
    CHVGuard.exe
"""

import argparse
import os

from flask import Flask

from database   import close_db, init_db, migrate_db
from blockchain import ensure_genesis
from routes     import bp


def create_app() -> Flask:
    app = Flask(__name__, template_folder='templates', static_folder='static')
    app.secret_key = os.urandom(32)

    # Teardown
    app.teardown_appcontext(close_db)

    # Register all routes
    app.register_blueprint(bp)

    # Init DB + blockchain
    init_db(app)
    migrate_db()
    ensure_genesis(app)

    return app


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='CHV-Guard v6 Secure Vault')
    parser.add_argument('--host', default='127.0.0.1', help='Bind address')
    parser.add_argument('--port', type=int, default=5000, help='Port number')
    parser.add_argument('--no-debug', action='store_true', help='Disable debug mode')
    args = parser.parse_args()

    application = create_app()

    print(f"""
  ╔══════════════════════════════════════╗
  ║   🛡️  CHV-Guard v6  — Secure Vault   ║
  ╠══════════════════════════════════════╣
  ║  Login    →  http://{args.host}:{args.port}/        ║
  ║  Register →  http://{args.host}:{args.port}/register ║
  ╚══════════════════════════════════════╝
""")

    application.run(
        debug=not args.no_debug,
        host=args.host,
        port=args.port
    )
