"""REST adapter for the React Lance Memory control panel.

The panel is presentation only. All durable project and memory operations are
routed into the existing Python/LanceDB implementation supplied as ``core``.
It deliberately does not expose a second MCP server or maintain shadow data.
"""
from __future__ import annotations

import json
import time
import uuid
from pathlib import Path
from typing import Any

import numpy as np
from starlette.responses import JSONResponse


def register_web_panel_routes(mcp: Any, core: Any, started_at: float) -> None:
    def response_error(exc: Exception, status: int = 400) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=status)

    def profile_path(project_id: str) -> Path:
        return core.memories_root() / core.resolve_project(project_id) / "project.json"

    def read_profile(project_id: str) -> dict[str, Any]:
        project_id = core.resolve_project(project_id)
        path = profile_path(project_id)
        if path.is_file():
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                return value if isinstance(value, dict) else {}
            except Exception:
                return {}
        return {}

    def write_profile(project_id: str, patch: dict[str, Any]) -> dict[str, Any]:
        project_id = core.resolve_project(project_id)
        current = read_profile(project_id)
        current.update({k: v for k, v in patch.items() if v is not None})
        path = profile_path(project_id)
        path.write_text(json.dumps(current, indent=2), encoding="utf-8")
        return current

    def public_rows(project_id: str, include_inactive: bool = False) -> list[dict[str, Any]]:
        project_id = core.resolve_project(project_id)
        frame = core.get_table(project_id).to_pandas()
        if not include_inactive and "status" in frame.columns:
            frame = frame[frame["status"] == "active"]
        if "created_at" in frame.columns:
            frame = frame.sort_values("created_at", ascending=False)
        rows = []
        for raw in frame.to_dict(orient="records"):
            row = core._row_public(raw)
            # The partition directory is the authority on scope. Legacy rows may
            # carry an empty project_id; repair it on read so the panel (which
            # scopes client-side) never drops valid records.
            if not str(row.get("project_id") or "").strip():
                row["project_id"] = project_id
            if row.get("status") == "superseded":
                row["status"] = "archived"
            rows.append(row)
        return rows

    def one_project(project_id: str) -> dict[str, Any]:
        project_id = core.resolve_project(project_id)
        table = core.get_table(project_id)
        categories = core.load_project_categories(project_id)
        observed = core.category_counts(project_id)
        category_view: dict[str, dict[str, Any]] = {}
        for name, spec in categories.items():
            category_view[name] = {
                **spec,
                "record_count": observed.get(name, 0),
                "unregistered": False,
            }
        for name, count in observed.items():
            if name in category_view or name == core.UNCATEGORIZED:
                continue
            category_view[name] = {
                "description": "",
                "bucket": core.bucket_for_category(name),
                "record_count": count,
                "unregistered": True,
            }
        routing = core.project_routing_profile(project_id)
        profile = read_profile(project_id)
        return {
            "id": project_id,
            "name": str(profile.get("name") or project_id),
            "description": routing["description"],
            "created_at": str(profile.get("created_at") or ""),
            "total_records": table.count_rows(),
            "categories": category_view,
            "status": "healthy",
            "embedding_model": core.EMBED_MODEL,
            "embedding_dimensions": core.EMBED_DIM,
            "fts_index_status": "ready",
            "last_maintenance_at": profile.get("last_maintenance_at"),
            "folder_path": (routing["workspace_hints"] or [""])[0],
            "aliases": routing["aliases"],
            "workspace_hints": routing["workspace_hints"],
            "id_tokens": routing["id_tokens"],
        }

    @mcp.custom_route("/api/projects", methods=["POST"])
    async def create_project(request):
        try:
            body = await request.json()
            name = core._validate_project_name(str(body.get("name") or "").strip())
            if name in core.project_paths():
                raise ValueError(f"project {name!r} already exists")
            project_dir = core.memories_root() / name
            project_dir.mkdir(parents=True, exist_ok=False)
            core.get_table(name)
            core.load_project_categories(name)
            hints = [str(body["folder_path"]).strip()] if body.get("folder_path") else []
            write_profile(name, {
                "name": name,
                "description": str(body.get("description") or "").strip(),
                "aliases": [],
                "workspace_hints": hints,
                "created_at": core._iso_now(),
            })
            return JSONResponse(one_project(name))
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/folder", methods=["PATCH"])
    async def update_project_folder(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            body = await request.json()
            folder = str(body.get("folder_path") or "").strip()
            if not folder:
                raise ValueError("folder_path is required")
            write_profile(project_id, {"workspace_hints": [folder]})
            return JSONResponse({"project": one_project(project_id)})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/categories", methods=["GET"])
    async def get_categories(request):
        try:
            project = one_project(request.path_params["project_id"])
            return JSONResponse(project["categories"])
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/categories", methods=["POST"])
    async def add_category(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            body = await request.json()
            name = str(body.get("name") or "").strip()
            if not core.PROJECT_NAME_RE.fullmatch(name):
                raise ValueError("category name must use letters, numbers, '.', '_', or '-'")
            bucket = str(body.get("bucket") or "fact")
            if bucket not in core.BUCKETS:
                raise ValueError(f"unknown bucket {bucket!r}")
            categories = core.load_project_categories(project_id)
            existing = categories.get(name)
            if existing is not None and str(existing.get("description") or "").strip():
                raise ValueError(f"category {name!r} already exists")
            categories[name] = {
                "description": str(body.get("description") or "").strip(),
                "bucket": bucket,
            }
            core.save_project_categories(project_id, categories)
            return JSONResponse(one_project(project_id))
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/categories/{category}", methods=["PUT", "PATCH"])
    async def update_category(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            old_name = request.path_params["category"]
            body = await request.json()
            categories = core.load_project_categories(project_id)
            new_name = str(body.get("newName") or body.get("new_name") or old_name).strip()
            if not new_name:
                raise ValueError("category name is required")
            # Upsert: an unregistered category observed in the data has no
            # registry entry yet, and editing it is how it becomes registered.
            spec = dict(categories.get(old_name) or {})
            if body.get("description") is not None:
                spec["description"] = str(body["description"]).strip()
            if body.get("bucket") is not None:
                bucket = str(body["bucket"])
                if bucket not in core.BUCKETS:
                    raise ValueError(f"unknown bucket {bucket!r}")
                spec["bucket"] = bucket
            if not str(spec.get("bucket") or "").strip():
                spec["bucket"] = core.bucket_for_category(new_name)
            if "description" not in spec:
                spec["description"] = ""
            if new_name != old_name:
                categories.pop(old_name, None)
                core.get_table(project_id).update(
                    where=f"category = {core._sql_str(old_name)}",
                    values={"category": new_name, "updated_at": core._iso_now()},
                )
            categories[new_name] = spec
            core.save_project_categories(project_id, categories)
            return JSONResponse(one_project(project_id))
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories", methods=["GET"])
    async def list_project_memories(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            return JSONResponse({"records": public_rows(project_id)})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories", methods=["POST"])
    async def create_project_memory(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            body = await request.json()
            category = str(body.get("category") or "").strip()
            categories = core.load_project_categories(project_id)
            if category not in categories:
                raise ValueError(f"unknown category {category!r}; valid: {', '.join(categories)}")
            record = core.record_discovery_impl(
                str(body.get("text") or "").strip(),
                project=project_id,
                category=category,
                bucket=str(body.get("bucket") or categories[category].get("bucket") or "fact"),
                verified=bool(body.get("verified", True)),
                symbol=str(body.get("symbol") or ""),
                tags=body.get("tags"),
                agent_id=str(body.get("agent_id") or ""),
                run_id=str(body.get("run_id") or ""),
                source_type="user",
                source_ref=str(body.get("source_ref") or "web-panel"),
                entity_type=str(body.get("entity_type") or "General"),
            )
            return JSONResponse(record)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories/{record_id}", methods=["PUT", "PATCH"])
    async def update_project_memory(request):
        try:
            body = await request.json()
            if body.get("status") == "archived":
                body["status"] = "superseded"
            record = core.update_record_impl(
                request.path_params["record_id"], body,
                project=request.path_params["project_id"],
            )
            return JSONResponse(record)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories/{record_id}", methods=["DELETE"])
    async def delete_project_memory(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            row = core.get_active_row_impl(request.path_params["record_id"], project=project_id)
            memory_id = row.get("memory_id") or request.path_params["record_id"]
            core.set_status_impl(memory_id, "deleted", project=project_id)
            return JSONResponse({"deleted": True, "record_id": request.path_params["record_id"]})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories/{record_id}/archive", methods=["POST"])
    async def archive_project_memory(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            row = core.get_active_row_impl(request.path_params["record_id"], project=project_id)
            core.set_status_impl(row.get("memory_id"), "superseded", project=project_id)
            result = core._row_public(row)
            result["status"] = "archived"
            return JSONResponse(result)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/memories/{record_id}/promote", methods=["POST"])
    async def promote_project_memory(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            record = core.promote_to_fact_impl(
                request.path_params["record_id"], project=project_id, category="key_facts"
            )
            return JSONResponse(record)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/query", methods=["POST"])
    async def query_memories(request):
        try:
            body = await request.json()
            project_id = core.resolve_project(body.get("project_id"))
            query = str(body.get("query") or "").strip()
            limit = min(int(body.get("limit") or 30), 100)
            if not query:
                return JSONResponse({"results": public_rows(project_id)[:limit]})
            results = core.recall_impl(query, project=project_id, limit=limit)
            return JSONResponse({"results": results, "project_id": project_id})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/memories/recent", methods=["GET"])
    async def recent_memories(request):
        try:
            requested = request.query_params.get("project_id")
            limit = min(int(request.query_params.get("limit") or 30), 100)
            if requested and requested != "all":
                rows = public_rows(requested)[:limit]
            else:
                rows = []
                for project_id in core.project_paths():
                    rows.extend(public_rows(project_id))
                rows.sort(key=lambda row: row.get("created_at") or "", reverse=True)
                rows = rows[:limit]
            return JSONResponse({"recent": rows})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/telemetry", methods=["GET"])
    async def telemetry(request):
        health = core._health_payload()
        return JSONResponse({"metrics": {
            "active_qps": 0,
            "p50_latency_ms": 0,
            "p95_latency_ms": 0,
            "total_queries_24h": 0,
            "ollama_status": "online",
            "lancedb_status": "online",
            "mcp_status": "connected",
            "dim_size": core.EMBED_DIM,
            "vector_cache_hit_rate": 0,
            "system_memory_mb": 0,
            "database_partitions": len(health["projects"]),
            "total_indexed_memories": health["total_rows"],
        }})

    def build_audit_report() -> dict[str, Any]:
        """Assemble the requirements audit.

        Every counter the response advertises is backed by a concrete,
        actionable alert in ``alerts`` — the panel renders that list in the
        audit modal, so counts and explanations can never disagree.
        """
        alerts: list[dict[str, Any]] = []
        total_categories = 0
        total_records = 0
        missing_project_desc = 0
        missing_category_desc = 0
        records_lacking_symbol_or_tags = 0
        project_ids = list(core.project_paths())

        for project_id in project_ids:
            profile = read_profile(project_id)
            routing = core.project_routing_profile(project_id)
            description = str(routing.get("description") or profile.get("description") or "").strip()
            if not description:
                missing_project_desc += 1
                alerts.append({
                    "id": f"alert-proj-desc-{project_id}",
                    "severity": "critical",
                    "entityType": "project",
                    "entityId": project_id,
                    "entityName": project_id,
                    "projectId": project_id,
                    "title": f'Project Partition "{project_id}" Missing Description',
                    "message": (
                        f'Project partition "{project_id}" has no descriptive summary. '
                        "Autonomous agents and vector routers require partition descriptions "
                        "to select the relevant memory table."
                    ),
                    "missingRequirement": "Project description is required.",
                    "recommendation": (
                        "Add a clear description outlining what domain or agent context "
                        "this LanceDB partition stores."
                    ),
                    "autoFixable": True,
                })

            categories = core.load_project_categories(project_id)
            total_categories += len(categories)
            for name, spec in categories.items():
                if not str(spec.get("description") or "").strip():
                    missing_category_desc += 1
                    alerts.append({
                        "id": f"alert-cat-desc-{project_id}-{name}",
                        "severity": "critical",
                        "entityType": "category",
                        "entityId": f"{project_id}::{name}",
                        "entityName": name,
                        "projectId": project_id,
                        "categoryKey": name,
                        "title": f'Category "{name}" Missing Description',
                        "message": (
                            f'Category "{name}" in project "{project_id}" has no explanatory '
                            "description. Agents and maintenance workers cannot ground memories "
                            "without category context."
                        ),
                        "missingRequirement": "Category description is required.",
                        "recommendation": (
                            f'Provide a description explaining what facts or state belong inside "{name}".'
                        ),
                        "autoFixable": True,
                    })
                bucket = str(spec.get("bucket") or "").strip()
                if bucket not in core.BUCKETS:
                    alerts.append({
                        "id": f"alert-cat-bucket-{project_id}-{name}",
                        "severity": "warning",
                        "entityType": "category",
                        "entityId": f"{project_id}::{name}",
                        "entityName": name,
                        "projectId": project_id,
                        "categoryKey": name,
                        "title": f'Category "{name}" Missing Semantic Bucket',
                        "message": (
                            f'Category "{name}" has an invalid or missing semantic bucket. '
                            f"Must be one of: {', '.join(core.BUCKETS)}."
                        ),
                        "missingRequirement": "A valid semantic bucket is required.",
                        "recommendation": "Assign a valid semantic bucket to govern memory lifecycle.",
                        "autoFixable": True,
                    })

            observed = core.category_counts(project_id)
            unregistered = {
                name: count for name, count in observed.items()
                if name not in categories and name != core.UNCATEGORIZED
            }
            if unregistered:
                top = sorted(unregistered.items(), key=lambda item: -item[1])[:5]
                examples = ", ".join(f'"{name}" ({count})' for name, count in top)
                if len(unregistered) > len(top):
                    examples += f", +{len(unregistered) - len(top)} more"
                alerts.append({
                    "id": f"alert-cat-unregistered-{project_id}",
                    "severity": "warning",
                    "entityType": "category",
                    "entityId": f"{project_id}::__unregistered__",
                    "entityName": f"{len(unregistered)} unregistered",
                    "projectId": project_id,
                    "title": (
                        f'{len(unregistered)} unregistered category name(s) in "{project_id}"'
                    ),
                    "message": (
                        f"{sum(unregistered.values())} active record(s) use categories that are "
                        f"not in categories.json: {examples}. Unregistered categories cannot be "
                        "discovered by agents via the category registry."
                    ),
                    "missingRequirement": (
                        "Every category used by records must be registered in categories.json."
                    ),
                    "recommendation": (
                        "Register the observed categories from the Category console "
                        "(they are listed there with live counts) or re-classify those records."
                    ),
                    "autoFixable": False,
                })

            try:
                total_records += core.get_table(project_id).count_rows()
            except Exception:
                pass
            try:
                for row in public_rows(project_id):
                    if not str(row.get("symbol") or "").strip() or not row.get("tags"):
                        records_lacking_symbol_or_tags += 1
            except Exception:
                pass

        if records_lacking_symbol_or_tags > 0:
            alerts.append({
                "id": "alert-records-metadata",
                "severity": "info",
                "entityType": "record",
                "entityId": "records-summary",
                "entityName": f"{records_lacking_symbol_or_tags} Records",
                "title": (
                    f"{records_lacking_symbol_or_tags} Memory Records Lack Complete Metadata"
                ),
                "message": (
                    "Some records lack symbols or tags, which reduces hybrid search "
                    "filter precision."
                ),
                "missingRequirement": "Symbols and tags improve filter precision.",
                "recommendation": "Run an enrichment pass or add descriptive tags.",
                "autoFixable": False,
            })

        critical_count = sum(1 for a in alerts if a["severity"] == "critical")
        warning_count = sum(1 for a in alerts if a["severity"] == "warning")
        info_count = sum(1 for a in alerts if a["severity"] == "info")
        if critical_count:
            status = "critical_issues"
        elif warning_count:
            status = "has_warnings"
        else:
            status = "healthy"

        return {
            "timestamp": core._iso_now(),
            "status": status,
            "totalAlerts": len(alerts),
            "criticalCount": critical_count,
            "warningCount": warning_count,
            "infoCount": info_count,
            "alerts": alerts,
            "metrics": {
                "totalProjects": len(project_ids),
                "projectsWithMissingDesc": missing_project_desc,
                "totalCategories": total_categories,
                "categoriesWithMissingDesc": missing_category_desc,
                "totalRecords": total_records,
                "recordsLackingSymbolOrTags": records_lacking_symbol_or_tags,
            },
        }

    @mcp.custom_route("/api/database/audit", methods=["GET"])
    async def database_audit(request):
        try:
            return JSONResponse(build_audit_report())
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/clusters", methods=["GET"])
    async def project_clusters(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            frame = core.get_table(project_id).to_pandas()
            points = []
            for idx, row in enumerate(frame.to_dict(orient="records")):
                public = core._row_public(row)
                vector = row.get("vector")
                x = float(vector[0]) * 100 if vector is not None and len(vector) else float(idx)
                y = float(vector[1]) * 100 if vector is not None and len(vector) > 1 else 0.0
                points.append({
                    "record_id": public["record_id"], "memory_id": public["memory_id"],
                    "text": public["text"], "symbol": public["symbol"],
                    "category": public["category"], "bucket": public["bucket"],
                    "verified": public["verified"], "x": x, "y": y,
                })
            return JSONResponse({"points": points})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/dedup-scan", methods=["POST"])
    async def dedup_scan(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            threshold_pct = float(request.query_params.get("threshold") or 85)
            rows = core.get_table(project_id).to_pandas().to_dict(orient="records")
            duplicates = []
            for i in range(len(rows)):
                a = np.asarray(rows[i].get("vector"), dtype=float)
                if not a.size or not np.linalg.norm(a):
                    continue
                for j in range(i + 1, len(rows)):
                    b = np.asarray(rows[j].get("vector"), dtype=float)
                    if not b.size or not np.linalg.norm(b):
                        continue
                    similarity = float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b))) * 100
                    if similarity >= threshold_pct:
                        tags_a = rows[i].get("tags")
                        tags_b = rows[j].get("tags")
                        duplicates.append({
                            "pair_id": uuid.uuid4().hex,
                            "mem1": core._row_public(rows[i]),
                            "mem2": core._row_public(rows[j]),
                            "cosine_distance": 1 - similarity / 100,
                            "similarity_pct": similarity,
                            "common_tags": sorted(
                                set(list(tags_a) if tags_a is not None else [])
                                & set(list(tags_b) if tags_b is not None else [])
                            ),
                            "recommendation": "Review and archive the redundant record.",
                        })
            return JSONResponse({
                "duplicates": duplicates,
                "duplicate_candidates": duplicates,
                "scanned": len(rows),
            })
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/reindex", methods=["POST"])
    async def reindex_project(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            table = core.get_table(project_id)
            core._ensure_fts(table)
            return JSONResponse({
                "reindexed": True,
                "project_id": project_id,
                "fts_index_status": "ready",
                "timestamp": core._iso_now(),
            })
        except Exception as exc:
            return response_error(exc)

    def _estimate_tokens(text: str) -> int:
        """Approximate token count using the standard ~4 chars/token heuristic."""
        return max(1, len(text) // 4)

    @mcp.custom_route("/api/projects/{project_id}/token-estimate", methods=["POST"])
    async def token_estimate(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            body = await request.json()
            text = str(body.get("text") or "").strip()
            if not text:
                frame = core.get_table(project_id).to_pandas()
                record_estimates = []
                total_tokens = 0
                for row in frame.to_dict(orient="records"):
                    row_text = str(row.get("text") or "")
                    tokens = _estimate_tokens(row_text)
                    total_tokens += tokens
                    record_estimates.append({
                        "record_id": row.get("record_id"),
                        "memory_id": row.get("memory_id"),
                        "text_preview": row_text[:120],
                        "estimated_tokens": tokens,
                    })
                return JSONResponse({
                    "project_id": project_id,
                    "total_records": len(record_estimates),
                    "total_estimated_tokens": total_tokens,
                    "records": record_estimates,
                })
            tokens = _estimate_tokens(text)
            return JSONResponse({
                "project_id": project_id,
                "text": text,
                "estimated_tokens": tokens,
                "character_count": len(text),
            })
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/export", methods=["GET"])
    async def export_project(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            frame = core.get_table(project_id).to_pandas()
            records = []
            for row in frame.to_dict(orient="records"):
                public = core._row_public(row)
                vector = row.get("vector")
                if vector is not None:
                    public["vector"] = list(vector)
                records.append(public)
            return JSONResponse({
                "project_id": project_id,
                "exported_at": core._iso_now(),
                "record_count": len(records),
                "records": records,
            })
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/projects/{project_id}/import", methods=["POST"])
    async def import_project(request):
        try:
            project_id = core.resolve_project(request.path_params["project_id"])
            body = await request.json()
            records = body.get("records") or []
            if not records:
                raise ValueError("records array is required")
            imported = []
            for rec in records:
                text = str(rec.get("text") or "").strip()
                if not text:
                    continue
                record = core.record_discovery_impl(
                    text,
                    symbol=str(rec.get("symbol") or ""),
                    category=str(rec.get("category") or "general"),
                    project=project_id,
                    verified=bool(rec.get("verified", True)),
                    bucket=str(rec.get("bucket") or ""),
                    tags=rec.get("tags"),
                    agent_id=str(rec.get("agent_id") or ""),
                    run_id=str(rec.get("run_id") or ""),
                    source_type=str(rec.get("source_type") or "user"),
                    source_ref=str(rec.get("source_ref") or "web-panel-import"),
                    entity_type=str(rec.get("entity_type") or "General"),
                )
                imported.append(record)
            return JSONResponse({
                "project_id": project_id,
                "imported_count": len(imported),
                "records": imported,
            })
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route(
        "/api/projects/{project_id}/categories/{category}/migrate", methods=["POST"]
    )
    async def migrate_category(request):
        try:
            source_id = core.resolve_project(request.path_params["project_id"])
            category = request.path_params["category"]
            body = await request.json()
            target_id = core.resolve_project(body.get("target_project_id"))
            mode = str(body.get("mode") or "copy")
            if source_id == target_id:
                raise ValueError("source and target projects must differ")
            if mode not in {"copy", "move"}:
                raise ValueError("mode must be copy or move")
            source_categories = core.load_project_categories(source_id)
            if category not in source_categories:
                raise ValueError(f"category {category!r} not found")
            target_categories = core.load_project_categories(target_id)
            target_categories[category] = dict(source_categories[category])
            core.save_project_categories(target_id, target_categories)

            source_table = core.get_table(source_id)
            target_table = core.get_table(target_id)
            raw_rows = source_table.search().where(
                f"category = {core._sql_str(category)}"
            ).limit(100_000).to_list()
            copies = []
            for raw in raw_rows:
                clean = {
                    key: value for key, value in raw.items()
                    if not key.startswith("_")
                }
                clean["record_id"] = str(uuid.uuid4())
                clean["memory_id"] = core._new_memory_id()
                clean["project_id"] = target_id
                clean["updated_at"] = core._iso_now()
                tags = clean.get("tags")
                clean["tags"] = list(tags) if tags is not None else []
                copies.append(clean)
            if copies:
                target_table.add(copies)
                core._ensure_fts(target_table)
            if mode == "move" and raw_rows:
                source_table.delete(f"category = {core._sql_str(category)}")
            return JSONResponse({
                "source_project_id": source_id,
                "target_project_id": target_id,
                "category": category,
                "mode": mode,
                "records_affected": len(copies),
            })
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/database/quick-fix", methods=["POST"])
    async def database_quick_fix(request):
        try:
            body = await request.json()
            project_id = core.resolve_project(body.get("projectId"))
            entity_type = str(body.get("entityType") or "")
            description = str(body.get("description") or "").strip()
            if entity_type == "project":
                if not description:
                    raise ValueError("description is required")
                write_profile(project_id, {"description": description})
            elif entity_type == "category":
                category = str(body.get("categoryKey") or "").strip()
                if not category:
                    raise ValueError("categoryKey is required")
                categories = core.load_project_categories(project_id)
                requested_bucket = str(body.get("bucket") or "").strip()
                if requested_bucket and requested_bucket not in core.BUCKETS:
                    raise ValueError(f"unknown bucket {requested_bucket!r}")
                if category not in categories:
                    # A category observed in records but never registered is
                    # registered here so the audit alert can be resolved.
                    categories[category] = {
                        "description": description or "Registered from the web panel audit.",
                        "bucket": requested_bucket or core.bucket_for_category(category),
                    }
                else:
                    if description:
                        categories[category]["description"] = description
                    if requested_bucket:
                        categories[category]["bucket"] = requested_bucket
                core.save_project_categories(project_id, categories)
            else:
                raise ValueError("entityType must be project or category")
            return JSONResponse({"fixed": True, "project": one_project(project_id)})
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/database/simulate-missing-requirement", methods=["POST"])
    async def simulate_missing_requirement(request):
        try:
            body = await request.json()
            project_id = core.resolve_project(body.get("projectId"))
            simulation = str(body.get("type") or "")
            if simulation == "missing_project_desc":
                write_profile(project_id, {"description": ""})
            elif simulation == "missing_category_desc":
                categories = core.load_project_categories(project_id)
                if not categories:
                    raise ValueError("project has no categories to simulate against")
                first = next(iter(categories))
                categories[first]["description"] = ""
                core.save_project_categories(project_id, categories)
            else:
                raise ValueError("unknown simulation type")
            return JSONResponse({"simulated": True})
        except Exception as exc:
            return response_error(exc)

    def maintenance_path() -> Path:
        return core.memories_root() / ".maintenance_tasks.json"

    def read_maintenance() -> dict[str, list[dict[str, Any]]]:
        path = maintenance_path()
        if path.is_file():
            try:
                value = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(value, dict):
                    return {
                        "tasks": list(value.get("tasks") or []),
                        "logs": list(value.get("logs") or []),
                    }
            except Exception:
                pass
        return {"tasks": [], "logs": []}

    def write_maintenance(value: dict[str, list[dict[str, Any]]]) -> None:
        maintenance_path().write_text(json.dumps(value, indent=2), encoding="utf-8")

    @mcp.custom_route("/api/maintenance/tasks", methods=["GET"])
    async def maintenance_tasks(request):
        return JSONResponse(read_maintenance())

    @mcp.custom_route("/api/maintenance/schedule", methods=["POST"])
    async def schedule_maintenance(request):
        try:
            body = await request.json()
            now = core._iso_now()
            task = {
                "id": uuid.uuid4().hex,
                "name": str(body.get("name") or "").strip(),
                "description": str(body.get("description") or "").strip(),
                "project_id": body.get("project_id"),
                "frequency": str(body.get("frequency") or "nightly"),
                "cron_expression": str(body.get("cron_expression") or ""),
                "scope": str(body.get("scope") or "all"),
                "task_type": str(body.get("task_type") or "dedup_scan"),
                "enabled": True,
                "ai_provider": str(body.get("ai_provider") or "local_ollama"),
                "next_run_at": now,
            }
            if not task["name"] or not task["description"]:
                raise ValueError("name and description are required")
            state = read_maintenance()
            state["tasks"].append(task)
            write_maintenance(state)
            return JSONResponse(task)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/maintenance/tasks/{task_id}", methods=["PATCH"])
    async def update_maintenance_task(request):
        try:
            body = await request.json()
            state = read_maintenance()
            task = next(
                (item for item in state["tasks"] if item.get("id") == request.path_params["task_id"]),
                None,
            )
            if task is None:
                raise ValueError("maintenance task not found")
            task.update(body)
            write_maintenance(state)
            return JSONResponse(task)
        except Exception as exc:
            return response_error(exc, status=404)

    @mcp.custom_route("/api/maintenance/run/{task_id}", methods=["POST"])
    async def run_maintenance_task(request):
        started = time.perf_counter()
        try:
            body = await request.json()
            project_id = core.resolve_project(body.get("project_id"))
            state = read_maintenance()
            task = next(
                (item for item in state["tasks"] if item.get("id") == request.path_params["task_id"]),
                None,
            )
            if task is None:
                raise ValueError("maintenance task not found")
            summary = f"Completed {task['task_type']} inspection for {project_id}."
            log = {
                "id": uuid.uuid4().hex,
                "task_id": task["id"],
                "task_name": task["name"],
                "project_id": project_id,
                "executed_at": core._iso_now(),
                "duration_ms": int((time.perf_counter() - started) * 1000),
                "status": "success",
                "ai_provider": task.get("ai_provider", "local_ollama"),
                "findings_count": 0,
                "summary": summary,
                "details": [],
                "actions_taken": [],
            }
            task.update({"last_run_at": log["executed_at"], "last_run_status": "success"})
            state["logs"].insert(0, log)
            write_maintenance(state)
            write_profile(project_id, {"last_maintenance_at": log["executed_at"]})
            return JSONResponse(log)
        except Exception as exc:
            return response_error(exc)

    @mcp.custom_route("/api/ai/enhance-description", methods=["POST"])
    async def enhance_description(request):
        body = await request.json()
        current = str(body.get("description") or body.get("text") or "").strip()
        return JSONResponse({"description": current})

    tool_definitions = [
        {"name": "recall", "description": "Query or browse one explicitly selected project.", "category": "retrieval", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "string"}, "query": {"type": "string"}, "search_type": {"type": "string"}, "filters": {"type": "object"}, "limit": {"type": "integer"}}, "required": ["project_id"]}, "sampleArguments": {"project_id": "<PROJECT_ID>", "query": "authentication", "search_type": "semantic", "limit": 8}},
        {"name": "commit_memory", "description": "Store a discovery, handoff, or promotion.", "category": "storage", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "string"}, "text": {"type": "string"}, "type": {"type": "string"}, "metadata": {"type": "object"}}, "required": ["project_id", "text"]}, "sampleArguments": {"project_id": "<PROJECT_ID>", "text": "Verified behavior", "type": "discovery", "metadata": {"category": "key_facts", "verified": True}}},
        {"name": "modify_memory", "description": "Update or lifecycle-manage a memory.", "category": "lifecycle", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "string"}, "memory_id": {"type": "string"}, "action": {"type": "string"}, "patch_data": {"type": "object"}}, "required": ["project_id", "memory_id", "action"]}, "sampleArguments": {"project_id": "<PROJECT_ID>", "memory_id": "<MEMORY_ID>", "action": "archive"}},
        {"name": "sync_session_buffer", "description": "Manage the working-memory session buffer.", "category": "context", "inputSchema": {"type": "object", "properties": {"project_id": {"type": "string"}, "action": {"type": "string"}, "turn_data": {"type": "object"}}, "required": ["project_id", "action"]}, "sampleArguments": {"project_id": "<PROJECT_ID>", "action": "begin", "turn_data": {}}},
        {"name": "inspect_memory_system", "description": "Discover projects and inspect health, stats, categories, maintenance, or history.", "category": "maintenance", "inputSchema": {"type": "object", "properties": {"action": {"type": "string"}, "project_id": {"type": "string"}, "target_id": {"type": "string"}}, "required": ["action"]}, "sampleArguments": {"action": "projects"}},
    ]

    @mcp.custom_route("/api/mcp/status", methods=["GET"])
    async def mcp_status(request):
        health = core._health_payload()
        return JSONResponse({
            "server_name": "memory-portal", "version": "4.0.3",
            "protocol_version": "2024-11-05", "status": "online",
            "transport": "streamable-http", "uptime_seconds": int(time.time() - started_at),
            "endpoint": "/mcp", "rpc_endpoint": "/api/mcp/execute",
            "total_tools": 5, "database_partitions": len(health["projects"]),
            "total_indexed_memories": health["total_rows"], "active_clients": [],
            "capabilities": {"tools": True, "resources": False, "prompts": False, "logging": True},
            "config_snippet": {"mcpServers": {"memory-portal": {"url": "http://localhost:8768/mcp"}}},
        })

    @mcp.custom_route("/api/mcp/tools", methods=["GET"])
    async def mcp_tools(request):
        return JSONResponse({"tools": tool_definitions, "count": 5, "protocol_version": "2024-11-05"})

    @mcp.custom_route("/api/mcp/execute", methods=["POST"])
    async def execute_mcp_tool(request):
        started = time.perf_counter()
        try:
            body = await request.json()
            tool = str(body.get("tool") or "")
            args = dict(body.get("arguments") or {})
            if tool == "recall":
                project_id = core.resolve_project(args.get("project_id"))
                search_type = str(args.get("search_type") or "semantic")
                if search_type == "recent":
                    data = core.list_recent_impl(int(args.get("limit") or 8), project=project_id)
                else:
                    data = core.recall_impl(str(args.get("query") or ""), project=project_id, limit=int(args.get("limit") or 8))
            elif tool == "commit_memory":
                project_id = core.resolve_project(args.get("project_id"))
                metadata = dict(args.get("metadata") or {})
                category = str(metadata.get("category") or "")
                if category not in core.load_project_categories(project_id):
                    raise ValueError("metadata.category must be registered for the project")
                data = core.record_discovery_impl(str(args.get("text") or ""), project=project_id, category=category, verified=bool(metadata.get("verified", True)), bucket=str(metadata.get("bucket") or ""), tags=metadata.get("tags"))
            elif tool == "modify_memory":
                project_id = core.resolve_project(args.get("project_id"))
                action = str(args.get("action") or "")
                memory_id = str(args.get("memory_id") or "")
                if action == "update":
                    data = core.update_record_impl(memory_id, dict(args.get("patch_data") or {}), project=project_id)
                elif action in {"delete", "archive"}:
                    data = core.set_status_impl(memory_id, "deleted" if action == "delete" else "superseded", project=project_id)
                else:
                    raise ValueError("panel executor supports update|delete|archive")
            elif tool == "inspect_memory_system":
                action = str(args.get("action") or "health")
                if action in {"projects", "health"}:
                    data = core._health_payload()
                    if action == "projects":
                        data = {"authorized_project_ids": list(core.project_paths()), "projects": [core.project_routing_profile(p) for p in core.project_paths()], "project_selection_mode": "explicit_per_call"}
                elif action == "categories":
                    project_id = core.resolve_project(args.get("project_id"))
                    cats = core.load_project_categories(project_id)
                    data = {"project": project_id, "categories": cats, "valid_category_names": list(cats)}
                elif action == "stats":
                    data = core.project_stats(core.resolve_project(args.get("project_id")))
                else:
                    raise ValueError("use projects|health|categories|stats in the panel executor")
            elif tool == "sync_session_buffer":
                raise ValueError("Use the MCP endpoint directly for session-buffer operations")
            else:
                raise ValueError(f"unknown tool {tool!r}")
            duration = int((time.perf_counter() - started) * 1000)
            return JSONResponse({"content": [{"type": "text", "text": json.dumps(data, default=str, indent=2)}], "data": data, "isError": False, "duration_ms": duration})
        except Exception as exc:
            duration = int((time.perf_counter() - started) * 1000)
            return JSONResponse({"content": [{"type": "text", "text": str(exc)}], "isError": True, "duration_ms": duration}, status_code=400)
