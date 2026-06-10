FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

# ---

FROM node:22-alpine AS runner

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

# Create documents directory for PDF uploads
RUN mkdir -p /app/documents

EXPOSE 9004

CMD ["npm", "start"]
