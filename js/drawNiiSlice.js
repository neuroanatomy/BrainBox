/*
	drawNiiSlice.js opens a nii file and writes to stdout a specific slice
	Arguments are:
	1: nii file
	2: view, either sag, cor or axi
	3: slice index (an integer value, starting from 0)
	4: name of the resulting image, for example image.jpg
*/

var os=require("os");
var fs=require("fs");
var zlib=require("zlib");

// jpeg-js library: https://github.com/eugeneware/jpeg-js
var jpeg=require('jpeg-js');

//console.log(process.argv);

var	path=__dirname+"/"+process.argv[2];
var view=process.argv[3];
var slice=parseInt(process.argv[4]);
//var result=process.argv[5];

var brain={};
var datatype=2;
var	vox_offset=352;

loadNifti();

function loadNifti() {
	if(!fs.existsSync(path)) {
		console.log("ERROR: File does not exist");
		return;
	} else {
		var niigz;
		try {
			niigz=fs.readFileSync(path);
			zlib.gunzip(niigz,function(err,nii) {
				var	sizeof_hdr=nii.readUInt32LE(0);
				var	dimensions=nii.readUInt16LE(40);
				brain.hdr=nii.slice(0,vox_offset);
				brain.dim=[];
				brain.dim[0]=nii.readUInt16LE(42);
				brain.dim[1]=nii.readUInt16LE(44);
				brain.dim[2]=nii.readUInt16LE(46);
				datatype=nii.readUInt16LE(72);
				brain.pixdim=[];
				brain.pixdim[0]=nii.readFloatLE(80);
				brain.pixdim[1]=nii.readFloatLE(84);
				brain.pixdim[2]=nii.readFloatLE(88);
				vox_offset=nii.readFloatLE(108);

				brain.data=nii.slice(vox_offset);

				var i,sum=0;
				for(i=0;i<brain.dim[0]*brain.dim[1]*brain.dim[2];i++)
					sum+=brain.data[i];
				brain.sum=sum;

/*
				console.log(new Date());
				console.log("size",brain.data.length);
				console.log("dim",brain.dim);
				console.log("pixdim",brain.pixdim);
				console.log("datatype",datatype);
				console.log("vox_offset",vox_offset);
				console.log("free memory",os.freemem());
*/				
				drawSlice(brain);
			});
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot read brain data");
		}
	}
}

function drawSlice(brain) {
	var x,y,i,j;
	var brain_W, brain_H;
	var brain_Wdim,brain_Hdim;
	var ys,ya,yc;
	
	switch(view)
	{	case 'sag':	brain_W=brain.dim[1]; brain_H=brain.dim[2]; brain_D=brain.dim[0]; break; // sagital
		case 'cor':	brain_W=brain.dim[0]; brain_H=brain.dim[2]; brain_D=brain.dim[1]; break; // coronal
		case 'axi':	brain_W=brain.dim[0]; brain_H=brain.dim[1]; brain_D=brain.dim[2]; break; // axial
	}
	
	var frameData = new Buffer(brain_W * brain_H * 4);

	j=0;
	ys=yc=ya=slice;
	for(y=0;y<brain_H;y++)
	for(x=0;x<brain_W;x++)
	{
		switch(view)
		{	case 'sag':i= y*brain.dim[1]*brain.dim[0]+ x*brain.dim[0]+ys; break;
			case 'cor':i= y*brain.dim[1]*brain.dim[0]+yc*brain.dim[0]+x; break;
			case 'axi':i=ya*brain.dim[1]*brain.dim[0]+ y*brain.dim[0]+x; break;
		}
	  frameData[4*j+0] = brain.data[i]; // red
	  frameData[4*j+1] = brain.data[i]; // green
	  frameData[4*j+2] = brain.data[i]; // blue
	  frameData[4*j+3] = 0xFF; // alpha - ignored in JPEGs
	  j++;
	}

	var rawImageData = {
	  data: frameData,
	  width: brain_W,
	  height: brain_H
	};
	var jpegImageData = jpeg.encode(rawImageData, 50);
	process.stdout.write(jpegImageData.data);
}
