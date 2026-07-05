FROM node:18

WORKDIR /app

COPY backend/package*.json ./
RUN npm install

# force fresh copy (important)
COPY backend/ ./

EXPOSE 3000

CMD ["npm", "start"]
