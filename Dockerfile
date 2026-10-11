# One image for the API (which also serves the built UI) and the worker; compose picks the command.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY web ./web
RUN npm run build:web

FROM node:24-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev --ignore-scripts && npm cache clean --force
COPY tsconfig.json sources.yaml ./
COPY src ./src
COPY --from=build /app/web/dist ./web/dist
USER node
EXPOSE 3000
CMD ["npm", "run", "api"]
