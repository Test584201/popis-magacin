"""Lokalni server za aplikaciju Popis Magacin (bez hostinga).

Pokretanje:  python serve.py     (ili dvaput kliknuti POKRENI-SERVER.bat)
Računar i telefon moraju biti na istoj Wi-Fi mreži.
"""
import http.server
import os
import socket
import sys

PORT = 8000
ROOT = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Tačni MIME tipovi (na nekim Windows računarima .js se pogrešno servira kao tekst)
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".css": "text/css",
        ".html": "text/html; charset=utf-8",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
    }

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stdout.write("  " + (fmt % args) + "\n")


def lan_ips():
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("10.255.255.255", 1))
        ips.append(s.getsockname()[0])
        s.close()
    except OSError:
        pass
    try:
        for ip in socket.gethostbyname_ex(socket.gethostname())[2]:
            if not ip.startswith("127.") and ip not in ips:
                ips.append(ip)
    except OSError:
        pass
    return ips


def main():
    try:
        server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    except OSError as e:
        print(f"Port {PORT} je zauzet ili nije dostupan: {e}")
        print("Zatvorite drugi prozor sa serverom i pokušajte ponovo.")
        return 1
    ips = lan_ips() or ["IP-ADRESA-RAČUNARA"]
    print("=" * 62)
    print(" Popis Magacin – lokalni server je pokrenut")
    print("=" * 62)
    print(" Na telefonu (isti Wi-Fi) otvorite u Chrome-u jednu od adresa:")
    for ip in ips:
        print(f"     http://{ip}:{PORT}")
    print(" (obično je prava ona koja počinje sa 192.168. ili 10.)")
    print()
    print(" Ne zatvarajte ovaj prozor dok instalirate aplikaciju.")
    print(" Zaustavljanje: Ctrl+C")
    print("=" * 62)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer je zaustavljen.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
