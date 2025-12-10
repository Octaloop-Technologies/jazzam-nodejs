# Use an official Node.js base image
FROM node:20

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# **Step 1: Remove any proxy config**
RUN npm config delete proxy \
    && npm config delete https-proxy

# **Step 2: Ensure npm uses the official registry**
RUN npm config set registry https://registry.npmjs.org/

# **Step 3: Optional: ignore strict SSL (only if corporate proxy intercepts HTTPS)**
# RUN npm config set strict-ssl false

# Install dependencies
RUN npm install

# Copy the rest of the app
COPY . .

# Expose port (example)
EXPOSE 5000

# Start app
CMD ["node", "index.js"]

