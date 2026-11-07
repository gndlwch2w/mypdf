# MyPDF

A local-first desktop PDF toolkit. Files are processed on the current device and are never uploaded.

## Features

- Merge, split, compress, and organize PDFs
- Convert between PDFs and images
- Extract embedded images from PDFs
- Rotate pages and add watermarks or page numbers
- Protect and unlock PDFs
- Extract text with OCR fallback for scanned documents

## Stack

- Electron, React, and TypeScript
- FastAPI and PyInstaller
- PyMuPDF, pikepdf, PyPDF2, Pillow, and ReportLab

## Requirements

- Node.js 20+
- Python 3.9+
- npm
- Tesseract (optional, required only for OCR)

macOS / Linux:

```bash
npm ci
python3 -m venv .venv
.venv/bin/python -m pip install -r backend/requirements.txt pyinstaller
```

Windows:

```powershell
npm ci
py -3 -m venv .venv
.venv\Scripts\python -m pip install -r backend\requirements.txt pyinstaller
```

## Development

```bash
npm run dev
```

Run only the Python API:

```bash
.venv/bin/python -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

## Build Installers

PyInstaller cannot cross-compile the Python backend. Build on the target operating system and CPU architecture.

| Platform | Command | Output |
| --- | --- | --- |
| macOS | `npm run package:mac` | `release/*.dmg` |
| Windows | `npm run package:win` | `release/*-setup.exe` |
| Linux | `npm run package:linux` | `release/*.AppImage` |

Each command builds the native Python backend, Electron frontend, and installer. Packages are unsigned by default. Public distribution requires Apple notarization, Windows code signing, or the appropriate Linux signing workflow.

## Commands

```bash
npm run typecheck              # Check TypeScript
npm run build:renderer         # Build the Electron frontend
npm run build:backend:portable # Build the backend for the current platform
npm run build:mac              # Build an unpacked macOS app
```

## Project Structure

```text
src/main/       Electron main process and backend lifecycle
src/preload/    Typed IPC bridge
src/renderer/   React interface
src/shared/     Shared types
backend/app/    PDF API and processing logic
scripts/        Build scripts
```

## License

MIT
