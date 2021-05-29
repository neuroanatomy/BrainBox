const notifier = require("../../notifier");

const validator = (req, res, next) => {
  const authorizedIP = ["1"]; // hardcoded authorized IPs
  let ip;
  if(req.connection.remoteAddress) {
    ip = req.connection.remoteAddress;
  } else if(req.socket._peername) {
    ip = req.socket._peername.address;
  }

  ip = ip.split(":").pop();
  console.log({ip});

  if(authorizedIP.includes(ip)) {
    return next();
  }

  res.status(403).send({error: "Unauthorized address"})
    .end();
};

/**
 * Save all atlases
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const saveAllAtlases = (req, res) => {
  notifier.emit("saveAllAtlases");
  res.send({msg: "Will save all atlases", success: true});
};

/**
 * Broadcast a server message to all connected users. Message is
 * in req.body.msg
 * @param {object} req Request object
 * @param {object} res Response object
 * @returns {void}
 */
const broadcastMessage = (req, res) => {
  console.log("broadcastMessage");

  req.checkBody('msg', 'Provide a msg to broadcast')
    .notEmpty();

  const errors = req.validationErrors();
  if (errors) {
    return res.status(403).send(errors)
      .end();
  }
  // const msg = req.sanitize(req.body.msg); // why does this not work?
  const {msg} = req.body;
  notifier.emit("broadcastMessage", msg);
  res.send({msg: "Will broadcast message " + msg, success: true});
};

module.exports = {
  validator,
  saveAllAtlases,
  broadcastMessage
};
