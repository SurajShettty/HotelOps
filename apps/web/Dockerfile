FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
COPY packages/database/package.json packages/database/package.json
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--workspace=apps/web"]
