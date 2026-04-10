const fs = require('fs');
const path = require('path');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});

/**
 * Escape special regex characters for use inside a MongoDB $regex query.
 * @param {string} str - raw user input
 * @returns {string} escaped string safe for $regex
 */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const getLabelsets = async (req, res) => {
  const arr = await fs.promises.readdir(path.join(__dirname, '../../public/labels/'));
  const info = [];
  for (const label of arr) {
    // eslint-disable-next-line no-await-in-loop
    const json = JSON.parse(await fs.promises.readFile(path.join(__dirname, '../../public/labels/' + label)));
    info.push({
      name: json.name,
      source: label
    });
  }
  res.send(info);
};

const userNameQuery = (req, res) => {
  const {query} = req;
  if(typeof query.q === 'undefined') {
    res.status(400).send({error: 'missing q parameter'});

    return;
  }
  const nativeDb = req.app.db.nativeMongoDB();
  nativeDb.collection('user')
    .find(
      { $or: [
        {nickname: {$regex:escapeRegex(query.q)}},
        {name: {$regex:escapeRegex(query.q)}}
      ]},
      { projection: { name: 1, nickname: 1 }, limit: 10 }
    )
    .toArray()
    .then((list) => {
      res.send(list);
    })
    .catch((err) => {
      tracer.log(err);
      res.status(500).send({ error: err.message });
    });
};

const getAtlasBackups = (req, res) => {
  const { source, atlasProject, atlasName } = req.query;

  if(typeof source === 'undefined'
      || typeof atlasProject === 'undefined'
      || typeof atlasName === 'undefined') {
    res.status(400);
    res.render('error', {
      message: 'Missing source, atlasProject or atlasName'
    });

    return;
  }

  // get the mri object to which this atlas belongs
  const nativeDb = req.app.db.nativeMongoDB();
  nativeDb.collection('mri').findOne({
    source: source,
    'mri.atlas': {$elemMatch:{name: atlasName, project: atlasProject}},
    backup: {$exists: false}
  }, {projection: {url: 1, 'mri.atlas.$': 1, _id: 0}})
    .then( (obj) => {
    // get all filenames that have ever been associated with this atlas
      if (!obj) {
        res.status(404);
        res.render('error', { message: 'Atlas not found' });

        return;
      }
      let {url: dataDir} = obj;
      [,, dataDir] = dataDir.split('/');
      nativeDb.collection('mri').aggregate([
        { $match:{ source: source, 'mri.atlas':{$elemMatch: {project: atlasProject, name: atlasName}}}},
        { $unwind: '$mri.atlas' },
        { $match: { 'mri.atlas.project':atlasProject, 'mri.atlas.name': atlasName}},
        { $group: {_id:{filename: '$mri.atlas.filename'}}},
        { $project: {_id:0, filename:'$_id.filename'}}
      ])
        .toArray()
        .then( (obj2) => {
        // get all backups for those files...
          let i;
          const promiseArray = [];
          // ...from backup logs
          for(i=0; i<obj2.length; i++) {
            promiseArray.push(
              // db.get('log').aggregate([
              nativeDb.collection('log').aggregate([
                { $match: {key:'saveAtlasBackup', 'value.atlasDirectory': dataDir, 'value.atlasFilename': obj2[i].filename}},
                { $project: {_id:0, filename:'$value.atlasFilename', timestamp:'$value.timestamp'}}
              ])
                .toArray()
            );
          }
          Promise.all(promiseArray)
            .then((values) => {
              let result = [].concat(...values);
              result = result.concat(obj2);
              res.send(result);
            })
            .catch( (err) => {
              res.status(500);
              res.render('error', {
                message: 'Can\'t query backup file logs',
                error: err
              });
            });
        })
        .catch( (err) => {
          res.status(500);
          res.render('error', {
            message: 'Can\'t query backup files',
            error: err
          });
        });
    })
    .catch( (err) => {
      res.status(400);
      res.render('error', {
        message: 'Can\'t find atlas',
        error: err
      });
    });
};

// eslint-disable-next-line max-statements
const log = async (req, res) => {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const json = req.body;
  let obj;
  const nativeDb = req.app.db.nativeMongoDB();
  try {
    switch (json.key) {
    case 'annotationLength': {
      if (!json.value || !json.value.source || !json.value.atlas) {
        res.status(400).send({error: 'missing value.source or value.atlas'});
        break;
      }

      obj = {
        key: 'annotationLength',
        username: loggedUser,
        'value.source': json.value.source,
        'value.atlas': json.value.atlas
      };

      const result = await nativeDb.collection('log').findOne(obj);
      let length = 0;
      if(result) {
        length = parseFloat(result.value.length);
      }
      const sum = parseFloat(json.value.length) + length;
      await nativeDb.collection('log').updateOne(obj, {$set:{
        'value.length':sum,
        date: (new Date()).toJSON()
      }}, {upsert: true});
      res.send({length: sum});
      break;
    }

    default:
      await nativeDb.collection('log').insertOne({
        key: json.key,
        value: json.value,
        username: loggedUser,
        date: (new Date()).toJSON(),
        ip: req.headers['x-forwarded-for'] ||
                    req.connection.remoteAddress ||
                    req.socket.remoteAddress ||
                    req.connection.socket.remoteAddress
      });
      res.send();
    }
    if (json.value && json.value.source && json.value.atlas) {
      nativeDb.collection('mri').updateOne({
        source: json.value.source,
        'mri.atlas':{$elemMatch:{filename:json.value.atlas}}
      }, {
        $set: {
          'mri.atlas.$.modified': (new Date()).toJSON(),
          'mri.atlas.$.modifiedBy': loggedUser
        }
      });
    }
  } catch (err) {
    tracer.log('ERROR', err);
    res.status(500).send({error: JSON.stringify(err)});
  }
};

module.exports = {
  getLabelsets,
  userNameQuery,
  getAtlasBackups,
  log
};
