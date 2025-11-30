FROM node:24 AS builder

WORKDIR /usr/src/app

# Copy root configuration files (no need for ../../ since context is root)
COPY package*.json ./
COPY nest-cli.json ./
COPY tsconfig*.json ./

RUN npm ci

# Copy only what this service needs
COPY apps/authentication ./apps/authentication
COPY apps/common ./apps/common

RUN npm run build authentication

FROM node:24 AS production

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/apps/authentication/config ./apps/authentication/config

EXPOSE 3000

CMD ["node", "dist/apps/authentication/main"]