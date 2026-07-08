import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

from .embeddings import cache_dir_from_env, embed_query, model_name_from_env


MAX_BODY_BYTES = 8192


class EmbedderHandler(BaseHTTPRequestHandler):
    server_version = "ElonMealsFastEmbed/1.0"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.respond_json(404, {"error": "not_found"})
            return
        self.respond_json(200, {"status": "ok", "model": model_name_from_env()})

    def do_POST(self) -> None:
        if self.path != "/embed":
            self.respond_json(404, {"error": "not_found"})
            return

        length_header = self.headers.get("Content-Length", "0")
        try:
            length = int(length_header)
        except ValueError:
            self.respond_json(400, {"error": "invalid_content_length"})
            return

        if length <= 0 or length > MAX_BODY_BYTES:
            self.respond_json(413, {"error": "payload_too_large"})
            return

        try:
            body = self.rfile.read(length)
            payload = json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self.respond_json(400, {"error": "invalid_json"})
            return

        text = clean_text(payload.get("text"))
        if not text:
            self.respond_json(400, {"error": "missing_text"})
            return
        if len(text) > 500:
            self.respond_json(400, {"error": "text_too_long"})
            return

        model_name = clean_text(payload.get("model")) or model_name_from_env()
        try:
            vector = embed_query(text, model_name=model_name, cache_dir=cache_dir_from_env())
        except Exception as exc:
            self.respond_json(503, {"error": "embedding_failed", "message": str(exc)[:300]})
            return

        self.respond_json(200, {
            "model": model_name,
            "dimension": len(vector),
            "embedding": vector,
        })

    def respond_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: Any) -> None:
        if os.environ.get("EMBEDDER_ACCESS_LOG", "").strip().lower() in {"1", "true", "yes", "on"}:
            super().log_message(format, *args)


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    return " ".join(str(value).split())


def main() -> int:
    port = int(os.environ.get("EMBEDDER_PORT", "9100"))
    server = ThreadingHTTPServer(("0.0.0.0", port), EmbedderHandler)
    print(f"FastEmbed service listening on 0.0.0.0:{port} with {model_name_from_env()}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
