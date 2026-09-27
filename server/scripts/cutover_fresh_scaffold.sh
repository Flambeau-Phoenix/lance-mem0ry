#!/usr/bin/env bash
set -euo pipefail
STAMP=20260918T201810Z
NEW_ROOT=/opt/eh-stack/app/lance-memory/project_memories
OLD_ROOT=/opt/eh-stack/app/arch_memory/project_memories

echo "=== 3. Delete old project_memories ==="
rm -rf "$OLD_ROOT"
mkdir -p "$OLD_ROOT"

echo "=== 4. Scaffold fresh LanceDB at new path ==="
rm -rf "$NEW_ROOT"
mkdir -p "$NEW_ROOT"
export PROJECT_MEMORIES_ROOT="$NEW_ROOT"
export PROJECT_MEMORY_PROJECTS=${PROJECT_MEMORY_PROJECTS:-""}
export PROJECT_MEMORY=${PROJECT_MEMORY:-""}
export OLLAMA_HOST=${OLLAMA_HOST:-"http://127.0.0.1:11434"}
cd /opt/eh-stack/app/arch_memory
if [ -f "init_project_memories.py" ]; then
    /opt/eh-stack/app/arch_memory/.venv/bin/python init_project_memories.py
fi

echo "=== 5. Install updated lance_memory package ==="
rm -rf /opt/eh-stack/app/lance-memory/src/lance_memory
mkdir -p /opt/eh-stack/app/lance-memory/src
if [ -d "/tmp/lance_memory_src_pkg/lance_memory" ]; then
    cp -a /tmp/lance_memory_src_pkg/lance_memory /opt/eh-stack/app/lance-memory/src/
    rm -rf /opt/eh-stack/app/arch_memory/lance_memory
    cp -a /tmp/lance_memory_src_pkg/lance_memory /opt/eh-stack/app/arch_memory/lance_memory
fi
if [ -d "/opt/eh-stack/app/arch_memory/.venv" ]; then
    /opt/eh-stack/app/arch_memory/.venv/bin/pip install -e /opt/eh-stack/app/lance-memory --quiet || true
fi

echo "=== 6. Install systemd units and retire legacy SSE ==="
if [ -f "/tmp/arch-memory-http.service" ]; then
    sudo cp /tmp/arch-memory-http.service /etc/systemd/system/arch-memory-http.service
    sudo cp /tmp/arch-memory-admin.service /etc/systemd/system/arch-memory-admin.service
    sudo cp /tmp/lance-memory-maintenance.service /etc/systemd/system/lance-memory-maintenance.service
    sudo systemctl disable --now arch-memory.service || true
    sudo systemctl daemon-reload
    sudo systemctl enable arch-memory-http.service arch-memory-admin.service lance-memory-maintenance.timer
    sudo systemctl restart arch-memory-http.service arch-memory-admin.service
fi

echo "=== 7. Verify ==="
sleep 3
systemctl is-active arch-memory-http.service arch-memory-admin.service || true
curl -fsS http://127.0.0.1:8768/health || true
echo
ls -la "$NEW_ROOT"
echo "CUTOVER_OK $STAMP"
