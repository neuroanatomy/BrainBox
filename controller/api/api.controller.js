/* eslint-disable no-sync */
/* eslint-disable max-statements */

const fs = require('fs');
const path = require('path');
const tracer = require('tracer').console({format: '[{{file}}:{{line}}]  {{message}}'});

const getLabelsets = (req, res) => {
  const arr = fs.readdirSync(path.join(__dirname, '../../public/labels/'));
  const info = [];
  for (const label of arr) {
    var json = JSON.parse(fs.readFileSync(path.join(__dirname, "../../public/labels/" + label)));
    info.push({
      name: json.name,
      source: label
    });
  }
  res.send(info);
};

const userNameQuery = (req, res) => {
  const {query} = req;
  const db = req.app.db.mongoDB();
  db.get('user')
    .find(
      { $or: [
        {nickname: {$regex:query.q}},
        {name: {$regex:query.q}}
      ]},
      { fields: ['name', 'nickname'], limit: 10 }
    )
    .then((list) => {
      res.send(list);
    })
    .catch(tracer.log);
};

const getAtlasBackups = (req, res) => {
  const { source, atlasProject, atlasName } = req.query;

  if(typeof source === "undefined"
      || typeof atlasProject === "undefined"
      || atlasName === "undefined") {
    res.status(400);
    res.render('error', {
      message: "Missing source, atlasProject or atlasName"
    });

    return;
  }

  // get the mri object to which this atlas belongs
  const db = req.app.db.mongoDB();
  db.get('mri').findOne({
    source: source,
    "mri.atlas": {$elemMatch:{name: atlasName, project: atlasProject}},
    backup: {$exists: 0}
  }, {url: 1, "mri.atlas.$": 1})
    .then( (obj) => {
    // get all filenames that have ever been associated with this atlas
      let {url: dataDir} = obj;
      [,, dataDir] = dataDir.split("/");
      db.get('mri').aggregate([
        { $match:{ source: source, "mri.atlas":{$elemMatch: {project: atlasProject, name: atlasName}}}},
        { $unwind: "$mri.atlas" },
        { $match: { "mri.atlas.project":atlasProject, "mri.atlas.name": atlasName}},
        { $group: {_id:{filename: "$mri.atlas.filename"}}},
        { $project: {_id:0, filename:"$_id.filename"}}
      ])
        .then( (obj2) => {
        // get all backups for those files...
          let i;
          const promiseArray = [];
          // ...from backup logs
          for(i=0; i<obj2.length; i++) {
            promiseArray.push(
              db.get('log').aggregate([
                { $match: {key:"saveAtlasBackup", "value.atlasDirectory": dataDir, "value.atlasFilename": obj2[i].filename}},
                { $project: {_id:0, filename:"$value.atlasFilename", timestamp:"$value.timestamp"}}
              ])
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
                message: "Can't query backup file logs",
                error: err
              });
            });
        })
        .catch( (err) => {
          res.status(500);
          res.render('error', {
            message: "Can't query backup files",
            error: err
          });
        });
    })
    .catch( (err) => {
      res.status(400);
      res.render('error', {
        message: "Can't find atlas",
        error: err
      });
    });
};

const log = (req, res) => {
  const loggedUser = req.isAuthenticated() ? req.user.username : 'anonymous';
  const json = req.body;
  let obj;
  const db = req.app.db.mongoDB();

  switch (json.key) {
  case 'annotationLength':
    obj = {
      key: "annotationLength",
      username: loggedUser,
      "value.source": json.value.source,
      "value.atlas": json.value.atlas
    };
    db.get('log').findOne(obj)
      .then( (result) => {
        let length = 0;
        if (result) {
          length = parseFloat(result.value.length);
        }
        var sum = parseFloat(json.value.length) + length;
        db.get('log').update(obj, {$set:{
          "value.length":sum,
          date: (new Date()).toJSON()
        }}, {upsert: true});
        res.send({length: sum});
      })
      .catch( (err) => {
        tracer.log('ERROR', err);
        res.send({error: JSON.stringify(err)});
      });
    break;
  default:
    db.get('log').insert({
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

  db.get('mri').update({
    source: json.value.source,
    "mri.atlas":{$elemMatch:{filename:json.value.atlas}}
  }, {
    $set: {
      "mri.atlas.$.modified": (new Date()).toJSON(),
      "mri.atlas.$.modifiedBy": loggedUser
    }
  });
};

module.exports = {
  getLabelsets,
  userNameQuery,
  getAtlasBackups,
  log
};
