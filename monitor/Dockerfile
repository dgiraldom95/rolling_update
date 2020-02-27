FROM node:10-alpine

RUN ["apk", "add", "curl"]

EXPOSE 3001:3001

WORKDIR /usr/src/app

COPY . .

RUN npm install

HEALTHCHECK CMD curl --fail http://localhost:3001/ || exit 1

CMD ["npm", "run", "start"]ƒ