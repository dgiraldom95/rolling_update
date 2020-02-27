FROM node:10-alpine

RUN ["apk", "add", "curl"]

EXPOSE 3000:3000

WORKDIR /usr/src/app

COPY . .

RUN npm install

HEALTHCHECK CMD curl --fail http://localhost:3000/ || exit 1

CMD ["npm", "run", "start"]