#!/usr/bin/env python3
"""Local bridge that links an open story map back to the Claude session.

Serves a filled story-map HTML on 127.0.0.1 and gives the page two channels:

  page -> Claude   POST /save   writes the map JSON to disk and bumps a counter
                                (.storymap-bridge/seq) that Claude can wait on
  Claude -> page   GET  /events server-sent events; whenever the JSON file
                                changes on disk *and* the change did not come
                                from the page, the new map is pushed to the tab

Stdlib only. Usage:

    python3 bridge.py MAP.html [--json PATH] [--port N]

Prints the URL (with the access token) on stdout and writes it to
<json dir>/.storymap-bridge/url.
"""

import argparse
import hashlib
import json
import os
import secrets
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

MAX_BODY = 8 * 1024 * 1024  # a story map is a few KB; this is just a sanity cap


def sha(b):
    return hashlib.sha256(b).hexdigest()


class Bridge:
    """Shared state: where the files are, and what the page last wrote."""

    def __init__(self, html_path, json_path, token):
        self.html_path = html_path
        self.json_path = json_path
        self.token = token
        self.dir = os.path.join(os.path.dirname(json_path) or ".", ".storymap-bridge")
        os.makedirs(self.dir, exist_ok=True)
        # per-map, so two maps sharing a directory don't wake each other's waiter
        stem = os.path.splitext(os.path.basename(json_path))[0]
        self.seq_path = os.path.join(self.dir, stem + ".seq")
        self.url_path = os.path.join(self.dir, stem + ".url")
        self.lock = threading.Lock()
        # Live-page bookkeeping, so the link can close itself when the tab does.
        self.clients = 0
        self.ever_connected = False
        self.idle_since = None
        # Hash of the bytes the page most recently saved. The SSE watcher skips
        # any file state matching this, so a save is never echoed back.
        self.from_page = None
        if not os.path.exists(self.seq_path):
            self._write(self.seq_path, "0")

    @staticmethod
    def _write(path, text):
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)

    def snapshot(self):
        """(mtime, content-hash) of the JSON file, or (None, None) if absent."""
        try:
            st = os.stat(self.json_path)
            with open(self.json_path, "rb") as f:
                return st.st_mtime, sha(f.read())
        except OSError:
            return None, None

    def save_from_page(self, body):
        with self.lock:
            self._write(self.json_path, body.decode("utf-8"))
            self.from_page = sha(body)
            try:
                n = int(open(self.seq_path, encoding="utf-8").read().strip() or 0)
            except (OSError, ValueError):
                n = 0
            n += 1
            self._write(self.seq_path, str(n))
            return n

    def client_in(self):
        with self.lock:
            self.clients += 1
            self.ever_connected = True
            self.idle_since = None

    def client_out(self):
        with self.lock:
            self.clients = max(0, self.clients - 1)
            if self.clients == 0:
                self.idle_since = time.time()

    def idle_expired(self, grace):
        """True once every tab has been gone for `grace` seconds."""
        with self.lock:
            if not self.ever_connected or self.clients or self.idle_since is None:
                return False
            return time.time() - self.idle_since > grace


def page_html(bridge):
    """Wrap the (fragment) template in a document and inject the bridge handle."""
    with open(bridge.html_path, encoding="utf-8") as f:
        body = f.read()
    handle = json.dumps({"token": bridge.token, "save": "/save", "events": "/events"})
    return (
        '<!doctype html>\n<html lang="en">\n'
        '<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        "<script>window.__USM_BRIDGE__=" + handle + ";</script>\n" + body
    )


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    bridge = None  # set on the subclass at startup

    def log_message(self, *args):
        pass  # stdout is the event channel; keep it clean

    def handle_one_request(self):
        # A tab closing resets its keep-alive socket mid-read. That is normal,
        # not an error — swallow it instead of dumping a traceback.
        try:
            super().handle_one_request()
        except (ConnectionResetError, BrokenPipeError, TimeoutError):
            self.close_connection = True

    # ---- helpers ----
    def _send(self, code, body=b"", ctype="text/plain; charset=utf-8", extra=None):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _json(self, code, obj):
        self._send(code, json.dumps(obj).encode("utf-8"), "application/json")

    def _authed(self, query):
        return (query.get("t", [""])[0] or self.headers.get("X-USM-Token", "")) == self.bridge.token

    # ---- routes ----
    def do_GET(self):
        u = urlparse(self.path)
        q = parse_qs(u.query)
        if u.path in ("/", "/index.html"):
            try:
                html = page_html(self.bridge).encode("utf-8")
            except OSError as e:
                return self._send(500, f"cannot read map: {e}".encode("utf-8"))
            return self._send(200, html, "text/html; charset=utf-8")
        if u.path == "/health":
            return self._json(200, {"ok": True, "json": self.bridge.json_path})
        if u.path == "/events":
            if not self._authed(q):
                return self._send(403, b"forbidden")
            return self.stream_events()
        return self._send(404, b"not found")

    def do_POST(self):
        u = urlparse(self.path)
        if u.path != "/save":
            return self._send(404, b"not found")
        if not self._authed(parse_qs(u.query)):
            return self._json(403, {"ok": False, "error": "bad token"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            n = 0
        if n <= 0 or n > MAX_BODY:
            return self._json(400, {"ok": False, "error": "bad length"})
        body = self.rfile.read(n)
        try:
            obj = json.loads(body)
            if not all(k in obj for k in ("activities", "phases", "stories")):
                raise ValueError("not a story map")
        except Exception as e:
            return self._json(400, {"ok": False, "error": str(e)})
        seq = self.bridge.save_from_page(body)
        print(f"[bridge] saved {self.bridge.json_path} (seq {seq})", flush=True)
        return self._json(200, {"ok": True, "seq": seq})

    def stream_events(self):
        """Push the map to the tab whenever the file changes outside the page."""
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Connection", "keep-alive")
        self.end_headers()
        seen_mtime, seen_hash = self.bridge.snapshot()
        last_ping = time.time()
        self.bridge.client_in()
        try:
            self.wfile.write(b"event: ready\ndata: {}\n\n")
            self.wfile.flush()
            while True:
                time.sleep(1.0)
                mtime, digest = self.bridge.snapshot()
                if digest and (mtime, digest) != (seen_mtime, seen_hash):
                    seen_mtime, seen_hash = mtime, digest
                    if digest != self.bridge.from_page:  # not the page's own save
                        with open(self.bridge.json_path, "rb") as f:
                            payload = f.read()
                        self.wfile.write(b"event: push\ndata: " + payload.replace(b"\n", b" ") + b"\n\n")
                        self.wfile.flush()
                        print("[bridge] pushed update to page", flush=True)
                # Short keepalive: the write is how a closed tab is noticed at all.
                if time.time() - last_ping > 5:
                    last_ping = time.time()
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            return
        finally:
            self.bridge.client_out()


def main(argv=None):
    ap = argparse.ArgumentParser(description="Serve a story map linked to the Claude session.")
    ap.add_argument("html", help="the filled story-map HTML file")
    ap.add_argument("--json", help="map JSON path (default: HTML path with .json)")
    ap.add_argument("--port", type=int, default=0, help="0 = pick a free port (default)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument(
        "--idle-timeout",
        type=int,
        default=90,
        metavar="SEC",
        help="close the link this long after the last tab goes away (0 = never; "
        "the grace period is what lets a page reload reconnect)",
    )
    args = ap.parse_args(argv)

    html_path = os.path.abspath(args.html)
    if not os.path.isfile(html_path):
        sys.exit(f"no such file: {html_path}")
    json_path = os.path.abspath(args.json or os.path.splitext(html_path)[0] + ".json")

    bridge = Bridge(html_path, json_path, secrets.token_urlsafe(16))
    handler = type("BoundHandler", (Handler,), {"bridge": bridge})
    httpd = ThreadingHTTPServer((args.host, args.port), handler)
    httpd.daemon_threads = True
    url = f"http://{args.host}:{httpd.server_address[1]}/?t={bridge.token}"
    Bridge._write(bridge.url_path, url + "\n")

    print(f"[bridge] map    {html_path}", flush=True)
    print(f"[bridge] json   {json_path}", flush=True)
    print(f"[bridge] seq    {bridge.seq_path}", flush=True)
    print(f"[bridge] ready  {url}", flush=True)

    def close(why):
        # Dropping the url file is the signal to the session's waiter that the
        # link is over, so it stops waiting instead of hanging to its timeout.
        try:
            os.remove(bridge.url_path)
        except OSError:
            pass
        print(f"[bridge] closed ({why})", flush=True)

    def watchdog():
        while args.idle_timeout > 0:
            time.sleep(2)
            if bridge.idle_expired(args.idle_timeout):
                print(f"[bridge] no tab for {args.idle_timeout}s — closing the link", flush=True)
                threading.Thread(target=httpd.shutdown, daemon=True).start()
                return

    threading.Thread(target=watchdog, daemon=True).start()
    for sig in ("SIGTERM", "SIGINT"):
        try:
            import signal

            signal.signal(
                getattr(signal, sig),
                lambda *a: threading.Thread(target=httpd.shutdown, daemon=True).start(),
            )
        except (ValueError, AttributeError, OSError):
            pass  # not on the main thread / platform lacks it — kill still works

    try:
        httpd.serve_forever()
        close("tab closed" if args.idle_timeout else "shut down")
    except KeyboardInterrupt:
        close("interrupted")


if __name__ == "__main__":
    main()
