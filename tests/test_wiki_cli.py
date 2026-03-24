import os
from codespace.wiki_cli import wiki_main


def test_wiki_help(capsys):
    ret = wiki_main(["--help"])
    assert ret == 0
    captured = capsys.readouterr()
    assert "Usage:" in captured.out


def test_wiki_no_args(capsys):
    ret = wiki_main([])
    assert ret == 0  # shows help
    captured = capsys.readouterr()
    assert "Usage:" in captured.out


def test_wiki_list(tmp_path, capsys):
    (tmp_path / "_index.md").write_text("# Module Index\n- auth\n- api\n")
    ret = wiki_main(["list", "--dir", str(tmp_path)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "auth" in captured.out


def test_wiki_module_lookup(tmp_path, capsys):
    (tmp_path / "auth.md").write_text("# Auth\n> Handles authentication.\n\n## API\n- login()\n")
    ret = wiki_main(["auth", "--dir", str(tmp_path)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "Auth" in captured.out


def test_wiki_module_full(tmp_path, capsys):
    content = "# Auth\n> Summary.\n\n## API\n- login()\n\n## Details\nLong paragraph about implementation.\n"
    (tmp_path / "auth.md").write_text(content)
    ret = wiki_main(["auth", "--full", "--dir", str(tmp_path)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "Long paragraph" in captured.out


def test_wiki_search(tmp_path, capsys):
    (tmp_path / "auth.md").write_text("# Auth\nJWT authentication logic.")
    (tmp_path / "api.md").write_text("# API\nREST gateway.")
    ret = wiki_main(["JWT", "authentication", "--dir", str(tmp_path)])
    assert ret == 0
    captured = capsys.readouterr()
    assert "auth" in captured.out.lower()


def test_wiki_missing_dir(capsys, monkeypatch):
    # Ensure no wiki dir is found
    monkeypatch.chdir("/tmp")
    ret = wiki_main(["list", "--dir", "/nonexistent/path"])
    assert ret == 1
    captured = capsys.readouterr()
    assert "not found" in captured.out.lower()
