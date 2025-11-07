
FROM node:latest-alpine

# Set the working directory in the contain
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install any dependencies
RUN npm install --no-cache

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 4000

# Run the application
CMD [ "npm", "start" ]
