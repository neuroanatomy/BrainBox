/*! AtlasMaker */
import $ from 'jquery'
import '../../downloads/struct.js';

import {AtlasMakerDraw} from './atlasMaker-draw.js';
import {AtlasMakerInteraction} from './atlasMaker-interaction.js';
import {AtlasMakerIO} from './atlasMaker-io.js';
import {AtlasMakerPaint} from './atlasMaker-paint.js';
import {AtlasMakerUI} from './atlasMaker-ui.js';
import {AtlasMakerWS} from './atlasMaker-ws.js';

import {AtlasMakerResources} from '../../dist/atlasMaker-resources.js';

/**
 * @page AtlasMaker
 */
export var AtlasMakerWidget = {
    //========================================================================================
    // Globals
    //========================================================================================
    debug:            1,
    hostname: 'http://localhost:3001', // '', // 'http://brainbox.pasteur.fr',
    wshostname: 'ws://localhost:8080', // 'ws://brainbox.pasteur.fr:8080',
    container:        null,    // Element where atlasMaker lives
    brain_offcn:    null,
    brain_offtx:    null,
    canvas:            null,
    context:        null,
    brain_px:        null,
    brain_W:        null,
    brain_H:        null,
    brain_D:        null,
    brain_Wdim:        null,
    brain_Hdim:        null,
    max:            0,
    /*
        {FIX: TRY TO KEEP ALL 3D STUFF INSIDE Users
    */
    brain_dim:        new Array(3),
    brain_pixdim:    new Array(3),
    brain_datatype:    null,
    /*
        }
    */
    brain_img:      {     img: null,
                         view: null,
                        slice: null
                    },
    brain:            0,
    alphaLevel:        0.5,
    annotationLength:0,
    measureLength:    null,
    User:            {  view:null,
                       tool:'show',
                      slice:null,
                    penSize:1,
                   penValue:1,
                     doFill:false,
                mouseIsDown:false,
                         x0:-1,
                         y0:-1,
                        mri:new Object()
            },
    Collab:                 [],
    atlas:                 null,
    atlas_offcn:         null,
    atlas_offtx:         null,    
    atlas_px:             null,
    name:                 null,
    url:                 null,
    atlasFilename:         null,
    socket:                 null,
    receiveFunctions:    [],
    sendFunctions:       [],
    flagConnected:         0,
    reconnectionTimeout: 5, // reconnection timeout starts at 5 seconds
    flagLoadingImg:      {loading:false},
    flagUsePreciseCursor: false,
    msg:                 null,
    msg0:                 "",
    prevData:             0,
    Crsr:            { x:undefined,            // cursor x coord
                       y:undefined,            // cursor y coord
                       fx:undefined,        // finger x coord
                       fy:undefined,        // finger y coord
                       x0:undefined,        // previous finger x coord
                       y0:undefined,        // previous finger y coord
                       cachedX:undefined,    // finger x coord at touch start
                       cachedY:undefined,    // finger y coord at touch start
                       state:"move",        // cursor state: move, draw, configure
                       prevState:undefined,    // state before configure
                       touchStarted:false    // touch started flag
                    },
    editMode:        0,    // editMode=0 to prevent editing, editMode=1 to accept it
    fullscreen:        false,    // fullscreen mode
    info:{},    // information displayed over each brain slice
    // undo stack
    /* DEPRECATED Undo:[], */
    version:    1, // version of the configuration file (slice number, plane, etc). Default=1

    /**
     * @function quit
     */
    quit: function quit() {
        var me=AtlasMakerWidget;
        me.log("","Goodbye!");
        me.socket.close();
        me.socket = null;
    },

    //====================================================================================
    // Configuration
    //====================================================================================
    /**
     * @function initAtlasMaker
     */
    initAtlasMaker: function initAtlasMaker(elem) {
        var me=AtlasMakerWidget;
        $.extend(AtlasMakerWidget,AtlasMakerDraw);
        $.extend(AtlasMakerWidget,AtlasMakerInteraction);
        $.extend(AtlasMakerWidget,AtlasMakerIO);
        $.extend(AtlasMakerWidget,AtlasMakerPaint);
        $.extend(AtlasMakerWidget,AtlasMakerUI);
        $.extend(AtlasMakerWidget,AtlasMakerWS);
        $.extend(AtlasMakerWidget,AtlasMakerResources);

        // Add css
        var css;
        for(css in me.css) {
            let node = document.createElement('style');
            node.innerHTML = me.css[css];
            document.body.appendChild(node);
        }

        // check if user is loged in
        $.get("/loggedIn",function(res) {
            console.log(res);
            if(res.loggedIn)
                me.User.username=res.username
            else
                me.User.username='Anonymous';
        });

        // Create offscreen canvas for mri and atlas
        me.brain_offcn=document.createElement('canvas');
        me.brain_offtx=me.brain_offcn.getContext('2d');
        me.atlas_offcn=document.createElement('canvas');
        me.atlas_offtx=me.atlas_offcn.getContext('2d');

        // Set widget div (create one if none)
        if(elem==undefined) {
            me.container=$("<div class='atlasMaker'");
            $(document.body).append(me.container);
        }
        else {
            me.container=elem;
            if(me.debug) console.log("Container: ",me.container);
        }
        
        // Init drawing canvas
        me.container.append('<div id="resizable"><canvas id="canvas"></canvas></div>');
        me.canvas = me.container.find('canvas')[0];
        me.context = me.canvas.getContext('2d');
        
        // Add div to display slice number
        me.container.find("#resizable").append("<div id='text-layer'></div>");

        // Add div to display slice number
        me.container.find("#resizable").append("<svg id='vector-layer'></svg>");
        
        // Add cursor (a small div)
        me.container.find("#resizable").append("<div id='cursor'></div>");
        
        $('body').attr('data-toolbarDisplay','right');
        
        // Add precise cursor
        var isTouchArr=[];//["iPad","iPod"];
        var curDevice=navigator.userAgent.split(/[(;]/)[1];
        if($.inArray(curDevice,isTouchArr)>=0) {
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
        let svg, tools;

        if(typeof me.useFullTools === 'undefined') {
            me.useFullTools = true;
        }
        if(me.useFullTools) {
            tools = me.html.toolsFull;
        } else {
            tools = me.html.toolsLight;
        }

        for(svg in me.svg) {
            tools = tools.replace(
                new RegExp('/img/' + svg + '.svg', 'g'),
                'data:image/svg+xml;utf8,' + me.svg[svg]
            );
            console.log(svg);
        }
        me.container.append(tools);
        // intercept keyboard events
        $(document).keydown(function(e){me.keyDown(e)});
        // configure annotation tools
        $("#tools-minimized").click(function(){me.changeToolbarDisplay("maximize")});
        me.push($(".push#display-minimize"),function(){me.changeToolbarDisplay("minimize")});
        me.push($(".push#display-left"),function(){me.changeToolbarDisplay("left")});
        me.push($(".push#display-right"),function(){me.changeToolbarDisplay("right")});
        me.slider($(".slider#slice"),function(x){me.changeSlice(Math.round(x))});
        me.chose($(".chose#plane"),me.changeView);
        me.chose($(".chose#paintTool"),me.changeTool);
        me.chose($(".chose#penSize"),me.changePenSize);
        me.toggle($(".toggle#precise"),me.togglePreciseCursor);
        me.toggle($(".toggle#fill"),me.toggleFill);
        me.toggle($(".toggle#fullscreen"),me.toggleFullscreen);
        me.toggle($(".toggle#bubble"),me.toggleChat);
        me.push($(".push#3drender"),me.render3D);
        me.push($(".push#link"),me.link);
        me.push($(".push#upload"),me.upload);
        me.push($(".push#download"),me.download);
        me.push($(".push#color"),me.color);
        me.push($(".push#undo"),me.sendUndoMessage);
        me.push($(".push#save"),me.sendSaveMessage);
        me.push($(".push#prev"),me.prevSlice);
        me.push($(".push#next"),me.nextSlice);

        // connect chat message input
        $("#msg").keypress(function keypress_fromInitAtlasMaker(e) {me.onkey(e)});

        $("#tools-minimized").hide();

        let pr = new Promise(function(resolve, reject) {
            me.initSocketConnection()
            .then( () => {
                resolve();
            })
            .catch( (err) => {
                reject();
                console.error("ERROR:",err);
            });
        });

        return pr;
    },
    /**
     * @function configureAtlasMaker
     */
    configureAtlasMaker: function configureAtlasMaker(info, index) {
        var me=AtlasMakerWidget;
        var pr = new Promise(function(resolve, reject) {
            me.configureMRI(info,index)
            .then(info2 => {
                var pr2 = new Promise(function(resolve2, reject2) {
                    info = info2;
                    $.getJSON(me.hostname + "/labels/"+info.mri.atlas[index].labels)
                    .then(function(data) {
                        resolve2(data);
                    })
                    .catch(err2 => {
                        console.log("ERROR:",err2);
                        reject2(err2);
                    });
                });
                
                return pr2;
            })
            .then(function from_configureAtlasMaker(data) {
                me.configureOntology(data);
                me.User.penValue=me.ontology.labels[0].value;

                if(me.fullscreen==true) { // WARNING: HACK... would be better to implement enter/exit fullscreen
                    me.fullscreen=false;
                    me.toggleFullscreen();
                }
        
                if(me.User.view!=null) {
                    $(".chose#plane .a").removeClass("pressed");
                    var view=me.User.view.charAt(0).toUpperCase()+me.User.view.slice(1);
                    $(".chose#plane .a:contains('"+view+"')").addClass("pressed");
                }

                me.sendUserDataMessage("allUserData");
                me.sendUserDataMessage("sendAtlas");

                me.changePenColor( 0 );
                resolve(info);
            })
            .catch( (err) => {
                console.log("ERROR:",err);
                reject(err);
            });
        });

        return pr;
    },
    /**
     * @function configureOntology
     */
    configureOntology: function configureOntology(json) {
        var me=AtlasMakerWidget;
        me.ontology=json
        me.ontology.valueToIndex=[];
        me.ontology.labels.forEach(function(o,i){me.ontology.valueToIndex[o.value]=i});
        // to clear the region name being displayed on the info text-layer when having used eyedrop
        delete me.info.region;
    },
    /**
     * @function requestMRIInfo
     * @desc Request to download an MRI, with polling to prevent hangouts on lengthy
     *       downloads
     */
    requestMRIInfo: function requestMRIInfo(source) {
        var me=AtlasMakerWidget;
        $("#loadingIndicator p").text("Loading... ");
        var pr = new Promise(function(resolve, reject) {
            var timer = setInterval( function () {
                console.log("polling for data...");
                $.post(me.hostname + "/mri/json",{url:source}, function(info) {
                    if(info.success == true) {
                        console.log('requestMRIInfo promise resolved');
                        clearInterval(timer);
                        resolve(info);
                    
                        return;
                    } else if(info.success == 'downloading') {
                        if(me.User.source != source) {
                            clearInterval(timer);
                            reject("ERROR: source changed. Probably no longer requested?");

                            return;
                        }
                        $("#loadingIndicator p").text("Loading... "+parseInt(info.cur/info.len*100,10)+"%");
                    } else {
                        console.log("ERROR: requestMRIInfo",info);
                        clearInterval(timer);
                        reject("ERROR: requestMRIInfo" + info);
                    }
                });
            }, 2000);
        });

        return pr;
    },
    /**
     * @function configureMRI
     */
    configureMRI: function configureMRI(info,index) {
        var me=AtlasMakerWidget;

        return new Promise(function(resolve, reject) {
            me.User.source = info.source;
            me.requestMRIInfo(info.source)
            .then((info2) => {
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

                // TODO: it's silly to have to put vol dim twice...
                // (first here, once again further down)
                me.User.dim=info2.dim;
                me.User.pixdim=info2.pixdim;

                // compute space transformations
                me.User.v2w=info2.voxel2world;
                me.User.wori=info2.worldOrigin;
                me.computeS2VTransformation();

                //me.testS2VTransformation();

                me.flagLoadingImg={loading:false};

                me.brain_img.img=null;

                // get volume dimensions
                me.brain_dim=info2.dim;
                if(info2.pixdim)
                    me.brain_pixdim=info2.pixdim;
                else
                    me.brain_pixdim=[1, 1, 1];

                resolve(info2);
            })
            .catch(function(err) {
                console.log("ERROR: DOWNLOAD FAILED", err);
                reject(err);
            });
        });
    }
};