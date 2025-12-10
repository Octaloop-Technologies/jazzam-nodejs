FROM node:22.15.1

WORKDIR /app

COPY package*.json ./

RUN npm config set strict-ssl false && npm install

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]

