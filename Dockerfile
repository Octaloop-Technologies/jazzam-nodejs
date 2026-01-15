# 1. Use a specific LTS version with Alpine (Lightweight OS)
# Avoiding 'latest' ensures your build doesn't break unexpectedly in the future.
FROM node:latest

# Set the working directory in the container
WORKDIR /app

# 3. Optimize Layer Caching
# Copy only package files first. Docker uses the cache for this layer 
# if package.json hasn't changed.
COPY package*.json ./

# Install any dependencies
RUN npm install

# Switch to the non-root user
USER node

EXPOSE 4000

# Run the application
CMD [ "node", "--experimental-json-modules", "src/index.js" ]
