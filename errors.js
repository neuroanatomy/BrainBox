'use strict';

const ForbiddenAccessError = function(...args) {
  const err = Error.apply(this, args);
  this.name = 'ForbiddenAccessError';
  this.message = err.message;
};

ForbiddenAccessError.prototype = Object.create(Error.prototype, {
  constructor: {
    value: ForbiddenAccessError
  }
});

module.exports = {
  ForbiddenAccessError
};
