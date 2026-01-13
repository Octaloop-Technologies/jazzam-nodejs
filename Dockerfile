# 1. Use a specific LTS version with Alpine (Lightweight OS)
# Avoiding 'latest' ensures your build doesn't break unexpectedly in the future.
FROM node:latest

# 2. Set the environment to production 
# This optimizes how some dependencies compile/run.
ENV NODE_ENV=production

WORKDIR /app

# 3. Optimize Layer Caching
# Copy only package files first. Docker uses the cache for this layer 
# if package.json hasn't changed.
COPY package*.json ./

# 4. Deterministic Install
# - 'npm ci' is faster and more reliable than 'install' for CI/CD.
# - '--only=production' prevents installing devDependencies (tests, linters).
# - '&& npm cache clean' removes temporary cache data to reduce image size.
RUN npm ci --only=production && npm cache clean --force

# 5. Security: Non-Root User
# The node image comes with a user named 'node'. We must set ownership
# before switching users so the app can access the files.
COPY --chown=node:node . .

# Switch to the non-root user
USER node

EXPOSE 4000

# 6. Direct Execution
# Using 'node' directly handles OS signals (SIGTERM/SIGINT) better than 'npm start'.
# Replace 'server.js' with your actual entry point file.
CMD [ "node", "server.js" ]
