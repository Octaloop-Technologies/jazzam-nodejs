# Use an official Node.js runtime as a parent image
FROM node:20-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install any dependencies
RUN npm install --omit=dev

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 4000

# Run the application
CMD [ "npm", "start" ]
