"""Entrypoint used by the Electron desktop bundle."""

import os

import uvicorn


def main() -> None:
    os.environ.setdefault("MYPDF_DESKTOP", "1")
    host = os.environ.get("MYPDF_HOST", "127.0.0.1")
    port = int(os.environ.get("MYPDF_PORT", "8000"))
    uvicorn.run("app.main:app", host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
