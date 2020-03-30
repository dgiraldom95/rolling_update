FROM node:10-alpine

RUN ["apk", "add", "curl"]

WORKDIR /usr/src/app

COPY . .

RUN npm install

ENV MONGO_HOST iot_mongo

HEALTHCHECK CMD curl --fail http://localhost:3001/ || exit 1

CMD ["npm", "run", "start"]

EXPOSE 3001