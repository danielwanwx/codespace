import tempfile, os
from codespace.indexer import scan_repo, Module

def _make_repo(tmp_path):
    """Create a minimal fake repo."""
    src = os.path.join(tmp_path, "src", "auth")
    os.makedirs(src)
    with open(os.path.join(src, "login.py"), "w") as f:
        f.write("def login(): pass\n")
    with open(os.path.join(src, "register.py"), "w") as f:
        f.write("def register(): pass\n")
    utils = os.path.join(tmp_path, "src", "utils")
    os.makedirs(utils)
    with open(os.path.join(utils, "helpers.py"), "w") as f:
        f.write("def helper(): pass\n")
    return tmp_path

def test_scan_finds_modules():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        modules = scan_repo(repo)
        names = {m.name for m in modules}
        assert "auth" in names
        assert "utils" in names

def test_scan_collects_files():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        modules = scan_repo(repo)
        auth = next(m for m in modules if m.name == "auth")
        assert len(auth.files) == 2

def test_scan_skips_excluded_dirs():
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        venv = os.path.join(tmp, "venv", "lib")
        os.makedirs(venv)
        with open(os.path.join(venv, "pkg.py"), "w") as f:
            f.write("x = 1\n")
        modules = scan_repo(repo)
        names = {m.name for m in modules}
        assert "lib" not in names

def test_merge_small_modules():
    """Directories with <= 2 files merge into parent."""
    with tempfile.TemporaryDirectory() as tmp:
        repo = _make_repo(tmp)
        # utils has only 1 file — should merge into parent
        modules = scan_repo(repo, min_files_per_module=2)
        names = {m.name for m in modules}
        assert "utils" not in names  # merged
