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
  info: {},

  /**
     * @function initBrainBox
     * @returns {object} A promise
     */
  initBrainBox: function initBrainBox () {
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

      window.addEventListener('unload', BrainBox.unload);
    });

    return pr;
  },

  /**
     * @function configureBrainBox
     * @param {object} param Configuration parameters
     * @returns {object} A promise
     */
  // eslint-disable-next-line max-statements
  configureBrainBox: async function configureBrainBox (param) {

    // Clear previous brain
    AtlasMakerWidget.User.mri = null;
    AtlasMakerWidget.brainImg.img = null;
    AtlasMakerWidget.flagLoadingImg.loading = true;
    AtlasMakerWidget.editMode = 0;
    AtlasMakerWidget.context.clearRect(0, 0, AtlasMakerWidget.context.canvas.width, AtlasMakerWidget.canvas.height);
    AtlasMakerWidget.sendUserDataMessage('allUserData');

    // eslint-disable-next-line max-statements
    const index = param.annotationItemIndex || 0;

    // Copy MRI from source

    // Configure MRI into atlasmaker
    if (param.info.success === false) {
      AtlasMakerWidget.appendChatMessage('ERROR: ' + param.info.message + '.');
      console.log('ERROR: ' + param.info.message + '.');
      throw (new Error(param.info.message));
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

    const info2 = await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
    BrainBox.info = info2;

    return ({ success: true });
  }
};
