FROM node:latest

WORKDIR /app

COPY package*.json ./

# Use npm mirror to bypass 502 errors
RUN npm config set registry https://registry.npmmirror.com \
    && npm install

COPY . .

EXPOSE 4000

CMD ["npm", "start"]
