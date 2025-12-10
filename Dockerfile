FROM node:18

WORKDIR /app

COPY package*.json ./

# Clear any inherited npm proxy / registry
RUN npm install --no-cache

COPY . .

EXPOSE 4000

CMD ["npm", "start"]
