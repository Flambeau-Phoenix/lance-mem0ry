# Lance Memory — Example Database & Data Samples

This folder contains a complete, portable example database partition and export for **lance-memory** (lance-mem0ry), designed to assist in developing and testing a new Web Portal backend or frontend without requiring a live Ollama or LanceDB server connection.

---

## 📁 What is Included

| File / Folder | Format | Description |
|---|---|---|
| [`example_database_export.json`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/example_database_export.json) | Standalone JSON | Full project export containing metadata, the category registry with descriptions, and 7 representative memory records with full 768-dim float vectors. Ideal for API mocking, unit tests, and frontend UI prototyping. |
| [`example_project_db/`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/example_project_db) | Directory | Real, binary LanceDB dataset (`records.lance/`) along with its project [`categories.json`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/example_project_db/categories.json). Ready to open directly with `lancedb.connect()`. |
| `example_project_db.tar.gz` | Gzipped Tarball | Compressed package of `example_project_db/` for easy distribution or transfer to another test machine. |
| [`generate_example_db.py`](file:///g:/Lance%20Memory%20Tool/lance-memory/examples/generate_example_db.py) | Python Script | The generation script that synthesizes realistic records across all categories, builds the LanceDB dataset, and outputs the JSON export. |

---

## 🗄️ LanceDB Table Schema (`records.lance`)

Each record adheres to the following PyArrow / LanceDB schema:

```typescript
interface LanceMemoryRecord {
  record_id: string;         // UUID (v1 legacy primary key, e.g. "d4979dc4-dde4-4c04-...")
  memory_id: string;         // Hex UUID (v2 key, e.g. "d6ac735de83f4259bd6413e8246772e0")
  project_id: string;        // Partition name (e.g. "example_project")
  text: string;              // Memory text content, blueprint, or verified fact
  vector: number[];          // 768-dimensional float32 embedding (from nomic-embed-text)
  category: string;          // Category slug (e.g. "key_facts", "api_reference", "ongoing_tasks")
  bucket: string;            // Semantic bucket: "fact" | "decision" | "state"
  symbol: string;            // Optional code symbol (e.g. "RedisConnectionPool", "POST /oauth/token")
  entity_type: string;       // "Rule" | "Directive" | "Preference" | "Hook" | "UI Element" | "Protocol" | "General"
  verified: boolean;         // true for proven code/facts; false for WIP blueprints
  tags: string[];            // Tags (e.g. ["redis", "networking", "caching"])
  agent_id: string;          // Originating agent persona (e.g. "backend-agent")
  run_id: string;            // Session or run identifier
  source_type: string;       // "agent" | "ast_index" | "human" | "migration"
  source_ref: string;        // Reference file path or source provenance
  created_at: string;        // ISO-8601 UTC timestamp
  updated_at: string;        // ISO-8601 UTC timestamp
  status: string;            // "active" | "archived" | "deleted"
  supersedes_id: string;     // UUID of previous memory if this is a promotion
}
```

---

## 🏷️ Category Registry (`categories.json`)

Each project partition contains a `categories.json` file defining authorized categories and their human/agent-readable descriptions:

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

## 💻 How to Query the Example Database

### Python (`lancedb`)
```python
import lancedb

# 1. Connect to the directory
db = lancedb.connect("examples/example_project_db")

# 2. Open the table
table = db.open_table("records")
print(f"Total rows: {table.count_rows()}")

# 3. Filter by category & status
facts = table.search().where("status = 'active' AND bucket = 'fact'").to_list()
for f in facts:
    print(f"[{f['category']}] {f['text']}")

# 4. Full-Text Search (BM25)
results = table.search("Redis connection").limit(5).to_list()
print(f"FTS hits: {len(results)}")
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
To mock backend responses in a frontend test server or Next.js API route:
```typescript
import sampleData from "./example_database_export.json";

export async function GET() {
  // Strip vectors to save bandwidth (as required by the backend spec)
  const memories = sampleData.records.map(({ vector, ...rest }) => rest);
  return Response.json({
    project: sampleData.project_id,
    categories: sampleData.categories,
    memories,
  });
}
```
