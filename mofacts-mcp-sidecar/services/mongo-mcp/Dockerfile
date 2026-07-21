FROM node:22.22.0-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 8932

CMD ["npm", "start"]
