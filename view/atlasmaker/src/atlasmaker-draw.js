/*global AtlasMakerWidget */
/*! AtlasMaker: Image Drawing */

/**
 * @page AtlasMaker: Image Drawing
 * @returns object
 */

export const AtlasMakerDraw = {

  /**
     * @function resizeWindow
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  resizeWindow: function () {
    const me = AtlasMakerWidget;
    const wH = me.container.clientHeight;
    const wW = me.container.clientWidth;

    const wAspect = wW / wH;
    const bAspect = me.brainW * me.brainWdim / (me.brainH * me.brainHdim);

    const resizable = document.getElementById('resizable');
    if (!resizable) {
      return;
    }

    // only need to resize if the resizable element is not fullscreen, else it auto resizes
    if (resizable.closest('.fullscreen') !== null) {
      if (wAspect > bAspect) {
        resizable.style.width = (100 * bAspect / wAspect) + '%';
        resizable.style.height = '100%';
      } else {
        resizable.style.width = '100%';
        resizable.style.height = (100 * wAspect / bAspect) + '%';
      }
    } else {
      resizable.style.width = '100%';
      resizable.style.height = '100%';
    }
  },

  /**
     * @function configureBrainImage
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  configureBrainImage: function () {
    const me = AtlasMakerWidget;
    if (me.User.view === null) { me.User.view = 'sag'; }

    const {s2v} = me.User;
    switch (me.User.view) {
    case 'sag': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[1], s2v.sdim[2], s2v.sdim[0], s2v.wpixdim[1], s2v.wpixdim[2]]; break; // sagital
    case 'cor': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[0], s2v.sdim[2], s2v.sdim[1], s2v.wpixdim[0], s2v.wpixdim[2]]; break; // coronal
    case 'axi': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[0], s2v.sdim[1], s2v.sdim[2], s2v.wpixdim[0], s2v.wpixdim[1]]; break; // axial
    }

    me.canvas.width = me.brainW;
    me.canvas.height = me.brainH * me.brainHdim / me.brainWdim;
    me.brainOffcn.width = me.brainW;
    me.brainOffcn.height = me.brainH;
    // me.brainPix = me.brainOfftx.getImageData(0, 0, me.brainOffcn.width, me.brainOffcn.height); UNUSED!!

    if (me.User.slice === null || me.User.slice >= me.brainD - 1) { me.User.slice = parseInt(me.brainD / 2, 10); }

    me.sendUserDataMessage(JSON.stringify({ 'view': me.User.view, 'slice': me.User.slice }));
    window.dispatchEvent(new CustomEvent('brainImageConfigured', { detail:
      { totalSlices: me.brainD - 1, currentSlice: me.User.slice, currentView: me.User.view, currentTool: me.User.tool }
    }));

    me.initCursor();
  },

  /**
     * @function configureAtlasImage
     * @returns {void}
     */
  configureAtlasImage: function () {
    const me = AtlasMakerWidget;
    // has to be run *after* configureBrainImage
    me.atlasOffcn.width = me.brainW;
    me.atlasOffcn.height = me.brainH;
    me.atlasPix = me.atlasOfftx.getImageData(0, 0, me.atlasOffcn.width, me.atlasOffcn.height);
  },

  /**
     * @function nearestNeighbour
     * @param {object} ctx Drawing context
     * @returns {void}
     */
  nearestNeighbour: function (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.mozImageSmoothingEnabled = false;
  },

  /**
     * @function computeSegmentedVolume
     * @returns {number} Volume in voxel units
     */
  computeSegmentedVolume: function () {
    const me = AtlasMakerWidget;
    let i;
    let sum = 0;
    const {data, dim} = me.atlas;

    for (i = 0; i < dim[0] * dim[1] * dim[2]; i++) {
      if (data[i] > 0) { sum += 1; }
    }

    return sum * me.User.pixdim[0] * me.User.pixdim[1] * me.User.pixdim[2];
  },

  /**
   * @function displayInformation
   * @desc Overlays text and vectorial information on top of the annotation volume slice. Text information is added from the AtlasMakerWidget.info object. Vectorial information is displayed using svg format
   * @returns {void}
   */
  displayInformation: function () {
    const me = AtlasMakerWidget;
    const text = me.container.querySelector('#text-layer');
    const vector = me.container.querySelector('#vector-layer');
    let txtStr;
    let svgStr;

    me.info.slice = me.User.slice;

    txtStr = '';
    for (const k in me.info) {
      if (Object.prototype.hasOwnProperty.call(me.info, k)) {
        txtStr += '<span>' + k + ': ' + me.info[k] + '</span><br/>';
      }
    }
    text.innerHTML = txtStr;

    // call registered displayInformation functions
    svgStr = '';
    for (const func of me.displayInformationFunctions) {
      svgStr = func(svgStr);
    }
    vector.innerHTML = svgStr;
  },

  /**
   * Draw the current brain image, atlas image and information overlay
   * @function drawImages
   * @returns {void}
   */
  drawImages: function () {
    const me = AtlasMakerWidget;
    if (!me.brainImg.img || me.brainImg.view !== me.User.view || me.brainImg.slice !== me.User.slice) {
      me.sendRequestSliceMessage();
    }
    if (me.brainImg.img
           && me.flagLoadingImg.view
           && me.flagLoadingImg.slice) {
      window.requestAnimationFrame(() => {
        me.context.clearRect(0, 0, me.context.canvas.width, me.canvas.height);
        me.displayInformation();

        // me.nearestNeighbour(me.context);

        me.context.drawImage(me.brainImg.img, 0, 0, me.brainW, me.brainH * me.brainHdim / me.brainWdim);
        me.drawAtlasImage(me.flagLoadingImg.view, me.flagLoadingImg.slice);
      });
    }
  },

  /**
     * @function drawAtlasImage
     * @param {string} view View string: 'sag', 'cor', or 'axi'
     * @param {number} slice The slice number
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  drawAtlasImage: function (view, slice) {
    const me = AtlasMakerWidget;
    if (!me.atlas) { return; }
    const {data} = me.atlas;
    let i, s, x, y;
    const [ys, yc, ya] = [slice, slice, slice];
    for (y = 0; y < me.brainH; y++) {
      for (x = 0; x < me.brainW; x++) {
        switch (view) {
        case 'sag': s = [ys, x, me.brainH - 1 - y]; break;
        case 'cor': s = [x, yc, me.brainH - 1 - y]; break;
        case 'axi': s = [x, me.brainH - 1 - y, ya]; break;
        }
        // eslint-disable-next-line new-cap
        i = me.S2I(s, me.User);
        const c = me.ontologyValueToColor(data[i]);
        const alpha = (data[i] > 0) ? 255 : 0;
        i = (y * me.atlasOffcn.width + x) * 4;
        if (i <= me.atlasPix.data.length - 4) {
          me.atlasPix.data.set([...c, alpha * me.alphaLevel], i);
        }
      }
    }
    me.atlasOfftx.putImageData(me.atlasPix, 0, 0);
    me.nearestNeighbour(me.context);
    me.context.drawImage(me.atlasOffcn, 0, 0, me.brainW, me.brainH * me.brainHdim / me.brainWdim);
  }
};
