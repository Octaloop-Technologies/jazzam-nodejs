FROM node:20

WORKDIR /app

COPY package*.json ./

# Simple network and SSL fix
RUN npm config set registry http://registry.npmjs.org/
RUN npm config set strict-ssl false
RUN npm config set fetch-timeout 300000

# Install with fallback
RUN npm install --legacy-peer-deps || \
    npm install --legacy-peer-deps --registry=http://registry.npmjs.org/

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]

