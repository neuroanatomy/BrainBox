/*global AtlasMakerWidget $*/
/*! AtlasMaker: Image Drawing */

/**
 * @page AtlasMaker: Image Drawing
 * @returns object
 */

export var AtlasMakerDraw = {

  /**
     * @function resizeWindow
     * @returns {void}
     */
  resizeWindow: function () {
    const me = AtlasMakerWidget;
    const wH = me.container.height();
    const wW = me.container.width();
    const wAspect = wW/wH;
    const bAspect = me.brainW*me.brainWdim/(me.brainH*me.brainHdim);

    if(wAspect>bAspect) {
      $('#resizable').css({ width:(100*bAspect/wAspect) + '%', height:'100%' });
    } else {
      $('#resizable').css({ width:'100%', height:(100*wAspect/bAspect) + '%' });
    }
  },

  /**
     * @function configureBrainImage
     * @returns {void}
     */
  configureBrainImage: function () {
    var me = AtlasMakerWidget;
    if(me.User.view === null) { me.User.view = "sag"; }

    const {s2v} = me.User;
    switch(me.User.view) {
    case 'sag': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[1], s2v.sdim[2], s2v.sdim[0], s2v.wpixdim[1], s2v.wpixdim[2]]; break; // sagital
    case 'cor': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[0], s2v.sdim[2], s2v.sdim[1], s2v.wpixdim[0], s2v.wpixdim[2]]; break; // coronal
    case 'axi': [me.brainW, me.brainH, me.brainD, me.brainWdim, me.brainHdim] = [s2v.sdim[0], s2v.sdim[1], s2v.sdim[2], s2v.wpixdim[0], s2v.wpixdim[1]]; break; // axial
    }

    me.canvas.width = me.brainW;
    me.canvas.height = me.brainH*me.brainHdim/me.brainWdim;
    me.brainOffcn.width = me.brainW;
    me.brainOffcn.height = me.brainH;
    // me.brainPix = me.brainOfftx.getImageData(0, 0, me.brainOffcn.width, me.brainOffcn.height); UNUSED!!

    if(me.User.slice === null || me.User.slice >= me.brainD-1) { me.User.slice = parseInt(me.brainD/2); }

    me.sendUserDataMessage(JSON.stringify({ 'view':me.User.view, 'slice':me.User.slice }));

    // configure toolbar slider
    $(".slider#slice").data({ max:me.brainD-1, val:me.User.slice });

    // if($("#slice .thumb")[0]) { $("#slice .thumb")[0].style.left = (me.User.slice/(me.brainD-1)*100) + "%"; }
    $("#slice").trigger("updateDisplay");

    me.drawImages();
    me.initCursor();
  },

  /**
     * @function configureAtlasImage
     * @returns {void}
     */
  configureAtlasImage: function () {
    var me = AtlasMakerWidget;
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
    var me = AtlasMakerWidget;
    let i;
    let sum = 0;
    const {data, dim} = me.atlas;

    for(i = 0; i<dim[0]*dim[1]*dim[2]; i++) {
      if(data[i]>0) { sum++; }
    }

    return sum*me.User.pixdim[0]*me.User.pixdim[1]*me.User.pixdim[2];
  },

  /**
   * @function displayInformation
   * @desc Overlays text and vectorial information on top of the annotation volume slice. Text information is added from the AtlasMakerWidget.info object. Vectorial information is displayed using svg format
   * @returns {void}
   */
  displayInformation: function () {
    var me = AtlasMakerWidget;
    var text = me.container.find("#text-layer");
    var vector = me.container.find("#vector-layer");
    let txtStr;
    let svgStr;

    me.info.slice = me.User.slice;

    txtStr = "";
    for(const k in me.info) {
      if (Object.prototype.hasOwnProperty.call(me.info, k)) {
        txtStr += "<span>" + k + ": " + me.info[k] + "</span><br/>";
      }
    }
    text.html(txtStr);

    // call registered displayInformation functions
    svgStr = "";
    for(const func of me.displayInformationFunctions) {
      svgStr = func(svgStr);
    }
    vector.html(svgStr);
  },

  /**
   * Draw the current brain image, atlas image and information overlay
   * @function drawImages
   * @returns {void}
   */
  drawImages: function () {
    var me = AtlasMakerWidget;
    if(me.brainImg.img
           && me.flagLoadingImg.view
           && me.flagLoadingImg.slice) {
      me.context.clearRect(0, 0, me.context.canvas.width, me.canvas.height);
      me.displayInformation();

      // me.nearestNeighbour(me.context);

      me.context.drawImage(me.brainImg.img, 0, 0, me.brainW, me.brainH*me.brainHdim/me.brainWdim);
      me.drawAtlasImage(me.flagLoadingImg.view, me.flagLoadingImg.slice);
    }

    if(!me.brainImg.img || me.brainImg.view !== me.User.view || me.brainImg.slice !== me.User.slice) {
      me.sendRequestSliceMessage();
    }
  },

  /**
     * @function drawAtlasImage
     * @param {string} view View string: 'sag', 'cor', or 'axi'
     * @param {number} slice The slice number
     * @returns {void}
     */
  drawAtlasImage: function (view, slice) {
    var me = AtlasMakerWidget;
    if(!me.atlas) { return; }
    const {data} = me.atlas;
    let i, s, x, y;
    const [ys, yc, ya] = [slice, slice, slice];
    for(y = 0; y < me.brainH; y++) {
      for(x = 0; x < me.brainW; x++) {
        switch(view) {
        case 'sag': s = [ys, x, me.brainH-1-y]; break;
        case 'cor': s = [x, yc, me.brainH-1-y]; break;
        case 'axi': s = [x, me.brainH-1-y, ya]; break;
        }
        i = me.S2I(s, me.User);
        var c = me.ontologyValueToColor(data[i]);
        var alpha = (data[i]>0)?255:0;
        i = (y*me.atlasOffcn.width + x)*4;
        me.atlasPix.data[i] = c[0];
        me.atlasPix.data[i + 1] = c[1];
        me.atlasPix.data[i + 2] = c[2];
        me.atlasPix.data[i + 3] = alpha*me.alphaLevel;
      }
    }
    me.atlasOfftx.putImageData(me.atlasPix, 0, 0);
    me.nearestNeighbour(me.context);
    me.context.drawImage(me.atlasOffcn, 0, 0, me.brainW, me.brainH*me.brainHdim/me.brainWdim);
  }
};
