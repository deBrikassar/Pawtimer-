import os
import subprocess


def test_audit_script_exists():
    assert os.path.exists("audit.py")

def test_fix_layout_script_exists():
    assert os.path.exists("fix_layout.py")

def test_ruff_format_check():
    # Basic check to ensure python files can be parsed by python
    result = subprocess.run(["python3", "-m", "py_compile", "audit.py"], capture_output=True)
    assert result.returncode == 0
