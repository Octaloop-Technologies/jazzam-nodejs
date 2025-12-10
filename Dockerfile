FROM node:20

WORKDIR /app

COPY package*.json ./

# Use yarn instead of npm to bypass network issues
RUN npm install -g yarn
RUN yarn config set registry http://registry.npmjs.org/
RUN yarn config set strict-ssl false

# Install with yarn (more reliable in corporate networks)
RUN yarn install --legacy-peer-deps --network-timeout 300000 || \
    yarn install --ignore-engines --network-timeout 300000

COPY . .

EXPOSE 4000 5000

CMD ["npm", "start"]

