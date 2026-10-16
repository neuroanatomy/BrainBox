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

const NotFoundError = function(...args) {
  const err = Error.apply(this, args);
  this.name = 'NotFoundError';
  this.message = err.message;
};

NotFoundError.prototype = Object.create(Error.prototype, {
  constructor: {
    value: NotFoundError
  }
});

module.exports = {
  ForbiddenAccessError,
  NotFoundError
};
