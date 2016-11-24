/**
 * @page AtlasMaker
 */
var AtlasMakerWidget = {
	//========================================================================================
	// Globals
	//========================================================================================
	debug:			1,
	container:		null,	// Element where atlasMaker lives
	brain_offcn:	null,
	brain_offtx:	null,
	canvas:			null,
	context:		null,
	brain_px:		null,
	brain_W:		null,
	brain_H:		null,
	brain_D:		null,
	brain_Wdim:		null,
	brain_Hdim:		null,
	max:			0,
	/*
		{FIX: TRY TO KEEP ALL 3D STUFF INSIDE Users
	*/
	brain_dim:		new Array(3),
	brain_pixdim:	new Array(3),
	brain_datatype:	null,
	/*
		}
	*/
	brain_img:      {     img: null,
						 view: null,
						slice: null
					},
	brain:			0,
	alphaLevel:		0.5,
	annotationLength:0,
	measureLength:	null,
	User:			{  view:null,
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
	Collab:			     [],
	atlas:			     null,
	atlas_offcn:	     null,
	atlas_offtx:	     null,	
	atlas_px:		     null,
	name:			     null,
	url:			     null,
	atlasFilename:	     null,
	socket:			     null,
	receiveFunctions:    [],
	sendFunctions:       [],
	flagConnected:	     0,
    reconnectionTimeout: 5, // reconnection timeout starts at 5 seconds
	flagLoadingImg:      {loading:false},
	flagUsePreciseCursor: false,
	msg:			     null,
	msg0:			     "",
	prevData:		     0,
	Crsr:			{ x:undefined,			// cursor x coord
					   y:undefined,			// cursor y coord
					   fx:undefined,		// finger x coord
					   fy:undefined,		// finger y coord
					   x0:undefined,		// previous finger x coord
					   y0:undefined,		// previous finger y coord
					   cachedX:undefined,	// finger x coord at touch start
					   cachedY:undefined,	// finger y coord at touch start
					   state:"move",		// cursor state: move, draw, configure
					   prevState:undefined,	// state before configure
					   touchStarted:false	// touch started flag
					},
	editMode:		0,	// editMode=0 to prevent editing, editMode=1 to accept it
	fullscreen:		false,	// fullscreen mode
	info:{},	// information displayed over each brain slice
	// undo stack
	/* DEPRECATED Undo:[], */
	version:	1, // version of the configuration file (slice number, plane, etc). Default=1

	/**
	 * @function traceLog
	 */
	traceLog: function traceLog(f,l,c) {
	/*
		var me=AtlasMakerWidget;
        if(me.debug && (l==undefined || me.debug>l)) {
            var str,arg=[];
            // str="am> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root");
            str="am> ";//+(f.name);
            if(c) {
                str="%c"+str;
            }
            arg.push(str);
            if(c) {
                arg.push("color:"+c);
            }
            return arg;
        }
    */
	},
    /**
     * @function quit
     */
	quit: function quit() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(quit,0,"#bbd");if(l)console.log.apply(undefined,l);
	
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
		var l=me.traceLog(initAtlasMaker,0,"#bbd");if(l)console.log.apply(undefined,l);
	
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
		
		$("body").attr('data-toolbarDisplay','right');
		
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

		// Init the toolbar: load template, wire actions
		var def=$.Deferred();
		$.get("/templates/tools.html",function from_initAtlasMaker(html) {
			me.container.append(html);

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
			me.push($(".push#prev"),me.prevSlice);
			me.push($(".push#next"),me.nextSlice);
			
			// connect chat message input
			$("#msg").keypress(function keypress_fromInitAtlasMaker(e) {me.onkey(e)});
			
            $("#tools-minimized").hide();
		})
		.then(function from_initAtlasMaker() {
			// Init web socket connection
			return me.initSocketConnection();
		}).then(function() {
			def.resolve()
		});
						
		return def.promise();
	},
    /**
     * @function configureAtlasMaker
     */
	configureAtlasMaker: function configureAtlasMaker(info,index) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureAtlasMaker,0,"#bbd");if(l)console.log.apply(undefined,l);

        var def=$.Deferred();

        me.configureMRI(info,index)
        .then(function (info2) {
            info = info2;
            return $.getJSON("/labels/"+info.mri.atlas[index].labels);
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
            def.resolve(info);
        })
        .catch(function(err) {
            console.log("ERROR:",err);
            def.reject();
        });
        
        return def.promise();
	},
    /**
     * @function configureOntology
     */
	configureOntology: function configureOntology(json) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureOntology,0,"#bbd");if(l)console.log.apply(undefined,l);

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
	requestMRIInfo: function requestMRIInfo(source, def) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(requestMRIInfo,0,"#bbd");if(l)console.log.apply(undefined,l);

		if(!def) {
		    var def=$.Deferred();
		}

        $.post("/mri/json",{url:source}, function(info) {
            if(info.success == true) {
                def.resolve(info);
            } else if(info.success == 'downloading') {
                setTimeout(function(){me.requestMRIInfo(source,def)},5000);
            } else {
                console.log("ERROR: requestMRIInfo",info);
                def.reject();
            }
        });
        
        return def.promise();
	},
    /**
     * @function configureMRI
     */
	configureMRI: function configureMRI(info,index) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureMRI,0,"#bbd");if(l)console.log.apply(undefined,l);

		var def=$.Deferred();

        me.requestMRIInfo(info.source)
		.then(function(info2) {
            
            if(!info.dim) {
		        // the mri object used to call this function does not have a 'dim'
		        // property, indicating that it had not been downloaded at the time of the
		        // call. Here we merge the fields from info2 that are initialised upon
		        // download of the mri server-side. The mri field in the original 'info',
                // which contains the newly created text 'annotations', is conserved
                $.extend(true, info, info2);
            }
            info2=info;
            
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
            me.User.source=info2.source;

            // TODO: it's silly to have to put vol dim twice...
            // (first here, once again further down)
            me.User.dim=info2.dim;
            me.User.pixdim=info2.pixdim;

            // compute space transformations
            me.User.v2w=info2.voxel2world;
            me.User.wori=info2.worldOrigin;
            me.computeS2VTransformation();
            me.testS2VTransformation();
        
            me.flagLoadingImg={loading:false};
        
            me.brain_img.img=null;
        
            // get volume dimensions
            me.brain_dim=info2.dim;
            if(info2.pixdim)
                me.brain_pixdim=info2.pixdim;
            else
                me.brain_pixdim=[1,1,1];
            
            def.resolve(info2);
        })
        .catch(function(err) {
            console.log("ERROR: DOWNLOAD FAILED", err);
            def.reject(err);
        });
		

		return def.promise();
	}
};
/*
				 0		int   sizeof_hdr;    //!< MUST be 348           //  // int sizeof_hdr;      //
				 4		char  data_type[10]; //!< ++UNUSED++            //  // char data_type[10];  //
				 14		char  db_name[18];   //!< ++UNUSED++            //  // char db_name[18];    //
				 32		int   extents;       //!< ++UNUSED++            //  // int extents;         //
				 36		short session_error; //!< ++UNUSED++            //  // short session_error; //
				 38		char  regular;       //!< ++UNUSED++            //  // char regular;        //
				 39		char  dim_info;      //!< MRI slice ordering.   //  // char hkey_un0;       //

													  //--- was image_dimension substruct ---//
				 40		short dim[8];        //!< Data array dimensions.//  // short dim[8];        //
				 56		float intent_p1 ;    //!< 1st intent parameter. //  // short unused8;       //
																	 // short unused9;       //
				 60		float intent_p2 ;    //!< 2nd intent parameter. //  // short unused10;      //
																	 // short unused11;      //
				 64		float intent_p3 ;    //!< 3rd intent parameter. //  // short unused12;      //
																	 // short unused13;      //
				 68		short intent_code ;  //!< NIFTI_INTENT_* code.  //  // short unused14;      //
				 70		short datatype;      //!< Defines data type!    //  // short datatype;      //
				 72		short bitpix;        //!< Number bits/voxel.    //  // short bitpix;        //
				 74		short slice_start;   //!< First slice index.    //  // short dim_un0;       //
				 76		float pixdim[8];     //!< Grid spacings.        //  // float pixdim[8];     //
				 108	float vox_offset;    //!< Offset into .nii file //  // float vox_offset;    //
				 112	float scl_slope ;    //!< Data scaling: slope.  //  // float funused1;      //
				 116	float scl_inter ;    //!< Data scaling: offset. //  // float funused2;      //
				 120	short slice_end;     //!< Last slice index.     //  // float funused3;      //
				 122	char  slice_code ;   //!< Slice timing order.   //
				 123	char  xyzt_units ;   //!< Units of pixdim[1..4] //
				 124	float cal_max;       //!< Max display intensity //  // float cal_max;       //
				 128	float cal_min;       //!< Min display intensity //  // float cal_min;       //
				 132	float slice_duration;//!< Time for 1 slice.     //  // float compressed;    //
				 136	float toffset;       //!< Time axis shift.      //  // float verified;      //
				 140	int   glmax;         //!< ++UNUSED++            //  // int glmax;           //
				 144	int   glmin;         //!< ++UNUSED++            //  // int glmin;           //
*/
