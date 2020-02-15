FROM node:10-alpine

RUN ["apk", "add", "curl"]

HEALTHCHECK --interval=3s --timeout=3s \
  CMD curl -f http://127.0.0.1:3000/healthcheck || exit 1

EXPOSE 3000:3001

WORKDIR /usr/src/app

COPY . .

RUN npm install


CMD ["npm", "run", "start"]