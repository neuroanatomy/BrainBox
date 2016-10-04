/**
 * @page AtlasMaker: Painting commands
 */
var AtlasMakerPaint = {
	//====================================================================================
	// Paint functions common to all users
	//====================================================================================
    /**
     * @function paintxy
     */
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
	
		var	dim=me.atlas.dim;
	
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
    /**
     * @function paintvol
     */
	paintvol: function paintvol(voxels) {
		/* this function is exclusively used for undoing */
		var me=AtlasMakerWidget;
		var l=me.traceLog(paintvol);if(l)console.log(l);
	
		var	i,
			ind,			// voxel index
			val;			// voxel delta-value, such that -=val undoes
		for(i=0;i<voxels.length;i++) {
			ind=voxels[i][0];
			val=voxels[i][1];
			
			me.atlas.data[ind]=val;
		}

		me.drawImages();
	},
    /**
     * @function fill
     */
	fill: function fill(x,y,z,val,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(fill);if(l)console.log(l);
	
		var	Q=[],n;
		var	atlas=me.atlas;
		var	dim=atlas.dim;
		var	i;
		var bval=atlas.data[me.slice2index(x,y,z,myView)]; // background-value: value of the voxel where the click occurred
		
		if(bval==val)	// nothing to do
			return;
		
		Q.push({"x":x,"y":y});
		while(Q.length>0) {
			n=Q.pop();
			x=n.x;
			y=n.y;
			if(atlas.data[me.slice2index(x,y,z,myView)]==bval) {
				atlas.data[me.slice2index(x,y,z,myView)]=val;
				if(x-1>=0         && atlas.data[me.slice2index(x-1,y,z,myView)]==bval)
					Q.push({"x":x-1,"y":y});
				if(x+1<me.brain_W && atlas.data[me.slice2index(x+1,y,z,myView)]==bval)
					Q.push({"x":x+1,"y":y});
				if(y-1>=0         && atlas.data[me.slice2index(x,y-1,z,myView)]==bval)
					Q.push({"x":x,"y":y-1});
				if(y+1<me.brain_H && atlas.data[me.slice2index(x,y+1,z,myView)]==bval)
					Q.push({"x":x,"y":y+1});
			}
		}
		me.drawImages();
	},
    /**
     * @function line
     */
	line: function line(x,y,val,usr) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(line,1);if(l)console.log(l);
	
		// Bresenham's line algorithm adapted from
		// http://stackoverflow.com/questions/4672279/bresenham-algorithm-in-javascript

		var	atlas=me.atlas;
		var	dim=atlas.dim;
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
			atlas.data[i]=val;
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
				atlas.data[i]=val;
			}
		}
		me.drawImages();
	},
    /**
     * @function slice2index
     */
	slice2index: function slice2index(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(slice2index,3);if(l)console.log(l);
	
		var	dim=me.atlas.dim;
		var	x,y,z,i;
		switch(myView) {
			case 'sag':	x=mz; y=mx; z=me.brain_H-1-my;break; // sagital
			case 'cor':	x=mx; y=mz; z=me.brain_H-1-my;break; // coronal
			case 'axi':	x=mx; y=me.brain_H-1-my; z=mz;break; // axial
		}
/*
	TRANSFORM SCREEN SPACE INTO VOXEL INDEX
*/
		var s=[x,y,z];
		i=me.S2I(s,me.User);
		/*
		i=z*dim[1]*dim[0]+y*dim[0]+x;
		*/
		return i;
	},
    /**
     * @function slice2xyzi
     */
	slice2xyzi: function slice2xyzi(mx,my,mz,myView) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(slice2xyzi,1);if(l)console.log(l);
	
		var	dim=me.atlas.dim;
		var	x,y,z,i;
		switch(myView) {
			case 'sag':	x=mz; y=mx; z=me.brain_H-1-my;break; // sagital
			case 'cor':	x=mx; y=mz; z=me.brain_H-1-my;break; // coronal
			case 'axi':	x=mx; y=me.brain_H-1-my; z=mz;break; // axial
		}
/*
	TRANSFORM SCREEN SPACE INTO VOXEL INDEX
*/
		var s=[x,y,z];
		i=me.S2I(s,me.User);
		/*
		i=z*dim[1]*dim[0]+y*dim[0]+x;
		*/
		return [x,y,z,i];	
	}
};
