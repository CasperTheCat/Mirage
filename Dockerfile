FROM node:latest

WORKDIR /source
COPY . /source/

RUN npm i
RUN npm run b2


ENTRYPOINT ["npm","run","start"]
