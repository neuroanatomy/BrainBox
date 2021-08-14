/* eslint-disable global-require */

module.exports = (app) => {
  console.log("Setting up routes");

  //========================================================================================
  // Admin route
  //========================================================================================
  app.use('/admin', require('../admin/'));

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

  app.use('/mri', require('../mri/'));
  app.use('/project', require('../project/'));
  app.use('/user', require('../user/'));
  app.use('/api', require('../api/'));
};
