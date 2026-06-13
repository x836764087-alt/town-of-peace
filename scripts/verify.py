#!/usr/bin/env python3
"""Quick verification script for 桃源镇 Living Town server"""
import json, urllib.request, sys, time, subprocess

BASE = "http://localhost:3000"

def get(path):
    try:
        with urllib.request.urlopen(f"{BASE}{path}", timeout=3) as r:
            return r.status, r.read()
    except Exception as e:
        return 0, str(e).encode()

# Start server
proc = subprocess.Popen(
    ["node", "server/main.js"],
    cwd="/home/ching/town-of-peace",
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL,
)
time.sleep(3)

passed = 0
failed = 0

# 1. Health
status, data = get("/api/health")
d = json.loads(data)
assert d["ok"] == True
assert d["aliveAgents"] == 27
print(f"✅ Health API: {d['aliveAgents']} agents, paused={d['paused']}")
passed += 1

# 2. Snapshot
status, data = get("/api/world/snapshot")
d = json.loads(data)
assert len(d["agents"]) == 27
print(f"✅ Snapshot: Year {d['world']['year']} {d['world']['season']}, {len(d['agents'])} agents, {len(d['buildings'])} buildings")
passed += 1

# 3. Static files
for path in ["/", "/css/game.css", "/js/game.js", "/js/network.js", "/js/ui.js"]:
    status, data = get(path)
    assert status == 200, f"{path} returned {status}"
    print(f"✅ {path} -> HTTP {status} ({len(data)}B)")
    passed += 1

# 4. Metrics
status, data = get("/api/admin/metrics")
d = json.loads(data)
print(f"✅ Metrics: {d['aliveAgents']} agents, {d['rss']}MB RSS, {d['heapUsed']}MB heap")
passed += 1

# 5. Buildings
status, data = get("/api/buildings")
bl = json.loads(data)
assert len(bl) == 11
print(f"✅ Buildings: {len(bl)} total (first: {bl[0]['name']})")
passed += 1

# 6. Agent detail
status, data = get("/api/agents/zhou-xiaoyue")
d = json.loads(data)
assert d["id"] == "zhou-xiaoyue"
print(f"✅ Agent detail: {d['name']} ({d['title']}), at ({d['x']},{d['y']})")
passed += 1

print(f"\n{'='*40}")
print(f"✅ {passed}/{passed+failed} checks passed")
print(f"{'='*40}")

proc.terminate()
proc.wait()
