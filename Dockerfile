# Stage 1: Build — install dependencies & build frontend (Vite) + siapkan backend
# .env HARUS ada di build context di sini karena Vite membaca variabel VITE_*
# (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) saat build, bukan saat runtime.
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Stage 2: Production runtime — jalankan server Express (backend /api + serve dist/)
# Nginx TIDAK menggantikan server ini, nginx cuma reverse proxy di depannya
# (lihat docker-compose.yml + nginx/default.conf), supaya fitur /api/* (manage
# user, delete-item setelah approval) tetap berfungsi di production.
FROM node:20-alpine AS production
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api

EXPOSE 3000
CMD ["npm", "start"]
