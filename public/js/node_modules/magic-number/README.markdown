#### Magic-number
[![Build Status](https://travis-ci.org/stpettersens/node-magic-number.svg?branch=master)](https://travis-ci.org/stpettersens/node-magic-number) [![Code Climate](https://codeclimate.com/github/stpettersens/node-magic-number/badges/gpa.svg)](https://codeclimate.com/github/stpettersens/node-magic-number/code) [![Development Dependency Status](https://david-dm.org/stpettersens/node-magic-number/dev-status.png?theme=shields.io)](https://david-dm.org/stpettersens/node-fake-storage#info=devDependencies) [![npm version](https://badge.fury.io/js/magic-number.svg)](http://npmjs.org/package/magic-number)

Node.js module to determine a file's type from its magic number.

Use from JavaScript:

    var magic = require('magic-number');
    magic.detectFile('file.zip'); // ==> 'application/zip'
    magic.detectFile('file.7z');  // ==> 'application/x-7z-compressed'

Use from [TypeScript](http://www.typescriptlang.org):

    /// <require path="typings/magic-number.d.ts" />
    import magic = require('magic-number');
    magic.detectFile('file.zip'); // ==> 'application/zip'
    magic.detectFile('file.7z');  // ==> 'application/x-7z-compressed'

Methods:

**magic.detectFile(file: string): string**

Parameter *file* is path string for the file to test.
Returns a MIME type for the tested file, 'unknown' if file type is not detected or
message when file doesn't exist.
