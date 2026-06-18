import http.server
import socketserver

class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        t = super().guess_type(path)
        base = t[0] if isinstance(t, tuple) else t
        if base in ("text/javascript", "application/javascript", "text/css", "text/html"):
            return base + "; charset=utf-8"
        return t

    def log_message(self, fmt, *args):
        print(fmt % args)

PORT = 8000
print("სერვერი ეშვება: http://localhost:" + str(PORT))
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    httpd.serve_forever()
