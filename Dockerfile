FROM node:23-alpine

WORKDIR /app

# Copy package files for both server and client
COPY package*.json ./
COPY admin-client/package*.json ./admin-client/

# Install dependencies for both server and client
RUN npm ci --only=production
RUN cd admin-client && npm ci

# Copy application code
COPY . .

# Build React app
RUN cd admin-client && npm run build

# Create database directory
RUN mkdir -p database

# Expose port
EXPOSE 3000

# Start the application
CMD ["npm", "start"]