#!/usr/bin/env bash
# new-project.sh — Create a new project with CI pre-wired
# Usage: new-project.sh /path/to/project [--backend supabase|mongodb|none] [--framework nextjs|vite] [--tier 1|2|3]

set -euo pipefail

PROJECT_DIR=""
BACKEND="none"
FRAMEWORK="nextjs"
TIER=2

while [[ $# -gt 0 ]]; do
  case "$1" in
    --backend)   BACKEND="$2"; shift 2 ;;
    --framework) FRAMEWORK="$2"; shift 2 ;;
    --tier)      TIER="$2"; shift 2 ;;
    -h|--help)
      echo "Usage: new-project.sh /path/to/project [options]"
      echo "  --backend supabase|mongodb|none  Backend (default: none)"
      echo "  --framework nextjs|vite         Framework (default: nextjs)"
      echo "  --tier 1|2|3                   Max tier (default: 2)"
      exit 0 ;;
    *)
      if [[ -z "$PROJECT_DIR" ]]; then
        PROJECT_DIR="$1"; shift
      else
        echo "Unknown argument: $1" >&2; exit 1
      fi ;;
  esac
done

if [[ -z "$PROJECT_DIR" ]]; then
  echo "Error: project directory required" >&2; exit 1
fi

if [[ -d "$PROJECT_DIR" ]]; then
  echo "Error: directory $PROJECT_DIR already exists" >&2; exit 1
fi

echo "🚀 Creating new project: $(basename $PROJECT_DIR)"
echo "   Framework: $FRAMEWORK | Backend: $BACKEND | Tier: $TIER"

# --- Scaffold project ---
mkdir -p "$PROJECT_DIR"
cd "$PROJECT_DIR"

# Initialize package.json
if [[ "$FRAMEWORK" == "nextjs" ]]; then
  echo "   Creating Next.js project..."
  npx create-next-app@latest . --typescript --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm --no-turbopack 2>&1 | tail -5
elif [[ "$FRAMEWORK" == "vite" ]]; then
  echo "   Creating Vite project..."
  npm create vite@latest . -- --template react-ts 2>&1 | tail -5
  npm install 2>&1 | tail -3
else
  echo "   Creating basic Node.js project..."
  npm init -y 2>&1 | tail -1
fi

# --- Initialize git ---
if [[ ! -d .git ]]; then
  git init
  git add -A
  git commit -m "Initial commit" 2>&1 | tail -1
fi

# --- Add backend ---
if [[ "$BACKEND" == "supabase" ]]; then
  echo "   Adding Supabase dependencies..."
  npm install @supabase/supabase-js @supabase/ssr 2>&1 | tail -3
elif [[ "$BACKEND" == "mongodb" ]]; then
  echo "   Adding MongoDB dependencies..."
  npm install mongoose 2>&1 | tail -3
fi

# --- Add CI ---
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "   Adding CI pipeline..."
bash "$SCRIPT_DIR/add-ci.sh" "$PROJECT_DIR" \
  --backend "$BACKEND" \
  --framework "$FRAMEWORK" \
  --tier "$TIER" \
  --skip-install  # already installed by scaffolding

# --- Final commit ---
git add -A
git commit -m "Add CI pipeline (tier $TIER)" 2>&1 | tail -1

echo ""
echo "✅ Project created at $PROJECT_DIR"
echo ""
echo "Next steps:"
echo "  cd $PROJECT_DIR"
echo "  npm run dev"
echo "  git remote add origin <your-repo-url>"
echo "  git push -u origin main"