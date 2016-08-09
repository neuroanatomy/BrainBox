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
	alphaLevel:		0.5,
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
	version:	1, // version of the configuration file (slice number, plane, etc). Default=1

	traceLog: function traceLog(f,l) {
		var me=AtlasMakerWidget;
		if(l==undefined || me.debug>l)
			return "am> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root");
	},
	
	//========================================================================================
	// Local user interaction
	//========================================================================================
	changeView: function changeView(theView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(changeView);if(l)console.log(l);
	
		switch(theView) {
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
	changeTool: function changeTool(theTool) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(changeTool);if(l)console.log(l);
	
		if(theTool.toLowerCase()==me.User.tool)
			return;
		
		switch(theTool) {
			case 'Paint':
				me.User.tool='paint';
				break;
			case 'Erase':
				me.User.tool='erase';
				break;
			case 'Measure':
				me.User.tool='measure';
				break;
			case 'Adjust':
				me.User.tool='adjust';
				if($("#adjust").length==0) {
					$.get("/templates/adjust.html",function(html) {
						me.container.find("#resizable").append(html);
					});
				}
				break;
		}
		me.sendUserDataMessage("change tool");
		me.User.measureLength=null;
	},
	changePenSize: function changePenSize(theSize) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(changePenSize);if(l)console.log(l);
	
		me.User.penSize=parseInt(theSize);
		me.sendUserDataMessage("change pen size");
	},
	changeSlice: function changeSlice(x) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(changeSlice,1);if(l)console.log(l);

		console.log("to",x);

		var max=$("#slice").data("max");
		$("#slice").data("val",x);
		$("#slice .thumb")[0].style.left=(x*100/max)+"%";
	
		me.User.slice=x;
		//me.sendUserDataMessage("change slice");

		me.drawImages();
	},
	prevSlice: function prevSlice() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(prevSlice,1);if(l)console.log(l);

		var x=$("#slice").data("val")-1;
		if(x<0) x=0;
		x=Math.round(x);
		if(x!=$("#slice").data("val")) {
			$("#slice").data("val",x);
			me.changeSlice(x);
		}
	},
	nextSlice: function nextSlice() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(nextSlice,1);if(l)console.log(l);

		var max=$("#slice").data("max");
		var x=$("#slice").data("val")+1;
		if(x>max) x=max;
		x=Math.round(x);
		if(x!=$("#slice").data("val")) {
			$("#slice").data("val",x);
			me.changeSlice(x);
		}
	},
	toggleFill: function toggleFill(x) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(toggleFill);if(l)console.log(l);
	
		me.User.doFill=x;
		me.sendUserDataMessage("toggle fill");
	},
	toggleChat: function toggleChat() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(toggleChat);if(l)console.log(l);
	
		$("#chatBlock").toggle();
	},
	toggleFullscreen: function toggleFullscreen() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(toggleFullscreen);if(l)console.log(l);

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
			$("#atlasMaker").detach().appendTo('#stereotaxic');
			//    me.editMode=0;
			me.resizeWindow();

			me.fullscreen=false;
		}
	},
	render3D: function render3D() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(render3D);if(l)console.log(l);
		
		// puts a fresh version of the segmentation in localStorage
		localStorage.brainbox=URL.createObjectURL(new Blob([me.encodeNifti()]));
		
		// opens 3d render window
		window.open("/templates/surface.html?path="+me.User.dirname+me.User.atlasFilename,"_blank");
	},
	link: function link() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(link);if(l)console.log(l);
		window.prompt("Copy to clipboard:", location.href+"&view="+AtlasMakerWidget.User.view+"&slice="+AtlasMakerWidget.User.slice);
	},
	upload: function upload() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(upload);if(l)console.log(l);
		
		var inp=$("<input>");
		inp.hide();
		$("body").append(inp);
		var input=inp.get(0);
		input.type="file";
		input.onchange=function from_upload(e){
			var name=this.files[0];
			var reader = new FileReader();
			reader.onload = function from_upload(e) {
				var result=e.target.result;
				var nii;
				if(name.name.split('.').pop()=="gz") {
					var inflate=new pako.Inflate();
					inflate.push(new Uint8Array(result),true);
					nii=inflate.result.buffer;
				}
				else
					nii=result;
				var mri=me.loadNifti(nii);

				if(	mri.dim[0]!=me.User.dim[0] ||
					mri.dim[1]!=me.User.dim[1] ||
					mri.dim[2]!=me.User.dim[2]) {
					console.log("ERROR: Volume dimensions do not match");
					return;
				}
				
				// copy uploaded data to atlas data
				var i;
				for(i=0;i<me.atlas.data.length;i++)
					me.atlas.data[i]=mri.data[i];
				
				// send uploaded data to server (compressed)
				me.socket.binaryType="arraybuffer";
				me.socket.send(pako.deflate(mri.data));
				me.socket.binaryType="blob";
				
				// redraw images
				me.drawImages();
			}
			reader.readAsArrayBuffer(name);
			inp.remove();
		}
		input.click();
	},
	download: function download() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(download);if(l)console.log(l);
			
		var a = document.createElement('a');
		var niigz=me.encodeNifti();
		var niigzBlob = new Blob([niigz]);
		a.href=window.URL.createObjectURL(niigzBlob);
		a.download=me.atlasName+".nii.gz";
		document.body.appendChild(a);
		a.click();
	},
	color: function color() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(color);if(l)console.log(l);
		
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
	changePenColor: function changePenColor(index) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(changePenColor);if(l)console.log(l);
		
		var c=me.ontology.labels[index].color;
		$("#color").css({backgroundColor:'rgb('+c[0]+','+c[1]+','+c[2]+')'});
		me.User.penValue=me.ontology.labels[index].value;
	},
	ontologyValueToColor: function ontologyValueToColor(val) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(ontologyValueToColor,3);if(l)console.log(l);

		var c=[0,0,0];
		var i;
		if(val in me.ontology.valueToIndex)
			i=me.ontology.valueToIndex[val];
		if(i!=undefined) {
			c=me.ontology.labels[i].color;
		} else if(val) {
			c=[255,0,0]; // unavailable labels are set to pure red
		}
		return c;
	},
	togglePreciseCursor: function togglePreciseCursor() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(togglePreciseCursor);if(l)console.log(l);
	
		me.flagUsePreciseCursor=!me.flagUsePreciseCursor;
		me.initCursor();
	},
	resizeWindow: function resizeWindow() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(resizeWindow,1);if(l)console.log(l);

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
	},
	encodeNifti: function encodeNifti() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(encodeNifti);if(l)console.log(l);
	
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
		dv.setInt16(70,datatype,true);
		dv.setInt16(72,8,true);			// bits per voxel
//		dv.setInt16(72,datatype,true);
//		dv.setInt16(74,8,true);			// bits per voxel
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
	saveNifti: function saveNifti() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(saveNifti);if(l)console.log(l);
	
		var niigz=me.encodeNifti();
		var niigzBlob = new Blob([niigz]);
	
		$("a#download_atlas").attr("href",window.URL.createObjectURL(niigzBlob));
		$("a#download_atlas").attr("download",me.User.atlasFilename);
	},
	loadNifti: function loadNifti(nii) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(loadNifti,1);if(l)console.log(l);

		var	dv=new DataView(nii);
		var	vox_offset=352;
		var	sizeof_hdr=dv.getInt32(0,true);
		var	dimensions=dv.getInt16(40,true);
	
		var mri={};
		mri.hdr=nii.slice(0,vox_offset);
		mri.dim=[];
		mri.dim[0]=dv.getInt16(42,true);
		mri.dim[1]=dv.getInt16(44,true);
		mri.dim[2]=dv.getInt16(46,true);
		mri.datatype=dv.getInt16(70,true);
		mri.pixdim=[];
		mri.pixdim[0]=dv.getFloat32(80,true);
		mri.pixdim[1]=dv.getFloat32(84,true);
		mri.pixdim[2]=dv.getFloat32(88,true);
		vox_offset=dv.getFloat32(108,true);	
		switch(mri.datatype)
		{
			case 2: // UCHAR
				mri.data=new Uint8Array(nii,vox_offset);
				break;
			case 4: // SHORT
				mri.data=new Int16Array(nii,vox_offset);
				break;
			case 8:  // INT
				mri.data=new Int32Array(nii,vox_offset);
				break;
			case 16: // FLOAT
				mri.data=new Float32Array(nii,vox_offset);
				break;
			default:
				console.log("ERROR: Unknown dataType: "+mri.datatype);
		}
	
		return mri;
	},
	configureBrainImage: function configureBrainImage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureBrainImage);if(l)console.log(l);
	
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
		if($("#slice .thumb")[0]) $("#slice .thumb")[0].style.left=(me.User.slice/me.brain_D*100)+"%";

		me.drawImages();
		
		me.initCursor();
	},
	configureAtlasImage: function configureAtlasImage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureAtlasImage);if(l)console.log(l);
	
		// has to be run *after* configureBrainImage
		me.atlas_offcn.width=me.brain_W;
		me.atlas_offcn.height=me.brain_H;
		me.atlas_px=me.atlas_offtx.getImageData(0,0,me.atlas_offcn.width,me.atlas_offcn.height);
	},
	nearestNeighbour: function nearestNeighbour(ctx) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(nearestNeighbour,1);if(l)console.log(l);
	
		ctx.imageSmoothingEnabled = false;
		ctx.mozImageSmoothingEnabled = false;
	},
	computeSegmentedVolume: function computeSegmentedVolume() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(computeSegmentedVolume,1);if(l)console.log(l);

		var i,sum=0;
		var	data=me.atlas.data;
		var	dim=me.atlas.dim;

		for(i=0;i<dim[0]*dim[1]*dim[2];i++) {
			if(data[i]>0)
				sum++;
		}
		return sum*me.User.pixdim[0]*me.User.pixdim[1]*me.User.pixdim[2];
	},
	displayInformation: function displayInformation() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(displayInformation,1);if(l)console.log(l);
			
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
	drawImages: function drawImages() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(drawImages,1);if(l)console.log(l);
	
		if(me.brain_img.img) {
			me.context.clearRect(0,0,me.context.canvas.width,me.canvas.height);
			me.displayInformation();

			me.nearestNeighbour(me.context);
			me.context.drawImage(me.brain_img.img,0,0,me.brain_W,me.brain_H*me.brain_Hdim/me.brain_Wdim);

			me.drawAtlasImage(me.flagLoadingImg.view,me.flagLoadingImg.slice);
		}

		if(!me.brain_img.img || me.brain_img.view!=me.User.view || me.brain_img.slice!=me.User.slice) {
			me.sendRequestSliceMessage();
		}
	},
	drawAtlasImage: function drawAtlasImage(view,slice) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(drawAtlasImage,1);if(l)console.log(l);
	
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
			
			var c=me.ontologyValueToColor(data[i]);
			var alpha=(data[i]>0)?255:0;
			i=(y*me.atlas_offcn.width+x)*4;
			me.atlas_px.data[ i ]  =c[0];
			me.atlas_px.data[ i+1 ]=c[1];
			me.atlas_px.data[ i+2 ]=c[2];
			me.atlas_px.data[ i+3 ]=alpha*me.alphaLevel;
		}
		me.atlas_offtx.putImageData(me.atlas_px, 0, 0);

		me.nearestNeighbour(me.context);
		me.context.drawImage(me.atlas_offcn,0,0,me.brain_W,me.brain_H*me.brain_Hdim/me.brain_Wdim);
	},
	mousedown: function mousedown(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(mousedown);if(l)console.log(l);
	
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
	mousemove: function mousemove(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(mousemove,2);if(l)console.log(l);
	
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
	mouseup: function mouseup(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(mouseup);if(l)console.log(l);
	
		me.up(e);
	},
	touchstart: function touchstart(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(touchstart);if(l)console.log(l);
	
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
	touchmove: function touchmove(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(touchmove,2);if(l)console.log(l);
		
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
	touchend: function touchend(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(touchend);if(l)console.log(l);
		
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
	initCursor: function initCursor() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(initCursor,1);if(l)console.log(l);

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
	updateCursor: function updateCursor() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(updateCursor,1);if(l)console.log(l);

		$("#finger").removeClass("move draw configure");
		switch(me.Crsr.state) {
			case "move": $("#finger").addClass("move");	break;
			case "draw": $("#finger").addClass("draw");	break;
			case "configure": $("#finger").addClass("configure");	break;
		}
		//$("#msg").html(C.state);
		//console.log(Crsr.state);
	},
	down: function down(x,y) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(down,2);if(l)console.log(l);
	
		/*
		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;
		*/
	
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
			case 'adjust':
				me.User.mouseIsDown = true;
				me.info.x=x/me.brain_W;
				me.info.y=1-y/me.brain_H;
				break;
		}
	
		// init annotation length counter
		me.annotationLength=0;
	},
	move: function move(x,y) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(move,2);if(l)console.log(l);
	
		/*
		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;
		*/

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
			case 'adjust':
				me.info.x=x/me.brain_W;
				me.info.y=1-y/me.brain_H;
				me.drawImages();
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
	up: function up(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(up,2);if(l)console.log(l);

		/*
		if(MyLoginWidget.loggedin==0 || me.editMode==0)
			return;
		*/

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
	keyDown: function keyDown(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(keyDown,2);if(l)console.log(l);
	
		// console.log("key:",e.which);
		
		if(e.target.tagName!="BODY")
			return;
	
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
	paintxy: function paintxy(u,c,x,y,usr) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(paintxy,1);if(l)console.log(l);
	
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
	paintvol: function paintvol(voxels) {
		/* this function is exclusively used for undoing */
		var me=AtlasMakerWidget;
		var l=me.traceLog(paintvol);if(l)console.log(l);
	
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
	fill: function fill(x,y,z,val,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(fill);if(l)console.log(l);
	
		var	Q=[],n;
		var	layer=me.atlas;
		var	dim=layer.dim;
		var	i;
		var bval=layer.data[me.slice2index(x,y,z,myView)]; // background-value: value of the voxel where the click occurred
		
		if(bval==val)	// nothing to do
			return;
		
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
	line: function line(x,y,val,usr) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(line,1);if(l)console.log(l);
	
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
	slice2index: function slice2index(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(slice2index,3);if(l)console.log(l);
	
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
	slice2xyzi: function slice2xyzi(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(slice2xyzi,1);if(l)console.log(l);
	
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
	xyz2slice: function xyz2slice(x,y,z,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(xyz2slice);if(l)console.log(l);
	
		var	mx,my,mz;
		switch(myView) {
			case 'sag':	mz=x; mx=y; my=z;break; // sagital
			case 'cor':	mx=x; mz=y; my=z;break; // coronal
			case 'axi':	mx=x; my=y; mz=z;break; // axial
		}	
		return new Object({"x":x,"y":y,"z":z});	
	},

	//====================================================================================
	// Web sockets
	//====================================================================================
	createSocket: function createSocket(host) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(createSocket);if(l)console.log(l);
	
		var ws;

		if (window.WebSocket) {
			ws=new WebSocket(host);
		} else if (window.MozWebSocket) {
			ws=new MozWebSocket(host);
		}

		return ws;
	},
	initSocketConnection: function initSocketConnection() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(initSocketConnection);if(l)console.log(l);
			
		var def=$.Deferred();
	
		// WS connection
		var host = "ws://" + window.location.hostname + ":8080/";
		
		if(me.debug)
			console.log("[initSocketConnection] host:",host);
		me.progress.html("Connecting...");
		
		try {
			me.socket = me.createSocket(host);
			
			me.socket.onopen = function(msg) {
				if(me.debug)
					console.log("[initSocketConnection] connection open",msg);
				me.progress.html("<img src='/img/download.svg' style='vertical-align:middle'/>MRI");
				$("#chat").text("Chat (1 connected)");
				me.flagConnected=1;
				def.resolve();
			};
			
			me.socket.onmessage = me.receiveSocketMessage;
			
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
	receiveSocketMessage: function receiveSocketMessage(msg) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveSocketMessage,1);if(l)console.log(l);

		// Message: atlas data initialisation
		if(msg.data instanceof Blob) {
			if(me.debug>1) console.log("received binary blob",msg.data.size,"bytes long");
			var fileReader = new FileReader();
			fileReader.onload = function from_receiveSocketMessage() {
				var data=new Uint8Array(this.result);
				var sz=data.length;
				var ext=String.fromCharCode(data[sz-8],data[sz-7],data[sz-6]);

				if(me.debug>1) console.log("type: "+ext);
				
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
						img.onload=function from_initSocketConnection(){
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
		if(me.debug) console.log("message: "+data.type);
	
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
	},
	sendUserDataMessage: function sendUserDataMessage(description) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendUserDataMessage,1);if(l)console.log(l);

		if(me.flagConnected==0)
			return;

		if(me.debug>1) console.log("message: "+description);
		
		var msg={"type":"intro","user":me.User,"description":description};
		try {
			me.socket.send(JSON.stringify(msg));
		} catch (ex) {
			console.log("ERROR: Unable to sendUserDataMessage",ex);
		}
	},
	receiveUserDataMessage: function receiveUserDataMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveUserDataMessage);if(l)console.log(l);

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
	sendChatMessage: function sendChatMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendChatMessage);if(l)console.log(l);
	
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
	receiveChatMessage: function receiveChatMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveChatMessage);if(l)console.log(l);
	
		var	theView=me.Collab[data.uid].view;
		var	theSlice=me.Collab[data.uid].slice;
		var theUsername=data.username;
		var	msg="<b>"+theUsername+" ("+theView+" "+theSlice+"): </b>"+data.msg+"<br />"
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	sendPaintMessage: function sendPaintMessage(msg) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendPaintMessage,1);if(l)console.log(l);
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:msg}));
		} catch (ex) {
			console.log("ERROR: Unable to sendPaintMessage",ex);
		}
	},
	receivePaintMessage: function receivePaintMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receivePaintMessage);if(l)console.log(l);
	
		var	msg=data.data;
		var u=data.uid;	// user
		var c=msg.c;	// command
		var x=parseInt(msg.x);	// x coordinate
		var y=parseInt(msg.y);	// y coordinate

		me.paintxy(u,c,x,y,me.Collab[u]);
	},
	receivePaintVolumeMessage: function receivePaintVolumeMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receivePaintVolumeMessage);if(l)console.log(l);
	
		var	i,ind,val,voxels;
	
		voxels=data.data;
		me.paintvol(voxels.data);
	},
	sendUndoMessage: function sendUndoMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendUndoMessage);if(l)console.log(l);
	
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"paint",data:{c:"u"}}));
		} catch (ex) {
			console.log("ERROR: Unable to sendUndoMessage",ex);
		}
	},
	sendRequestSliceMessage: function sendRequestSliceMessage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendRequestSliceMessage,1);if(l)console.log(l);

		if(me.flagConnected==0)
			return;
		if(me.flagLoadingImg.loading==true)
			return;
		try {
			me.socket.send(JSON.stringify({
				type:"requestSlice",
				view:me.User.view,
				slice:me.User.slice
			}));
			me.flagLoadingImg.loading=true;
			me.flagLoadingImg.view=me.User.view;
			me.flagLoadingImg.slice=me.User.slice;

		} catch (ex) {
			console.log("ERROR: Unable to sendRequestSliceMessage",ex);
		}
	},
	sendSaveMetadataMessage: function sendSaveMetadataMessage(info) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(sendSaveMetadataMessage,1);if(l)console.log(l);
			
		if(me.flagConnected==0)
			return;
		try {
			me.socket.send(JSON.stringify({type:"saveMetadata",metadata:info}));
		} catch (ex) {
			console.log("ERROR: Unable to sendSaveMetadataMessage",ex);
		}
	},
	receiveDisconnectMessage: function receiveDisconnectMessage(data) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(receiveDisconnectMessage);if(l)console.log(l);

		var u=data.uid;	// user
		//var	msg="<b>"+me.Collab[u].username+"</b> left atlas "+me.Collab[u].specimenName+"/"+me.Collab[u].atlasFilename+"<br />"
		var	msg="<b>"+me.Collab[u].username+"</b> left<br />"
		me.Collab.splice(u,1);
		var	v,nusers=1; for(v in me.Collab) nusers++;
		$("#chat").text("Chat ("+nusers+" connected)");
		$("#log").append(msg);
		$("#log").scrollTop($("#log")[0].scrollHeight);
	},
	onkey: function onkey(e) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(onkey);if(l)console.log(l);
	
		if (e.keyCode == 13) {
			me.sendChatMessage();
		}
	},
	quit: function quit() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(quit);if(l)console.log(l);
	
		me.log("","Goodbye!");
		me.socket.close();
		me.socket = null;
	},
	//==========
	// Database
	//==========
	logToDatabase: function logToDatabase(key,value) {
		var def=$.Deferred();
		var me=AtlasMakerWidget;
		var l=me.traceLog(logToDatabase,1);if(l)console.log(l);
		$.ajax({
			url:"/api/log",
			type:"POST",
			data: {
				username:me.User.username,
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
	initAtlasMaker: function initAtlasMaker(elem) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(initAtlasMaker);if(l)console.log(l);
	
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
		me.container.find("#resizable").append("<div id='cursor'></div>");
		
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
		})
		.then(function from_initAtlasMaker() {
			// Init web socket connection
			return me.initSocketConnection();
		}).then(function() {
			def.resolve()
		});
						
		return def.promise();
	},
	configureAtlasMaker: function configureAtlasMaker(info,index) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureAtlasMaker);if(l)console.log(l);
		
		// Load segmentation labels
		return $.getJSON(info.mri.atlas[index].labels,function from_configureAtlasMaker(d){me.configureOntology(d);})
		.then(function from_configureAtlasMaker() {
			var def=$.Deferred();
			me.configureMRI(info,index)
			.then(function from_configureAtlasMaker() {

				if(me.fullscreen==true) { // WARNING: HACK... would be better to implement enter/exit fullscreen
					me.fullscreen=false;
					me.toggleFullscreen();
				}
			
				if(me.User.view!=null) {
					$(".chose#plane .a").find(".pressed").removeClass("pressed");
					var view=me.User.view.charAt(0).toUpperCase()+me.User.view.slice(1);
					$(".chose#plane .a:contains('"+view+"')").addClass("pressed");
				}

				me.sendUserDataMessage();

				console.log("sendAtlas");
				me.sendUserDataMessage("sendAtlas");
				def.resolve();
			});
			return def.promise();
		});
	},
	configureOntology: function configureOntology(json) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureOntology);if(l)console.log(l);

		me.ontology=json
		me.ontology.valueToIndex=[];
		me.ontology.labels.forEach(function(o,i){me.ontology.valueToIndex[o.value]=i});
		me.changePenColor(0);
	},
	configureMRI: function configureMRI(info,index) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureMRI);if(l)console.log(l);

		var def=$.Deferred();
				
		// Get data from AtlasMaker object
		me.name=info.name||"Untitled";
		me.url=info.url;
		me.atlasFilename=info.mri.atlas[index].filename;
		me.atlasName=info.mri.atlas[index].name;

		// get local file path from url
		me.User.dirname=me.url; // TEMPORARY
		me.User.mri=info.mri.brain;
		me.User.specimenName=me.name;
		me.User.atlasFilename=info.mri.atlas[index].filename;
		me.User.isMRILoaded=false;
		
		// TODO: it's silly to have to put vol dim twice...
		// (first here, once again further down)
		me.User.dim=info.dim;
		me.User.pixdim=info.pixdim;
		
		me.flagLoadingImg={loading:false};
		
		me.brain_img.img=null;
		
		// get volume dimensions
		me.brain_dim=info.dim;
		if(info.pixdim)
			me.brain_pixdim=info.pixdim;
		else
			me.brain_pixdim=[1,1,1];

		return def.resolve().promise();
	},
	slider: function slider(elem,callback) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(slider,2);if(l)console.log(l);
		
		// Initialise a 'slider' control

		$(elem).data({
			drag:false,
			val:0,
			max:100
		});
		
		var movex=function(el,clientX) {
			if ($(el).data("drag")==true) {
				var R=$(el).find(".track")[0].getBoundingClientRect();
				var x=(clientX-R.left)/R.width;
				if(x<0) x=0;
				if(x>1) x=1;
				x=x*$(el).data("max");
				if(x!=$(el).data("val")) {
					callback(x);
				}
			}
		};
		$(document).on("mousemove",function from_slider(ev){movex(elem,ev.clientX);});
		$(document).on("touchmove",function from_slider(ev){movex(elem,ev.originalEvent.changedTouches[0].pageX);});		
		$(document).on("mouseup touchend",function from_slider(){$(elem).data({drag:false})});
		$(elem).on('mousedown touchstart',function from_slider(){$(elem).data({drag:true})});
	},
	chose: function chose(elem,callback) {
		// Initialise a 'chose' control
		var ch=$(elem).find(".a");
		ch.each(function(c,d){
			$(d).click(function(){
				if($(this).hasClass("pressed")) {
					callback($(this).attr('title'));
					return;
				}
				ch.each(function(){$(this).removeClass("pressed")});
				$(this).addClass("pressed");
				if(callback)
					callback($(this).attr('title'));
			});
		});
	},
	toggle: function toggle(elem,callback) {
		// Initialise a 'toggle' control
		$(elem).click(function(){
			$(this).hasClass("pressed")?$(this).removeClass("pressed"):$(this).addClass("pressed");
			if(callback)
				callback($(this).hasClass("pressed"));
		});
	},
	push: function push(elem,callback) {
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
