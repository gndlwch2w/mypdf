#!/usr/bin/env bash
set -euo pipefail
unset CDPATH

project_root="$(cd "$(dirname "$0")/.." && pwd)"
python_bin="$project_root/.venv/bin/python"
force_rebuild=false

case "${1:-}" in
  "") ;;
  --force) force_rebuild=true ;;
  *)
    echo "Usage: $0 [--force]"
    exit 2
    ;;
esac

if [[ ! -x "$python_bin" ]]; then
  echo "Missing .venv. Run: python3 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt pyinstaller"
  exit 1
fi

cd "$project_root"
export PYINSTALLER_CONFIG_DIR="$project_root/backend/.pyinstaller-cache"
dist_file="$project_root/backend/dist/mypdf-backend"
stamp_file="$project_root/backend/build/.mypdf-backend-inputs.sha256"

# PyInstaller is by far the slowest part of a desktop build. Hash the actual
# backend inputs and the active Python environment so unchanged builds can
# reuse the existing executable safely.
input_hash="$({
  "$python_bin" -c 'import platform, sys; print(sys.version); print(platform.platform()); print(platform.machine())'
  "$python_bin" -m PyInstaller --version
  "$python_bin" -m pip freeze
  shasum -a 256 scripts/build-backend.sh
  find backend \
    -type d \( -name build -o -name dist -o -name .pyinstaller-cache -o -name __pycache__ \) -prune -o \
    -type f \( -name '*.py' -o -name 'requirements*.txt' \) -print |
    LC_ALL=C sort |
    while IFS= read -r source_file; do
      shasum -a 256 "$source_file"
    done
} | shasum -a 256 | awk '{print $1}')"

if [[ "$force_rebuild" == false && -x "$dist_file" && -f "$stamp_file" ]]; then
  previous_hash="$(<"$stamp_file")"
  if [[ "$input_hash" == "$previous_hash" ]]; then
    echo "Backend unchanged; reusing backend/dist/mypdf-backend"
    exit 0
  fi
fi

pyinstaller_flags=(--noconfirm)
if [[ "$force_rebuild" == true ]]; then
  pyinstaller_flags+=(--clean)
fi

"$python_bin" -m PyInstaller \
  "${pyinstaller_flags[@]}" \
  --onefile \
  --name mypdf-backend \
  --paths backend \
  --distpath backend/dist \
  --workpath backend/build \
  --specpath backend \
  --collect-binaries fitz \
  --collect-data fitz \
  --collect-binaries pikepdf \
  --collect-data pikepdf \
  --hidden-import app.main \
  --hidden-import app.api.pdf_routes \
  backend/desktop_main.py

mkdir -p "$(dirname "$stamp_file")"
printf '%s\n' "$input_hash" > "$stamp_file"
