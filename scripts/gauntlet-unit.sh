#!/usr/bin/env bash
# 🔧 Worktree Unit Runner
# เป้าหมาย: รับ 1 unit (spec + ขอบเขตไฟล์) แล้วจัดการทั้ง cycle ให้ถึงขั้น "commit บน
# branch ของ unit นั้น" — setup worktree -> link deps -> เรียก worktree-worker แบบ headless
# -> ตรวจเองอิสระ (ไม่เชื่อ is_error) -> commit ถ้าผ่านทุกด่าน -> เขียน report แล้วหยุด
#
# ไม่ merge ให้ ไม่ลบ worktree ให้ — เจตนาให้มีจุดตัดสินใจของคนก่อนเข้า branch หลักเสมอ
#
# ใช้งาน:
#   bash scripts/gauntlet-unit.sh <unit-name> <spec-file|-> <scope-path> [scope-path...]
#
# ตัวอย่าง:
#   bash scripts/gauntlet-unit.sh u2-applyDiscount docs/units/u2.md \
#     src/services/pricingService.ts src/__tests__/pricing.test.ts
set -u

CLAUDE_BIN="${CLAUDE_BIN:-claude}"     # ตั้งเป็น mock-claude เพื่อซ้อมโดยไม่เสียเงิน (ดู headless/pipeline.sh)
MODEL="${MODEL:-sonnet}"
REPORT="${REPORT:-gauntlet-report.json}"
BASE="${BASE:-}"                       # ว่าง = ตัด worktree จาก HEAD ปัจจุบัน
KEEP_WORKTREE="${KEEP_WORKTREE:-1}"    # สคริปต์นี้ไม่เคยลบ worktree เอง ตัวแปรนี้กันเผื่ออนาคต

fail() { echo "❌ $*" >&2; exit 2; }

# ── (0) args ──────────────────────────────────────────────────────────────
UNIT="${1:-}"; SPEC_SRC="${2:-}"; shift 2 2>/dev/null || true
SCOPE_PATHS=("$@")
[ -n "$UNIT" ] && [ -n "$SPEC_SRC" ] && [ "${#SCOPE_PATHS[@]}" -ge 1 ] || \
  fail "usage: gauntlet-unit.sh <unit-name> <spec-file|-> <scope-path> [scope-path...]"

MAIN_ROOT=$(git rev-parse --show-toplevel) || fail "not inside a git repo"
cd "$MAIN_ROOT" || fail "cannot cd to repo root ($MAIN_ROOT)"

if [ "$SPEC_SRC" = "-" ]; then
  SPEC=$(cat)
else
  [ -f "$SPEC_SRC" ] || fail "spec file not found: $SPEC_SRC"
  SPEC=$(cat "$SPEC_SRC")
fi

WT_DIR=".claude/worktrees/$UNIT"
BRANCH="gauntlet/$UNIT"
RAW_JSON="$WT_DIR.json"

echo "=== unit: $UNIT ==="
echo "=== scope: ${SCOPE_PATHS[*]} ==="

# ── (1) preflight — ห้ามมีของค้างอยู่ในขอบเขตนี้ก่อนเริ่ม ────────────────────
dirty=$(git status --porcelain -- "${SCOPE_PATHS[@]}")
[ -z "$dirty" ] || fail "uncommitted changes already touch this unit's scope — commit or stash first:
$dirty"

# นับเทสต์ baseline (จำนวนที่ผ่านตอนนี้ ก่อนแตะอะไรเลย)
test_count() { npm test 2>&1 | grep -E '^Tests:' | grep -Eo '[0-9]+' | head -1; }
echo "--- baseline npm test (main tree) ---"
BASELINE=$(test_count)
[ -n "$BASELINE" ] || fail "could not read baseline test count — is npm test broken on main?"
echo "baseline tests passed: $BASELINE"

# ── (2) worktree — สร้างใหม่ หรือใช้ของเดิมถ้ามีอยู่แล้ว (idempotent) ─────────
if [ -d "$WT_DIR" ]; then
  echo "worktree $WT_DIR มีอยู่แล้ว — ใช้ต่อ"
elif git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
  echo "branch $BRANCH มีอยู่แล้วแต่ไม่มี worktree ผูกอยู่ — attach"
  git worktree add "$WT_DIR" "$BRANCH" || fail "git worktree add (attach) failed"
else
  echo "สร้าง worktree ใหม่: $WT_DIR (branch $BRANCH)"
  if [ -n "$BASE" ]; then
    git worktree add -b "$BRANCH" "$WT_DIR" "$BASE" || fail "git worktree add failed"
  else
    git worktree add -b "$BRANCH" "$WT_DIR" || fail "git worktree add failed"
  fi
fi

# ── (3) link deps — worktree ไม่มี node_modules ของตัวเอง (npm test/prettier hook ต้องใช้) ──
if [ ! -e "$WT_DIR/node_modules" ]; then
  ln -s "$MAIN_ROOT/node_modules" "$WT_DIR/node_modules" || fail "symlink node_modules failed"
fi

# git worktree checkout เนื้อหาจาก commit เท่านั้น — ไฟล์ที่ยัง uncommitted ในต้นทางจะ "หายไป"
# ในนี้ ถ้า worktree-worker.md ยังไม่ commit เข้า base branch จะเจอ error จาก claude CLI ตรง ๆ
# ว่า "--agent 'worktree-worker' not found" ซึ่งงงกว่านี้มาก เช็คไว้ก่อนเรียกจริงจะชัดกว่า
if [ ! -f "$WT_DIR/.claude/agents/worktree-worker.md" ]; then
  fail "$WT_DIR/.claude/agents/worktree-worker.md ไม่มี — เพราะ git worktree checkout จาก commit
เท่านั้น ไฟล์ agent ตัวนี้ต้อง commit เข้า branch หลักก่อนถึงจะใช้ worktree ที่ตัดจากมันได้:
  git add .claude/agents/worktree-worker.md && git commit -m 'feat: add worktree-worker agent'"
fi

# ── (4) เรียก worker แบบ headless ────────────────────────────────────────────
# --agent worktree-worker  : ใช้ persona นี้เป็นของเซสชันเองตรง ๆ (ไม่ใช่แค่ข้อความใน prompt)
# --disallowedTools Task Agent : กันการ dispatch ไปยัง subagent อื่นซ้อนอีกชั้น (บั๊กที่เจอรอบก่อน)
# ห้ามใส่ --max-turns — เคยเจอมาแล้วว่าทำให้งานเสร็จจริงแต่เซสชันโดนตัดกลางคันจนรายงาน error ผิด ๆ
scope_note="ขอบเขตไฟล์ที่อนุญาตให้แก้ในงานนี้ (ห้ามแตะไฟล์อื่นนอกจากนี้): ${SCOPE_PATHS[*]}"
full_prompt="$SPEC

$scope_note"

echo "--- running worktree-worker (model=$MODEL) ---"
out=$(cd "$WT_DIR" && "$CLAUDE_BIN" -p "$full_prompt" \
  --agent worktree-worker \
  --disallowedTools Task Agent \
  --model "$MODEL" \
  --permission-mode acceptEdits \
  --output-format json 2>"../$UNIT.err.log")
echo "$out" > "$RAW_JSON"   # เก็บ JSON ดิบไว้เสมอ debug ได้ — บทเรียนจาก Lab A ที่ทิ้ง $out แล้วสืบสาเหตุไม่ได้

# ── (5) แตกผลด้วย jq (ห้ามใช้ `.is_error // true` — false เป็น falsy ใน jq) ───
if echo "$out" | jq -e . >/dev/null 2>&1; then
  claimed_ok=$(echo "$out" | jq -r 'if .is_error == false then "false" else "true" end')
  cost=$(echo "$out" | jq -r '.total_cost_usd // 0')
  duration_ms=$(echo "$out" | jq -r '.duration_ms // 0')
  num_turns=$(echo "$out" | jq -r '.num_turns // 0')
else
  claimed_ok="true"
  cost=0; duration_ms=0; num_turns=0
fi
echo "worker claimed is_error=false: $claimed_ok · cost=\$$cost · turns=$num_turns"

# ── (6) ตรวจเองอิสระ — ห้ามเชื่อ is_error (บทเรียนหลักของ Lab A: is_error ไม่บอกว่างานสำเร็จไหม) ──
GATE_FAIL=""

echo "--- npm test (in $WT_DIR) ---"
( cd "$WT_DIR" && npm test ) > "/tmp/gauntlet-$UNIT-test.log" 2>&1
test_exit=$?
AFTER=$(cd "$WT_DIR" && test_count)
if [ "$test_exit" -ne 0 ]; then
  GATE_FAIL="npm test แดง (ดู /tmp/gauntlet-$UNIT-test.log)"
elif [ -z "$AFTER" ] || [ "$AFTER" -le "$BASELINE" ]; then
  GATE_FAIL="จำนวนเทสต์ไม่เพิ่มขึ้นจาก baseline ($BASELINE -> ${AFTER:-?}) — ต้องมีเทสต์ใหม่ตามสเปก"
fi

if [ -z "$GATE_FAIL" ]; then
  echo "--- npm run typecheck (in $WT_DIR) ---"
  if ! ( cd "$WT_DIR" && npm run typecheck ) > "/tmp/gauntlet-$UNIT-typecheck.log" 2>&1; then
    GATE_FAIL="typecheck ไม่ผ่าน (ดู /tmp/gauntlet-$UNIT-typecheck.log)"
  fi
fi

if [ -z "$GATE_FAIL" ]; then
  echo "--- scope gate (git status ต้องอยู่ในขอบเขตที่ให้เท่านั้น) ---"
  out_of_scope=""
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    p="${line:3}"                       # ตัด 2 ตัวอักษร status + เว้นวรรค ("git status --porcelain")
    [ "$p" = "node_modules" ] && continue
    in_scope=0
    for s in "${SCOPE_PATHS[@]}"; do
      [ "$p" = "$s" ] && { in_scope=1; break; }
    done
    [ "$in_scope" -eq 1 ] || out_of_scope="$out_of_scope$p
"
  done <<EOF
$(cd "$WT_DIR" && git status --porcelain)
EOF
  [ -z "$out_of_scope" ] || GATE_FAIL="แก้ไฟล์นอกขอบเขต:
$out_of_scope"
fi

# ── (7) commit เฉพาะเมื่อผ่านทุกด่าน ──────────────────────────────────────────
if [ -n "$GATE_FAIL" ]; then
  status="gate-failed"; committed="false"
  echo "❌ GATE FAILED: $GATE_FAIL"
  echo "   worktree เก็บไว้ที่ $WT_DIR ให้ไปตรวจเอง (ไม่ได้ commit ให้)"
else
  ( cd "$WT_DIR" && git add -- "${SCOPE_PATHS[@]}" && \
    git commit -m "feat: $UNIT

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>" ) > "/tmp/gauntlet-$UNIT-commit.log" 2>&1
  if [ $? -eq 0 ]; then
    status="committed"; committed="true"
    echo "✅ committed on $BRANCH"
  else
    status="commit-failed"; committed="false"
    echo "❌ git commit ล้มเหลว (ดู /tmp/gauntlet-$UNIT-commit.log)"
  fi
fi

# ── (8) report — เขียนต่อท้าย ไม่ทับของเดิม ────────────────────────────────────
[ -f "$REPORT" ] && jq -e . "$REPORT" >/dev/null 2>&1 || echo "[]" > "$REPORT"
jq --arg unit "$UNIT" --arg status "$status" \
   --argjson cost "$cost" --argjson duration_ms "$duration_ms" --argjson num_turns "$num_turns" \
   --argjson tests_before "$BASELINE" --argjson tests_after "${AFTER:-null}" \
   --argjson committed "$committed" \
   '. + [{unit:$unit, status:$status, cost:$cost, duration_ms:$duration_ms, num_turns:$num_turns,
          tests_before:$tests_before, tests_after:$tests_after, committed:$committed}]' \
   "$REPORT" > "$REPORT.tmp" && mv "$REPORT.tmp" "$REPORT"
echo "report -> $REPORT"

# ── (9) หยุดตรงนี้เสมอ — merge เป็นการตัดสินใจของคน ────────────────────────────
if [ "$committed" = "true" ]; then
  echo
  echo "ขั้นต่อไป (ทำเอง ไม่ merge ให้อัตโนมัติ):"
  echo "  git diff $(git branch --show-current) $BRANCH   # ตรวจ diff ก่อน merge"
  echo "  git merge --no-ff $BRANCH"
  exit 0
else
  exit 1
fi
