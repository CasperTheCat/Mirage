FROM node:latest

WORKDIR /source
COPY . /source/

RUN apt update && apt install -y ffmpeg
RUN mkdir /source/cache/tn
RUN mkdir /source/cache/video

RUN npm i
RUN npm run b2


ENTRYPOINT ["npm","run","start"]
