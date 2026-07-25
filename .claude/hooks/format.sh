#!/usr/bin/env bash
# PostToolUse: format ไฟล์ที่เพิ่งถูกแก้ (รับ JSON ทาง stdin)
file=$(jq -r '.tool_input.file_path // empty')
[ -z "$file" ] && exit 0
case "$file" in
  *.ts|*.js|*.json) npx prettier --write "$file" >/dev/null 2>&1 ;;
esac
exit 0
