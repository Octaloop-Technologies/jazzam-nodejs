FROM node:22

WORKDIR /app

COPY package*.json ./

RUN npm config set proxy http://1v1-backend.octalooptechnologies.com:5000 \
    && npm config set https-proxy http://1v1-backend.octalooptechnologies.com:5000 \
    && npm config set strict-ssl false \
    && npm install

COPY . .

EXPOSE 4000

CMD ["npm", "start"]
