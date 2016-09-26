/**
 * @page AtlasMaker: Image Drawing
 */

var AtlasMakerDraw = {
    /**
     * @function resizeWindow
     */
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
    /**
     * @function configureBrainImage
     */
    configureBrainImage: function configureBrainImage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureBrainImage);if(l)console.log(l);
	
		if(me.User.view==null)
			me.User.view="sag";
			
		var s2v=me.User.s2v;
		switch(me.User.view) {
			case 'sag':	me.brain_W=s2v.sdim[1]; me.brain_H=s2v.sdim[2]; me.brain_D=s2v.sdim[0]; me.brain_Wdim=s2v.wpixdim[1]; me.brain_Hdim=s2v.wpixdim[2]; break; // sagital
			case 'cor':	me.brain_W=s2v.sdim[0]; me.brain_H=s2v.sdim[2]; me.brain_D=s2v.sdim[1]; me.brain_Wdim=s2v.wpixdim[0]; me.brain_Hdim=s2v.wpixdim[2]; break; // coronal
			case 'axi':	me.brain_W=s2v.sdim[0]; me.brain_H=s2v.sdim[1]; me.brain_D=s2v.sdim[2]; me.brain_Wdim=s2v.wpixdim[0]; me.brain_Hdim=s2v.wpixdim[1]; break; // axial
		}

		me.canvas.width=me.brain_W;
		me.canvas.height=me.brain_H*me.brain_Hdim/me.brain_Wdim;
		me.brain_offcn.width=me.brain_W;
		me.brain_offcn.height=me.brain_H;
		me.brain_px=me.brain_offtx.getImageData(0,0,me.brain_offcn.width,me.brain_offcn.height);
		
		if(me.User.slice==null || me.User.slice>=me.brain_D-1)
			me.User.slice=parseInt(me.brain_D/2);

		me.sendUserDataMessage(JSON.stringify({'view':me.User.view,'slice':me.User.slice}));
		
		// configure toolbar slider
		$(".slider#slice").data({max:me.brain_D-1,val:me.User.slice});
		if($("#slice .thumb")[0]) $("#slice .thumb")[0].style.left=(me.User.slice/(me.brain_D-1)*100)+"%";

		me.drawImages();
		
		me.initCursor();
	},
    /**
     * @function configureAtlasImage
     */
    configureAtlasImage: function configureAtlasImage() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(configureAtlasImage);if(l)console.log(l);
	
		// has to be run *after* configureBrainImage
		me.atlas_offcn.width=me.brain_W;
		me.atlas_offcn.height=me.brain_H;
		me.atlas_px=me.atlas_offtx.getImageData(0,0,me.atlas_offcn.width,me.atlas_offcn.height);
	},
    /**
     * @function nearestNeighbour
     */
    nearestNeighbour: function nearestNeighbour(ctx) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(nearestNeighbour,1);if(l)console.log(l);
	
		ctx.imageSmoothingEnabled = false;
		ctx.mozImageSmoothingEnabled = false;
	},
    /**
     * @function computeSegmentedVolume
     */
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
    /**
     * @function displayInformation
     */
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
    /**
     * @function drawImages
     */
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
    /**
     * @function drawAtlasImage
     */
    drawAtlasImage: function drawAtlasImage(view,slice) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(drawAtlasImage,1);if(l)console.log(l);
	
		if(!me.atlas)
			return;

		var	data=me.atlas.data;
		var	dim=me.atlas.dim;
		var	s,val;

		ys=yc=ya=slice;
		for(y=0;y<me.brain_H;y++)
		for(x=0;x<me.brain_W;x++) {
			switch(view) {
				case 'sag':s=[ys,x,me.brain_H-1-y]; break;
				case 'cor':s=[x,yc,me.brain_H-1-y]; break;
				case 'axi':s=[x,me.brain_H-1-y,ya]; break;
			}
			i=me.S2I(s,me.User);

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
	}
};
