FROM node

# Fixes Issu 9863
RUN cd $(npm root -g)/npm \
  && npm install fs-extra \
  && sed -i -e s/graceful-fs/fs-extra/ -e s/fs\.rename/fs.move/ ./lib/utils/rename.js

VOLUME ["/brainbox"]
ADD start.sh /start.sh
RUN chmod 755 /start.sh
CMD ["/start.sh"]