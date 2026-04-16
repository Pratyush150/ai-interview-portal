"""Start the AI Interview Portal server.

Usage:
    python3 run.py
    python3 run.py --port 8000
"""
import argparse
import socket
import uvicorn


def get_local_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


def main():
    parser = argparse.ArgumentParser(description="AI Interview Portal Server")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--host", default="0.0.0.0", help="Bind address (0.0.0.0 for WSL/remote access)")
    args = parser.parse_args()

    local_ip = get_local_ip()
    print(f"\n  AI Interview Portal")
    print(f"  Local:     http://localhost:{args.port}")
    print(f"  WSL/LAN:   http://{local_ip}:{args.port}")
    print(f"\n  If localhost doesn't work in your Windows browser, try the WSL/LAN address.\n")

    uvicorn.run("backend.api:app", host=args.host, port=args.port, reload=True)


if __name__ == "__main__":
    main()
