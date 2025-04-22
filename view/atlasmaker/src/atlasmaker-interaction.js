/* eslint-disable max-lines */
/* global AtlasMakerWidget */
/*! AtlasMaker: Interaction */

import pako from 'pako';

/**
 * @page AtlasMaker: Interaction
 */
export const AtlasMakerInteraction = {
  //========================================================================================
  // Load graphic tools and commands
  //========================================================================================
  _loadCommandTool: function (tool) {
    const me = AtlasMakerWidget;
    // const path = `/lib/atlasmaker-tools/${tool.name}.js`;
    // const path = `../tools/${tool.name}.js`;
    // let cmd = await import(path);
    // let cmd = await import(/* webpackIgnore: true */`/lib/atlasmaker-tools/${tool.name}.js`);
    // console.log("cmd:", tool.name, cmd, cmd());

    return me.loadScript(`/lib/atlasmaker-tools/${tool.name}.js`);
  },
  _loadTools: function (list) {
    const me = AtlasMakerWidget;
    for (const tool of list) {
      if (tool.type === 'cmd') {
        me._loadCommandTool(tool);
      }
    }
  },

  /**
     * @function loadTools
     * @description Load graphic tools and commands
     * @returns {void}
     */
  async loadTools () {
    const me = AtlasMakerWidget;
    const tools = await (await fetch('/lib/atlasmaker-tools/tools.json')).json();
    me._loadTools(tools);
  },

  //========================================================================================
  // Generic UI functionalities
  //========================================================================================

  /**
     * @function changeView
     * @param {string} theView The view plane to use.
     * @returns {void}
     */
  changeView: function (theView) {
    const me = AtlasMakerWidget;
    switch (theView) {
    case 'sag':
      me.User.view = 'sag';
      break;
    case 'cor':
      me.User.view = 'cor';
      break;
    case 'axi':
      me.User.view = 'axi';
      break;
    }
    me.sendUserDataMessage(JSON.stringify({ 'view': me.User.view }));
    me.configureBrainImage();
    me.configureAtlasImage();
    me.resizeWindow();
    me.drawImages();
    me.initCursor();
  },

  /**
     * @function changeTool
     * @desc Change the tool that defines the effect of mouse clicks
     * @param { string } theTool Name of the tool: Paint, Erase, Measure, Adjust
     * @returns {void}
     */
  changeTool: function (theTool) {
    const me = AtlasMakerWidget;
    if (theTool.toLowerCase() === me.User.tool) {
      return;
    }

    switch (theTool) {
    case 'Show':
      me.User.tool = 'show';
      break;
    case 'Paint':
      me.User.tool = 'paint';
      break;
    case 'Erase':
      me.User.tool = 'erase';
      break;
    case 'Landmark':
      me.User.tool = 'landmark';
      break;
    case 'Measure':
      me.User.tool = 'measure';
      break;
    case 'Eyedrop':
      me.User.tool = 'eyedrop';
      break;
    }
    me.sendUserDataMessage(JSON.stringify({ 'tool': me.User.tool }));
    me.User.measureLength = null;
  },

  /**
     * @function changePenSize
     * @param {number} theSize Size of the pen
     * @returns {void}
     */
  changePenSize: function (theSize) {
    const me = AtlasMakerWidget;
    me.User.penSize = parseInt(theSize, 10);
    me.sendUserDataMessage(JSON.stringify({ 'penSize': me.User.penSize }));
  },

  /**
     * @function changePenColor
     * @param {number} index Index of the color to use for the pen
     * @returns {void}
     */
  changePenColor: function (index) {
    const me = AtlasMakerWidget;
    me.User.penValue = me.ontology.labels[index].value;
    me.sendUserDataMessage(JSON.stringify({ 'penValue': me.User.penValue }));
  },

  /**
     * @function changeSlice
     * @param {number} x New slice number
     * @returns {void}
     */
  changeSlice: function (x) {
    const me = AtlasMakerWidget;
    me.User.slice = x;
    me.sendUserDataMessage(JSON.stringify({ 'slice': me.User.slice }));
    me.drawImages();
  },

  /**
     * @function toggleFill
     * @param {bool} doFill Whether to fill or not
     * @returns {void}
     */
  toggleFill: function (doFill) {
    const me = AtlasMakerWidget;
    me.User.doFill = doFill;
    me.sendUserDataMessage(JSON.stringify({ 'doFill': me.User.doFill }));
  },

  /**
     * @function ontologyValueToColor
     * @param {number} val Numerical value used for painting with the selected label
     * @returns {array} Red, green and blue colors
     */
  ontologyValueToColor: function (val) {
    const me = AtlasMakerWidget;
    let c = [0, 0, 0];
    let i;
    if (val in me.ontology.valueToIndex) { i = me.ontology.valueToIndex[val]; }
    if (typeof i !== 'undefined') {
      c = me.ontology.labels[i].color;
    } else if (val) {
      c = [255, 0, 0]; // unavailable labels are set to pure red
    }

    return c;
  },
  _voxelCoord2ScreenCoord: function (position) {
    const me = AtlasMakerWidget;
    const { view } = me.User;
    let x, y;
    let newSlice;
    const { sdim } = me.User.s2v;
    if (view === 'sag') {
      [x, y, newSlice] = [position[1], sdim[2] - 1 - position[2], position[0]];
    } else if (view === 'cor') {
      [x, y, newSlice] = [position[0], sdim[2] - 1 - position[2], position[1]];
    } else if (view === 'axi') {
      [x, y, newSlice] = [position[0], sdim[1] - 1 - position[1], position[2]];
    }

    return [x, y, newSlice];
  },

  /**
     * @function initCursor
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  initCursor: function () {
    const me = AtlasMakerWidget;
    const canvas = document.querySelector('#atlasmaker canvas');
    if (canvas === null) { return; }
    const W = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('width'));
    const H = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('height'));
    const w = parseFloat(canvas.getAttribute('width'));
    const h = parseFloat(canvas.getAttribute('height'));

    me.Crsr.x = parseInt(w / 2, 10);
    me.Crsr.y = parseInt(h / 2, 10);

    me.Crsr.fx = parseInt(w / 2, 10) * (W / w);
    me.Crsr.fy = parseInt(h / 2, 10) * (H / h);

    const cursorElement = document.querySelector('#cursor');
    if (cursorElement === null) { return; }
    cursorElement.style.top = me.Crsr.y * (H / h) + 'px';
    cursorElement.style.left = me.Crsr.x * (W / w) + 'px';
    cursorElement.style.width = me.User.penSize * (W / w);
    cursorElement.style.height = me.User.penSize * (H / h);

    me.Crsr.fx = parseInt(w / 2, 10) * (W / w);
    me.Crsr.fy = parseInt(h / 2, 10) * (H / h);

    if (me.flagUsePreciseCursor) {
      let finger = document.getElementById('finger');
      if (!finger) {
        finger = document.createElement('div');
        finger.id = 'finger';
        finger.className = 'touchDevice';
        me.container.appendChild(finger);

        // configure touch events for tablets
        finger.ontouchstart = me.touchstart;
        finger.ontouchend = me.touchend;
        finger.ontouchmove = me.touchmove;

        // turn off eventual touch events handled by canvas
        me.canvas.ontouchstart = null;
        me.canvas.ontouchmove = null;
        me.canvas.ontouchend = null;
      }
      me.updateCursor();

      finger.style.left = me.Crsr.fx + 'px';
      finger.style.top = me.Crsr.fy + 'px';
    } else {
      // remove precise cursor
      const finger = document.getElementById('finger');
      if (finger) {
        finger.parentNode.removeChild(finger);
      }

      // configure touch events for tablets
      me.canvas.ontouchstart = me.touchstart;
      me.canvas.ontouchmove = me.touchmove;
      me.canvas.ontouchend = me.touchend;
    }
  },

  /**
     * @function updateCursor
     * @returns {void}
     */
  updateCursor: function () {
    const me = AtlasMakerWidget;
    const finger = document.getElementById('finger');
    if (finger) {
      ['move', 'draw', 'configure'].forEach((className) => finger.classList.remove(className));
    }
    switch (me.Crsr.state) {
    case 'move': finger.classList.add('move'); break;
    case 'draw': finger.classList.add('draw'); break;
    case 'configure': finger.classList.add('configure'); break;
    }
  },
  _eventCoords2ImageCoords: function (ex, ey) {
    const canvas = document.querySelector('#atlasmaker canvas');
    const W = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('width'));
    const H = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('height'));
    const w = parseFloat(canvas.getAttribute('width'));
    const h = parseFloat(canvas.getAttribute('height'));
    const rect = canvas.getBoundingClientRect();
    const offset = {
      left: rect.left + (document.documentElement.scrollLeft || document.body.scrollLeft),
      top: rect.top + (document.documentElement.scrollTop || document.body.scrollTop)
    };
    const wratio = w / W;
    const hratio = h / H;
    const x = parseInt((ex - offset.left) * wratio, 10);
    const y = parseInt((ey - offset.top) * hratio, 10);

    return { x, y, wratio, hratio };
  },

  // ====================================
  //   Mouse, touch and keyboard events
  // ====================================
  /**
     * @function mousedown
     * @param {object} e Event object
     * @returns {void}
     */
  mousedown: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();
    const { x, y } = me._eventCoords2ImageCoords(e.pageX, e.pageY);
    // compensation for rectangular pixels: f(brainWdim, brainHdim)
    me.down(x, Math.round(y * me.brainWdim / me.brainHdim));
  },

  /**
     * @function mousemove
     * @desc Handles a mouse move event. The x and y slice screens are computed from the pageX and pageY screen coordinates and dispatched to the generic move handler. The position and size of the cursor are adjusted.
     * @param {object} e Event object
     * @returns {void}
     */
  mousemove: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();
    const { x, y, wratio, hratio } = me._eventCoords2ImageCoords(e.pageX, e.pageY);

    const cursor = document.querySelector('#cursor');
    cursor.style.left = (x / wratio) + 'px';
    cursor.style.top = (y / hratio) + 'px';
    cursor.style.width = me.User.penSize / wratio + 'px';
    cursor.style.height = me.User.penSize / hratio + 'px';

    // compensation for rectangular pixels: f(brainWdim, brainHdim)
    me.move(x, Math.round(y * me.brainWdim / me.brainHdim));
  },

  /**
     * @function mouseup
     * @param {object} e Event object
     * @returns {void}
     */
  mouseup: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();
    const { x, y } = me._eventCoords2ImageCoords(e.pageX, e.pageY);
    // compensation for rectangular pixels: f(brainWdim, brainHdim)
    me.up(x, Math.round(y * me.brainWdim / me.brainHdim));
  },

  longpress: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();
    const { tool } = me.User;
    const { pageXOffset, pageYOffset } = window;
    const { x, y } = me._eventCoords2ImageCoords(
      e.detail.clientX + pageXOffset,
      e.detail.clientY + pageYOffset
    );

    if ({}.hasOwnProperty.call(me.longPressTools, tool)) {
      me.longPressTools[tool](x, y);
    }
  },

  /**
     * @function touchstart
     * @param {object} e Event object
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  touchstart: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();

    let touchEvent;
    if (e.originalEvent) {
      [touchEvent] = Array.from(e.originalEvent);
    } else {
      [touchEvent] = Array.from(e.changedTouches);
    }
    // var x = parseInt((touchEvent.pageX-o.left)*(w/W));
    // var y = parseInt((touchEvent.pageY-o.top)*(h/H));
    const { x, y } = me._eventCoords2ImageCoords(touchEvent.pageX, touchEvent.pageY);

    if (me.flagUsePreciseCursor) {
      // Precision cursor
      me.Crsr.x0 = x;
      me.Crsr.cachedX = x;
      me.Crsr.y0 = y;
      me.Crsr.cachedY = y;

      const finger = document.getElementById('finger');
      const rect = finger.getBoundingClientRect();
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;
      me.Crsr.fx = rect.left + scrollLeft;
      me.Crsr.fy = rect.top + scrollTop;
      me.Crsr.touchStarted = true;
      setTimeout(function () {
        if (me.Crsr.cachedX === me.Crsr.x0 && me.Crsr.cachedY === me.Crsr.y0 && !me.Crsr.touchStarted) {
          // short tap: change mode
          me.Crsr.state = (me.Crsr.state === 'move') ? 'draw' : 'move';
          me.updateCursor();
        }
      }, 200);
      setTimeout(function () {
        if (me.Crsr.cachedX === me.Crsr.x0 && me.Crsr.cachedY === me.Crsr.y0 && me.Crsr.touchStarted) {
          // long tap: change to configure mode
          me.Crsr.prevState = me.Crsr.state;
          me.Crsr.state = 'configure';
          me.updateCursor();
        }
      }, 1000);
      me.down(me.Crsr.x, Math.round(me.Crsr.y * me.brainWdim / me.brainHdim));
    } else { me.down(x, Math.round(y * me.brainWdim / me.brainHdim)); }
  },

  /**
     * @function touchmove
     * @param {object} e Event object
     * @returns {void}
     */
  // eslint-disable-next-line max-statements
  touchmove: function (e) {
    const me = AtlasMakerWidget;
    if (me.Crsr.touchStarted === false && me.debug) {
      console.log('WARNING: touch can move without having started');
    }
    e.preventDefault();

    let touchEvent;
    if (e.originalEvent) {
      [touchEvent] = Array.from(e.originalEvent.changedTouches);
    } else {
      [touchEvent] = Array.from(e.changedTouches);
    }
    // var x = parseInt((touchEvent.pageX-o.left)*(w/W));
    // var y = parseInt((touchEvent.pageY-o.top)*(h/H));
    const { x, y, wratio, hratio } = me._eventCoords2ImageCoords(touchEvent.pageX, touchEvent.pageY);

    if (me.flagUsePreciseCursor) {
      // Precision cursor
      const dx = x - me.Crsr.x0;
      const dy = y - me.Crsr.y0;
      if (me.Crsr.state === 'move' || me.Crsr.state === 'draw') {
        me.Crsr.x += dx;
        me.Crsr.y += dy;

        const cursor = document.querySelector('#cursor');
        cursor.style.left = me.Crsr.x / wratio + 'px';
        cursor.style.top = me.Crsr.y / hratio + 'px';
        cursor.style.width = me.User.penSize / wratio + 'px';
        cursor.style.height = me.User.penSize / hratio + 'px';

        if (me.Crsr.state === 'draw') { me.move(me.Crsr.x, Math.round(me.Crsr.y * me.brainWdim / me.brainHdim)); }
      }

      me.Crsr.fx += dx / wratio;
      me.Crsr.fy += dy / hratio;
      const finger = document.querySelector('#finger');
      const scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
      const scrollLeft = document.documentElement.scrollLeft || document.body.scrollLeft;

      if (finger) {
        finger.style.left = (me.Crsr.fx + scrollLeft) + 'px';
        finger.style.top = (me.Crsr.fy + scrollTop) + 'px';
      }

      me.Crsr.x0 = x;
      me.Crsr.y0 = y;
    } else {

      const cursor = document.querySelector('#cursor');
      cursor.style.left = (x / wratio) + 'px';
      cursor.style.top = (y / hratio) + 'px';
      cursor.style.width = me.User.penSize / wratio + 'px';
      cursor.style.height = me.User.penSize / hratio + 'px';
      me.move(x, Math.round(y * me.brainWdim / me.brainHdim));
    }
  },

  /**
     * @function touchend
     * @param {object} e Event object
     * @returns {void}
     */
  touchend: function (e) {
    const me = AtlasMakerWidget;
    e.preventDefault();
    let touchEvent;
    if (e.originalEvent) {
      [touchEvent] = Array.from(e.originalEvent);
    } else {
      [touchEvent] = Array.from(e.changedTouches);
    }
    const { x, y } = me._eventCoords2ImageCoords(touchEvent.pageX, touchEvent.pageY);

    if (me.flagUsePreciseCursor) {
      // Precision cursor
      me.Crsr.touchStarted = false;
      if (me.Crsr.state === 'configure') {
        me.Crsr.state = me.Crsr.prevState;
        me.updateCursor();
      }
    }
    me.up(x, y);
  },

  /**
   * @function down
   * @desc Generic pointer down event: Deals with down events generated by mouse clicks or touch events. The effect of the down event is determined by the current User.tool
   * @param { integer } x X coordinate in slice space
   * @param { integer } y Y coordinate in slice space
   * @returns {void}
   */
  down: function (x, y) {
    const me = AtlasMakerWidget;
    const { tool } = me.User;
    if ({}.hasOwnProperty.call(me.clickDownTools, tool)) {
      me.clickDownTools[tool](x, y);
    }

    // init annotation length counter
    me.annotationLength = 0;
  },

  /**
   * @function move
   * @desc Generic pointer move event: Deals with move events generated by mouse clicks or touch events. The effect of the move event is determined by the current User.tool
   * @param {number} x X coordinate in slice space
   * @param {number} y Y coordinate in slice space
   * @returns {void}
   */
  move: function (x, y) {
    const me = AtlasMakerWidget;
    if (!me.User.mouseIsDown) { return; }
    const { tool } = me.User;
    if ({}.hasOwnProperty.call(me.moveTools, tool)) {
      me.moveTools[tool](x, y);
    }
  },

  /**
   * @function up
   * @desc Generic pointer up event: Deals with up events generated by mouse clicks or touch events.
   * @param {number} x Coordinate
   * @param {number} y Coordinate
   * @returns {void}
   */
  up: function (x, y) {
    const me = AtlasMakerWidget;

    const { tool } = me.User;
    if ({}.hasOwnProperty.call(me.clickUpTools, tool)) {
      me.clickUpTools[tool](x, y);
    }

    // Send mouse/touch ended message
    me.User.mouseIsDown = false;
    me.User.x0 = -1;
    me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown': false }));

    // const msg = { "c": "mu" };
    // me.sendPaintMessage(msg)
    // TEST
    // me.sendRequestSliceMessage();
  },

  /**
   * @function keyDown
   * @param {object} e Event object
   * @returns {void}
   */
  // eslint-disable-next-line max-statements
  keyDown: function (e) {
    const me = AtlasMakerWidget;
    // console.log("key:", e.which);

    if (e.which === 13 && e.target.getAttribute('contenteditable')) {
      e.preventDefault();

      return;
    }

    if (e.target.tagName !== 'BODY') { return; }

    switch (e.which) {
    case 13: // return
      if (me.User.measureLength) {
        let length = 0;
        const p = me.User.measureLength;
        const wdim = me.brainWdim;
        const hdim = me.brainHdim;
        let i;
        for (i = 1; i < p.length; i++) { length += Math.sqrt((wdim * (p[i].x - p[i - 1].x)) ** 2 + (hdim * (p[i].y - p[i - 1].y)) ** 2); }
        me.appendChatMessage('Length: ' + length);
        me.User.measureLength = null;
        me.displayInformation();
      }
      break;
    }
  },

  /**
   * @function onkey
   * @param {object} e Event object
   * @returns {void}
   */
  onkey: function (e) {
    const me = AtlasMakerWidget;
    if (e.keyCode === 13) {
      me.sendChatMessage();
    }
  },

  // ==============
  //      Tools
  // ==============
  /**
   * @function render3D
   * @returns {void}
   */
  render3D: function () {
    const me = AtlasMakerWidget;
    // puts a fresh version of the segmentation in localStorage
    localStorage.brainbox = URL.createObjectURL(new Blob([me.encodeNifti()]));

    const newWindow = window.open('', 'Render 3D', 'width=800,height=600');

    /*
    const webxr = `
      <html>
      <head>
      <script src="https://aframe.io/releases/1.0.4/aframe.min.js"></script>
      <script src="http://localhost/libs/three.js/r111/examples/js/loaders/PLYLoader.js"></script>
      </head>
      <body>
        <a-scene>
          <a-sky color="#ECECEC"></a-sky>
        </a-scene>
        <script>const path = "${me.User.dirname}${me.User.atlasFilename}";</script>
        <script src="/lib/atlasmaker-tools/render3D.js"></script>
        </body>
      </html>`;
    */
    newWindow.document.write(`
        <html>
        <body>
          <script>const path = "${me.User.dirname}${me.User.atlasFilename}";</script>
          <script src="/lib/atlasmaker-tools/render3D.js"></script>
        </body>
        </html>`
    );
    newWindow.document.close();
  },

  /**
     * @function link
     * @returns {void}
     */
  link: function () {
    // eslint-disable-next-line no-alert
    window.prompt('Copy to clipboard:', location.href + '&view = ' + AtlasMakerWidget.User.view + '&slice = ' + AtlasMakerWidget.User.slice);
  },

  /**
     * @function upload
     * @returns {void}
     */
  upload: function () {
    const me = AtlasMakerWidget;
    const input = document.createElement('input');
    input.style.display = 'none';
    document.body.appendChild(input);
    input.type = 'file';
    input.onchange = function () {
      const [name] = this.files;
      const reader = new FileReader();
      // eslint-disable-next-line max-statements
      reader.onload = function (e) {
        const { result } = e.target;
        let nii;
        if (name.name.split('.').pop() === 'gz') {
          const inflate = new pako.Inflate();
          inflate.push(new Uint8Array(result), true);
          nii = inflate.result.buffer;
        } else { nii = result; }
        const mri = me.loadNifti(nii);

        if (mri.dim[0] !== me.User.dim[0] ||
          mri.dim[1] !== me.User.dim[1] ||
          mri.dim[2] !== me.User.dim[2]) {
          console.log('ERROR: Volume dimensions do not match');

          return;
        }

        // copy uploaded data to atlas data
        let i;
        for (i = 0; i < me.atlas.data.length; i++) { me.atlas.data[i] = mri.data[i]; }

        // send uploaded data to server (compressed)
        me.sendAtlasDataMessage(mri.data);

        // redraw images
        me.drawImages();
      };
      reader.readAsArrayBuffer(name);
      document.body.removeChild(input);
    };
    input.click();
  },

  /**
     * @function download
     * @returns {void}
     */
  download: function () {
    const me = AtlasMakerWidget;
    const a = document.createElement('a');
    const niigz = me.encodeNifti();
    const niigzBlob = new Blob([niigz]);
    a.href = window.URL.createObjectURL(niigzBlob);
    a.download = me.atlasName + '.nii.gz';
    document.body.appendChild(a);
    a.click();
  },

  /**
     * @function togglePreciseCursor
     * @returns {void}
     */
  togglePreciseCursor: function () {
    const me = AtlasMakerWidget;
    me.flagUsePreciseCursor = !me.flagUsePreciseCursor;
    me.initCursor();
  },

  _showToolDown: function (x, y) {
    const me = AtlasMakerWidget;
    me.User.mouseIsDown = true;
    me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown': true }));
    me.showxy(-1, 'm', x, y, me.User);
  },
  _showToolMove: function (x, y) {
    const me = AtlasMakerWidget;
    me.showxy(-1, 'm', x, y, me.User);
  },
  _showToolUp: function () {
    const me = AtlasMakerWidget;
    const msg = { 'c': 'u' };
    me.sendShowMessage(msg);
  },

  _paintToolDown: function (x, y) {
    const me = AtlasMakerWidget;
    if (me.editMode === 0) {
      // check for 'edit' access
      return;
    }
    if (me.User.doFill) {
      // fill
      me.paintxy(-1, 'f', x, y, me.User);
    } else {
      //paint
      me.User.mouseIsDown = true;
      me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown': true }));
      me.paintxy(-1, 'mf', x, y, me.User);
    }
  },
  _paintToolMove: function (x, y) {
    const me = AtlasMakerWidget;
    me.paintxy(-1, 'lf', x, y, me.User);
  },
  _paintToolUp: function () {
    const me = AtlasMakerWidget;
    const msg = { c: 'mu' };
    me.sendPaintMessage(msg);

    // add annotated length to User.annotation length and post to DB
    me.logToDatabase('annotationLength', {
      source: me.User.source,
      atlas: me.User.atlasFilename,
      length: me.annotationLength
    })
      .then(function (response) {
        const length = parseInt(response.length, 10);
        me.info.length = length + ' mm';
        me.displayInformation();
      });

    me.annotationLength = 0;

    // compute total segmented volume
    console.log(me);
    const vol = me.computeSegmentedVolume();
    me.info.volume = parseInt(vol, 10) + ' mm3';
  },

  _eraseToolDown: function (x, y) {
    const me = AtlasMakerWidget;
    if (me.editMode === 0) {
      // check for 'edit' access
      return;
    }
    if (me.User.doFill) {
      // fill
      me.paintxy(-1, 'e', x, y, me.User);
    } else {
      // erase
      me.User.mouseIsDown = true;
      me.sendUserDataMessage(JSON.stringify({ 'mouseIsDown': true }));
      me.paintxy(-1, 'me', x, y, me.User);
    }
  },
  _eraseToolMove: function (x, y) {
    const me = AtlasMakerWidget;
    me.paintxy(-1, 'le', x, y, me.User);
  },

  /**
   * @function eyedrop
   * @param {number} x X or horizontal coordinate
   * @param {number} y Y or vertical coordinate
   * @param {object} usr User structure for the current user
   * @returns {number} The value at the given location
   */
  _eyedropToolDown: function (x, y) {
    const me = AtlasMakerWidget;
    const value = me.eyedrop(x, y, me.User);
    if (value) {
      const index = me.ontology.valueToIndex[value];
      const selRegionName = me.ontology.labels[index].name;
      me.info.region = selRegionName;
      me.changePenColor(index);
    }
  },
  _eyedropToolUp: function () {
    const me = AtlasMakerWidget;
    me.displayInformation();

    const msg = { 'c': 'mu' };
    me.sendPaintMessage(msg);
  },
  eyedrop: function (x, y, usr) {
    const me = AtlasMakerWidget;
    const z = usr.slice;
    const i = me.slice2index(x, y, z, usr.view);

    return me.atlas.data[i];
  },

  // Landmark tool
  _landmarkToolDown: function (x, y) {
    const me = AtlasMakerWidget;
    me.User.mouseIsDown = true;
    for (let i = 0; i < me.User.vectorial.length; i++) {
      const ann = me.User.vectorial[i];
      if (ann.type !== 'text') {
        continue;
      }
      const [sx, sy, sz] = me._voxelCoord2ScreenCoord(ann.position);
      if (me.User.slice === sz && (x - sx) ** 2 + (y - sy) ** 2 < 2 ** 2) {
        me.User.x0 = x;
        me.User.y0 = y;
        me.User.indexOfMovingLandmark = i;

        return;
      }
    }
  },
  _landmarkToolMove: function (x, y) {
    const me = AtlasMakerWidget;
    const index = me.User.indexOfMovingLandmark;
    if (typeof index === 'undefined') {
      return;
    }
    const position = me.slice2xyzi(x, y, me.User.slice, me.User.view);
    me.User.vectorial[index].position = position;
    me.displayInformation();
  },
  _landmarkToolLong: function () {
    const me = AtlasMakerWidget;
    me.User.mouseIsDown = false;
    me.landmarkClick();
  },
  _landmarkToolUp: function (x, y) {
    const me = AtlasMakerWidget;
    const type = 'text';
    const position = me.slice2xyzi(x, y, me.User.slice, me.User.view);
    if (typeof me.User.vectorial === 'undefined') {
      me.User.vectorial = [];
    }
    if (me.User.mouseIsDown && typeof me.User.indexOfMovingLandmark === 'undefined') {
      // eslint-disable-next-line no-alert
      const text = prompt('Landmark label');
      if (text === null) {
        return;
      }
      me.User.vectorial.push({ type, position, text });
      me.sendVectorialAnnotationMessage(me.User.vectorial);
      me.displayInformation();
    }
    delete me.User.indexOfMovingLandmark;
  },
  landmarkClick: function () {
    const me = AtlasMakerWidget;
    if (typeof me.User.vectorial === 'undefined') {
      me.User.vectorial = [];
    }
    const vectorial = JSON.parse(JSON.stringify(me.User.vectorial));
    const dialog = document.querySelector('#landmarksDialog');

    const displayTable = () => {
      const html = [];
      for (let i = 0; i < vectorial.length; i++) {
        const ann = vectorial[i];
        if (ann.type !== 'text') { continue; }
        const worldCoords = me.mulMatVec(me.User.v2w, ann.position).map((v) => parseInt(v * 10, 10) / 10.0);
        html.push(`
          <tr data-row=${i}>
            <td contentEditable class="noEmptyWithPlaceholder" placeholder="Enter landmark label"
            >${ann.text}</td>
            <td contentEditable class="noEmpty"
            >${ann.position.slice(0, 3).join(', ')}</td>
            <td contentEditable class="noEmpty"
            >${worldCoords.join(', ')}</td>
          </tr>`);
      }
      dialog.querySelector('tbody').innerHTML = html.join('\n');
      dialog.querySelector('tbody tr').classList.add('selected');
      dialog.style.display = 'inline-block';
    };
    const exit = () => {
      // eslint-disable-next-line no-use-before-define
      for (const l of listeners) {
        dialog.querySelector(l.sel).removeEventListener('click', l.func);
        dialog.style.display = 'none';
      }
    };
    const listeners = [
      {
        sel: '#landmarksDialogOk',
        func: () => {
          me.User.vectorial = vectorial;
          me.sendVectorialAnnotationMessage(me.User.vectorial);
          me.displayInformation();
          exit();
        }
      },
      { sel: '#landmarksDialogCancel', func: exit },
      // { sel: "#importLandmarks", func: () => { console.log("import"); }},
      {
        sel: '#exportLandmarks',
        func: () => {
          const csv = [
            'Label, i, j, k, x, y, z',
            ...vectorial.filter((ann) => ann.type === 'text').map((ann) => {
              const worldCoords = me.mulMatVec(me.User.v2w, ann.position).map((v) => parseInt(v * 10, 10) / 10.0);

              return `${ann.text}, ${ann.position.slice(0, 3)}, ${worldCoords}`;
            })
          ].join('\n');
          const csvData = 'data:text/ascii;charset=utf-8,' + encodeURIComponent(csv);
          const a = document.createElement('a');
          a.href = csvData;
          a.download = 'landmarks.csv';
          document.body.appendChild(a);
          a.click();
        }
      },
      // {sel: "#addLandmark",func: () => {vectorial.push({type, text: "", position: [0, 0, 0]}); displayTable();}},
      {
        sel: '#removeLandmark',
        func: () => {
          const i = dialog.querySelector('tr.selected').dataset.row;
          vectorial.splice(i, 1);
          displayTable();
        }
      },
      {
        sel: 'tbody',
        ev: 'click',
        func: (ev) => {
          const tr = ev.target.closest('tr');
          for (const row of tr.closest('tbody').rows) {
            row.classList.remove('selected');
          }
          tr.classList.add('selected');
        }
      }
    ];
    for (const l of listeners) {
      dialog.querySelector(l.sel).addEventListener('click', l.func);
    }
    displayTable();
  },
  // eslint-disable-next-line max-statements
  landmarkToolDisplayInformation: function (svgStr) {
    const me = AtlasMakerWidget;
    if (!me.brainW) {
      return '';
    }
    const { slice } = me.User;
    const canvas = document.querySelector('#atlasmaker canvas');
    const W = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('width'));
    const w = me.brainW;
    const zx = W / w;
    const zy = zx * me.brainHdim / me.brainWdim;
    if (typeof me.User.vectorial !== 'undefined') {
      for (const a of me.User.vectorial.filter((o) => o.type === 'text')) {
        const { text, position } = a;
        const [x, y, z] = me._voxelCoord2ScreenCoord(position);
        const onSlice = (z === slice);
        if (onSlice) {
          svgStr +=
            `
<g transform='translate(${zx * x},${zy * y}) scale(0.85)'>
<path class='landmark' fill='#ffffff' stroke='#00000080' d="m 0,0 c 0,0 6,-6 9,-11 3,-5 0,-15 -9,-15 -9,0 -12,10 -9,15 3,5 9,11 9,11 z"></path>
<text fill='white' x=10 y='-10'>${text}</text>
</g>
`;
          //   <circle class='landmark' fill='#00ff00' cx=${zx*x} cy=${zy*y} r=3 />
        }
      }
    }

    return svgStr;
  },

  // Measure tool
  _measureToolDownHandler: function (x, y) {
    const me = AtlasMakerWidget;
    if (me.User.measureLength === null) {
      me.User.measureLength = [{ x: x, y: y }];
    } else {
      me.User.measureLength.push({ x: x, y: y });
    }
    me.displayInformation();
  },
  measureToolDisplayInformation: function (svgStr) {
    const me = AtlasMakerWidget;
    if (me.User.measureLength) {
      const canvas = document.querySelector('#atlasmaker canvas');
      const W = parseFloat(window.getComputedStyle(canvas, null).getPropertyValue('width'));
      const w = parseFloat(canvas.getAttribute('width'));
      const zx = W / w;
      const zy = zx * me.brainHdim / me.brainWdim;
      const p = me.User.measureLength;
      let str1 = 'M' + zx * p[0].x + ', ' + zy * p[0].y;
      let i;
      for (i = 1; i < p.length; i++) {
        str1 += 'L' + zx * p[i].x + ', ' + zy * p[i].y;
      }
      svgStr += [
        '<circle fill=\'#00ff00\' cx=' + zx * p[0].x + ' cy=' + zy * p[0].y + ' r=3 />',
        '<path stroke=\'#00ff00\' fill=\'none\' d=\'' + str1 + '\'/>',
        (i > 0) ? '<circle fill=\'#00ff00\' cx=' + zx * p[i - 1].x + ' cy=' + zy * p[i - 1].y + ' r=3 />' : ''
      ].join('\n');
    }

    return svgStr;
  },

  appendChatMessage: function (msg) {
    const me = AtlasMakerWidget;
    me.receivedMessages.push(msg);
    window.dispatchEvent(new CustomEvent('newMessage', { detail: { message: msg } }));
  },

  setNotification: function (msg) {
    const me = AtlasMakerWidget;
    me.notificationMessage = msg;
    window.dispatchEvent(new CustomEvent('newNotification', { detail: { notification: msg } }));
  },

  setLoadingMessage (msg) {
    window.dispatchEvent(new CustomEvent('newLoadingMessage', { detail: { message: msg } }));
  },

  sendFinishedLoadingEvent () {
    window.dispatchEvent(new Event('finishedLoading'));
  }

};
