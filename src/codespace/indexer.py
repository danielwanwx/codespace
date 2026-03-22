"""Indexer: walk repo, collect files into Modules."""
from dataclasses import dataclass, field
import os

EXCLUDE_DIRS = {"venv", ".venv", "__pycache__", ".git", "node_modules",
                ".egg-info", "dist", "build", ".tox", ".mypy_cache"}
INCLUDE_EXTS = {".py"}
MAX_FILE_SIZE_KB = 100


@dataclass
class IndexedFile:
    rel_path: str
    abs_path: str
    content: str
    size_bytes: int
    line_count: int


@dataclass
class Module:
    name: str
    path: str  # relative to repo root
    files: list[IndexedFile] = field(default_factory=list)
    slug: str = ""  # unique id: "src/auth" → "src.auth"

    def __post_init__(self):
        if not self.slug:
            self.slug = self.path.replace(os.sep, ".").strip(".")


def scan_repo(repo_path: str, min_files_per_module: int = 1) -> list[Module]:
    """Walk repo, group .py files by directory into Modules."""
    repo_path = os.path.abspath(repo_path)
    dir_files: dict[str, list[IndexedFile]] = {}

    for root, dirs, files in os.walk(repo_path):
        dirs[:] = [d for d in dirs if d not in EXCLUDE_DIRS]
        rel_dir = os.path.relpath(root, repo_path)
        if rel_dir == ".":
            rel_dir = ""

        py_files = []
        for f in sorted(files):
            if not any(f.endswith(ext) for ext in INCLUDE_EXTS):
                continue
            abs_path = os.path.join(root, f)
            size = os.path.getsize(abs_path)
            if size > MAX_FILE_SIZE_KB * 1024:
                continue
            content = open(abs_path, "r", errors="replace").read()
            rel_path = os.path.relpath(abs_path, repo_path)
            py_files.append(IndexedFile(
                rel_path=rel_path,
                abs_path=abs_path,
                content=content,
                size_bytes=size,
                line_count=content.count("\n") + 1,
            ))

        if py_files:
            dir_files[rel_dir] = py_files

    # Build modules, merging small directories into parent
    modules = []
    merged_into_parent: set[str] = set()

    for dir_path, files in sorted(dir_files.items()):
        if len(files) < min_files_per_module and dir_path:
            parent = os.path.dirname(dir_path)
            if parent not in dir_files:
                dir_files[parent] = []
            dir_files[parent].extend(files)
            merged_into_parent.add(dir_path)

    for dir_path, files in sorted(dir_files.items()):
        if dir_path in merged_into_parent:
            continue
        name = os.path.basename(dir_path) if dir_path else os.path.basename(repo_path)
        modules.append(Module(name=name, path=dir_path, files=files))

    return modules
