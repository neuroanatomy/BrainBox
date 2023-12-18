/* eslint-disable max-lines */
/*! AtlasMaker */

// import 'structjs';
import './css/atlasmaker.css';

import Config from './../../../cfg.json';
import {AtlasMakerDraw} from './atlasmaker-draw.js';
import {AtlasMakerInteraction} from './atlasmaker-interaction.js';
import {AtlasMakerIO} from './atlasmaker-io.js';
import {AtlasMakerPaint} from './atlasmaker-paint.js';
import {AtlasMakerUI} from './atlasmaker-ui.js';
import {AtlasMakerWS} from './atlasmaker-ws.js';

/**
 * AtlasMakerWidget base object
 * @namespace AtlasMakerWidget
 */
const me = {
  //========================================================================================
  // Globals
  //========================================================================================
  debug: 1, // integer, debug level. None = 0
  version: 1, // version of the configuration file (slice number, plane, etc). Default=1

  // connection
  hostname: Config.hostname, // string, host url
  wshostname: Config.wshostname, // string, websocket url
  secure: Config.secure, // wss used?

  // canvas and drawing
  container: null, // [DOM element] where atlasmaker lives
  canvas: null, // [canvas] canvas for brain and atlas mri
  context: null, // [CanvasRenderingContext2D], canvas rendering context for brain and atlas mri
  brainOffcn: null, // [canvas] offscreen canvas for brain mri
  brainOfftx: null, // [CanvasRenderingContext2D] offscreen canvas rendering context for brain mri
  // brainPix: null, // [ImageData]: pixels of the current brain image UNUSED: REMOVE!! HAD THE ROLE OF brainImg?
  brainW: null, // integer, width of the brain image (one of the dimensions of the voxel matrix)
  brainH: null, // integer, height of the brain image
  brainD: null, // integer, depth of the brain image: number of slices
  brainWdim: null, // real, width of a brain image pixel
  brainHdim: null, // real, height of a brain image pixel
  atlas: null, // object: {data, dim, name}
  atlasOffcn: null, // [canvas] offscreen canvas for atlas rendering
  atlasOfftx: null, // [CanvasRenderingContext2D], associated canvas rendering context
  atlasPix: null, // [ImageData]: pixels of the current atlas image
  brainImg: { // the image currently rendered
    img: null, // [img]
    view: null, //string, "sag", "cor", "axi"
    slice: null // integer
  },
  // brain: 0, // UNUSED: REMOVE
  alphaLevel: 0.5, // real, blending of brain and atlas image
  flagUsePreciseCursor: false, // use precise cursor?
  Crsr: { // precise cursor object
    x: null, // cursor x coord
    y: null, // cursor y coord
    fx: null, // finger x coord
    fy: null, // finger y coord
    x0: null, // previous finger x coord
    y0: null, // previous finger y coord
    cachedX: null, // finger x coord at touch start
    cachedY: null, // finger y coord at touch start
    state: 'move', // cursor state: mosve, draw, configure
    prevState: null, // state before configure
    touchStarted: false // touch started flag
  },
  editMode: 0, // editMode=0 to prevent editing, editMode=1 to accept it
  fullscreen: false, // fullscreen mode?
  useFullTools: true, // use full tools or light version?

  name: null, // string, name given to the current brain mri, ex.: "Lion"
  url: null, // string, path of the mri data and atlas in the server. Starts with /data/
  atlasFilename: null, // string, name of the current atlas file in the server, ex.: "atlas.nii.gz"
  atlasName: null, // string, name given to the current atlas, ex.: "Cerebrum"
  max: 0,
  ontology: null, // {name:"", source:"http...", labels:[{name, value, color: [r, g, b], url}], valueToIndex: []} current ontology used for segmentation

  // FIX: TRY TO KEEP ALL 3D STUFF INSIDE Users
  brainDim: new Array(3), // brainDim IS ONLY USED IN ATLASMAKER-WS.JS LINE 204
  brainPixdim: new Array(3), // brainPixdim IS USED DURING PAINTING
  // brainDatatype: null, // UNUSED: REMOVE!
  //}

  annotationLength: 0, // real, how much the user has drawn in the current atlas
  measureLength: null, // real, the result produced by the length measurement tool
  User: {
    view: null, // string, sag, axi, cor
    tool: 'show', // string, show, paint, erase, ...
    slice: null, // integer
    penSize: 1, // integer
    penValue: 1, // integer, from the ontology
    doFill: false, // boolean
    mouseIsDown: false, // boolean
    x0: -1, // real
    y0: -1, // real
    mri: null // string, name of the mri file, ex.: "brain.nii.gz"
    // atlasFilename: string, name of the current atlas voxel volume file, ex.: "atlas.nii.gz"
    // dim: array, 3 integers, dimensions of the voxels matrix
    // dirname: name of the directory containing brain and atlases in the server
    // isMRILoaded: boolean
    // measureLength: length measured with the measure tool
    // pixdim: array, 3 reals, with world-dimensions of the voxels
    // source: string, original url where the mri is located, ex.: "https://zenodo.org/brain.nii.gz"
    // specimenName: string, name given to the brain mri volume, ex.: "Lion"
    // username: string, name of the current user, ex.: "Anonymonus", "foo"
    // vectorial: layer containing vectorial informatioin
    // s2v: object, screen to volume transformation
    // v2w: matrix, 9 reals, volume to world transformation
    // wori: array, 3 reals, world origin
  },

  // real-time connection
  Collab: [], // array, other users connected at the same time
  socket: null, // [WebSocket]
  receiveFunctions: [], // array, functions receiving messages from the websocket
  sendFunctions: [], // array, functions to send messages through the websocket
  flagConnected: 0, // boolean, is the user is currently connected to the server?
  reconnectionTimeout: 5, // reconnection timeout starts at 5 seconds, used in case of websocket cuts
  flagLoadingImg: {loading: false}, // is an image is loading?
  isMRILoaded: false, // is the currently requested MRI already loaded in the server?

  clickDownTools: [], // array, functions handling clicks made by different tools: show, paint, erase, ...
  moveTools: [], // array, functions handling click or touch moves
  clickUpTools: [], // array, functions handling clicks made by different tools: show, paint, erase, ...
  longPressTools: [], // array, functions handling long clicks
  displayInformationFunctions: [], // array, functions handling data display: landmarks, length measurement
  info: {}, // information displayed over each brain slice
  msg: null, // ?
  msg0: '', // ?
  prevData: 0, // ?

  // messaging and logged info
  receivedMessages: [],
  notificationMessage: '',

  /**
   * Closes the websocket before leaving
   * @function quit
   * @return {void}
   */
  quit () {
    me.log('', 'Goodbye!');
    me.socket.close();
    me.socket = null;
  },

  /**
   * Loads script from path if test is not fulfilled
   * @function loadScript
   * @param {string} path Path to script, either a local path or a url
   * @param {function} testScriptPresent Function to test if the script is already present.
   *        If undefined, the script will be loaded.
   * @returns {object} A promise
   */
  loadScript (path, testScriptPresent) {
    const pr = new Promise((resolve, reject) => {
      if (testScriptPresent && testScriptPresent()) {
        console.log('[loadScript] Script', path, 'already present, not loading it again');

        return resolve();
      }
      const s = document.createElement('script');
      s.src = path;
      s.onload = function () {
        console.log('Loaded', path);
        resolve();
      };
      s.onerror = function (e) {
        reject(e);
      };
      document.body.appendChild(s);
    });

    return pr;
  },
  _removeVariablesFromURL (url) {
    return url.split('&')[0];
  },
  _registerToolDown (tool) {
    const {name, func} = tool;
    me.clickDownTools[name] = func;
  },
  _registerToolMove (tool) {
    const {name, func} = tool;
    me.moveTools[name] = func;
  },
  _registerToolUp (tool) {
    const {name, func} = tool;
    me.clickUpTools[name] = func;
  },
  _registerToolLongPress (tool) {
    const {name, func} = tool;
    me.longPressTools[name] = func;
  },
  _registerToolDisplayInformation (func) {
    me.displayInformationFunctions.push(func);
  },
  _registerAllToolsDown () {
    const arr = [
      {name: 'show', func: me._showToolDown},
      {name: 'paint', func: me._paintToolDown},
      {name: 'erase', func: me._eraseToolDown},
      {name: 'measure', func: me._measureToolDownHandler},
      {name: 'landmark', func: me._landmarkToolDown},
      {name: 'eyedrop', func: me._eyedropToolDown}
    ];
    for (const tool of arr) {
      me._registerToolDown(tool);
    }
  },
  _registerAllToolsMove () {
    const arr = [
      {name: 'landmark', func: me._landmarkToolMove},
      {name: 'paint', func: me._paintToolMove},
      {name: 'erase', func: me._eraseToolMove},
      {name: 'show', func: me._showToolMove}
    ];
    for (const tool of arr) {
      me._registerToolMove(tool);
    }
  },
  _registerAllToolsUp () {
    const arr = [
      {name: 'show', func: me._showToolUp},
      {name: 'eyedrop', func: me._eyedropToolUp},
      {name: 'landmark', func: me._landmarkToolUp},
      {name: 'paint', func: me._paintToolUp}, // same up function for paint and erase
      {name: 'erase', func: me._paintToolUp} // same up function for paint and erase
    ];
    for (const tool of arr) {
      me._registerToolUp(tool);
    }
  },
  _registerAllToolsLongPress () {
    const arr = [{name: 'landmark', func: me._landmarkToolLong}];
    for (const tool of arr) {
      me._registerToolLongPress(tool);
    }
  },
  _registerAllToolsDisplayInformation () {
    me._registerToolDisplayInformation(me.landmarkToolDisplayInformation);
    me._registerToolDisplayInformation(me.measureToolDisplayInformation);
  },
  _addAtlasMakerComponents () {
    Object.assign(me, AtlasMakerDraw);
    Object.assign(me, AtlasMakerInteraction);
    Object.assign(me, AtlasMakerIO);
    Object.assign(me, AtlasMakerPaint);
    Object.assign(me, AtlasMakerUI);
    Object.assign(me, AtlasMakerWS);
  },
  _createOffscreenCanvases () {
    // Create offscreen canvases for mri and atlas
    me.brainOffcn = document.createElement('canvas');
    me.brainOfftx = me.brainOffcn.getContext('2d');
    me.atlasOffcn = document.createElement('canvas');
    me.atlasOfftx = me.atlasOffcn.getContext('2d');
  },
  // eslint-disable-next-line max-statements
  _createOnscreenCanvases: function (elem) {
    // Set widget div (create one if none)
    if (typeof elem === 'undefined') {
      me.container = document.getElementById('atlasmaker');
      document.body.appendChild(me.container);
    } else {
      me.container = elem;
      if (me.debug) { console.log('Container: ', me.container); }
    }
    // Init drawing canvas
    me.container.innerHTML = '<div id="resizable"><canvas id="canvas" data-long-press-delay="500"></canvas></div>';
    me.canvas = me.container.querySelector('canvas');
    me.context = me.canvas.getContext('2d');
    const resizable = me.container.querySelector('#resizable');

    // Add a div to display the slice number
    const textLayer = document.createElement('div');
    textLayer.id = 'text-layer';
    resizable.appendChild(textLayer);

    // Add a div to display the vector layer
    const vectorLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    vectorLayer.id = 'vector-layer';
    resizable.appendChild(vectorLayer);

    // Add the cursor (a small div)
    const cursor = document.createElement('div');
    cursor.id = 'cursor';
    resizable.appendChild(cursor);

    document.body.setAttribute('data-toolbarDisplay', 'right');

    // Add precise cursor
    const isTouchArr = [];//["iPad","iPod"];
    const [, curDevice] = navigator.userAgent.split(/[(;]/);
    if (isTouchArr.includes(curDevice)) {
      me.flagUsePreciseCursor = true;
      me.initCursor();
    }

    // get pointer to progress div
    me.progress = document.querySelector('a.download_MRI');
  },

  //====================================================================================
  // Configuration
  //====================================================================================
  /**
     * Generates the GUI for AMW and connects all the different events. It
     * should be called only one, when AMW is started.
     * @function initAtlasMaker
     * @param {object} elem DOM element
     * @return {object} Returns a promise
     */
  async initAtlasMaker (elem) {
    me._addAtlasMakerComponents();
    me.identifyUser();

    me._createOffscreenCanvases();
    me._createOnscreenCanvases(elem);

    me.loadTools();

    me.setupEventListeners();

    // event connect: register click tools
    me._registerAllToolsDown();
    me._registerAllToolsMove();
    me._registerAllToolsUp();
    me._registerAllToolsLongPress();

    // register functions displaying information
    me._registerAllToolsDisplayInformation();

    try {
      await me.initSocketConnection();
    } catch (err) {
      console.error('ERROR:', err);
      throw err;
    }
  },

  async identifyUser () {
    // check if user is logged in
    const res = await (await fetch('/loggedIn')).json();
    if (res.loggedIn) {
      me.User.username = res.username;
    } else {
      me.User.username = 'Anonymous';
    }
  },

  async setupEventListeners () {
    // event connect: Configure mouse events for desktop computers
    // (touch events are configured in the initCursor function)
    me.canvas.onmousedown = me.mousedown;
    me.canvas.onmousemove = me.mousemove;
    me.canvas.onmouseup = me.mouseup;

    // event connect: Connect event to respond to window resizing
    window.addEventListener('resize', () => {
      me.resizeWindow();
      me.drawImages();
    });

    // event connect: get keyboard events
    document.addEventListener('keydown', (e) => {
      me.keyDown(e);
    });

    // long-press event
    await me.loadScript('https://cdn.jsdelivr.net/gh/john-doherty/long-press-event@2.1.0/dist/long-press-event.min.js');
    me.container.addEventListener('long-press', me.longpress);
  },

  /**
   * Requests information about an MRI from the server, potentially triggering
   * a download. The function uses polling to prevent hangouts on lengthy downloads
   * @function _requestMRIInfo
   * @param {string} source The MRI source, a URL
   * @return {object} A promise
   */
  _requestMRIInfo (source) {
    const url = me._removeVariablesFromURL(source);
    me.setLoadingMessage('Loading... ');
    const pr = new Promise(function (resolve, reject) {
      const timer = setInterval(async function () {
        console.log('polling for data...', url);

        const res = await fetch(me.hostname + '/mri/json', {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({ url })
        });
        const info = await res.json();
        if (info.success === true) {
          console.log('requestMRIInfo promise resolved');
          clearInterval(timer);
          resolve(info);
        } else if (info.success === 'downloading') {
          if (me.User.source !== url) {
            clearInterval(timer);
            reject(new Error('source changed. Probably no longer requested?'));

            return;
          }
          me.setLoadingMessage('Loading... ' + parseInt(info.cur / info.len * 100, 10) + '%');
        } else {
          console.log('ERROR: requestMRIInfo', info);
          clearInterval(timer);
          reject(new Error('requestMRIInfo' + info));
        }
      }, 2000);
    });

    return pr;
  },

  merge (source, target) {
    for (const [key, val] of Object.entries(source)) {
      if (val !== null && typeof val === 'object') {
        if (typeof target[key] === 'undefined') {
          target[key] = new val.constructor();
        }
        me.merge(val, target[key]);
      } else {
        target[key] = val;
      }
    }

    return target;
  },

  /**
   * Queries the server to obtain and configure all information
   * relative to voxel data associated with an atlas: paths to brain and
   * atlas MRIs, matrix and voxel dimensions, transformation matrices.
   * @function _configureMRI
   * @param {object} info Object with mri information
   * @param {number} index Index of the atlas to use
   * @return {object} A promise
   */
  // eslint-disable-next-line max-statements
  async _configureMRI (info, index) {
    me.User.source = info.source;
    let info2;

    if (!info.dim) {
      // the mri object used to call this function does not have a 'dim'
      // property, indicating that it had not been downloaded at the time of the
      // call. Here we merge the fields from info2 that are initialised upon
      // download of the mri server-side. The mri field in the original 'info',
      // which contains the newly created text 'annotations', is conserved
      info2 = await me._requestMRIInfo(info.source);
      info = me.merge(info, info2);
    }
    info2 = info;

    // Get data from AtlasMaker object
    me.name = info2.name || 'Untitled'; // 1
    me.url = info2.url; // 2; NII
    me.atlasFilename = info2.mri.atlas[index].filename; // 3; NII
    me.atlasName = info2.mri.atlas[index].name;

    // get local file path from url
    me.User.dirname = me.url; // REPEATED (2); NII
    me.User.mri = info2.mri.brain; // NII
    me.User.specimenName = me.name; // REPEATED (1)
    me.User.atlasFilename = info2.mri.atlas[index].filename; // REPEATED (3); NII
    me.User.isMRILoaded = false; // NII

    // @todo it's silly to have to put vol dim twice...
    // (first here, once again further down)
    me.User.dim = info2.dim; // 4; NII
    me.User.pixdim = info2.pixdim; // 5; NII

    // compute space transformations
    me.User.v2w = info2.voxel2world; // NII
    me.User.wori = info2.worldOrigin; // NII
    me.computeS2VTransformation();
    //me.testS2VTransformation();

    me.flagLoadingImg = {loading: false}; // NII

    me.brainImg.img = null; // NII

    // get volume dimensions
    me.brainDim = info2.dim; // REPEATED (4); NII
    if (info2.pixdim) {
      me.brainPixdim = info2.pixdim; // REPEATED (5); NII
    } else {
      me.brainPixdim = [1, 1, 1];
    }

    return info2;
  },

  /**
   * Uses information about an ontology to configure the labels and
   * colours that will be used for segmentation. It is called by configureAtlasMaker
   * when switching brain or atlas, but can also be called independently when
   * switching the ontology used for segmenting an atlas.
   * @param {object} json A json object with ontology information
   * @return {void}
   */
  configureOntology (json) {
    me.ontology = json;
    me.ontology.valueToIndex = [];
    me.ontology.labels.forEach(function (o, i) { me.ontology.valueToIndex[o.value] = i; });
    // to clear the region name being displayed on the info text-layer when having used eyedrop
    delete me.info.region;
  },

  /**
   * Set the brain and the atlas on which AMW is going to work.
   * It can be called several times, to change the brain or to change the atlas.
   * with an mri info object.
   * @param {object} info Object with mri information
   * @param {number} index Index of the atlas to use
   * @return {object} A promise
   */
  // eslint-disable-next-line max-statements
  configureAtlasMaker: async function (info, index) {
    // configure MRI and ontology
    const info2 = await me._configureMRI(info, index);
    info = info2;
    const res = await fetch(me.hostname + '/labels/' + info.mri.atlas[index].labels);
    const labels = await res.json();
    me.configureOntology(labels);
    me.User.penValue = me.ontology.labels[0].value;

    // inform other connected users of the changes
    console.log('====> Inform server of my settings');
    me.sendUserDataMessage('allUserData');
    me.sendUserDataMessage('sendAtlas');

    // configure vectorial layer
    // [HERE]

    // enforce fullscreen setting
    if (me.fullscreen === true) { // WARNING: HACK... would be better to implement enter/exit fullscreen
      //me.fullscreen=false;
      //me.toggleFullscreen(); // FIXME
    }

    // pick the first label for segmenting (it has to come after the
    // sendUserDataMessage calls, because it also sends ws messages)
    me.changePenColor(0);

    return info;
  }
};

export const AtlasMakerWidget = me;
