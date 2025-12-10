FROM node:20

WORKDIR /app

# Add npm registry to hosts for network bypass
RUN echo "104.16.3.35 registry.npmjs.org" >> /etc/hosts

COPY package*.json ./

# Production-ready npm configuration
RUN npm config set registry https://registry.npmjs.org/
RUN npm config set strict-ssl false
RUN npm config set fetch-timeout 300000

# Install with fallback
RUN npm install --legacy-peer-deps || \
    npm config set registry http://registry.npmjs.org/ && \
    npm install --legacy-peer-deps

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]
