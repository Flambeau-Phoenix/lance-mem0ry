#!/usr/bin/env python3
"""Comprehensive Streamlit Control Console for LanceDB Architectural Memory, Rules & Mem0 Directives."""
from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import requests
import streamlit as st

from admin_cli import BACKUP_ROOT, audit_project, backup_project
from memory_server import (
    ArchitecturalMemory,
    EMBED_DIM,
    EMBED_MODEL,
    KNOWN_PROJECTS,
    OLLAMA_HOST,
    TABLE_NAME,
    VALID_ENTITY_TYPES,
    _iso_now,
    embed_text,
    get_table,
    hybrid_search,
    invalidate_table,
    memories_root,
    project_db_path,
    rebuild_fts,
)

SSE_URL = os.environ.get("ARCH_MEMORY_SSE_URL", "")
HTTP_URL = os.environ.get("ARCH_MEMORY_HTTP_URL", "http://127.0.0.1:8768/mcp")
SERVICE_UNITS = (
    "arch-memory-http.service",
    "arch-memory-admin.service",
)

# Extended entity types including Mem0 rules & directives
EXTENDED_ENTITY_TYPES = ("Rule", "Directive", "Preference", "Hook", "UI Element", "Protocol", "State Schema", "Config", "General")

st.set_page_config(
    page_title="LanceDB Memory & Rules Studio",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# Dark UI styling
st.markdown(
    """
    <style>
      .stApp { background: #0b0f19; color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      [data-testid="stSidebar"] { background: #111827; border-right: 1px solid #1f2937; }
      div[data-testid="stMetricValue"] { color: #38bdf8; font-weight: 700; }
      .stButton > button { border-radius: 8px; font-weight: 600; border: 1px solid #374151; transition: all 0.2s; }
      .stButton > button:hover { border-color: #38bdf8; background: #1e293b; color: #38bdf8; }
      button[kind="primary"] { background: linear-gradient(135deg, #0ea5e9, #6366f1) !important; border: none !important; color: white !important; }
      button[kind="primary"]:hover { opacity: 0.95; box-shadow: 0 0 15px rgba(14, 165, 233, 0.4); }
      .stDownloadButton > button { background: linear-gradient(135deg, #10b981, #059669) !important; color: white !important; border: none !important; }
      .stDownloadButton > button:hover { opacity: 0.95; box-shadow: 0 0 15px rgba(16, 185, 129, 0.4); }
      .danger-box { background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.35); border-radius: 10px; padding: 18px; margin: 15px 0; }
      .rule-card { background: #131d31; border: 1px solid #1e3a5f; border-left: 4px solid #38bdf8; border-radius: 8px; padding: 14px; margin-bottom: 12px; }
      .pref-card { background: #1c192b; border: 1px solid #3b2d54; border-left: 4px solid #a855f7; border-radius: 8px; padding: 14px; margin-bottom: 12px; }
      .entry-box { background: #141e33; border: 1px solid #233554; border-radius: 8px; padding: 14px; margin-bottom: 10px; }
      code { color: #38bdf8 !important; background: #1e293b !important; padding: 2px 6px; border-radius: 4px; }
    </style>
    """,
    unsafe_allow_html=True,
)


def get_available_projects() -> list[str]:
    """Dynamically discover all project directories on disk under project_memories/."""
    root = memories_root()
    projects = set(KNOWN_PROJECTS)
    if root.exists():
        for item in root.iterdir():
            if item.is_dir() and not item.name.startswith("."):
                projects.add(item.name)
    return sorted(list(projects))


def unit_state(unit: str) -> str:
    try:
        result = subprocess.run(["systemctl", "is-active", unit], capture_output=True, text=True, timeout=5)
        return (result.stdout or result.stderr).strip() or "unknown"
    except Exception as exc:
        return f"error: {exc}"


def probe(url: str, *, sse: bool = False) -> tuple[bool, str]:
    try:
        if sse:
            response = requests.get(url, timeout=(3, 3), stream=True)
        else:
            response = requests.get(url, timeout=(3, 5))
        code = response.status_code
        response.close()
        return code in {200, 405, 406}, f"HTTP {code}"
    except requests.exceptions.ReadTimeout:
        return sse, "connected (stream open)" if sse else "timeout"
    except Exception as exc:
        return False, str(exc)


def ollama_status() -> tuple[bool, str]:
    try:
        response = requests.get(f"{OLLAMA_HOST}/api/tags", timeout=(3, 5))
        response.raise_for_status()
        names = [str(model.get("name") or "") for model in response.json().get("models", [])]
        found = any(EMBED_MODEL in name for name in names)
        return found, f"{EMBED_MODEL}: {'ready' if found else 'missing'} ({len(names)} models)"
    except Exception as exc:
        return False, str(exc)


def extraction_llm_status() -> tuple[bool, str]:
    try:
        url = os.environ.get("EXTRACTION_LLM_URL", "")
        if not url:
            return True, "not configured (optional)"
        base = url.rstrip("/").rstrip("/v1")
        response = requests.get(f"{base}/v1/models", timeout=(2, 3))
        if response.status_code == 200:
            models = response.json().get("data", [])
            return True, f"online ({len(models)} models)"
        return False, f"HTTP {response.status_code}"
    except Exception as exc:
        return False, "offline"


def journal(minutes: int = 15, lines: int = 150) -> str:
    try:
        result = subprocess.run(
            ["journalctl", "-u", "arch-memory-http.service", "-u", "arch-memory-admin.service", f"--since=-{minutes} minutes", "-n", str(lines), "--no-pager", "-o", "short-iso"],
            capture_output=True,
            text=True,
            timeout=8,
        )
        return result.stdout or result.stderr
    except Exception as exc:
        return str(exc)


def safe_id(value: str) -> str:
    try:
        return str(uuid.UUID(str(value)))
    except ValueError as exc:
        raise ValueError("Invalid record ID UUID") from exc


def get_project_records(project: str, limit: int = 5000) -> pd.DataFrame:
    try:
        table = get_table(project)
        df = table.to_pandas()
        if "vector" in df.columns:
            df = df.drop(columns=["vector"])
        if "created_at" in df.columns:
            df = df.sort_values("created_at", ascending=False)
        return df.head(limit)
    except Exception as e:
        return pd.DataFrame()


def add_record(project: str, text: str, category: str, symbol: str, entity_type: str, verified: bool) -> str:
    text = text.strip()
    if not text:
        raise ValueError("Text content is required")
    record_id = str(uuid.uuid4())
    table = get_table(project)
    table.add([{
        "record_id": record_id,
        "text": text,
        "category": category.strip() or "general",
        "symbol": symbol.strip(),
        "entity_type": entity_type,
        "verified": bool(verified),
        "created_at": _iso_now(),
        "vector": embed_text(text),
    }])
    try:
        rebuild_fts(table)
    except Exception:
        pass
    return record_id


def delete_record(project: str, record_id: str) -> int:
    record_id = safe_id(record_id)
    backup_project(project, "pre-del-single")
    table = get_table(project)
    result = table.delete(f"record_id = '{record_id}'")
    try:
        rebuild_fts(table)
    except Exception:
        pass
    return int(getattr(result, "num_deleted_rows", 1))


def delete_by_category(project: str, category: str) -> int:
    category = category.strip()
    if not category:
        raise ValueError("Category name required")
    backup_project(project, f"pre-del-cat-{category[:20]}")
    table = get_table(project)
    safe_cat = category.replace("'", "''")
    result = table.delete(f"category = '{safe_cat}'")
    try:
        rebuild_fts(table)
    except Exception:
        pass
    return int(getattr(result, "num_deleted_rows", 1))


def rename_category(project: str, old_cat: str, new_cat: str) -> int:
    old_cat = old_cat.strip()
    new_cat = new_cat.strip()
    if not old_cat or not new_cat:
        raise ValueError("Both old and new category names are required")
    backup_project(project, f"pre-rename-cat-{old_cat[:15]}")
    table = get_table(project)
    safe_old = old_cat.replace("'", "''")
    result = table.update(where=f"category = '{safe_old}'", values={"category": new_cat})
    try:
        rebuild_fts(table)
    except Exception:
        pass
    return int(getattr(result, "rows_updated", 1))


def purge_project(project: str) -> bool:
    """Wipe all records in table and recreate clean schema."""
    import lancedb
    backup_project(project, "pre-purge-table")
    path = project_db_path(project)
    db = lancedb.connect(str(path))
    try:
        db.drop_table(TABLE_NAME)
    except Exception:
        pass
    table = db.create_table(TABLE_NAME, schema=ArchitecturalMemory)
    rebuild_fts(table)
    invalidate_table(project)
    return True


def delete_project_completely(project: str) -> bool:
    """Completely remove project folder from disk."""
    path = project_db_path(project)
    backup_project(project, "pre-destroy-project")
    invalidate_table(project)
    if path.exists():
        shutil.rmtree(path)
    return True


def create_new_project(new_name: str) -> bool:
    """Create a new project directory and table."""
    import lancedb
    clean_name = re.sub(r"[^a-zA-Z0-9_-]", "", new_name.strip())
    if not clean_name:
        raise ValueError("Invalid project name")
    root = memories_root()
    proj_dir = root / clean_name
    proj_dir.mkdir(parents=True, exist_ok=True)
    db = lancedb.connect(str(proj_dir))
    table = db.create_table(TABLE_NAME, schema=ArchitecturalMemory)
    rebuild_fts(table)
    return True


def batch_embed_texts(texts: list[str]) -> list[list[float]]:
    url = f"{OLLAMA_HOST}/api/embed"
    resp = requests.post(url, json={"model": EMBED_MODEL, "input": texts}, timeout=90)
    resp.raise_for_status()
    embeddings = resp.json().get("embeddings", [])
    if len(embeddings) != len(texts):
        raise RuntimeError(f"Expected {len(texts)} embeddings, got {len(embeddings)}")
    return [[float(v) for v in vec] for vec in embeddings]


def ingest_records(project: str, records: list[dict[str, Any]], progress_bar=None) -> int:
    table = get_table(project)
    BATCH_SIZE = 30
    total = len(records)
    added = 0

    for i in range(0, total, BATCH_SIZE):
        batch = records[i : i + BATCH_SIZE]
        texts = [b.get("text", "").strip() for b in batch if b.get("text", "").strip()]
        if not texts:
            continue
        vectors = batch_embed_texts(texts)

        rows = []
        for b, vec in zip(batch, vectors):
            rows.append({
                "record_id": b.get("record_id") or str(uuid.uuid4()),
                "text": b.get("text", ""),
                "category": b.get("category", "general"),
                "symbol": b.get("symbol", "")[:120],
                "entity_type": b.get("entity_type", "General"),
                "verified": bool(b.get("verified", True)),
                "created_at": b.get("created_at") or _iso_now(),
                "vector": vec,
            })
        table.add(rows)
        added += len(rows)
        if progress_bar:
            progress_bar.progress(min(1.0, added / total))

    rebuild_fts(table)
    return added


# ---------------------------------------------------------------------------
# Sidebar & Global Header Controls
# ---------------------------------------------------------------------------

available_projects = get_available_projects()

st.sidebar.title("🧠 LanceDB Control")
default_idx = 0
project = st.sidebar.selectbox("Active Project Partition", available_projects, index=default_idx)

st.sidebar.markdown("---")
st.sidebar.subheader("⏱️ Auto-Refresh Controls")
auto_refresh = st.sidebar.toggle("Auto-Refresh Enabled", value=False)
refresh_interval = st.sidebar.selectbox(
    "Refresh Interval",
    [60, 30, 120, 300],
    index=0,
    format_func=lambda s: f"{s} seconds (1 min)" if s == 60 else (f"{s//60} minutes" if s >= 60 else f"{s} seconds"),
    disabled=not auto_refresh,
)
if st.sidebar.button("🔄 Refresh Now", use_container_width=True):
    st.rerun()

st.sidebar.markdown("---")
st.sidebar.caption("Partitions are directory-based under PROJECT_MEMORIES_ROOT.\nSet PROJECT_MEMORY_PROJECTS to pre-seed project names.")

# Top Header Navigation Tabs
tabs = st.tabs([
    "📊 System Monitor",
    "📂 View & Search Memories",
    "📜 Rules & Directives (Mem0)",
    "🏷️ Category Controls",
    "🪙 Token Estimate Lab",
    "📥 Export & Import",
    "🗑️ Delete & Purge",
    "🛠️ Maintenance",
])

# ---------------------------------------------------------------------------
# TAB 1: System Monitor
# ---------------------------------------------------------------------------
with tabs[0]:
    st.title("📊 System Telemetry & Partition Health")
    
    units = {name: unit_state(name) for name in SERVICE_UNITS}
    http_ok, http_message = probe(HTTP_URL)
    ol_ok, ol_message = ollama_status()
    b_ok, b_message = extraction_llm_status()
    audits = [audit_project(name) for name in available_projects]
    logs = journal()

    m1, m2, m3, m4 = st.columns(4)
    m1.metric("FastMCP HTTP", "ACTIVE" if http_ok else "OFFLINE", http_message)
    m2.metric("Extraction LLM", "ONLINE" if b_ok else "OFFLINE", b_message)
    m3.metric("Ollama Embeddings", "READY" if ol_ok else "OFFLINE", ol_message)
    m4.metric("Active Partitions", len(available_projects), "Unified access")


    st.markdown("### 🗄️ LanceDB Partition Ledger")
    st.dataframe(
        pd.DataFrame([{
            "Project Partition": item["project"],
            "Total Rows": item["rows"],
            "Disk Size (MB)": round(item["disk_bytes"] / 1_000_000, 3),
            "FTS Indices": ", ".join(item.get("indices", [])),
            "Duplicates": item.get("duplicate_text", 0),
            "Schema": f"v{item.get('schema_version', 2)}",
        } for item in audits]),
        width="stretch",
        hide_index=True,
    )

    with st.expander("📋 Live Service Logs & Journal", expanded=False):
        st.code(logs or "(no logs in this time window)", language="text")

# ---------------------------------------------------------------------------
# TAB 2: View & Search Memories (Entry Tier)
# ---------------------------------------------------------------------------
with tabs[1]:
    st.title(f"📂 View Memories & Entry Controls · {project}")

    # Search & Filtering Bar
    col_q, col_cat_f, col_lim = st.columns([3, 2, 1])
    search_q = col_q.text_input("🔍 Semantic / Hybrid Search", placeholder="e.g. SpaceCanvas, connection, token...")
    result_limit = col_lim.slider("Limit", 5, 500, 50)

    df_all = get_project_records(project, limit=result_limit)
    all_cats = ["(All Categories)"] + sorted(df_all["category"].unique().tolist()) if not df_all.empty and "category" in df_all.columns else ["(All Categories)"]
    selected_cat_filter = col_cat_f.selectbox("Filter by Category", all_cats)

    if search_q.strip():
        with st.spinner("Searching..."):
            hits = hybrid_search(search_q.strip(), limit=result_limit, project=project)
        df_display = pd.DataFrame(hits)
        st.success(f"Found {len(hits)} matching memories for '{search_q}':")
    else:
        df_display = df_all
        if selected_cat_filter != "(All Categories)" and not df_display.empty:
            df_display = df_display[df_display["category"] == selected_cat_filter]
        st.markdown(f"**Displaying {len(df_display)} records in `{project}`:**")

    if not df_display.empty:
        st.dataframe(df_display, width="stretch", hide_index=True)
    else:
        st.info(f"No records found in {project}.")

    # Direct Entry Actions Expander
    st.markdown("---")
    c_add, c_del_single = st.columns(2)

    with c_add:
        with st.expander("➕ Create New Memory Entry", expanded=False):
            with st.form("add_memory_form", clear_on_submit=True):
                in_text = st.text_area("Memory Text / Note", placeholder="Enter architectural notes, code symbol, or fact...")
                ca, cb = st.columns(2)
                in_symbol = ca.text_input("Symbol / Name", placeholder="e.g. SpaceCanvas")
                in_category = cb.text_input("Category", value="general")
                cc, cd = st.columns(2)
                in_entity = cc.selectbox("Entity Type", EXTENDED_ENTITY_TYPES, index=len(EXTENDED_ENTITY_TYPES) - 1)
                in_verified = cd.checkbox("Verified / Canonical", value=True)
                if st.form_submit_button("💾 Save Entry", type="primary", use_container_width=True):
                    if in_text.strip():
                        try:
                            rid = add_record(project, in_text, in_category, in_symbol, in_entity, in_verified)
                            st.success(f"Created record: `{rid}`")
                            time.sleep(0.5)
                            st.rerun()
                        except Exception as e:
                            st.error(f"Error: {e}")
                    else:
                        st.warning("Text content cannot be empty.")

    with c_del_single:
        with st.expander("🗑️ Delete Single Record by UUID", expanded=False):
            del_uuid = st.text_input("Record UUID to remove", placeholder="Copy UUID from table")
            if st.button("Delete Record Now", type="secondary", disabled=not del_uuid.strip(), use_container_width=True):
                try:
                    num = delete_record(project, del_uuid.strip())
                    st.success(f"Deleted {num} record successfully.")
                    time.sleep(0.5)
                    st.rerun()
                except Exception as e:
                    st.error(f"Failed to delete: {e}")

# ---------------------------------------------------------------------------
# TAB 3: Rules & Directives (Mem0 Dissection Tier)
# ---------------------------------------------------------------------------
with tabs[2]:
    st.title("📜 Rules, System Prompts & Directives (Mem0 Dissection)")
    st.markdown("Manage persistent agent rules, user preferences, and operational constraints extracted from Mem0.")

    r_col1, r_col2 = st.columns([1, 1])

    with r_col1:
        st.subheader("➕ Author New Rule / Directive")
        with st.form("new_rule_form", clear_on_submit=True):
            r_title = st.text_input("Rule Name / Invariant", placeholder="e.g. NEVER_COMMIT_SECRETS")
            r_type = st.selectbox("Rule Classification", ["Rule", "Directive", "Preference", "Constraint", "Architecture Invariant"])
            r_category = st.selectbox("Category", ["system_rule", "coding_preference", "security_constraint", "agent_rule", "ui_rule"])
            r_content = st.text_area("Rule Description / Directives", height=120, placeholder="Define the strict behavior or persistent rule for your agent...")
            r_canonical = st.checkbox("High Priority / Enforced", value=True)

            if st.form_submit_button("📌 Enforce & Save Rule", type="primary", use_container_width=True):
                if r_content.strip():
                    try:
                        composed_text = f"[RULE: {r_title.strip() or 'DIRECTIVE'}] {r_content.strip()}"
                        rid = add_record(project, composed_text, r_category, r_title.strip(), r_type, r_canonical)
                        st.success(f"Rule `{r_title}` registered into `{project}` memory ledger!")
                        time.sleep(0.5)
                        st.rerun()
                    except Exception as e:
                        st.error(f"Failed to save rule: {e}")
                else:
                    st.warning("Rule content is required.")

    with r_col2:
        st.subheader(f"📋 Enforced Rules in `{project}`")
        df_rules = get_project_records(project, limit=1000)
        rule_mask = (df_rules["entity_type"].isin(["Rule", "Directive", "Preference"])) | (df_rules["category"].str.contains("rule", case=False, na=False))
        active_rules = df_rules[rule_mask] if not df_rules.empty else pd.DataFrame()

        if not active_rules.empty:
            for _, r in active_rules.iterrows():
                card_cls = "pref-card" if r.get("entity_type") == "Preference" else "rule-card"
                st.markdown(f'<div class="{card_cls}">', unsafe_allow_html=True)
                st.markdown(f"**{r.get('symbol') or 'RULE'}** · `{r.get('category')}` · `{r.get('entity_type')}`")
                st.write(r.get("text", ""))
                st.caption(f"ID: `{r.get('record_id')}` | Added: {r.get('created_at', '')[:19]}")
                if st.button(f"Delete Rule", key=f"del_rule_{r.get('record_id')}"):
                    delete_record(project, r.get("record_id"))
                    st.success("Rule removed.")
                    time.sleep(0.5)
                    st.rerun()
                st.markdown('</div>', unsafe_allow_html=True)
        else:
            st.info("No active rules found in this partition. Add rules using the form on the left.")

# ---------------------------------------------------------------------------
# TAB 4: Category Controls
# ---------------------------------------------------------------------------
with tabs[3]:
    st.title(f"🏷️ Category Management · {project}")
    st.markdown("Perform bulk operations on whole memory categories within the active partition.")

    df_p = get_project_records(project, limit=5000)
    if not df_p.empty and "category" in df_p.columns:
        cat_counts = df_p["category"].value_counts().reset_index()
        cat_counts.columns = ["Category Name", "Record Count"]

        st.subheader("Category Breakdown")
        st.dataframe(cat_counts, width="stretch", hide_index=True)

        st.markdown("---")
        c_ren, c_del_c = st.columns(2)

        with c_ren:
            st.subheader("✏️ Rename Category")
            sel_old = st.selectbox("Select Category to Rename", cat_counts["Category Name"].tolist(), key="rename_old")
            new_name = st.text_input("New Category Name", placeholder="e.g. core_architecture")
            if st.button("Rename Category Across All Records", disabled=not new_name.strip(), use_container_width=True):
                try:
                    updated = rename_category(project, sel_old, new_name.strip())
                    st.success(f"Renamed category '{sel_old}' to '{new_name.strip()}' for {updated} records!")
                    time.sleep(0.5)
                    st.rerun()
                except Exception as e:
                    st.error(f"Rename failed: {e}")

        with c_del_c:
            st.subheader("🗑️ Delete Entire Category")
            sel_del = st.selectbox("Select Category to Purge", cat_counts["Category Name"].tolist(), key="purge_cat_sel")
            cnt = int(cat_counts[cat_counts["Category Name"] == sel_del]["Record Count"].iloc[0])
            st.write(f"This will permanently delete **{cnt}** records in `{sel_del}`.")
            confirm_cat_del = st.checkbox(f"Yes, purge all {cnt} records in category '{sel_del}'", key="chk_del_cat")
            if st.button(f"Delete Category '{sel_del}'", disabled=not confirm_cat_del, type="secondary", use_container_width=True):
                try:
                    deleted = delete_by_category(project, sel_del)
                    st.success(f"Purged {deleted} records from '{sel_del}'!")
                    time.sleep(0.5)
                    st.rerun()
                except Exception as e:
                    st.error(f"Delete failed: {e}")
    else:
        st.info(f"No records or categories found in {project}.")

# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# TAB 5: Token Estimate Lab
# ---------------------------------------------------------------------------
with tabs[4]:
    st.title("🪙 Token Estimate Workbench")
    st.markdown("Rough token-count estimate for pasted text (heuristic; no external token library required).")

    t_input = st.text_area("Analyze Text / Prompt", placeholder="Paste prompt or text here to estimate token count...", height=140)

    if t_input.strip():
        try:
            token_count = max(1, len(t_input) // 4)

            c1, c2 = st.columns(2)
            c1.metric("Estimated Tokens", f"{token_count:,}", "tokens (heuristic)")
            c2.metric("Local Ollama Cost", "$0.0000", "100% Free / Local")

            models_to_compare = [
                ("gemini-2.0-flash", "Gemini 2.0 Flash"),
                ("gemini-1.5-pro", "Gemini 1.5 Pro"),
                ("claude-3-5-sonnet", "Claude 3.5 Sonnet"),
                ("gpt-4o", "GPT-4o"),
                ("gpt-4o-mini", "GPT-4o Mini"),
            ]

            st.caption(
                "Model names below are illustrative only — plug in your own "
                "token/cost library (e.g. tiktoken + provider pricing) for "
                "real cost estimates."
            )
            st.dataframe(
                pd.DataFrame([{"Model": name} for _, name in models_to_compare]),
                width="stretch",
                hide_index=True,
            )

        except Exception as exc:
            st.info(f"Token heuristic: ~{max(1, len(t_input) // 4)} tokens ({exc})")
    else:
        st.info("Enter or paste text above to estimate token counts.")

    st.markdown("---")
    st.subheader(f"📊 Local Extraction Budget Quota · {project}")
    try:
        from lance_memory import LanceMemory
        from lance_memory.config import load_config
        cfg = load_config({"vector_store": {"config": {"uri": str(project_db_path(project))}}})
        m = LanceMemory(cfg)
        b_hour = m.write_harness.tracker.count("hour")
        b_day = m.write_harness.tracker.count("day")
        q1, q2 = st.columns(2)
        q1.metric("LLM Extractions This Hour", f"{b_hour} / 60", f"{60 - b_hour} remaining")
        q2.metric("LLM Extractions Today", f"{b_day} / 400", f"{400 - b_day} remaining")
    except Exception as exc:
        st.caption(f"Budget tracker inactive or empty for {project}: {exc}")

# TAB 6: Export & Import
# ---------------------------------------------------------------------------
with tabs[5]:
    st.title(f"📥 Export & Import · {project}")

    e_col, i_col = st.columns(2)

    with e_col:
        st.subheader("💾 Extract / Export Memories")
        st.write(f"Export all memories from **`{project}`** directly into a structured JSON dataset.")

        df_exp = get_project_records(project, limit=10_000)
        recs = df_exp.to_dict(orient="records") if not df_exp.empty else []

        payload = {
            "project": project,
            "exported_at": datetime.now(timezone.utc).isoformat(),
            "count": len(recs),
            "records": recs,
        }
        st.download_button(
            label=f"⬇️ Download {project} Dataset ({len(recs)} records as JSON)",
            data=json.dumps(payload, indent=2),
            file_name=f"{project}_memories_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json",
            use_container_width=True,
            disabled=len(recs) == 0,
        )

    with i_col:
        st.subheader("📂 Ingest / Import Memories")
        st.write(f"Upload external JSON records to batch-embed and insert into **`{project}`**.")

        uploaded = st.file_uploader("Upload JSON File", type=["json"], key="json_uploader")
        if uploaded:
            try:
                data = json.loads(uploaded.getvalue().decode("utf-8"))
                import_recs = data.get("records", []) if isinstance(data, dict) else data
                st.info(f"Ready to ingest **{len(import_recs)}** records from `{uploaded.name}`.")
                if st.button(f"🚀 Begin Ingestion & Embedding", type="primary", use_container_width=True):
                    pb = st.progress(0.0)
                    with st.spinner("Processing embeddings..."):
                        c = ingest_records(project, import_recs, progress_bar=pb)
                    st.success(f"Ingested {c} memories successfully!")
                    time.sleep(1.0)
                    st.rerun()
            except Exception as e:
                st.error(f"Invalid JSON: {e}")

# ---------------------------------------------------------------------------
# TAB 6: Delete & Purge (Project Tier Down)
# ---------------------------------------------------------------------------
with tabs[6]:
    st.title("🗑️ Comprehensive Delete & Project Management")
    st.markdown("Straightforward controls to manage database lifecycles: from project-level deletion down to single entries.")

    # 1. Complete Project Folder Deletion
    st.markdown("---")
    st.subheader(f"💥 Complete Project Removal from Disk (`{project}`)")
    st.write(f"Permanently delete the entire **`{project}`** directory (`{project_db_path(project)}`) from disk.")

    with st.container():
        st.markdown('<div class="danger-box">', unsafe_allow_html=True)
        st.warning(f"⚠️ MAXIMUM DANGER: This completely deletes the folder on the server. A snapshot backup will be saved first.")
        req_phrase = f"DELETE {project}"
        confirm_input = st.text_input(f"Type '{req_phrase}' to execute complete project folder removal:", key="del_proj_input")
        if st.button(f"🔥 Delete Project Folder '{project}'", disabled=confirm_input != req_phrase, type="secondary"):
            with st.spinner(f"Removing {project} from disk..."):
                try:
                    delete_project_completely(project)
                    st.success(f"Successfully deleted project folder `{project}`! Backup preserved.")
                    time.sleep(1.0)
                    st.rerun()
                except Exception as e:
                    st.error(f"Error removing project: {e}")
        st.markdown('</div>', unsafe_allow_html=True)

    # 2. Table Purge (Wipe and recreate schema)
    st.markdown("---")
    st.subheader(f"🧹 Truncate / Wipe Records (`{project}`)")
    st.write(f"Wipe all records in `{project}` but keep the project folder intact with a blank schema.")
    
    with st.container():
        st.markdown('<div class="danger-box">', unsafe_allow_html=True)
        wipe_phrase = f"WIPE {project}"
        confirm_wipe = st.text_input(f"Type '{wipe_phrase}' to clear all records:", key="wipe_proj_input")
        if st.button(f"Clear All Records in '{project}'", disabled=confirm_wipe != wipe_phrase):
            try:
                purge_project(project)
                st.success(f"Table in `{project}` purged and reset to blank state!")
                time.sleep(1.0)
                st.rerun()
            except Exception as e:
                st.error(f"Error: {e}")
        st.markdown('</div>', unsafe_allow_html=True)

    # 3. Create New Project Partition
    st.markdown("---")
    st.subheader("➕ Provision New Project Partition")
    new_proj_name = st.text_input("New Project Name", placeholder="e.g. ResearchBot")
    if st.button("Create Partition", disabled=not new_proj_name.strip()):
        try:
            create_new_project(new_proj_name.strip())
            st.success(f"Project `{new_proj_name.strip()}` provisioned with blank LanceDB table & FTS indices!")
            time.sleep(1.0)
            st.rerun()
        except Exception as e:
            st.error(f"Creation failed: {e}")

# ---------------------------------------------------------------------------
# TAB 7: Maintenance
# ---------------------------------------------------------------------------
with tabs[7]:
    st.title("🛠️ Database Maintenance & Snapshots")
    
    col_t1, col_t2, col_t3 = st.columns(3)
    with col_t1:
        if st.button("🔄 Rebuild FTS Index", use_container_width=True):
            with st.spinner("Rebuilding full-text indexes..."):
                r = rebuild_fts(get_table(project))
                st.success(f"FTS Rebuild OK: {r}")
    with col_t2:
        if st.button("📦 Take Project Snapshot", use_container_width=True):
            bk = backup_project(project, "manual")
            st.success(f"Backup saved: {bk}")
    with col_t3:
        if st.button("⚡ Optimize Table", use_container_width=True):
            res = get_table(project).optimize(cleanup_older_than=timedelta(days=7))
            st.success(f"Optimized: {res}")

    st.markdown("---")
    st.subheader("📁 Saved Recovery Snapshots")
    backups = []
    if BACKUP_ROOT.exists():
        for item in sorted(BACKUP_ROOT.iterdir(), key=lambda path: path.stat().st_mtime, reverse=True)[:30]:
            backups.append({
                "Snapshot Name": item.name,
                "Created At": datetime.fromtimestamp(item.stat().st_mtime, tz=timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC"),
                "Path": str(item),
            })
    if backups:
        st.dataframe(pd.DataFrame(backups), width="stretch", hide_index=True)
    else:
        st.info("No recovery snapshots found.")

# Trigger Auto-Refresh if enabled
if auto_refresh:
    st.markdown(f'<meta http-equiv="refresh" content="{refresh_interval}">', unsafe_allow_html=True)
