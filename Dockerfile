FROM node:latest

WORKDIR /app

COPY package*.json ./

# Clear any inherited npm proxy / registry
RUN npm config delete proxy \
    && npm config delete https-proxy \
    && npm config set registry https://registry.npmjs.org/ \
    && npm install

COPY . .

EXPOSE 4000

CMD ["npm", "start"]
