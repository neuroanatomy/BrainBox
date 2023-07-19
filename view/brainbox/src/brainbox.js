/* global AtlasMakerWidget */
/*! BrainBox */

/**
 * @library BrainBox
 * @version 0.0.1
 * @brief Real-time collaboration in neuroimaging
 */

/**
 * @page BrainBox
 */
export const BrainBox = {
  version: 1,
  debug: 1,
  info:{},
  accessLevels: ['none', 'view', 'edit', 'add', 'remove'],

  /**
     * @function initBrainBox
     * @returns {object} A promise
     */
  initBrainBox: function initBrainBox() {
    const pr = new Promise(function (resolve, reject) {
      // Add AtlasMaker and friends
      const stereotaxic = document.getElementById('stereotaxic');
      stereotaxic.innerHTML = '';
      const atlasmaker = document.createElement('div');
      atlasmaker.id = 'atlasmaker';
      atlasmaker.className = 'edit-mode';
      stereotaxic.appendChild(atlasmaker);

      AtlasMakerWidget.initAtlasMaker(atlasmaker)
        .then(function () {
          resolve();
        })
        .catch((err) => {
          console.error('ERROR:', err);
          reject(err);
        });

      window.addEventListener( 'unload', BrainBox.unload);
    });

    return pr;
  },

  /**
     * @function configureBrainBox
     * @param {object} param Configuration parameters
     * @returns {object} A promise
     */
  configureBrainBox: function configureBrainBox(param) {
    // eslint-disable-next-line max-statements
    const pr = new Promise(function (resolve, reject) {
      const index = param.annotationItemIndex || 0;

      // Copy MRI from source
      AtlasMakerWidget.appendChatMessage('Downloading from source to server...');

      // Configure MRI into atlasmaker
      if (param.info.success === false) {
        AtlasMakerWidget.appendChatMessage('ERROR: ' + param.info.message + '.');
        console.log('ERROR: ' + param.info.message + '.');
        reject(new Error(param.info.message));

        return;
      }
      BrainBox.info = param.info;

      /**
            * @todo Check it these two lines are of any use...
            */
      param.dim = BrainBox.info.dim; // this allows to keep dim and pixdim through annotation changes
      param.pixdim = BrainBox.info.pixdim;

      // re-instance stored configuration
      let stored = localStorage.AtlasMaker;
      if (stored) {
        stored = JSON.parse(stored);
        if (stored.version && stored.version === BrainBox.version) {
          for (let i = 0; i < stored.history.length; i++) {
            if (stored.history[i].url === param.url) {
              AtlasMakerWidget.User.view = stored.history[i].view;
              AtlasMakerWidget.User.slice = stored.history[i].slice;
              break;
            }
          }
        }
      }

      // enact configuration in param, eventually overriding the stored one
      if (param.view) {
        AtlasMakerWidget.User.view = param.view;
        AtlasMakerWidget.User.slice = null; // this will set the slider to the middle slice in case no slice were specified
      }
      if (param.slice) { AtlasMakerWidget.User.slice = param.slice; }

      if (param.fullscreen) {
        AtlasMakerWidget.fullscreen = param.fullscreen;
      } else {
        AtlasMakerWidget.fullscreen = false;
      }

      AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index)
        .then(function (info2) {
          BrainBox.info = info2;


          // check 'edit' access
          const accessStr = BrainBox.info.mri.atlas[index].access;
          let accessLvl = BrainBox.accessLevels.indexOf(accessStr);
          if (accessLvl < 0 || accessLvl > BrainBox.accessLevels.length - 1) { accessLvl = 0; }
          if (accessLvl >= 2) { AtlasMakerWidget.editMode = 1; } else { AtlasMakerWidget.editMode = 0; }
          resolve({ success: true });


        })
        .catch((err) => {
          console.log('ERROR:', err);
          reject(err);


        });
    });

    return pr;
  }

};
