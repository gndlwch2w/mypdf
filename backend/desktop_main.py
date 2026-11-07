"""Entrypoint used by the Electron desktop bundle."""

import os


def main() -> None:
    os.environ.setdefault("MYPDF_DESKTOP", "1")
    if os.environ.get("MYPDF_DEBUG_STARTUP") == "1":
        # Enabled only by the Windows CI smoke test to expose import deadlocks.
        import faulthandler

        faulthandler.enable()
        faulthandler.dump_traceback_later(25, repeat=True)
        print("[backend-startup] importing uvicorn", flush=True)

    import uvicorn

    host = os.environ.get("MYPDF_HOST", "127.0.0.1")
    port = int(os.environ.get("MYPDF_PORT", "8000"))
    if os.environ.get("MYPDF_DEBUG_STARTUP") == "1":
        print(f"[backend-startup] serving on {host}:{port}", flush=True)
    uvicorn.run("app.main:app", host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
