FROM node:20

WORKDIR /app

COPY package*.json ./

# Use HTTP registry to bypass SSL/proxy issues
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false

# Install with fallback options
RUN npm install --legacy-peer-deps || npm install --legacy-peer-deps --registry=http://registry.npmjs.org/

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]
