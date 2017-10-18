const fs = require('fs');
const zlib = require('zlib');
const fileType = require('file-type');

const MRILoader = function () {

/*
Var loadNifti = function(nii) {
	var	vox_offset=352;
	var	sizeof_hdr=nii.readUInt32LE(0);
	var	dimensions=nii.readUInt16LE(40);

	var mri={};
	mri.hdr=nii.slice(0,vox_offset);
	mri.dim=[];
	mri.dim[0]=nii.readUInt16LE(42);
	mri.dim[1]=nii.readUInt16LE(44);
	mri.dim[2]=nii.readUInt16LE(46);
	mri.datatype=nii.readUInt16LE(70);
	mri.pixdim=[];
	mri.pixdim[0]=nii.readFloatLE(80);
	mri.pixdim[1]=nii.readFloatLE(84);
	mri.pixdim[2]=nii.readFloatLE(88);
	vox_offset=nii.readFloatLE(108);

	var tmp;
	switch(mri.datatype) {
		case 2: // UCHAR
			mri.data=nii.slice(vox_offset);
			break;
		case 4: // SHORT
			tmp=nii.slice(vox_offset);
			mri.data=new Int16Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(var j=0;j<mri.dim[0]*mri.dim[1]*mri.dim[2];j++)
				mri.data[j]=tmp.readInt16LE(j*2);
			break;
		case 8: // INT
			tmp=nii.slice(vox_offset);
			mri.data=new Uint32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(var k=0;k<mri.dim[0]*mri.dim[1]*mri.dim[2];k++)
				mri.data[k]=tmp.readUInt32LE(k*4);
			break;
		case 16: // FLOAT
			tmp=nii.slice(vox_offset);
			mri.data=new Float32Array(mri.dim[0]*mri.dim[1]*mri.dim[2]);
			for(var l=0;l<mri.dim[0]*mri.dim[1]*mri.dim[2];l++)
				mri.data[l]=tmp.readFloatLE(l*4);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+mri.datatype);
	}

	return mri;
}

var loadBrainNifti = function(nii,callback) {

	var brain=loadNifti(nii);

	var i,sum=0,min,max;
	min=brain.data[0];
	max=min;
	for(i=0;i<brain.dim[0]*brain.dim[1]*brain.dim[2];i++) {
		sum+=brain.data[i];

		if(brain.data[i]<min) min=brain.data[i];
		if(brain.data[i]>max) max=brain.data[i];
	}
	brain.sum=sum;
	brain.min=min;
	brain.max=max;

	callback(brain);
}

var loadBrainMGZ = function(data,callback) {
	var hdr_sz=284;
	var brain={};
	var datatype;

	brain.dim=[];
	brain.dim[0]=data.readInt32BE(4);
	brain.dim[1]=data.readInt32BE(8);
	brain.dim[2]=data.readInt32BE(12);
	datatype=data.readInt32BE(20);
	brain.pixdim=[];
	brain.pixdim[0]=data.readFloatBE(30);
	brain.pixdim[1]=data.readFloatBE(34);
	brain.pixdim[2]=data.readFloatBE(38);

	var tmp
	switch(datatype) {
		case 0: // MGHUCHAR
			brain.data=data.slice(hdr_sz);
			break;
		case 1: // MGHINT
			tmp=data.slice(hdr_sz);
			brain.data=new Uint32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(var j=0;j<brain.dim[0]*brain.dim[1]*brain.dim[2];j++)
				brain.data[j]=tmp.readUInt32BE(j*4);
			break;
		case 3: // MGHFLOAT
			tmp=data.slice(hdr_sz);
			brain.data=new Float32Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(var k=0;k<brain.dim[0]*brain.dim[1]*brain.dim[2];k++)
				brain.data[k]=tmp.readFloatBE(k*4);
			break;
		case 4: // MGHSHORT
			tmp=data.slice(hdr_sz);
			brain.data=new Int16Array(brain.dim[0]*brain.dim[1]*brain.dim[2]);
			for(var l=0;l<brain.dim[0]*brain.dim[1]*brain.dim[2];l++)
				brain.data[l]=tmp.readInt16BE(l*2);
			break;
		default:
			console.log("ERROR: Unknown dataType: "+datatype);
	}
	var i,sum=0,min,max;
	min=brain.data[0];
	max=min;
	for(i=0;i<brain.dim[0]*brain.dim[1]*brain.dim[2];i++) {
		sum+=brain.data[i];

		if(brain.data[i]<min) min=brain.data[i];
		if(brain.data[i]>max) max=brain.data[i];
	}
	brain.sum=sum;
	brain.min=min;
	brain.max=max;
	callback(brain);
}

this.loadBrain = function(path,callback) {
	if(!fs.existsSync(path)) {
		console.log("ERROR: File does not exist:",path);					//modify call error object
		return;
	} else {
		var datagz;
		try {
			datagz=fs.readFileSync(path);
			var ft=fileType(datagz);
			var ext=path.split('.').pop();

			switch(ft.ext) {
				case 'gz': {
					switch(ext) {
						case 'gz':
								zlib.gunzip(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainNifti(nii,callback)});		//modify call error object
							break;
						case 'mgz':
								zlib.gunzip(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainMGZ(nii,callback)});		//modify call error object
							break;
					}
					break;
				}
				case 'zip':
					zlib.inflate(datagz,function(err,nii){if(err) console.log("ERROR:",err);loadBrainNifti(nii,callback)});		//modify call error object
					break;
				default:
					switch(ext) {
						case 'nii':
							loadBrainNifti(datagz,callback);
							break;
						case 'mgh':
							loadBrainMGZ(datagz, callback);
							break;
					}
					break;						//modify call error object
			}
		} catch(e) {
			console.log(new Date(),"ERROR: Cannot read brain data");		//modify call error object
		}
	}
	return null;
}
*/

};

module.exports = new MRILoader();
