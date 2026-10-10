# -*- coding: utf-8 -*-
"""投递管理 · 无窗口启动器（双击即可启动，不会弹出控制台）。"""
import os
import sys
import subprocess

BASE = os.path.dirname(os.path.abspath(__file__))


def _msg(text):
    try:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, text, '投递管理', 0x10)
    except Exception:
        pass


def _ensure_deps():
    try:
        import openpyxl  # noqa: F401
        return True
    except ImportError:
        pass
    python_exe = os.path.join(os.path.dirname(sys.executable), 'python.exe')
    if not os.path.exists(python_exe):
        python_exe = sys.executable
    flags = getattr(subprocess, 'CREATE_NO_WINDOW', 0)
    try:
        subprocess.run(
            [python_exe, '-m', 'pip', 'install', '-r', 'requirements.txt'],
            cwd=BASE, creationflags=flags, check=True,
        )
        return True
    except Exception:
        _msg('依赖安装失败，请手动运行：python -m pip install -r requirements.txt')
        return False


if __name__ == '__main__':
    os.chdir(BASE)
    sys.path.insert(0, BASE)
    if not _ensure_deps():
        sys.exit(1)
    import app
    app.main()