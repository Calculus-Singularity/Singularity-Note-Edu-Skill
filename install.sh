#!/usr/bin/env bash
set -euo pipefail

SKILL_NAME="singnote-flow-author"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/$SKILL_NAME"
DEST_ROOT="${CODEX_HOME:-"$HOME/.codex"}/skills"
FORCE=0
DRY_RUN=0

usage() {
  cat <<'USAGE'
Usage: ./install.sh [--dest <skills-dir>] [--force] [--dry-run]

Installs singnote-flow-author into Codex skills.

Options:
  --dest <dir>   Skills root directory. Default: ${CODEX_HOME:-$HOME/.codex}/skills
  --force        Replace an existing singnote-flow-author installation
  --dry-run      Print what would happen without writing files
  -h, --help     Show this help
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --dest)
      if [ "$#" -lt 2 ]; then
        echo "install.sh: --dest requires a directory" >&2
        exit 2
      fi
      DEST_ROOT="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "install.sh: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ ! -f "$SOURCE_DIR/SKILL.md" ]; then
  echo "install.sh: cannot find $SOURCE_DIR/SKILL.md" >&2
  exit 1
fi

DEST_DIR="$DEST_ROOT/$SKILL_NAME"

echo "Source: $SOURCE_DIR"
echo "Destination: $DEST_DIR"

if [ "$DRY_RUN" -eq 1 ]; then
  if [ -e "$DEST_DIR" ] && [ "$FORCE" -eq 0 ]; then
    echo "Would fail: destination already exists. Use --force to replace it."
  elif [ -e "$DEST_DIR" ]; then
    echo "Would replace existing skill directory."
  else
    echo "Would install skill."
  fi
  exit 0
fi

mkdir -p "$DEST_ROOT"

if [ -e "$DEST_DIR" ]; then
  if [ "$FORCE" -ne 1 ]; then
    echo "install.sh: destination already exists: $DEST_DIR" >&2
    echo "Use --force to replace it." >&2
    exit 1
  fi
  rm -rf "$DEST_DIR"
fi

cp -R "$SOURCE_DIR" "$DEST_DIR"

echo "Installed $SKILL_NAME."
echo "Restart Codex to pick up new skills."
