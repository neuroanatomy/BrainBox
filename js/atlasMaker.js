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
	brain_dim:		new Array(3),
	brain_pixdim:	new Array(3),
	brain_datatype:	null,
	brain_img:      {     img: null,
						 view: null,
						slice: null
					},
	brain:			0,
	annotationLength:0,
	measureLength:	null,
	User:			{  view:null,
					   tool:'paint',
					  slice:null,
					penSize:1,
				   penValue:1,
					 doFill:false,
				mouseIsDown:false,
						 x0:-1,
						 y0:-1,
						mri:new Object()
			},
	Collab:			[],
	atlas:			null,
	atlas_offcn:	null,
	atlas_offtx:	null,	
	atlas_px:		null,
	name:			null,
	url:			null,
	atlasFilename:	null,
	socket:			null,
	flagConnected:	0,
	flagLoadingImg: {loading:false},
	flagUsePreciseCursor: false,
	msg:			null,
	msg0:			"",
	prevData:		0,
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
	dbphp:          "php/brainbox.php",
	version:	1, // version of the configuration file (slice number, plane, etc). Default=1

	//========================================================================================
	// Local user interaction
	//========================================================================================
	changeView: function(theView) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> changeView()");
	
		switch(theView.toLowerCase()) {
			case 'sag':
				me.User.view='sag';
				break;
			case 'cor':
				me.User.view='cor';
				break;
			case 'axi':
				me.User.view='axi';
				break;
		}
		me.sendUserDataMessage("change view");
	
		me.configureBrainImage();
		me.configureAtlasImage();
		me.resizeWindow();

		console.log(">>changeView:drawImages");
		me.drawImages();
		
		me.initCursor();

	},
	changeTool: function(theTool) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> changeTool()");
	
		switch(theTool) {
			case 'Paint':
				me.User.tool='paint';
				me.User.penValue=1;
				break;
			case 'Erase':
				me.User.tool='erase';
				me.User.penValue=0;
				break;
			case 'Measure':
				me.User.tool='measure';
				break;
		}
		me.sendUserDataMessage("change tool");
		me.User.measureLength=null;
	},
	changePenSize: function(theSize) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> changePenSize()");
	
		me.User.penSize=parseInt(theSize);
		me.sendUserDataMessage("change pen size");
	},
	changeSlice: function(x) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> changeSlice("+x+")");

		var max=$("#slice").data("max");
		$("#slice").data("val",x);
		$("#slice .thumb")[0].style.left=(x*100/max)+"%";
	
		me.User.slice=x;
		me.sendUserDataMessage("change slice");

		me.drawImages();
	},
	prevSlice: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> prevSlice()");

		var x=$("#slice").data("val")-1;
		if(x<0) x=0;
		x=Math.round(x);
		if(x!=$("#slice").data("val")) {
			$("#slice").data("val",x);
			me.changeSlice(x);
		}
	},
	nextSlice: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> nextSlice()");

		var max=$("#slice").data("max");
		var x=$("#slice").data("val")+1;
		if(x>max) x=max;
		x=Math.round(x);
		if(x!=$("#slice").data("val")) {
			$("#slice").data("val",x);
			me.changeSlice(x);
		}
	},
	toggleFill: function(x) {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> toggleFill()");
	
		me.User.doFill=x;
		me.sendUserDataMessage("toggle fill");
	},
	toggleFullscreen: function() {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> toggleFullscreen()");

		if(me.fullscreen==false) {
			// Enter fullscreen
			//-----------------
		
			// add black overlay
			var black=$("<div id='blackOverlay'>");
			black.css({position:'fixed',top:0,left:0,width:'100%',height:'100%','z-index':5,'background-color':'#222'});
			$('body').append(black);
	
			// configure display mode
			//    $("#atlasMaker").removeClass('display-mode');
			$("#atlasMaker").addClass('fullscreen-mode');
			$("#atlasMaker").detach().appendTo('body');
			//    me.editMode=1;
			me.resizeWindow();
	
			// configure toolbar for edit mode
			//$("#log").outerHeight($("#tools-side").outerHeight()-$("#log").offset().top-$("#msg").closest("tr").outerHeight());
			me.fullscreen=true;
		} else {

			// Exit fullscreen
			//----------------
		
			// remove black overlay
			$("#blackOverlay").remove();
	
			// go back to display mode
			$("#atlasMaker").removeClass('fullscreen-mode');
			//    $("#atlasMaker").addClass('display-mode');
			$("#atlasMaker").detach().appendTo('#stereotaxic')	;
			//    me.editMode=0;
			me.resizeWindow();

			/*
			// configure toolbar for display mode
			$("div#toolbar").draggable('destroy');
			$("div#toolbar").resizable('destroy');
			$("div#toolbar").removeAttr("style");
			*/
			me.fullscreen=false;
		}
	},
	render3D: function() {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> reder3D()");
		
		// puts a fresh version of the segmentation in localStorage
		localStorage.brainbox=URL.createObjectURL(new Blob([me.encodeNifti()]));
		
		// opens 3d render window
		window.open("/templates/surface.html?path="+me.User.dirname+me.User.atlasFilename,"_blank");
	},
	link: function() {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> link()");
		window.prompt("Copy to clipboard:", location.href+"&view="+AtlasMakerWidget.User.view+"&slice="+AtlasMakerWidget.User.slice);
	},
	color: function() {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> color()");
		$("#labelset").appendTo(me.container);
		$("#labelset").show();

		var obj=$("#labelset");
		$(obj).find("span#labels-name").text(me.ontology.name);
		$(obj).find("#label-list").html("");
		for(var i=0;i<me.ontology.labels.length;i++) {
			var l=me.ontology.labels[i];
			var la=$(obj).find("#label-template").clone();
			la.attr({"data-index":i});
			la.find(".label-color").css({backgroundColor:"rgb("+l.color[0]+","+l.color[1]+","+l.color[2]+")"});
			la.find(".label-name").text(l.name);
			la.click(function() {
				me.changePenColor($(this).attr("data-index"));
				$(obj).hide();
			});
			$(obj).find("#label-list").append(la);
			la.show();
		}
	},
	changePenColor: function(index) {
		var me=AtlasMakerWidget;
		var c=me.ontology.labels[index].color;
		$("#color").css({backgroundColor:'rgb('+c[0]+','+c[1]+','+c[2]+')'});
		me.User.penValue=me.ontology.labels[index].value;
	},
	togglePreciseCursor: function() {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> togglePreciseCursor()");
	
		me.flagUsePreciseCursor=!me.flagUsePreciseCursor;
		me.initCursor();
	},
	resizeWindow: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1)
			console.log("> resizeWindow()");

		var wH=me.container.height();
		var wW=me.container.width();	
		var	wAspect=wW/wH;
		var	bAspect=me.brain_W*me.brain_Wdim/(me.brain_H*me.brain_Hdim);
		
		if(me.editMode==1) {
			// In edit mode width or height can be fixed to 100%
			// depending on the slice and container aspect ratio
			if(wAspect>bAspect)
				$('#resizable').css({width:(100*bAspect/wAspect)+'%',height:'100%'});
			else
				$('#resizable').css({width:'100%',height:(100*wAspect/bAspect)+'%'});
		} else {
			// In display mode slice width is always fixed to 100%
			$('#resizable').css({width:'100%',height:(100*wAspect/bAspect)+'%'});
			
			// Slice height cannot be larger than window's inner height:
			var sliceH=me.container.height();
			var windowH=window.innerHeight;
			if(sliceH>windowH) {
				var f=windowH/sliceH;
				$('#resizable').css({width:(f*100)+'%',height:f*(100*wAspect/bAspect)+'%'});
			}
			
		}
		
		/*
		if(me.fullscreen==true) {
			$("#log").outerHeight($("#tools-side").outerHeight()-$("#log").offset().top-$("#msg").closest("tr").outerHeight());
		}
		*/
	},
	encodeNifti: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> encodeNifti()");
	
		var	sizeof_hdr=348;
		var	dimensions=4;			// number of dimension values provided
		var	spacetimeunits=2+8;		// 2=nifti code for millimetres | 8=nifti code for seconds
		var	datatype=2;				// datatype for 8 bits (DT_UCHAR8 in nifti or UCHAR in analyze)
		var	voxel_offset=348;
		var	hdr=new ArrayBuffer(sizeof_hdr);
		var	dv=new DataView(hdr);
		dv.setInt32(0,sizeof_hdr,true);
		dv.setInt16(40,dimensions,true);
		dv.setInt16(42,me.brain_dim[0],true);
		dv.setInt16(44,me.brain_dim[1],true);
		dv.setInt16(46,me.brain_dim[2],true);
		dv.setInt16(48,1,true);
		dv.setInt16(72,datatype,true);
		dv.setInt16(74,8,true);			// bits per voxel
		dv.setFloat32(76,1,true);		// first pixdim value
		dv.setFloat32(80,me.brain_pixdim[0],true);
		dv.setFloat32(84,me.brain_pixdim[1],true);
		dv.setFloat32(88,me.brain_pixdim[2],true);
		dv.setFloat32(108,voxel_offset,true);
		dv.setInt8(123,spacetimeunits);

		var	data=me.atlas.data;
		var	i;

		var nii = new Uint8Array(voxel_offset+data.length);
		for(i=0;i<sizeof_hdr;i++)
			nii[i]=dv.getUint8(i);
		for(i=0;i<data.length;i++)
			nii[i+voxel_offset]=data[i];
		
		var	niigz=new pako.Deflate({gzip:true});
		niigz.push(nii,true);
				
		return niigz.result;
	},
	saveNifti: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> saveNifti()");
	
		var niigz=me.encodeNifti();
		var niigzBlob = new Blob([niigz]);
	
		$("a#download_atlas").attr("href",window.URL.createObjectURL(niigzBlob));
		$("a#download_atlas").attr("download",me.User.atlasFilename);
	},
	configureBrainImage: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> configureBrainImage()");
	
		if(me.User.view==null)
			me.User.view="sag";

		// init query image
		switch(me.User.view) {
			case 'sag':	me.brain_W=me.brain_dim[1]/*PA*/; me.brain_H=me.brain_dim[2]/*IS*/; me.brain_D=me.brain_dim[0]; me.brain_Wdim=me.brain_pixdim[1]; me.brain_Hdim=me.brain_pixdim[2]; break; // sagital
			case 'cor':	me.brain_W=me.brain_dim[0]/*LR*/; me.brain_H=me.brain_dim[2]/*IS*/; me.brain_D=me.brain_dim[1]; me.brain_Wdim=me.brain_pixdim[0]; me.brain_Hdim=me.brain_pixdim[2]; break; // coronal
			case 'axi':	me.brain_W=me.brain_dim[0]/*LR*/; me.brain_H=me.brain_dim[1]/*PA*/; me.brain_D=me.brain_dim[2]; me.brain_Wdim=me.brain_pixdim[0]; me.brain_Hdim=me.brain_pixdim[1]; break; // axial
		}
		me.canvas.width=me.brain_W;
		me.canvas.height=me.brain_H*me.brain_Hdim/me.brain_Wdim;
		me.brain_offcn.width=me.brain_W;
		me.brain_offcn.height=me.brain_H;
		me.brain_px=me.brain_offtx.getImageData(0,0,me.brain_offcn.width,me.brain_offcn.height);
		
		me.User.dim=me.brain_dim;
		if(me.User.slice==null || me.User.slice>=me.brain_D)
			me.User.slice=parseInt(me.brain_D/2);

		me.sendUserDataMessage("configure brain image");
		
		// configure toolbar slider
		$(".slider#slice").data({max:me.brain_D,val:me.User.slice});
		$("#slice .thumb")[0].style.left=(me.User.slice/me.brain_D*100)+"%";

		console.log(">>configureBrainImage:drawImages");
		me.drawImages();
		
		me.initCursor();
	},
	configureAtlasImage: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> configureAtlasImage()");
	
		// has to be run *after* configureBrainImage
		me.atlas_offcn.width=me.brain_W;
		me.atlas_offcn.height=me.brain_H;
		me.atlas_px=me.atlas_offtx.getImageData(0,0,me.atlas_offcn.width,me.atlas_offcn.height);
	},
	nearestNeighbour: function(ctx) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> nearestNeighbour()");
	
		ctx.imageSmoothingEnabled = false;
		ctx.mozImageSmoothingEnabled = false;
	},
	computeSegmentedVolume: function() {
		var me=AtlasMakerWidget;
		var i,sum=0;
		var	data=me.atlas.data;
		var	dim=me.atlas.dim;

		for(i=0;i<dim[0]*dim[1]*dim[2];i++) {
			if(data[i]>0)
				sum++;
		}
		return sum*me.User.pixdim[0]*me.User.pixdim[1]*me.User.pixdim[2];
	},
	displayInformation: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> displayInformation()");
		me.info.slice=me.User.slice;
		var i=0,info=me.container.find("#info");
		
		var str="";
		for(var k in me.info) {
			str+="<text x='5' y='"+(15+15*i++)+"' fill='white'>"+k+": "+me.info[k]+"</text>";
		}
		
		if(me.User.measureLength) {
			var W=parseFloat($('#atlasMaker canvas').css('width'));
			var w=parseFloat($('#atlasMaker canvas').attr('width'));
			var zx=W/w,zy=zx*me.brain_Hdim/me.brain_Wdim,p=me.User.measureLength,str1;
			var W=parseFloat($('#atlasMaker canvas').css('width'));
			var w=parseFloat($('#atlasMaker canvas').attr('width'));
			str1="M"+zx*p[0].x+","+zy*p[0].y;
			for(i=1;i<p.length;i++)
				str1+="L"+zx*p[i].x+","+zy*p[i].y;
			str+=[	"<circle fill='#00ff00' cx="+zx*p[0].x+" cy="+zy*p[0].y+" r=3 />",
					"<path stroke='#00ff00' fill='none' d='"+str1+"'/>",
					(i>0)?"<circle fill='#00ff00' cx="+zx*p[i-1].x+" cy="+zy*p[i-1].y+" r=3 />":""].join("\n");
		}
		
		info.html(str);
	},
	drawImages: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> drawImages()");
	
		if(me.brain_img.img && me.brain_img.view==me.User.view && me.brain_img.slice==me.User.slice) {
			me.context.clearRect(0,0,me.context.canvas.width,me.canvas.height);
			me.displayInformation();

			me.nearestNeighbour(me.context);
			me.context.drawImage(me.brain_img.img,0,0,me.brain_W,me.brain_H*me.brain_Hdim/me.brain_Wdim);

			me.context.globalAlpha = 0.8;
			me.context.globalCompositeOperation = "lighter";
			me.drawAtlasImage(me.flagLoadingImg.view,me.flagLoadingImg.slice);
		} else {
			me.sendRequestSliceMessage();
		}
	},
	drawAtlasImage: function(view,slice) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> drawAtlasImage()");
	
		if(!me.atlas)
			return;

		var	data=me.atlas.data;
		var	dim=me.atlas.dim;
		var	val;

		ys=yc=ya=slice;
		for(y=0;y<me.brain_H;y++)
		for(x=0;x<me.brain_W;x++) {
			switch(view) {
				case 'sag':i= y*dim[1]/*PA*/*dim[0]/*LR*/+ x*dim[0]/*LR*/+ys; break;
				case 'cor':i= y*dim[1]/*PA*/*dim[0]/*LR*/+yc*dim[0]/*LR*/+x; break;
				case 'axi':i=ya*dim[1]/*PA*/*dim[0]/*LR*/+ y*dim[0]/*LR*/+x; break;
			}
			
			var c;
			if(data[i]>0) {
				try {
					c=me.ontology.labels[data[i]-1].color;
				} catch(e) {
					c=me.ontology.labels[me.ontology.labels.length-1].color; // label saturation
				}
			}
			else
				c=[0,0,0];
			i=(y*me.atlas_offcn.width+x)*4;
			me.atlas_px.data[ i ]  =c[0];
			me.atlas_px.data[ i+1 ]=c[1];
			me.atlas_px.data[ i+2 ]=c[2];
			me.atlas_px.data[ i+3 ]=255;
		}
		me.atlas_offtx.putImageData(me.atlas_px, 0, 0);

		me.nearestNeighbour(me.context);
		me.context.drawImage(me.atlas_offcn,0,0,me.brain_W,me.brain_H*me.brain_Hdim/me.brain_Wdim);
	},
	mousedown: function(e) {
		var me=AtlasMakerWidget;
		if(this.debug) console.log("> mousedown()");
	
		e.preventDefault();

		var W=parseFloat($('#atlasMaker canvas').css('width'));
		var H=parseFloat($('#atlasMaker canvas').css('height'));
		var w=parseFloat($('#atlasMaker canvas').attr('width'));
		var h=parseFloat($('#atlasMaker canvas').attr('height'));
		var o=$('#atlasMaker canvas').offset();
		var x=parseInt((e.pageX-o.left)*(w/W));
		// i have to add here the compensation for rectangular pixels: f(brain_Wdim, brain_Hdim)
		var y=parseInt((e.pageY-o.top)*(h/H));
		me.down(x,Math.round(y*me.brain_Wdim/me.brain_Hdim));
	},
	mousemove: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug==2) console.log("> mousemove()");
	
		e.preventDefault();
		var W=parseFloat($('#atlasMaker canvas').css('width'));
		var H=parseFloat($('#atlasMaker canvas').css('height'));
		var w=parseFloat($('#atlasMaker canvas').attr('width'));
		var h=parseFloat($('#atlasMaker canvas').attr('height'));
		var o=$('#atlasMaker canvas').offset();
		var x=parseInt((e.pageX-o.left)*(w/W));
		var y=parseInt((e.pageY-o.top)*(h/H));
	
		$("#cursor").css({
			left:(x*(W/w))+'px',
			top:(y*(H/h))+'px',
			width:me.User.penSize*(W/w),
			height:me.User.penSize*(H/h)
		});
		me.move(x,Math.round(y*me.brain_Wdim/me.brain_Hdim));
	},
	mouseup: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> mouseup()");
	
		me.up(e);
	},
	touchstart: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> touchstart()");
	
		e.preventDefault();

		var W=parseFloat($('#atlasMaker canvas').css('width'));
		var H=parseFloat($('#atlasMaker canvas').css('height'));
		var w=parseFloat($('#atlasMaker canvas').attr('width'));
		var h=parseFloat($('#atlasMaker canvas').attr('height'));
		var o=$('#atlasMaker canvas').offset();
		var	touchEvent;
		if(e.originalEvent)
			touchEvent=e.originalEvent.changedTouches[0];
		else
			touchEvent=e.changedTouches[0];
		var x=parseInt((touchEvent.pageX-o.left)*(w/W));
		var y=parseInt((touchEvent.pageY-o.top)*(h/H));
	
		if(me.flagUsePreciseCursor) {
			// Precision cursor
			me.Crsr.x0=x;
			me.Crsr.cachedX=x;
			me.Crsr.y0=y;
			me.Crsr.cachedY=y;
			me.Crsr.fx=$("#finger").offset().left;
			me.Crsr.fy=$("#finger").offset().top;
			me.Crsr.touchStarted=true;
			setTimeout(function() {
				if( me.Crsr.cachedX == me.Crsr.x0 && me.Crsr.cachedY==me.Crsr.y0 && !me.Crsr.touchStarted) {
					// short tap: change mode
					me.Crsr.state=(me.Crsr.state=="move")?"draw":"move";
					me.updateCursor();
				}
			},200);
			setTimeout(function() {
				if (me.Crsr.cachedX==me.Crsr.x0 && me.Crsr.cachedY==me.Crsr.y0 && me.Crsr.touchStarted) {
					// long tap: change to configure mode
					me.Crsr.prevState=me.Crsr.state;
					me.Crsr.state="configure";
					me.updateCursor();
				}
			},1000);
			me.down(me.Crsr.x,Math.round(me.Crsr.y*me.brain_Wdim/me.brain_Hdim));
		} else
			me.down(x,Math.round(y*me.brain_Wdim/me.brain_Hdim));
	},
	touchmove: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> touchmove()");
		
		if(me.Crsr.touchStarted==false && me.debug) {
			console.log("WARNING TO MYSELF: touch can move without having started");
		}
	
		e.preventDefault();

		var W=parseFloat($('#atlasMaker canvas').css('width'));
		var H=parseFloat($('#atlasMaker canvas').css('height'));
		var w=parseFloat($('#atlasMaker canvas').attr('width'));
		var h=parseFloat($('#atlasMaker canvas').attr('height'));
		var o=$('#atlasMaker canvas').offset();
		var	touchEvent;
		if(e.originalEvent)
			touchEvent=e.originalEvent.changedTouches[0];
		else
			touchEvent=e.changedTouches[0];
		var x=parseInt((touchEvent.pageX-o.left)*(w/W));
		var y=parseInt((touchEvent.pageY-o.top)*(h/H));
	
		if(me.flagUsePreciseCursor) {
			// Precision cursor
			var dx=x-me.Crsr.x0;
			var dy=y-me.Crsr.y0;
			if(me.Crsr.state=="move"||me.Crsr.state=="draw") {
				me.Crsr.x+=dx;
				me.Crsr.y+=dy;
				$("#cursor").css({left:me.Crsr.x*(W/w),top:me.Crsr.y*(H/h),width:me.User.penSize*(W/w),height:me.User.penSize*(H/h)});
				if(me.Crsr.state=="draw")
					me.move(me.Crsr.x,Math.round(me.Crsr.y*me.brain_Wdim/me.brain_Hdim));
			}
			me.Crsr.fx+=dx*(W/w);
			me.Crsr.fy+=dy*(H/h);
			$("#finger").offset({left:me.Crsr.fx,top:me.Crsr.fy});
		
			me.Crsr.x0=x;
			me.Crsr.y0=y;
		} else {
			$("#cursor").css({
				left:(x*(W/w))+'px',
				top:(y*(H/h))+'px',
				width:me.User.penSize*(W/w),
				height:me.User.penSize*(H/h)
			});
			me.move(x,Math.round(y*me.brain_Wdim/me.brain_Hdim));
		}
	},
	touchend: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> touchend()");
		
		e.preventDefault();
	
		if(me.flagUsePreciseCursor) {
			// Precision cursor
			me.Crsr.touchStarted=false;
			if(me.Crsr.state=="configure") {
				me.Crsr.state=me.Crsr.prevState;
				me.updateCursor();
			}
		}	
		me.up(e);
	},
	initCursor: function() {
		var me=AtlasMakerWidget;
		var W=parseFloat($('#atlasMaker canvas').css('width'));
		var H=parseFloat($('#atlasMaker canvas').css('height'));
		var w=parseFloat($('#atlasMaker canvas').attr('width'));
		var h=parseFloat($('#atlasMaker canvas').attr('height'));
		
		me.Crsr.x=parseInt(w/2);
		me.Crsr.y=parseInt(h/2);
		
		me.Crsr.fx=parseInt(w/2)*(W/w);
		me.Crsr.fy=parseInt(h/2)*(H/h);
		$("#cursor").css({left:(me.Crsr.x*(W/w))+"px",top:(me.Crsr.y*(H/h))+"px",width:me.User.penSize*(W/w),height:me.User.penSize*(H/h)});
		
		if(me.flagUsePreciseCursor) {
			if($("#finger").length==0) {
				me.container.append("<div id='finger'></div>");
				$("#finger").addClass("touchDevice");

				// configure touch events for tablets
				$("#finger").on("touchstart",function(e){me.touchstart(e)});
				$("#finger").on("touchend",function(e){me.touchend(e)});
				$("#finger").on("touchmove",function(e){me.touchmove(e)});
			
				// turn off eventual touch events handled by canvas
				me.canvas.ontouchstart=null;
				me.canvas.ontouchmove=null;
				me.canvas.ontouchend=null;
			}
			me.updateCursor();

			$("#finger").css({left:me.Crsr.fx+"px",top:me.Crsr.fy+"px"});
		} else {
			// remove precise cursor
			$("#finger").remove();

			// configure touch events for tablets
			me.canvas.ontouchstart=me.touchstart;
			me.canvas.ontouchmove=me.touchmove;
			me.canvas.ontouchend=me.touchend;
		}
	},
	updateCursor: function() {
		var me=AtlasMakerWidget;
		$("#finger").removeClass("move draw configure");
		switch(me.Crsr.state) {
			case "move": $("#finger").addClass("move");	break;
			case "draw": $("#finger").addClass("draw");	break;
			case "configure": $("#finger").addClass("configure");	break;
		}
		//$("#msg").html(C.state);
		//console.log(Crsr.state);
	},
	down: function(x,y) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> down()");
	
		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;
	
		var z=me.User.slice;

		
		switch(me.User.tool) {
			case 'paint':
				if(me.User.doFill)
					me.paintxy(-1,'f',x,y,me.User);
				else {
					me.User.mouseIsDown = true;
					me.sendUserDataMessage("mouse down");
					me.paintxy(-1,'mf',x,y,me.User);
				}
				break;
			case 'erase':
				if(me.User.doFill)
					me.paintxy(-1,'e',x,y,me.User);
				else {
					me.User.mouseIsDown = true;
					me.sendUserDataMessage("mouse down");
					me.paintxy(-1,'me',x,y,me.User);
				}
				break;
			case 'measure':
				if(me.User.measureLength==null)
					me.User.measureLength=[{x:x,y:y}];
				else
					me.User.measureLength.push({x:x,y:y});
				break;
		}
		
		/*
		if(me.User.doFill) {
			if(me.User.penValue==0)
				me.paintxy(-1,'e',x,y,me.User);
			else
				me.paintxy(-1,'f',x,y,me.User);
		} else {
			me.User.mouseIsDown = true;
			me.sendUserDataMessage("mouse down");
			if(me.User.tool=='paint')
				me.paintxy(-1,'mf',x,y,me.User);
			else
			if(me.User.tool=='erase')
				me.paintxy(-1,'me',x,y,me.User);
		}
		*/
	
		// init annotation length counter
		me.annotationLength=0;
	},
	move: function(x,y) {
		var me=AtlasMakerWidget;
		if(me.debug==2) console.log("> move()");
	
		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;

		var z=me.User.slice;

		if(!me.User.mouseIsDown)
			return;
		
		switch(me.User.tool) {
			case 'paint':
				me.paintxy(-1,'lf',x,y,me.User);
				break;
			case 'erase':
				me.paintxy(-1,'le',x,y,me.User);
				break;
		}
		
		/*
		if(me.User.tool=='paint')
			me.paintxy(-1,'lf',x,y,me.User);
		else
		if(me.User.tool=='erase')
			me.paintxy(-1,'le',x,y,me.User);
		*/

	},
	up: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> up()");

		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;

		// Send mouse up (touch ended) message
		me.User.mouseIsDown = false;
		me.User.x0=-1;
		var msg={"c":"mu"};
		me.sendPaintMessage(msg);
	
		// add annotated length to User.annotation length and post to DB
		me.logToDatabase("annotationLength",JSON.stringify({specimen:me.name,atlas:me.atlas.name,length:me.annotationLength}))
			.then(function(value){var length=parseInt(value);me.info.length=length+" mm";me.displayInformation()});

		me.annotationLength=0;

		// compute total segmented volume
		var vol=me.computeSegmentedVolume();
		me.info.volume=parseInt(vol)+" mm3";
	},
	keyDown: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> keyDown()");
	
		// console.log("key:",e.which);
	
		switch(e.which) {
			case 13: // return
				if(me.User.measureLength) {
					var length=0;
					var p=me.User.measureLength;
					var wdim=me.brain_Wdim,hdim=me.brain_Hdim;
					var i;
					for(i=1;i<p.length;i++)
						length+=Math.sqrt(Math.pow(wdim*(p[i].x-p[i-1].x),2)+Math.pow(hdim*(p[i].y-p[i-1].y),2));
					$("#log").append("Length: "+length+"<br/>");
					me.User.measureLength=null;
				}
				break;
			case 37: // left arrow
				me.prevSlice();
				e.preventDefault();
				break;
			case 39: // right arrow
				me.nextSlice(this);
				e.preventDefault();
				break;
		}
	},

	//====================================================================================
	// Paint functions common to all users
	//====================================================================================
	paintxy: function(u,c,x,y,usr) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> paintxy()");
	
		// u: user number
		// c: command
		// x, y: coordinates
		msg={"c":c,"x":x,"y":y};
		if(u==-1 && JSON.stringify(msg)!=JSON.stringify(me.msg0)) {
			me.sendPaintMessage(msg);
			me.msg0=msg;
		}
	
		var	layer=me.atlas;
		var	dim=layer.dim;
	
		var	coord={"x":x,"y":y,"z":usr.slice};
		if(usr.x0<0) {
			usr.x0=coord.x;
			usr.y0=coord.y;
		}
	
		var val=usr.penValue;
		switch(c) {
			case 'le':
				me.line(coord.x,coord.y,0,usr);
				break;
			case 'lf':
				me.line(coord.x,coord.y,val,usr);
				break;
			case 'e':
				me.fill(coord.x,coord.y,coord.z,0,usr.view);
				break;
			case 'f':
				me.fill(coord.x,coord.y,coord.z,val,usr.view);
				break;
		}

		usr.x0=coord.x;
		usr.y0=coord.y;
	},
	paintvol: function(voxels) {
		var me=AtlasMakerWidget;
		/* this function is exclusively used for undoing */
	
		if(me.debug) console.log("> paintvol()");
	
		var	i,
			ind,			// voxel index
			val,			// voxel delta-value, such that -=val undoes
			layer=me.atlas;
		for(i=0;i<voxels.length;i++) {
			ind=voxels[i][0];
			val=voxels[i][1];
			
			/*
			layer.data[ind]-=val;	// TODO-UNDO: move from delta-value to absolute
			*/
			layer.data[ind]=val;
		}

		me.drawImages();
	},
	/* DEPRECATED
	paintslice: function(u,img,user) {
		var me=AtlasMakerWidget;
		/// part of undo
		// u: user number
		// img: img data
		msg={"img":img};
		if(u==-1 && JSON.stringify(msg)!=JSON.stringify(me.msg0)) {
			//me.sendPaintMessage(msg);
			me.msg0=msg;
		}

		var layer=me.atlas;
		// Should be called only from the server
		// img contains the img data
		// we must apply this image on the correct slice / view ( user.slice, user.view) !!
		var idx_img = 0;
		var width = getCanvasWidth(user.view);
		var height = getCanvasHeight(user.view);
		var i,x,y;
		for(y = 0 ; y < height; y++) {
			for(x = 0 ; x < width; x++) {
				i = me.slice2index(x, y, user.slice, user.view);
				layer.data[i] -= img[idx_img];
				idx_img++;
			}
		}

		me.drawImages();
	},
	*/
	fill: function(x,y,z,val,myView) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> fill()");
	
		var	Q=[],n;
		var	layer=me.atlas;
		var	dim=layer.dim;
		var	i;
		var bval; // background-value: value of the voxel where the click occurred
		
		bval=layer.data[me.slice2index(x,y,z,myView)];
		
		Q.push({"x":x,"y":y});
		while(Q.length>0) {
			n=Q.pop();
			x=n.x;
			y=n.y;
			if(layer.data[me.slice2index(x,y,z,myView)]==bval) {
				layer.data[me.slice2index(x,y,z,myView)]=val;
				if(x-1>=0         && layer.data[me.slice2index(x-1,y,z,myView)]==bval)
					Q.push({"x":x-1,"y":y});
				if(x+1<me.brain_W && layer.data[me.slice2index(x+1,y,z,myView)]==bval)
					Q.push({"x":x+1,"y":y});
				if(y-1>=0         && layer.data[me.slice2index(x,y-1,z,myView)]==bval)
					Q.push({"x":x,"y":y-1});
				if(y+1<me.brain_H && layer.data[me.slice2index(x,y+1,z,myView)]==bval)
					Q.push({"x":x,"y":y+1});
			}
		}
		me.drawImages();
	},
	line: function(x,y,val,usr) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> line()");
	
		// Bresenham's line algorithm adapted from
		// http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

		var	layer=me.atlas;
		var	dim=layer.dim;
		var	xyzi1=new Array(4);
		var	xyzi2=new Array(4);
		var	i;
		var	x1=usr.x0;
		var y1=usr.y0;
		var x2=x;
		var y2=y;
		var	z=usr.slice;

		// Define differences and error check
		var dx = Math.abs(x2 - x1);
		var dy = Math.abs(y2 - y1);
		var sx = (x1 < x2) ? 1 : -1;
		var sy = (y1 < y2) ? 1 : -1;
		var err = dx - dy;

		xyzi1=me.slice2xyzi(x1,y1,z,usr.view);
		xyzi2=me.slice2xyzi(x2,y2,z,usr.view);
		me.annotationLength+=Math.sqrt(	Math.pow(me.brain_pixdim[0]*(xyzi1[0]-xyzi2[0]),2)+
										Math.pow(me.brain_pixdim[1]*(xyzi1[1]-xyzi2[1]),2)+
										Math.pow(me.brain_pixdim[2]*(xyzi1[2]-xyzi2[2]),2));
	
		for(j=0;j<usr.penSize;j++)
		for(k=0;k<usr.penSize;k++) {
			i=me.slice2index(x1+j,y1+k,z,usr.view);
			layer.data[i]=val;
		}
	
		while (!((x1 == x2) && (y1 == y2))) {
			var e2 = err << 1;
			if (e2 > -dy) {
				err -= dy;
				x1 += sx;
			}
			if (e2 < dx) {
				err += dx;
				y1 += sy;
			}
			for(j=0;j<usr.penSize;j++)
			for(k=0;k<usr.penSize;k++) {
				i=me.slice2index(x1+j,y1+k,z,usr.view);
				layer.data[i]=val;
			}
		}
		me.drawImages();
	},
	slice2index: function(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		if(me.debug>1)
			console.log("> slice2index()");
	
		var	layer=me.atlas;
		var	dim=layer.dim;
		var	x,y,z;
		switch(myView) {
			case 'sag':	x=mz; y=mx; z=my;break; // sagital
			case 'cor':	x=mx; y=mz; z=my;break; // coronal
			case 'axi':	x=mx; y=my; z=mz;break; // axial
		}	
		return z*dim[1]*dim[0]+y*dim[0]+x;	
	},
	slice2xyzi: function(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		if(me.debug>1)
			console.log("> slice2xyzi()");
	
		var	layer=me.atlas;
		var	dim=layer.dim;
		var	x,y,z,i;
		switch(myView) {
			case 'sag':	x=mz; y=mx; z=my;break; // sagital
			case 'cor':	x=mx; y=mz; z=my;break; // coronal
			case 'axi':	x=mx; y=my; z=mz;break; // axial
		}
		i=z*dim[1]*dim[0]+y*dim[0]+x;
		return [x,y,z,i];	
	},
	xyz2slice: function(x,y,z,myView) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> xyz2slice()");
	
		var	mx,my,mz;
		switch(myView) {
			case 'sag':	mz=x; mx=y; my=z;break; // sagital
			case 'cor':	mx=x; mz=y; my=z;break; // coronal
			case 'axi':	mx=x; my=y; mz=z;break; // axial
		}	
		return new Object({"x":x,"y":y,"z":z});	
	},
	/* DEPRECATED
	//====================================================================================
	// Undo
	//====================================================================================
	newUndoLayer: function() {
		var undoLayer={};
		Undo.push(undoLayer);
	},
	*/

	//====================================================================================
	// Web sockets
	//====================================================================================
	createSocket: function(host) {
		if(this.debug) console.log("> createSocket()");
	
		var ws;

		if (window.WebSocket) {
			ws=new WebSocket(host);
		} else if (window.MozWebSocket) {
			ws=new MozWebSocket(host);
		}

		return ws;
	},
	initSocketConnection: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> initSocketConnection()");
		var def=$.Deferred();
	
		// WS connection
		var host = "ws://" + window.location.host + ":8080/";
	
		if(me.debug)
			console.log("[initSocketConnection] host:",host);
		me.progress.html("Connecting...");
		
		/* work in progress: animate the connection :)
		setInterval(function(){
			if(me.progress.text()=="MRI")
				clearInterval(this);
			else {
				var i=me.progress.text().length;
				if(i<13) me.progress.append(".");
				else me.progress.html("Connecting");
			}
		},200);
		*/
	
		try {
			me.socket = me.createSocket(host);
			
			me.socket.onopen = function(msg) {
				if(me.debug)
					console.log("[initSocketConnection] onopen",msg);
				me.progress.html("<img src='/img/download.svg' style='vertical-align:middle'/>MRI");
				$("#chat").text("Chat (1 connected)");
				me.flagConnected=1;
				def.resolve();
			};
			
			me.socket.onmessage = function(msg) {
				if(me.debug>1) console.log("[initSocketConnection] onmessage",msg);
				// Message: atlas data initialisation
				if(msg.data instanceof Blob) {
					if(this.debug) console.log("received binary blob",msg.data.size,"bytes long");
					var fileReader = new FileReader();
					fileReader.onload = function() {
						var data=new Uint8Array(this.result);
						var sz=data.length;
						var ext=String.fromCharCode(data[sz-8],data[sz-7],data[sz-6]);
						
						switch(ext) {
							case "nii": {
								var	inflate=new pako.Inflate();
								inflate.push(data,true);
								var layer=new Object();
								layer.data=inflate.result;
								layer.name=me.atlasFilename;
								layer.dim=me.brain_dim;
						
								me.atlas=layer;

								me.configureBrainImage();
								me.configureAtlasImage();
								me.resizeWindow();

								me.brain_img.img=null;
								me.drawImages();
								
								// compute total segmented volume
								var vol=me.computeSegmentedVolume();
								me.info.volume=parseInt(vol)+" mm3";

								// setup download link
								var	link=me.container.find("span#download_atlas");
								link.html("<a class='download' href='"+me.User.dirname+me.User.atlasFilename+"'><img src='/img/download.svg' style='vertical-align:middle'/></a>"+layer.name);
								break;
							}
							case "jpg": {
								var urlCreator = window.URL || window.webkitURL;
								var imageUrl = urlCreator.createObjectURL(msg.data);
								var img = new Image();
								img.onload=function(){
									var flagFirstImage=(me.brain_img.img==null);
									me.brain_img.img=img;
									me.brain_img.view=me.flagLoadingImg.view;
									me.brain_img.slice=me.flagLoadingImg.slice;

									me.drawImages();
																		
									me.flagLoadingImg.loading=false;

									if(flagFirstImage || me.flagLoadingImg.view!=me.User.view ||me.flagLoadingImg.slice!=me.User.slice) {
										me.sendRequestSliceMessage();
									}
								}
								img.src=imageUrl;
								
								break;
							}
						}
					};
					fileReader.readAsArrayBuffer(msg.data);
					return;
				}
			
				// Message: interaction message
				var	data=JSON.parse(msg.data);
			
				// [deprecated]
				// If we receive a message from an unknown user,
				// send our own data to make us known
				// [now, the server does the introductions]
				/*
				if(data.uid!=undefined && !Collab[data.uid]) {
					console.log("Received message from unknown user");
					sendUserDataMessage("introduce to new user");
				}
				*/
			
				switch(data.type) {
					case "intro":
						me.receiveUserDataMessage(data);
						break;
					case "volInfo":
						console.log("volInfo",data);
						break;
					case "chat":
						me.receiveChatMessage(data);
						break;
					case "paint":
						me.receivePaintMessage(data);
						break;
					case "paintvol":
						me.receivePaintVolumeMessage(data);
						break;
					case "disconnect":
						me.receiveDisconnectMessage(data);
						break;
				}
			};
			
			me.socket.onclose = function(msg) {
				me.socket.send(JSON.stringify({
					"type":"echo",
					"msg":"user socket closing",
					"username":me.User.username
				}));
				$("#chat").text("Chat (disconnected)");
				me.flagConnected=0;
			};
		}
		catch (ex) {
			$("#chat").text("Chat (not connected - connection error)");
		}
		
		return def.promise();
	},
	sendUserDataMessage: function(description) {
		var me=AtlasMakerWidget;

		if(me.flagConnected==0)
			return;

		if(me.debug>1) console.log("> sendUserDataMessage()");
		
		var msg={"type":"intro","user":me.User,"description":description};
		try {
			me.socket.send(JSON.stringify(msg));
		} catch (ex) {
			console.log("ERROR: Unable to sendUserDataMessage",ex);
		}
	},
	receiveUserDataMessage: function(data) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> receiveUserDataMessage()");
		if(me.debug) console.log("description: "+data.description,data);
	
		var u=data.uid;
	
		if(me.Collab[u]==undefined) {
			try {
				//var	msg="<b>"+data.user.username+"</b> entered atlas "+data.user.specimenName+"/"+data.user.atlasFilename+"<br />"
				var	msg="<b>"+data.user.username+"</b> entered<br />"
				$("#log").append(msg);
				$("#log").scrollTop($("#log")[0].scrollHeight);
			} catch (e) {
				console.log(e);
			}
		}
		me.Collab[u]=data.user;

		var	v,nusers=1; for(v in me.Collab) nusers++;
		$("#chat").text("Chat ("+nusers+" connected)");
	},
	sendChatMessage: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> sendChatMessage()");
	
		if(me.flagConnected==0)
			return;
		var msg = $('input#msg')[0].value;
		try {
			me.socket.send(JSON.stringify({"type":"chat","msg":msg,"username":me.User.username}));
			var	msg="<b>me: </b>"+msg+"<br />";
			$("#log").append(msg);
			$("#log").scrollTop($("#log")[0].scrollHeight);
			$('input#msg').val("");
		} catch (ex) {
			console.log("ERROR: Unable to sendChatMessage",ex);
		}
	},
	receiveChatMessage: function(data) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> receiveChatMessage()");
	
		var	theView=me.Collab[data.uid].view;
		var	theSlice=me.Collab[data.uid].slice;
		var theUsername=data.username;
		var	msg="<b>"+theUsername+" ("+theView+" "+theSlice+"): </b>"+data.msg+"<br />"
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	sendPaintMessage: function(msg) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> sendPaintMessage()");
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:msg}));
		} catch (ex) {
			console.log("ERROR: Unable to sendPaintMessage",ex);
		}
	},
	receivePaintMessage: function(data) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> receivePaintMessage()");
	
		var	msg=data.data;
		var u=data.uid;	// user
		var c=msg.c;	// command
		var x=parseInt(msg.x);	// x coordinate
		var y=parseInt(msg.y);	// y coordinate

		me.paintxy(u,c,x,y,me.Collab[u]);
	},
	receivePaintVolumeMessage: function(data) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> receivePaintVolumeMessage()");
	
		var	i,ind,val,voxels;
	
		voxels=data.data;
		me.paintvol(voxels.data);
	},
	/* DEPRECATED
	receivePaintSliceMessage: function(data) {
		var me=AtlasMakerWidget;
		// part of undo
		if(me.debug) console.log("[receivePaintSliceMessage]");

		var msg=data.data;
		var u=data.uid;       // user
		var img=msg.img;    // img data

		me.paintslice(u,img,me.Collab[u]);
	},
	*/
	sendUndoMessage: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> sendUndoMessage()");
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:{c:"u"}}));
		} catch (ex) {
			console.log("ERROR: Unable to sendUndoMessage",ex);
		}
	},
	sendRequestSliceMessage: function() {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> sendRequestSliceMessage()");
		if(me.flagConnected==0)
			return;
		if(me.flagLoadingImg.loading==true)
			return;
		try {
			me.socket.send(JSON.stringify({type:"requestSlice"}));
			me.flagLoadingImg.loading=true;
			me.flagLoadingImg.view=me.User.view;
			me.flagLoadingImg.slice=me.User.slice;

		} catch (ex) {
			console.log("ERROR: Unable to sendRequestSliceMessage",ex);
		}
	},
	sendSaveMetadataMessage: function(info) {
		var me=AtlasMakerWidget;
		if(me.debug>1) console.log("> sendSaveMetadataMessage()");
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"saveMetadata",metadata:info}));
		} catch (ex) {
			console.log("ERROR: Unable to sendSaveMetadataMessage",ex);
		}
	},
	receiveDisconnectMessage: function(data) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> receiveDisconnectMessage()");
		var u=data.uid;	// user
		//var	msg="<b>"+me.Collab[u].username+"</b> left atlas "+me.Collab[u].specimenName+"/"+me.Collab[u].atlasFilename+"<br />"
		var	msg="<b>"+me.Collab[u].username+"</b> left<br />"
		me.Collab.splice(u,1);
		var	v,nusers=1; for(v in me.Collab) nusers++;
		$("#chat").text("Chat ("+nusers+" connected)");
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	onkey: function(e) {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> onkey()");
	
		if (e.keyCode == 13) {
			me.sendChatMessage();
		}
	},
	quit: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log("> quit()");
	
		me.log("","Goodbye!");
		me.socket.close();
		me.socket = null;
	},
	//==========
	// Database
	//==========
	logToDatabase: function(key,value) {
		var def=$.Deferred();
		$.ajax({
			url:AtlasMakerWidget.dbphp,
			type:"POST",
			data: {
				action:"add_log",
				userName:MyLoginWidget.username,
				key:key,
				value:value
		}})
		.done(function(data) {
			def.resolve(data);
		})
		.fail(function() {
			def.reject("Error");
		});
		return def.promise();
	},


	//====================================================================================
	// Configuration
	//====================================================================================
	initAtlasMaker: function(elem) {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("> initAtlasMaker()");
	
		// Create offscreen canvas for mri and atlas
		me.brain_offcn=document.createElement('canvas');
		me.brain_offtx=me.brain_offcn.getContext('2d');
		me.atlas_offcn=document.createElement('canvas');
		me.atlas_offtx=me.atlas_offcn.getContext('2d');

		// Set widget div (create one if none)
		if(elem==undefined) {
			me.container=$("<div class='atlasMaker'>");
			$(document.body).append(me.container);
		}
		else {
			me.container=elem;
			if(me.debug) console.log("Container: ",me.container);
		}
		
		// Init drawing canvas
		me.container.append([
			'<div id="resizable">',
			'	<canvas id="canvas"></canvas>',
			'</div>'
		].join("\n"));
		me.canvas = me.container.find('canvas')[0];
		me.context = me.canvas.getContext('2d');

		// Add div to display slice number
		me.container.find("#resizable").append("<svg id='info'></svg>");
		
		// Add cursor (a small div)
		me.container.append("<div id='cursor'></div>");
		
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
		$.get("templates/tools.html",function(html) {
			me.container.append(html);
			
			// hide or show annotation tools depending on login changes
			if(MyLoginWidget) {
				me.loginChanged();
				MyLoginWidget.subscribe(me.loginChanged);
			}

			// intercept keyboard events
			$(document).keydown(function(e){me.keyDown(e)});

			// configure annotation tools
			me.slider($(".slider#slice"),me.changeSlice);
			me.chose($(".chose#plane"),me.changeView);
			me.chose($(".chose#paintTool"),me.changeTool);
			me.chose($(".chose#penSize"),me.changePenSize);
			me.toggle($(".toggle#precise"),me.togglePreciseCursor);
			me.toggle($(".toggle#fill"),me.toggleFill);
			me.toggle($(".toggle#fullscreen"),me.toggleFullscreen);
			me.push($(".push#3drender"),me.render3D);
			me.push($(".push#link"),me.link);
			me.push($(".push#color"),me.color);
			me.push($(".push#undo"),me.sendUndoMessage);
			me.push($(".push#prev"),me.prevSlice);
			me.push($(".push#next"),me.nextSlice);
			
			if(me.fullscreen==true) { // WARNING: HACK... would be better to implement enter/exit fullscreen
				me.fullscreen=false;
				me.toggleFullscreen();
			}
			
			if(me.User.view!=null) {
				$(".chose#plane .a").removeClass("pressed");
				var view=me.User.view.charAt(0).toUpperCase()+me.User.view.slice(1);
				$(".chose#plane .a:contains('"+view+"')").addClass("pressed");
			}
		})
		.then(
			// Init web socket connection
			me.initSocketConnection
		).then(function() {
			def.resolve()
		});
						
		return def.promise();
	},
	configureAtlasMaker: function (info,index) {
		var me=AtlasMakerWidget;
		if(me.debug)
			console.log("configureAtlasMaker");
		
		// Load segmentation labels
		$.getJSON(info.mri.atlas[index].labels,function(json) {
			me.ontology=json
			me.changePenColor(0);
		});

		var def=$.Deferred();
		me.configureMRI(info,index)
		.then(function() {
			me.sendUserDataMessage("sendAtlas");
			def.resolve();
		});
	},
	configureMRI: function(info,index) {
		var me=AtlasMakerWidget;
		var def=$.Deferred();
		
		console.log("> configureMRI()");
				
		// Get data from AtlasMaker object
		me.name=info.name||"Untitled";
		me.url=info.url;
		me.atlasFilename=info.mri.atlas[index].filename;

		// get local file path from url
		me.User.dirname=me.url; // TEMPORARY
		me.User.mri=info.mri.brain;
		me.User.specimenName=me.name;
		me.User.atlasFilename=info.mri.atlas[index].filename;
		
		// TODO: it's silly to have to put vol dim twice...
		// (first here, once again further down)
		me.User.dim=info.dim;
		me.User.pixdim=info.pixdim;
		
		me.flagLoadingImg={loading:false};
		
		// get volume dimensions
		me.brain_dim=info.dim;
		if(info.pixdim)
			me.brain_pixdim=info.pixdim;
		else
			me.brain_pixdim=[1,1,1];

		return def.resolve().promise();
	},
	loginChanged: function() {
		var me=AtlasMakerWidget;
		if(me.debug) console.log(">loginChanged() to",MyLoginWidget.loggedin);
		if(MyLoginWidget.loggedin) {
			$('body').addClass('loggedIn');
			// Show all controls required to log in
			//$(".loginRequired").css('display','inline-block');
			me.User.username=MyLoginWidget.username;
			// inform the server
			me.sendUserDataMessage("logged in");
		}
		else {
			$('body').removeClass('loggedIn');
			// Hide all controls required to log in
			//$(".loginRequired").css('display','none');
			// inform the server
			me.sendUserDataMessage("logged out");
		}
	},
	slider: function(elem,callback) {
		// Initialise a 'slider' control
		var me=AtlasMakerWidget;
		$(elem).data({
			drag:false,
			val:0,
			max:100
		});
		
		var movex=function(clientX) {
			if ($(elem).data("drag")==true) {
				var R=$("#slice .track")[0].getBoundingClientRect();
				var x=(clientX-R.left)/R.width;
				if(x<0) x=0;
				if(x>1) x=1;
				x=Math.round(x*$("#slice").data("max"));
				if(x!=$("#slice").data("val")) {
					me.changeSlice(x);
				}
			}
		};
		$(document).on("mousemove",function(ev){movex(ev.clientX);});
		$(document).on("touchmove",function(ev){movex(ev.originalEvent.changedTouches[0].pageX);});		
		$(document).on("mouseup touchend",function(){$(elem).data({drag:false})});
		$(elem).on('mousedown touchstart',function(){$(elem).data({drag:true})});
	},
	chose: function(elem,callback) {
		// Initialise a 'chose' control
		var ch=$(elem).find(".a");
		ch.each(function(c,d){
			$(d).click(function(){
				ch.each(function(){$(this).removeClass("pressed")});
				$(this).addClass("pressed");
				if(callback)
					callback($(this).text());
			});
		});
	},
	toggle: function(elem,callback) {
		// Initialise a 'toggle' control
		$(elem).click(function(){
			$(this).hasClass("pressed")?$(this).removeClass("pressed"):$(this).addClass("pressed");
			if(callback)
				callback($(this).hasClass("pressed"));
		});
	},
	push: function(elem,callback) {
		// Initialise a 'push' control
		$(elem).click(function(){
			if(callback)
				callback();
		});
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
