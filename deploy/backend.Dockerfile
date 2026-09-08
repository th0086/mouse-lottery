FROM node:20-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace shared && npm run build --workspace backend

EXPOSE 4001
CMD ["npm", "run", "start", "--workspace", "backend"]
