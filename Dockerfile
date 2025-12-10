FROM node:latest

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first
COPY package*.json ./

# Fix for ERR_TLS_CERT_ALTNAME_INVALID:
# 1. Force npm to use the correct registry
# 2. Disable strict SSL for npm (only if necessary)
RUN npm config set registry https://registry.npmjs.org/ \
    && npm config set strict-ssl false \
    && npm install

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 4000

# Run the application
CMD ["npm", "start"]
