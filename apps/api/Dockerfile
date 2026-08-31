FROM node:20-alpine

# postgresql-client provides pg_isready (used to wait for the db) and psql
# (used to apply the hand-written EXCLUDE-constraint migration Prisma can't express).
RUN apk add --no-cache postgresql-client

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install

COPY . .

# Generate the Prisma client for THIS (Linux) container — the host's
# generated client (if bind-mounted over) is Windows/macOS-specific and
# won't run here; the generated/ anonymous volume in docker-compose.yml
# keeps this container's copy from being shadowed by the host bind mount.
RUN npm run db:generate

EXPOSE 4000

ENTRYPOINT ["sh", "apps/api/entrypoint.sh"]
