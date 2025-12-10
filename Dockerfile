FROM node:20

WORKDIR /app

COPY package*.json ./

# Fix npm SSL and registry issues
RUN npm config set registry https://registry.npmjs.org/
RUN npm config set strict-ssl false
RUN npm config delete proxy
RUN npm config delete https-proxy

# Install dependencies with retry and ignore peer conflicts
RUN npm install --legacy-peer-deps --retry 5

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]
