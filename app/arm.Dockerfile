FROM node:10-alpine

RUN ["apk", "add", "curl"]

WORKDIR /usr/src/app

COPY . .

RUN npm install

HEALTHCHECK CMD curl --fail http://localhost:3000/healthcheck || exit 1


CMD ["npm", "run", "start"]

EXPOSE 3000