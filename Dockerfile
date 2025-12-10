FROM node:latest

WORKDIR /app

# Copy package.json files
COPY package*.json ./

# Configure npm for network issues
RUN npm config set strict-ssl false
RUN npm config set registry http://registry.npmjs.org/

# Install dependencies with retry
RUN npm install --retry=5

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 4000

CMD ["npm", "start"]
