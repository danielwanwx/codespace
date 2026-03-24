from codespace.mcp_server import detect_intent, load_index, load_module_wiki, search_wiki


def test_detect_intent_list():
    assert detect_intent("list") == "list"
    assert detect_intent("repos") == "list"
    assert detect_intent("repositories") == "list"


def test_detect_intent_module():
    assert detect_intent("auth_service") == "module"
    assert detect_intent("r::auth") == "module"


def test_detect_intent_search():
    assert detect_intent("how does authentication work") == "search"


def test_load_index(tmp_path):
    (tmp_path / "_index.md").write_text("# Index\n- auth")
    assert "# Index" in load_index(tmp_path)


def test_load_index_not_found(tmp_path):
    result = load_index(tmp_path)
    assert "[REPO_NOT_FOUND]" in result


def test_load_module_auto_returns_l1(tmp_path):
    (tmp_path / "r__auth.md").write_text("# Auth\n> Purpose.\n\n## API\n- login()\n\n## Details\nLong paragraph...")
    result = load_module_wiki(tmp_path, "r::auth", depth="auto")
    assert "## API" in result
    assert "Long paragraph" not in result


def test_load_module_full_returns_l2(tmp_path):
    content = "# Auth\nFull content here."
    (tmp_path / "auth.md").write_text(content)
    assert load_module_wiki(tmp_path, "auth", depth="full") == content


def test_load_module_not_found(tmp_path):
    assert "[MODULE_NOT_FOUND]" in load_module_wiki(tmp_path, "nope")


def test_search_wiki(tmp_path):
    (tmp_path / "auth.md").write_text("# Auth\nJWT authentication logic.")
    (tmp_path / "api.md").write_text("# API\nREST gateway.")
    result = search_wiki(tmp_path, "JWT")
    assert "auth" in result.lower()


def test_search_no_results(tmp_path):
    (tmp_path / "mod.md").write_text("# Mod\nContent.")
    assert "No results" in search_wiki(tmp_path, "nonexistent")
