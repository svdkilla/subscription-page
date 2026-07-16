#!/bin/sh

echo "Starting entrypoint script..."

if [ -n "${REMNAWAVE_API_TOKEN_FILE:-}" ]; then
    export REMNAWAVE_API_TOKEN="$(node -e "process.stdout.write(require('fs').readFileSync(process.env.REMNAWAVE_API_TOKEN_FILE, 'utf8').trim())")"
fi

if [ -n "${INTERNAL_JWT_SECRET_FILE:-}" ]; then
    export INTERNAL_JWT_SECRET="$(node -e "process.stdout.write(require('fs').readFileSync(process.env.INTERNAL_JWT_SECRET_FILE, 'utf8').trim())")"
fi

if [ -z "${INTERNAL_JWT_SECRET:-}" ]; then
    export INTERNAL_JWT_SECRET="$(node -e "process.stdout.write(require('crypto').randomBytes(64).toString('hex'))")"
fi


echo "Entrypoint script completed."
exec "$@"
