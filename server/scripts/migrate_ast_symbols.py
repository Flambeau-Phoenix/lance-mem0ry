"""Export and segregate AST code symbols from FlamBot partition.
Safe & additive: preserves rows, exports backup, and sets status='superseded'.
"""
from __future__ import annotations
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
import lancedb

AST_CATEGORIES = {
    "code_symbol",
    "flambot_module",
    "flambot_function",
    "flambot_class",
    "flambot_method",
}

DEFAULT_DB_DIR = Path("/opt/eh-stack/app/arch_memory/project_memories/FlamBot")
BACKUP_DIR = Path("/opt/eh-stack/app/arch_memory/backups")


def main():
    parser = argparse.ArgumentParser(description="Segregate AST symbols from FlamBot memories")
    parser.add_argument("--db-path", default=str(DEFAULT_DB_DIR), help="Path to FlamBot LanceDB dir")
    parser.add_argument("--dry-run", action="store_true", help="Only scan and report without modifying")
    args = parser.parse_args()

    db = lancedb.connect(args.db_path)
    tbl = db.open_table("records")
    df = tbl.to_pandas()

    mask = df["category"].isin(AST_CATEGORIES)
    ast_df = df[mask]
    real_df = df[~mask]

    print(f"Total rows in FlamBot: {len(df)}")
    print(f"AST symbol rows found: {len(ast_df)}")
    print(f"Curated architectural rows: {len(real_df)}")

    if len(ast_df) == 0:
        print("No AST symbols to segregate.")
        return

    # 1. Export backup JSON
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    export_file = BACKUP_DIR / f"flambot_ast_symbols_{len(ast_df)}_{ts}.json"
    
    records = ast_df.to_dict(orient="records")
    # Clean vector arrays for JSON serialization
    for r in records:
        if "vector" in r:
            del r["vector"]

    with open(export_file, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, default=str)
    print(f"Exported AST symbol backup to: {export_file}")

    if args.dry_run:
        print("Dry run complete. No modifications applied.")
        return

    # 2. Mark AST rows as superseded
    ast_ids = ast_df["record_id"].dropna().tolist()
    if not ast_ids:
        ast_ids = ast_df["id"].dropna().tolist()
    
    print(f"Marking {len(ast_ids)} rows as status='superseded'...")
    now_iso = datetime.now(timezone.utc).isoformat()
    for cat in AST_CATEGORIES:
        tbl.update(
            where=f"category = '{cat}'",
            values={"status": "superseded", "updated_at": now_iso},
        )

    # Verify
    new_df = tbl.to_pandas()
    print("Updated status counts:")
    print(new_df["status"].value_counts())
    active_cats = new_df[new_df["status"] == "active"]["category"].value_counts()
    print("\nRemaining active categories:")
    print(active_cats)


if __name__ == "__main__":
    main()
