#!/bin/sh
set -e

echo "Waiting for postgres at ${DB_HOST}:${DB_PORT}..."
until pg_isready -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready."

echo "Generating Prisma client..."
npm run db:generate

echo "Running Prisma migrations..."
npm run migrate:deploy --workspace=packages/database

echo "Applying manual exclusion-constraint SQL (idempotent)..."
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -v ON_ERROR_STOP=1 \
  -f packages/database/prisma/manual-sql/001_exclusion_constraints.sql

echo "Seeding initial data (idempotent)..."
npm run db:seed

echo "Starting API..."
exec npm run start:dev --workspace=apps/api
