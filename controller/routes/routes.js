const admin = require('../admin/');
const api = require('../api/');
const Mri = require('../mri/');
const project = require('../project/');
const user = require('../user/');

module.exports = (app) => {
  console.log('Setting up routes');

  //========================================================================================
  // Admin route
  //========================================================================================
  app.use('/admin', admin);

  //========================================================================================
  // GUI routes
  //========================================================================================
  app.get('/', (req, res) => {
    const login = (req.isAuthenticated()) ?
      ('<a href=\'/user/' + req.user.username + '\'>' + req.user.username + '</a> (<a href=\'/logout\'>Log Out</a>)') :
      ('<a href=\'/auth/github\'>Log in with GitHub</a>');

    // store return path in case of login
    req.session.returnTo = req.originalUrl;

    res.render('index', {
      title: 'BrainBox',
      login: login
    });
  });

  app.use('/mri', new Mri(app.db.mongoDB));
  app.use('/project', project);
  app.use('/user', user);
  app.use('/api', api);
};
