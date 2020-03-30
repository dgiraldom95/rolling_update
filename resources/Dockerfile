FROM node:10-alpine

RUN apk add --update docker openrc
RUN rc-update add docker boot

WORKDIR /usr/src/app

COPY . .

RUN npm install

ENV MONITOR_HOST iot_monitor

HEALTHCHECK CMD curl --fail http://localhost:3002/healthcheck || exit 1

CMD npm run start

EXPOSE 3002