# 1. Use a specific LTS version of Node.js (better stability)
# Consider pinning the exact Node.js version, but 22 is a fine choice for stability.
FROM node:22

# Set the working directory in the container
WORKDIR /app

# 3. Optimize layer caching by copying package files first
# Docker uses the cache for this layer if package.json hasn't changed.
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application code into the container
COPY . .

# Switch to a non-root user for security (best practice)
USER node

# Expose the port the app will run on
EXPOSE 4000

# Start the application
CMD ["npm", "start"]
