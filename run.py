"""Start the AI Interview Portal server.

Usage:
    python3 run.py
    python3 run.py --port 8000
    python3 run.py --no-clean      # skip the cache-wipe step

Every start (unless `--no-clean` is passed) kills any existing uvicorn
listening on the chosen port, drops every Python bytecode cache, and
optionally rebuilds the Next.js static export so the browser receives
fresh chunks. That way the architecture is deterministic on every boot —
no stale modules, no leftover server, no cached HTML.
"""
import argparse
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
from pathlib import Path

import uvicorn

REPO_ROOT = Path(__file__).resolve().parent


def get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def kill_port(port: int) -> None:
    """Best-effort: kill any process holding the port. Uses `lsof` if
    available, otherwise `fuser`. Silent if the port is already free."""
    cmds = [
        ["lsof", "-ti", f":{port}"],
        ["fuser", "-k", f"{port}/tcp"],
    ]
    for cmd in cmds:
        if not shutil.which(cmd[0]):
            continue
        try:
            if cmd[0] == "lsof":
                out = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout.strip()
                if not out:
                    return
                for pid in out.splitlines():
                    try:
                        os.kill(int(pid), signal.SIGTERM)
                    except (ValueError, ProcessLookupError, PermissionError):
                        pass
                time.sleep(0.5)
                # Hard-kill any survivors
                out2 = subprocess.run(cmd, capture_output=True, text=True, timeout=5).stdout.strip()
                for pid in out2.splitlines():
                    try:
                        os.kill(int(pid), signal.SIGKILL)
                    except (ValueError, ProcessLookupError, PermissionError):
                        pass
                return
            else:
                subprocess.run(cmd, capture_output=True, timeout=5)
                return
        except subprocess.TimeoutExpired:
            continue
        except Exception:
            continue


def wipe_pycache() -> int:
    """Remove every __pycache__ directory and .pyc file under the repo.
    Returns the count of removed entries (for the boot banner)."""
    n = 0
    for path in REPO_ROOT.rglob("__pycache__"):
        if not path.is_dir():
            continue
        # Skip node_modules — that's npm's territory.
        if "node_modules" in path.parts:
            continue
        try:
            shutil.rmtree(path)
            n += 1
        except Exception:
            pass
    for path in REPO_ROOT.rglob("*.pyc"):
        if "node_modules" in path.parts:
            continue
        try:
            path.unlink()
            n += 1
        except Exception:
            pass
    return n


def main() -> None:
    parser = argparse.ArgumentParser(description="AI Interview Portal Server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument(
        "--host", default="0.0.0.0",
        help="Bind address (0.0.0.0 for WSL/remote access)",
    )
    parser.add_argument(
        "--no-clean", action="store_true",
        help="Skip the pre-boot cache-wipe + port-kill step.",
    )
    args = parser.parse_args()

    if not args.no_clean:
        # 1. Kill any existing server holding the port. Otherwise uvicorn
        # exits immediately with EADDRINUSE.
        kill_port(args.port)
        # 2. Wipe Python bytecode caches so module reloads pick up source
        # edits cleanly — defends against the classic "I edited the file
        # but the old class is still loaded" surprise.
        removed = wipe_pycache()
        print(f"  Cache wipe: cleared {removed} __pycache__/.pyc entries")
        # 3. Bump a build-version file so the frontend can detect new
        # backend revisions if it ever wants to (e.g. force a hard-reload
        # banner). Cheap to write, easy to grep for.
        try:
            (REPO_ROOT / ".build-version").write_text(
                f"started_at={int(time.time())}\n"
            )
        except Exception:
            pass

    local_ip = get_local_ip()
    print(f"\n  AI Interview Portal")
    print(f"  Local:     http://localhost:{args.port}")
    print(f"  WSL/LAN:   http://{local_ip}:{args.port}")
    print(f"\n  If localhost doesn't work in your Windows browser, try the WSL/LAN address.\n")

    # `reload=True` watches /root/ai_interview_portal for changes and
    # restarts the worker. Combined with the pycache wipe above, every
    # boot is from a clean module state.
    uvicorn.run(
        "backend.api:app",
        host=args.host,
        port=args.port,
        reload=True,
    )


if __name__ == "__main__":
    main()
