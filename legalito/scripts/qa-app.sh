#!/usr/bin/env bash
# Arranca la aplicación completa contra el backend de pruebas (PostgreSQL local).
#   scripts/qa-app.sh build   # compila en .next-qa
#   scripts/qa-app.sh start   # reinicia la BD legalito_qa y arranca en :3400
#   scripts/qa-app.sh test    # ejecuta tests/e2e/app.spec.ts
set -euo pipefail
cd "$(dirname "$0")/.."
export LEGALITO_TEST_BACKEND=1 APP_ENV=test
export NEXT_PUBLIC_SUPABASE_URL=http://qa.local NEXT_PUBLIC_SUPABASE_ANON_KEY=qa-anon-key-0000000000000000
export NEXT_PUBLIC_SITE_URL=http://localhost:3400
export TEST_BACKEND_DATABASE_URL=${TEST_BACKEND_DATABASE_URL:-postgres://postgres:postgres@localhost:5432/legalito_qa}
export SUPABASE_SERVICE_ROLE_KEY=qa-service-key-000000000000 ALLOW_DEMO_TEMPLATES=true HASH_SALT=qa-salt-0123456789abcdef
export STRIPE_SECRET_KEY=sk_test_qa STRIPE_WEBHOOK_SECRET=whsec_qa
case "${1:-}" in
  build) npx next build ;;
  start)
    # Detiene cualquier servidor previo en el puerto de QA.
    if command -v fuser >/dev/null; then fuser -k 3400/tcp 2>/dev/null || true; sleep 1; fi
    npx tsx tests/harness/setup-qa-db.ts
    nohup npx next start -p 3400 > "${QA_LOG:-/tmp/legalito-qa.log}" 2>&1 &
    for _ in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3400/ && break; sleep 1; done
    echo "QA en http://localhost:3400"
    ;;
  test) E2E_APP=1 E2E_BASE_URL=http://localhost:3400 npx playwright test tests/e2e/app.spec.ts --workers=1 "${@:2}" ;;
  *) echo "uso: $0 build|start|test"; exit 1 ;;
esac
