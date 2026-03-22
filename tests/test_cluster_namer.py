# tests/test_cluster_namer.py
from codespace.cluster_namer import name_clusters, _build_naming_prompt
from codespace.clusters import Cluster

def test_build_naming_prompt():
    cluster = Cluster(id="r::auth", name="auth", path="src/auth", parent_id="r",
                      file_count=3, symbol_count=10)
    symbols_summary = "login(), register(), verify_token(), hash_password()"
    prompt = _build_naming_prompt(cluster, symbols_summary)
    assert "auth" in prompt
    assert "login" in prompt

def test_name_clusters_without_llm():
    """Without LLM, falls back to directory name."""
    clusters = [Cluster(id="r::auth", name="auth", path="src/auth", parent_id="r")]
    name_clusters(clusters, {}, llm_client=None)
    assert clusters[0].semantic_label == "auth"  # fallback
