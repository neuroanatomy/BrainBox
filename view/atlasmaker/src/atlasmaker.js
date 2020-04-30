/*! AtlasMaker */

import 'structjs';
import './css/atlasmaker.css';
import './css/loading-style.css';

import {AtlasMakerDraw} from './atlasmaker-draw.js';
import {AtlasMakerIO} from './atlasmaker-io.js';
import {AtlasMakerInteraction} from './atlasmaker-interaction.js';
import {AtlasMakerPaint} from './atlasmaker-paint.js';
import {AtlasMakerUI} from './atlasmaker-ui.js';
import {AtlasMakerWS} from './atlasmaker-ws.js';
import Config from './../../../cfg.json';

import toolsFull from './html/toolsFull.html';
import toolsLight from './html/toolsLight.html';
import $ from 'jquery';

window.$ = $;

/**
 * @page AtlasMaker
 */
export var AtlasMakerWidget = {
  //========================================================================================
  // Globals
  //========================================================================================
  debug: 1,
  hostname: Config.hostname,
  wshostname: Config.wshostname,
  container: null, // Element where atlasmaker lives
  brainOffcn: null,
  brainOfftx: null,
  canvas: null,
  context: null,
  brainPix: null,
  brainW: null,
  brainH: null,
  brainD: null,
  brainWdim: null,
  brainHdim: null,
  max: 0,

  /*
        {FIX: TRY TO KEEP ALL 3D STUFF INSIDE Users
    */
  brainDim: new Array(3),
  brainPixdim: new Array(3),
  brainDatatype: null,

  /*
        }
    */
  brainImg: { img: null,
    view: null,
    slice: null
  },
  brain: 0,
  alphaLevel: 0.5,
  annotationLength:0,
  measureLength: null,
  clickTools: [],
  displayInformationFunctions: [],
  User: { view:null,
    tool:'show',
    slice:null,
    penSize:1,
    penValue:1,
    doFill:false,
    mouseIsDown:false,
    x0:-1,
    y0:-1,
    mri:{}
  },
  Collab: [],
  atlas: null,
  atlasOffcn: null,
  atlasOfftx: null,
  atlasPix: null,
  name: null,
  url: null,
  atlasFilename: null,
  socket: null,
  receiveFunctions: [],
  sendFunctions: [],
  flagConnected: 0,
  reconnectionTimeout: 5, // reconnection timeout starts at 5 seconds
  flagLoadingImg: {loading:false},
  flagUsePreciseCursor: false,
  msg: null,
  msg0: "",
  prevData: 0,
  Crsr: { x:void 0, // cursor x coord
    y:void 0, // cursor y coord
    fx:void 0, // finger x coord
    fy:void 0, // finger y coord
    x0:void 0, // previous finger x coord
    y0:void 0, // previous finger y coord
    cachedX:void 0, // finger x coord at touch start
    cachedY:void 0, // finger y coord at touch start
    state:"move", // cursor state: move, draw, configure
    prevState:void 0, // state before configure
    touchStarted:false // touch started flag
  },
  editMode: 0, // editMode=0 to prevent editing, editMode=1 to accept it
  fullscreen: false, // fullscreen mode
  info:{}, // information displayed over each brain slice
  // undo stack
  /* DEPRECATED Undo:[], */
  secure: true,
  version: 1, // version of the configuration file (slice number, plane, etc). Default=1

  /**
   * Closes the websocket before leaving
   * @return {void}
   */
  quit: function () {
    var me=AtlasMakerWidget;
    me.log("", "Goodbye!");
    me.socket.close();
    me.socket = null;
  },

  /**
     * @function loadScript
     * @desc Loads script from path if test is not fulfilled
     * @param {string} path Path to script, either a local path or a url
     * @param {function} testScriptPresent Function to test if the script is already present.
     *        If undefined, the script will be loaded.
     * @returns {object} A promise
     */
  loadScript: function (path, testScriptPresent) {
    const pr = new Promise((resolve, reject) => {
      if(testScriptPresent && testScriptPresent()) {
        console.log("[loadScript] Script", path, "already present, not loading it again");

        return resolve();
      }
      const s = document.createElement("script");
      s.src = path;
      s.onload=function () {
        console.log("Loaded", path);
        resolve();
      };
      s.onerror = function (e) {
        reject(e);
      };
      document.body.appendChild(s);
    });

    return pr;
  },

  _removeVariablesFromURL: function (url) {
    return url.split("&")[0];
  },
  _registerClickTool: function(tool) {
    const me=AtlasMakerWidget;
    const {name, func} = tool;
    me.clickTools[name] = func;
  },
  _registerClickTools: function () {
    const me = AtlasMakerWidget;
    const arr = [
      {name: 'show', func: me._showToolHandler},
      {name: 'paint', func: me._paintToolHandler},
      {name: 'erase', func: me._eraseToolHandler},
      {name: 'landmark', func: me._landmarkToolHandler},
      {name: 'measure', func: me._measureToolHandler},
      {name: 'adjust', func: me._adjustToolHandler},
      {name: 'eyedrop', func: me._eyedropToolHandler},
      {name: 'landmark', func: me._landmarkToolHandler}
    ];
    for(const tool of arr) {
      me._registerClickTool(tool);
    }
  },
  _registerDisplayInformationFunction: function (func) {
    const me = AtlasMakerWidget;
    me.displayInformationFunctions.push(func);
  },

  //====================================================================================
  // Configuration
  //====================================================================================
  /**
     * @function initAtlasMaker
     * @param {object} elem DOM element
     * @return {object} Returns a promise
     */
  initAtlasMaker: function (elem) {
    var me=AtlasMakerWidget;
    $.extend(AtlasMakerWidget, AtlasMakerDraw);
    $.extend(AtlasMakerWidget, AtlasMakerInteraction);
    $.extend(AtlasMakerWidget, AtlasMakerIO);
    $.extend(AtlasMakerWidget, AtlasMakerPaint);
    $.extend(AtlasMakerWidget, AtlasMakerUI);
    $.extend(AtlasMakerWidget, AtlasMakerWS);

    // check if user is loged in
    $.get("/loggedIn", function(res) {
      if(res.loggedIn) {
        me.User.username=res.username;
      } else {
        me.User.username='Anonymous';
      }
    });

    // Create offscreen canvases for mri and atlas
    me.brainOffcn=document.createElement('canvas');
    me.brainOfftx=me.brainOffcn.getContext('2d');
    me.atlasOffcn=document.createElement('canvas');
    me.atlasOfftx=me.atlasOffcn.getContext('2d');

    // Set widget div (create one if none)
    if(typeof elem === 'undefined') {
      me.container=$("<div class='atlasmaker'");
      $(document.body).append(me.container);
    } else {
      me.container=elem;
      if(me.debug) { console.log("Container: ", me.container); }
    }

    // Init drawing canvas
    me.container.append('<div id="resizable"><canvas id="canvas"></canvas></div>');
    me.canvas = me.container.find('canvas')[0];
    me.context = me.canvas.getContext('2d');

    // Add a div to display the slice number
    me.container.find("#resizable").append("<div id='text-layer'></div>");

    // Add a div to display the vector layer
    me.container.find("#resizable").append("<svg id='vector-layer'></svg>");

    // Add the cursor (a small div)
    me.container.find("#resizable").append("<div id='cursor'></div>");

    $('body').attr('data-toolbarDisplay', 'right');

    // Add precise cursor
    var isTouchArr = [];//["iPad","iPod"];
    var curDevice = navigator.userAgent.split(/[(;]/)[1];
    if($.inArray(curDevice, isTouchArr)>=0) {
      me.flagUsePreciseCursor=true;
      me.initCursor();
    }

    // Configure mouse events for desktop computers
    me.canvas.onmousedown = me.mousedown;
    me.canvas.onmousemove = me.mousemove;
    me.canvas.onmouseup = me.mouseup;

    // Connect event to respond to window resizing
    $(window).resize(function() {
      me.resizeWindow();
    });

    // get pointer to progress div
    me.progress=$("a.download_MRI");

    // Init the toolbar

    // configure and append tools
    let tools;
    if(typeof me.useFullTools === 'undefined') {
      me.useFullTools = true;
    }
    if(me.useFullTools) {
      tools = toolsFull;
    } else {
      tools = toolsLight;
    }
    me.container.append(tools);

    // get keyboard events
    $(document).keydown(function(e) { me.keyDown(e); });

    // configure annotation tools
    $("#tools-minimized").click(function() { me.changeToolbarDisplay("maximize"); });
    me.push($(".push#display-minimize"), function() { me.changeToolbarDisplay("minimize"); });
    me.push($(".push#display-left"), function() { me.changeToolbarDisplay("left"); });
    me.push($(".push#display-right"), function() { me.changeToolbarDisplay("right"); });
    me.slider($(".slider#slice"), function(x) { me.changeSlice(Math.round(x)); });
    me.chose($(".chose#plane"), me.changeView);
    me.chose($(".chose#paintTool"), me.changeTool);
    me.chose($(".chose#penSize"), me.changePenSize);
    me.toggle($(".toggle#precise"), me.togglePreciseCursor);
    me.toggle($(".toggle#fill"), me.toggleFill);
    me.toggle($(".toggle#fullscreen"), me.toggleFullscreen);
    me.chose3state($(".chose#text"), me.toggleTextInput);
    me.push($(".push#3drender"), me.render3D);
    me.push($(".push#link"), me.link);
    me.push($(".push#upload"), me.upload);
    me.push($(".push#download"), me.download);
    me.push($(".push#color"), me.color);
    me.push($(".push#undo"), me.sendUndoMessage);
    me.push($(".push#save"), me.sendSaveMessage);
    me.push($(".push#prev"), me.prevSlice);
    me.push($(".push#next"), me.nextSlice);

    // connect chat message input
    $("#msg").keypress((e) => { me.onkey(e); });

    $("#tools-minimized").hide();

    // load tools
    me.loadTools();

    // register click tools
    me._registerClickTools();

    // register functions displaying information
    me._registerDisplayInformationFunction(me.landmarkDisplay);

    // start websocket
    const pr = new Promise(function(resolve, reject) {
      me.initSocketConnection()
        .then( () => {
          resolve();
        })
        .catch( (err) => {
          console.error("ERROR:", err);
          reject(err);
        });
    });

    return pr;
  },

  /**
     * @function requestMRIInfo
     * @desc Request to download an MRI, with polling to prevent hangouts on lengthy
     *       downloads
     * @param {string} source The MRI source, a URL
     * @return {object} A promise
     */
  requestMRIInfo: function (source) {
    var me=AtlasMakerWidget;
    const url = me._removeVariablesFromURL(source);
    $("#loadingIndicator p").text("Loading... ");
    var pr = new Promise(function(resolve, reject) {
      var timer = setInterval( function () {
        console.log("polling for data...", url);
        $.post(me.hostname + "/mri/json", {url}, function(info) {
          if(info.success === true) {
            console.log('requestMRIInfo promise resolved');
            clearInterval(timer);
            resolve(info);
          } else if(info.success === 'downloading') {
            if(me.User.source !== url) {
              clearInterval(timer);
              reject(new Error("source changed. Probably no longer requested?"));

              return;
            }
            $("#loadingIndicator p").text("Loading... "+parseInt(info.cur/info.len*100, 10)+"%");
          } else {
            console.log("ERROR: requestMRIInfo", info);
            clearInterval(timer);
            reject(new Error("requestMRIInfo" + info));
          }
        });
      }, 2000);
    });

    return pr;
  },

  /**
   * @function configureMRI
   * @param {object} info Object with mri information
   * @param {number} index Index of the atlas to use
   * @return {object} A promise
   */
  configureMRI: async function (info, index) {
    var me=AtlasMakerWidget;

    me.User.source = info.source;
    let info2;
    try {
      info2 = await me.requestMRIInfo(info.source);
    } catch(err) {
      throw new Error(err);
    }

    if(!info.dim) {
      // the mri object used to call this function does not have a 'dim'
      // property, indicating that it had not been downloaded at the time of the
      // call. Here we merge the fields from info2 that are initialised upon
      // download of the mri server-side. The mri field in the original 'info',
      // which contains the newly created text 'annotations', is conserved
      $.extend(true, info, info2);
    }
    info2 = info;

    // Get data from AtlasMaker object
    me.name=info2.name||"Untitled";
    me.url=info2.url;
    me.atlasFilename=info2.mri.atlas[index].filename;
    me.atlasName=info2.mri.atlas[index].name;

    // get local file path from url
    me.User.dirname=me.url; // TEMPORARY
    me.User.mri=info2.mri.brain;
    me.User.specimenName=me.name;
    me.User.atlasFilename=info2.mri.atlas[index].filename;
    me.User.isMRILoaded=false;

    // @todo it's silly to have to put vol dim twice...
    // (first here, once again further down)
    me.User.dim=info2.dim;
    me.User.pixdim=info2.pixdim;

    // compute space transformations
    me.User.v2w=info2.voxel2world;
    me.User.wori=info2.worldOrigin;
    me.computeS2VTransformation();
    //me.testS2VTransformation();

    me.flagLoadingImg={loading:false};

    me.brainImg.img=null;

    // get volume dimensions
    me.brainDim = info2.dim;
    if(info2.pixdim) { me.brainPixdim=info2.pixdim; } else { me.brainPixdim=[1, 1, 1]; }

    return info2;
  },

  /**
   * @function configureOntology
   * @param {object} json A json object with ontology information
   * @return {void}
   */
  configureOntology: function (json) {
    var me=AtlasMakerWidget;
    me.ontology=json;
    me.ontology.valueToIndex=[];
    me.ontology.labels.forEach(function(o, i) { me.ontology.valueToIndex[o.value]=i; });
    // to clear the region name being displayed on the info text-layer when having used eyedrop
    delete me.info.region;
  },

  /**
   * Configure an already initialised instance of AtlasMakerWidget
   * with an mri info object.
   * @param {object} info Object with mri information
   * @param {number} index Index of the atlas to use
   * @return {object} A promise
   */
  configureAtlasMaker: async function (info, index) {
    const me=AtlasMakerWidget;
    let info2;
    let res;
    let data;

    try {
      info2 = await me.configureMRI(info, index);
      info = info2;
      res = await fetch(me.hostname + "/labels/" + info.mri.atlas[index].labels);
      data = await res.json();
    } catch (err) {
      throw new Error(err);
    }

    me.configureOntology(data);
    me.User.penValue=me.ontology.labels[0].value;

    if(me.fullscreen === true) { // WARNING: HACK... would be better to implement enter/exit fullscreen
      me.fullscreen=false;
      me.toggleFullscreen();
    }

    if(me.User.view !== null) {
      $(".chose#plane .a").removeClass("pressed");
      var view=me.User.view.charAt(0).toUpperCase()+me.User.view.slice(1);
      $(".chose#plane .a:contains('"+view+"')").addClass("pressed");
    }

    me.sendUserDataMessage("allUserData");
    me.sendUserDataMessage("sendAtlas");

    me.changePenColor( 0 );

    return info;
  }
};
