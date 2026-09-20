# Briefing & Handoff Prompt: Redesigning the Lance Memory Web Portal

> **How to use this document:**  
> Copy and paste this prompt directly to any AI coding assistant (Cursor, Antigravity, Claude Code, Windsurf) or human full-stack developer to kick off the redesign and implementation of the new Lance Memory Web Application.

---

```markdown
# Role & Objective
You are an expert Full-Stack Engineer and UI/UX Designer. You are tasked with designing and building a state-of-the-art Web Application (Frontend + Backend API) to replace an existing legacy Streamlit admin dashboard for **Lance Memory** (`lance-mem0ry`).

Lance Memory is a high-performance, autonomous engineering memory system used by AI coding agents and developers to persist, recall, and govern codebase facts, architectural decisions, and working state across multi-agent sessions.

---

## 1. System Architecture & Mental Model

1. **Embedded Columnar Vector Database (LanceDB)**:
   - Lance Memory stores records in local **LanceDB** tables (`records.lance`) beneath a root directory `$PROJECT_MEMORIES_ROOT`.
   - Data is strictly partitioned by project: `$PROJECT_MEMORIES_ROOT/<project_id>/records.lance`.
   - This is a clean base installation: there are no pre-baked user projects. Projects are created dynamically by the administrator (e.g. `MyProject`, `CoreBackend`, `MobileApp`).

2. **Embedding Pipeline (Ollama `nomic-embed-text`)**:
   - Every memory record contains a **768-dimensional float32 vector embedding** generated via local Ollama (`http://127.0.0.1:11434/api/embed`).
   - Vector search uses **cosine distance similarity**.
   - Keyword search uses an embedded **Tantivy Full-Text Search (BM25)** index on the `text` column.
   - Hybrid search merges vector similarity and BM25 FTS scores using Reciprocal Rank Fusion.

3. **Strict Category Governance (`categories.json`)**:
   - Each project folder contains a `categories.json` registry.
   - Categories define:
     - `description`: Authoritative explanation of what belongs here (agents read this via FastMCP to autonomously place memories).
     - `bucket`: Semantic category bucket — `"fact"` (verified code/constants), `"decision"` (architectural invariants), or `"state"` (WIP/handoff).
   - Baseline standard categories seeded into every new project: `key_facts`, `architectural_decisions`, `ongoing_tasks`, `session_handoff`.
   - Administrators can add custom project-specific categories via the Category Management Console.

4. **The Agent Lifecycle & Guardrails**:
   - **Fact vs. Blueprint**: WIP plans and hypotheses are strictly stored with `verified=false` under bucket `state` (`ongoing_tasks`). Once tested and proven, they are promoted to `verified=true` under `fact` or `decision` (`key_facts`).
   - **Agents must never invent arbitrary project IDs**: Agents discover authorized contextual routing profiles. An authorized `lance_memory_project_id` in the nearest applicable `AGENTS.md` takes precedence; otherwise they choose the best fit from project purpose, task, aliases, workspace hints, ID tokens, and categories. Folder-name equality is not required. New project partitions are created exclusively by administrators via this web portal or CLI.

---

## 2. Core Screens & Feature Requirements for the New Web App

The new web portal should have a modern, sleek dark-mode aesthetic (e.g. Tailwind CSS, Lucide icons, glassmorphism accents, fast response times) and provide the following views:

### Screen A: Project Partition Switcher & Provisioning
- Quick-switch header/sidebar dropdown displaying active partition, total record count, and health.
- **Provision New Project Modal**: 1-click modal to create a new LanceDB partition, initialize the schema, build the Tantivy index, and seed default `categories.json`.

### Screen B: Memory Explorer & Search Lab
- **Search Bar**: Supports 3 search modes:
  1. *Hybrid Search* (Vector + Keyword BM25)
  2. *Semantic Vector Search* (Cosine similarity)
  3. *Full-Text Keyword Search* (Tantivy BM25)
- **Faceted Filters**: Filter by Category, Bucket (`fact`, `decision`, `state`), Verified status (`true`/`false`), Entity Type, and Status (`active`, `archived`, `deleted`).
- **Memory Cards / Data Grid**:
  - Displays text snippets, symbol tags, category badges, verification pill, and creation date.
  - Inline actions: Edit text/metadata, Promote Blueprint to Verified Fact, Archive, or Delete.
- **Detail View Modal**: Shows full text, symbol, UUIDs (`record_id`, `memory_id`), tags, access count, last accessed timestamp, and source provenance.

### Screen C: Category Management Console (Crucial New Feature)
- **Category Catalog Table**: Lists all categories in the active project with descriptions, semantic bucket badges, and real-time record counts.
- **Add / Edit Category Form**: Modal to create or update categories with mandatory `description` and `bucket` selection.
- **Cross-Project Category Migration & Copy Tool**:
  - Lets the admin select a Source Project, Category, and Target Project.
  - Mode: **Copy** (replicates records and category schema in target) or **Move / Migrate** (replicates into target and cleanly removes from source).
  - Automatically updates `project_id`, tags with `migrated_from:<source>`, and rebuilds FTS indices.
- **Rename Category**: Renames in `categories.json` and cascades an update across all records in the LanceDB table.

### Screen D: Rules & Mem0 Directives Hub
- Focused view filtering records where `entity_type IN ('Rule', 'Directive', 'Preference', 'Hook', 'Protocol')`.
- Displays the behavioral guidelines and operational rules currently enforced across agents.

### Screen E: Quality Control & Maintenance Lab
- **Vector Deduplication Scan**: Calculates pairwise cosine distance between vectors; flags near-identical records ($\text{dist} < 0.15$) and offers a 1-click merge or archive workflow.
- **Token Estimation Lab**: Calculates estimated context window injection cost for selected memories.
- **Re-Index Trigger**: 1-click button to rebuild the Tantivy FTS index.

### Screen F: System Telemetry & Process Monitor
- Real-time status cards:
  - `lance-memory-http.service` (Port 8768)
  - Ollama Embedding Server (`http://127.0.0.1:11434`, verifying `nomic-embed-text`)
  - `cockpit.socket` (Port 9090)
  - Disk usage per partition.
- **Live Journal Log Viewer**: View recent logs from `lance-memory-http.service`.

### Screen G: Export & Import
- Export project records and categories to clean JSON (with or without vectors).
- Import memories from JSON with automatic batch embedding via Ollama.

---

## 3. Critical Technical Gotchas & Rules

1. **The NumPy / PyArrow `ndarray` Serialization Crash**:
   - In LanceDB, the `vector` column contains NumPy `ndarray` objects (768 floats). Standard JSON serializers crash with `TypeError: Object of type ndarray is not JSON serializable`.
   - **Rule**: In summary/grid view API endpoints, **STRIP the `vector` field completely**. Do not transport 768 floats across the wire for every row.
   - For export endpoints where vectors are required, explicitly convert via `vector.tolist()` or a custom `NumpyEncoder`.
2. **LanceDB Concurrency**:
   - LanceDB uses Arrow MVCC for concurrent reads. However, write operations (especially table recreation or category migrations) must be handled through a single backend service process to avoid lock contention with the FastMCP daemon.
3. **Category Descriptions Are Functional**:
   - Category descriptions are not decorative; AI agents read them via API to autonomously choose categories. Never allow a category to be saved without a descriptive explanation.

---

## 4. Reference Resources & Sample Files Available in This Repo

Before writing code, inspect these curated resources in the repository:

- **Backend REST API Requirements & Architecture**:  
  [`docs/WEB_PORTAL_BACKEND_REQUIREMENTS.md`](file:///g:/Lance%20Memory%20Tool/lance-memory/docs/WEB_PORTAL_BACKEND_REQUIREMENTS.md)
- **Complete Tool & LanceDB Schema Reference**:  
  [`docs/MEMORY_SYSTEM_REFERENCE.md`](file:///g:/Lance%20Memory%20Tool/lance-memory/docs/MEMORY_SYSTEM_REFERENCE.md)
- **Standalone Working LanceDB Database (Ready to Query)**:  
  [`examples/example_project_db/`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/example_project_db)
- **Standalone JSON Mock Export (7 sample records with 768-dim vectors)**:  
  [`examples/example_database_export.json`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/example_database_export.json)
- **Existing Streamlit Implementation (for logic reference)**:  
  [`server/admin_app.py`](file:///g:/Lance%20Memory%20Tool/lance-memory/server/admin_app.py)

---

## 5. Next Steps
Please propose the tech stack (e.g. FastAPI backend + Next.js / Tailwind frontend) and an implementation plan to scaffold and build this web portal.
```
