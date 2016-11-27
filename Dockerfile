FROM node

# RUN apt-get update -qq && apt-get install -y build-essential libpq-dev libkrb5-dev

# Fixes Issu 9863
RUN cd $(npm root -g)/npm \
  && npm install fs-extra \
  && sed -i -e s/graceful-fs/fs-extra/ -e s/fs\.rename/fs.move/ ./lib/utils/rename.js

# RUN mkdir /brainbox-src
# WORKDIR /brainbox-src
# ADD package.json /brainbox-src/package.json
# RUN npm install -g && npm install -g grunt-cli

RUN npm install -g grunt-cli

# ADD . /brainbox

VOLUME ["/brainbox"]
ADD start.sh /start.sh
RUN chmod 755 /start.sh
CMD ["/start.sh"]