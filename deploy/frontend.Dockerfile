FROM node:20-alpine AS base
WORKDIR /app

ARG NEXT_PUBLIC_API_BASE_URL
ENV NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/package.json
COPY frontend/package.json ./frontend/package.json
COPY shared/package.json ./shared/package.json
RUN npm ci

COPY . .
RUN npm run build --workspace shared && npm run build --workspace frontend

EXPOSE 4000
CMD ["npm", "run", "start", "--workspace", "frontend"]
