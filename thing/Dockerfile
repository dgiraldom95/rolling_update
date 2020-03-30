FROM node:10-alpine

WORKDIR /usr/src/app

COPY . .

RUN npm install

ENV APP_HOST iot_app

HEALTHCHECK CMD curl --fail http://localhost:3003/healthcheck || exit 1

CMD npm run start

EXPOSE 3003