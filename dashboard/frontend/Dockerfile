FROM node:21-slim

WORKDIR /app

COPY package.json ./

# Install dependencies (ignoring optional logs for clean execution)
RUN npm install --silent

COPY . .

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server
CMD ["npm", "run", "dev"]
