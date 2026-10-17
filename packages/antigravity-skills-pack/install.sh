#!/usr/bin/env bash
# ==============================================================================
# Developer Excellence & Ponytail Master Skills Pack (v1.0.0)
# Multi-platform installer for Linux / macOS / WSL
# ==============================================================================

set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
SKILLS_SRC="$DIR/skills"

if [ ! -d "$SKILLS_SRC" ]; then
    echo "Error: Source skills directory not found at: $SKILLS_SRC" >&2
    exit 1
fi

SKILL_COUNT=$(find "$SKILLS_SRC" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')

echo "=========================================================="
echo " Developer Excellence & Ponytail Skills Pack (v1.0.0)    "
echo " Total skills in package: $SKILL_COUNT                    "
echo "=========================================================="

MODE="global"
TARGET_DIR=""

while [[ $# -gt 0 ]]; do
    key="$1"
    case $key in
        -g|--global)
            MODE="global"
            shift
            ;;
        -t|--target)
            MODE="target"
            TARGET_DIR="$2"
            shift
            shift
            ;;
        -h|--help)
            echo "Usage: $0 [options]"
            echo "Options:"
            echo "  --global, -g           Install as global Antigravity plugin (default)"
            echo "  --target, -t <path>    Install into specific project (<path>/.agents/skills)"
            echo "  --help, -h             Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

if [ "$MODE" = "target" ]; then
    if [ -z "$TARGET_DIR" ]; then
        echo "Error: Target directory not specified. Use -t <path>" >&2
        exit 1
    fi

    DEST="$TARGET_DIR/.agents/skills"
    mkdir -p "$DEST"
    echo "[*] Installing $SKILL_COUNT skills into project: $DEST..."
    cp -r "$SKILLS_SRC"/* "$DEST/"
    echo "[SUCCESS] Project installation complete! $SKILL_COUNT skills added to: $DEST"
else
    DEST="$HOME/.gemini/config/plugins/dev-excellence-pack"
    echo "[*] Installing as Global Antigravity Plugin to: $DEST..."
    mkdir -p "$DEST"
    rm -rf "$DEST/skills"
    cp -r "$SKILLS_SRC" "$DEST/"
    cp "$DIR/plugin.json" "$DEST/"
    cp "$DIR/README.md" "$DEST/"

    echo "[SUCCESS] Global plugin successfully installed!"
    echo "Location: $DEST"
    echo "Total skills available globally across all projects: $SKILL_COUNT"
fi
