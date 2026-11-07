"""Trace Windows PyInstaller imports and native DLL discovery in GitHub Actions.

A hung import shows its package in the last unmatched 'import start' entry.
The wrapper runs the regular PyInstaller CLI and does not change collected files.
"""

import faulthandler
import sys

if sys.platform == "win32":
    from PyInstaller.depend import bindepend
    from PyInstaller.isolated._parent import Python

    _original_call = Python.call

    def _traced_call(self, function, *args, **kwargs):
        if function.__name__ != "import_library":
            return _original_call(self, function, *args, **kwargs)
        package = args[0] if args else "<unknown>"
        print(f"[pyi-trace] import start: {package!r}", flush=True)
        result = _original_call(self, function, *args, **kwargs)
        print(f"[pyi-trace] import done: {package!r}", flush=True)
        return result

    Python.call = _traced_call

    _original_get_imports = bindepend.get_imports

    def _traced_get_imports(filename, *args, **kwargs):
        print(f"[pyi-trace] DLL scan start: {filename}", flush=True)
        result = _original_get_imports(filename, *args, **kwargs)
        print(f"[pyi-trace] DLL scan done: {filename}", flush=True)
        return result

    bindepend.get_imports = _traced_get_imports

faulthandler.enable()
faulthandler.dump_traceback_later(120, repeat=True)

from PyInstaller.__main__ import run

if __name__ == "__main__":
    run()
