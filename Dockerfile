FROM node:latest

WORKDIR /app

# Copy package.json
COPY package*.json ./

# Disable strict SSL temporarily to fix ERR_TLS_CERT_ALTNAME_INVALID
RUN npm config set strict-ssl false

# Install dependencies
RUN npm install --no-cache

# Copy the rest of the application
COPY . .

# Expose port
EXPOSE 4000

CMD ["npm", "start"]

