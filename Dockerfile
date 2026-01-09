FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Azure listens on this port
EXPOSE 5001

# Start app
CMD ["node", "index.js"]
