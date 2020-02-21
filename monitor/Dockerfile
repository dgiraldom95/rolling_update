FROM node:10-alpine

RUN ["apk", "add", "curl"]

EXPOSE 3001:3001

WORKDIR /usr/src/app

COPY . .

RUN npm install

CMD ["npm", "run", "start"]