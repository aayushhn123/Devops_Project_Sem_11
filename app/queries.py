"""Loads the annotated query library from sql/04_analysis_queries.sql."""
import re
from pathlib import Path

SQL_FILE = Path(__file__).resolve().parent.parent / "sql" / "04_analysis_queries.sql"
_CASTS = {"int": int, "float": float, "str": str}


def _parse_params(spec: str) -> list[dict]:
    out = []
    for part in filter(None, (p.strip() for p in spec.split(","))):
        left, _, default = part.partition("=")
        name, _, typ = left.partition(":")
        typ = (typ or "str").strip()
        out.append({"name": name.strip(), "type": typ, "default": _CASTS[typ](default.strip())})
    return out


def _parse_chart(spec: str) -> dict:
    tokens = spec.split()
    chart = {"type": tokens[0]}
    for t in tokens[1:]:
        k, _, v = t.partition("=")
        chart[k] = v
    return chart


def load_queries() -> dict[str, dict]:
    text = SQL_FILE.read_text(encoding="utf-8")
    blocks = re.split(r"(?m)^(?=-- name:)", text)[1:]
    queries = {}
    for block in blocks:
        meta, sql_lines, in_header = {}, [], True
        for line in block.splitlines():
            m = re.match(r"^-- (name|title|group|concepts|description|params|chart):\s*(.*)$", line)
            if in_header and m:
                meta[m.group(1)] = m.group(2).strip()
            elif line.startswith("--"):
                continue                      # separators / section banners
            else:
                in_header = False
                sql_lines.append(line)
        sql = "\n".join(sql_lines).strip()
        sql = sql[: sql.rfind(";")].rstrip() if ";" in sql else sql
        q = {
            "name": meta["name"],
            "title": meta.get("title", meta["name"]),
            "group": meta.get("group", "Other"),
            "concepts": [c.strip() for c in meta.get("concepts", "").split(",") if c.strip()],
            "description": meta.get("description", ""),
            "params": _parse_params(meta.get("params", "")),
            "chart": _parse_chart(meta["chart"]) if "chart" in meta else None,
            "sql": sql,
        }
        queries[q["name"]] = q
    return queries


def coerce_params(q: dict, raw: dict) -> dict:
    """Cast incoming query-string values to the declared types, falling back to defaults."""
    out = {}
    for p in q["params"]:
        v = raw.get(p["name"])
        try:
            out[p["name"]] = _CASTS[p["type"]](v) if v not in (None, "") else p["default"]
        except (TypeError, ValueError):
            out[p["name"]] = p["default"]
    return out
