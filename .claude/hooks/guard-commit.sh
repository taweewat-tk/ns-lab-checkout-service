#!/usr/bin/env bash
# PreToolUse (matcher: Bash): ถ้าเป็นคำสั่ง git commit ให้เช็คก่อน
cmd=$(jq -r '.tool_input.command // empty')
echo "$cmd" | grep -q "git commit" || exit 0
if ! npm run typecheck >/dev/null 2>&1; then
  echo "typecheck ไม่ผ่าน — แก้ให้เขียวก่อนค่อย commit" >&2
  exit 2   # exit 2 = บล็อก + ส่งเหตุผลให้ Claude อ่าน
fi
exit 0
