# Lance Memory — Example Database & Data Samples

This folder contains a portable example database partition and export for **lance-memory**,
useful for developing and testing a Web Portal backend or frontend without a live Ollama
embedding server (vectors here are synthetic unit vectors, not real model output).

---

## What is Included

| File / Folder | Format | Description |
|---|---|---|
| [`example_database_export.json`](./example_database_export.json) | Standalone JSON | Full project export: metadata, category registry, and 7 sample memory records with 768-dim float vectors. Ideal for API mocking and UI prototyping. |
| [`example_project_db/`](./example_project_db/) | Directory | LanceDB dataset (`records.lance/`) plus [`categories.json`](./example_project_db/categories.json). Open with `lancedb.connect()`. |
| [`example_project_db.tar.gz`](./example_project_db.tar.gz) | Gzipped tarball | Compressed package of `example_project_db/` for easy distribution. |
| [`generate_example_db.py`](./generate_example_db.py) | Python script | Regenerates the JSON export, LanceDB dataset, and tarball offline (no API keys). Requires `lancedb` only for the binary dataset/tarball. |

### Regenerate

```bash
# From repo root (optional: pip install lancedb pyarrow)
python examples/generate_example_db.py
```

No OpenAI/Ollama keys are required. Vectors are deterministic synthetic unit vectors.

---

## LanceDB Table Schema (`records.lance`)

Each record adheres to the following schema:

```typescript
interface LanceMemoryRecord {
  record_id: string;         // UUID (v1 legacy primary key)
  memory_id: string;         // Hex UUID (v2 key)
  project_id: string;        // Partition name (e.g. "example_project")
  text: string;              // Memory text content
  vector: number[];          // 768-dimensional float32 embedding
  category: string;          // Category slug
  bucket: string;            // "fact" | "decision" | "state"
  symbol: string;            // Optional code symbol
  entity_type: string;       // Rule | Directive | Preference | ...
  verified: boolean;         // true for proven facts; false for WIP
  tags: string[];
  agent_id: string;
  run_id: string;
  source_type: string;       // "agent" | "ast_index" | "human" | "migration"
  source_ref: string;
  created_at: string;        // ISO-8601 UTC
  updated_at: string;
  status: string;            // "active" | "archived" | "deleted"
  supersedes_id: string;
}
```

---

## Category Registry (`categories.json`)

```json
{
  "key_facts": {
    "description": "Ratified facts, verified patterns, stable APIs, and configuration constants.",
    "bucket": "fact"
  },
  "architectural_decisions": {
    "description": "System architecture, design choices, invariants, patterns, and trade-offs.",
    "bucket": "decision"
  },
  "ongoing_tasks": {
    "description": "WIP blueprints, hypotheses, and pending implementation steps.",
    "bucket": "state"
  },
  "session_handoff": {
    "description": "Session summaries, milestones reached, and next action items.",
    "bucket": "state"
  },
  "api_reference": {
    "description": "Verified external and internal API signatures, client bindings, and protocols.",
    "bucket": "fact"
  },
  "coding_standards": {
    "description": "Project-specific coding guidelines, error handling rules, and conventions.",
    "bucket": "decision"
  }
}
```

---

## How to Query the Example Database

### Python (`lancedb`)

```python
import lancedb

db = lancedb.connect("examples/example_project_db")
table = db.open_table("records")
print(f"Total rows: {table.count_rows()}")

facts = table.search().where("status = 'active' AND bucket = 'fact'").to_list()
for f in facts:
    print(f"[{f['category']}] {f['text']}")
```

### Node.js / TypeScript (`@lancedb/lancedb`)

```typescript
import * as lancedb from "@lancedb/lancedb";

const db = await lancedb.connect("examples/example_project_db");
const table = await db.openTable("records");

const records = await table.query()
  .where("status = 'active'")
  .limit(10)
  .toArray();

console.log(records);
```

### JSON / REST Mocking

```typescript
import sampleData from "./example_database_export.json";

export async function GET() {
  const memories = sampleData.records.map(({ vector, ...rest }) => rest);
  return Response.json({
    project: sampleData.project_id,
    categories: sampleData.categories,
    memories,
  });
}
```