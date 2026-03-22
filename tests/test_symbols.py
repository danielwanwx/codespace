# tests/test_symbols.py
from codespace.symbols import extract_symbols, SymbolEntry

SAMPLE_CODE = '''
class AuthService:
    def login(self, email: str, password: str) -> str:
        """Authenticate user."""
        user = find_user(email)
        if verify_hash(password, user.hash):
            return encode_token(user.id)
        raise AuthError("bad password")

    def register(self, email: str) -> None:
        create_user(email)

def find_user(email: str):
    """Look up user by email."""
    return db.query(email)
'''

def test_extract_functions():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    names = {s.qualified_name for s in symbols}
    assert "myrepo::auth.service::find_user" in names

def test_extract_class():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    classes = [s for s in symbols if s.kind == "class"]
    assert len(classes) == 1
    assert classes[0].qualified_name == "myrepo::auth.service::AuthService"

def test_extract_methods():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    login = next(s for s in symbols if "login" in s.qualified_name)
    assert login.kind == "method"
    assert "email" in login.signature
    assert login.metadata_class_name == "AuthService"

def test_calls_extracted():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    login = next(s for s in symbols if "login" in s.qualified_name)
    assert "find_user" in login.calls
    assert "verify_hash" in login.calls
    assert "encode_token" in login.calls

def test_signature_format():
    symbols = extract_symbols(SAMPLE_CODE, "myrepo", "auth.service", "src/auth/service.py")
    find = next(s for s in symbols if "find_user" in s.qualified_name)
    assert find.signature == "find_user(email: str)"
