# tests/test_imports.py
from codespace.imports import parse_imports

CODE_WITH_IMPORTS = '''
from database.repo import find_user, create_user
from crypto import verify_hash
import os
import json
from .utils import helper
'''

def test_parse_from_imports():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert "find_user" in imports
    assert imports["find_user"] == "database.repo"

def test_parse_multiple_names():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["create_user"] == "database.repo"

def test_parse_single_name():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["verify_hash"] == "crypto"

def test_skips_stdlib():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert "os" not in imports
    assert "json" not in imports

def test_relative_import():
    imports = parse_imports(CODE_WITH_IMPORTS)
    assert imports["helper"] == ".utils"
