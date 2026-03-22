# tests/test_clusters.py
from codespace.clusters import form_clusters, Cluster
from codespace.indexer import Module, IndexedFile
from codespace.symbols import SymbolEntry

def _make_module(name, path, n_files=3):
    files = [IndexedFile(f"{path}/f{i}.py", f"/abs/{path}/f{i}.py", "x=1", 10, 1)
             for i in range(n_files)]
    return Module(name=name, path=path, files=files)

def test_basic_cluster_formation():
    modules = [_make_module("auth", "src/auth"), _make_module("db", "src/db")]
    clusters = form_clusters(modules, [], "myrepo")
    assert len(clusters) == 2
    names = {c.name for c in clusters}
    assert "auth" in names and "db" in names

def test_cluster_has_parent_repo():
    modules = [_make_module("auth", "src/auth")]
    clusters = form_clusters(modules, [], "myrepo")
    assert clusters[0].parent_id == "myrepo"

def test_cluster_id_format():
    modules = [_make_module("auth", "src/auth")]
    clusters = form_clusters(modules, [], "myrepo")
    assert clusters[0].id == "myrepo::src.auth"
