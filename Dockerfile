FROM node:20
WORKDIR /app

COPY package*.json ./

# Use HTTPS registry for stability
RUN npm config set registry https://registry.npmjs.org/
RUN npm config set strict-ssl true

# Install dependencies with retry and ignore peer conflicts
RUN npm install --legacy-peer-deps --retry 5

COPY . .

EXPOSE 4000
CMD ["npm", "start"]
