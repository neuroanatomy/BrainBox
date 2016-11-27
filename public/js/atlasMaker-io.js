/**
 * @page AtlasMaker: Input/Output
 */
var AtlasMakerIO = {
    /**
     * @function encodeNifti
     */
	encodeNifti: function encodeNifti() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(encodeNifti);if(l)console.log.apply(undefined,l);
	
		var	sizeof_hdr=348;
		var	dimensions=4;			// number of dimension values provided
		var	spacetimeunits=2+8;		// 2=nifti code for millimetres | 8=nifti code for seconds
		var	datatype=2;				// datatype for 8 bits (DT_UCHAR8 in nifti or UCHAR in analyze)
		var	voxel_offset=352;
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
    /**
     * @function saveNifti
     */
	saveNifti: function saveNifti() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(saveNifti);if(l)console.log.apply(undefined,l);
	
		var niigz=me.encodeNifti();
		var niigzBlob = new Blob([niigz]);
	
		$("a#download_atlas").attr("href",window.URL.createObjectURL(niigzBlob));
		$("a#download_atlas").attr("download",me.User.atlasFilename);
	},
    /**
     * @function loadNifti
     */
	loadNifti: function loadNifti(nii) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(loadNifti,1);if(l)console.log.apply(undefined,l);

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
	/*
		{Linear algebra
	*/
    /**
     * @function computeS2VTransformation
     */
	computeS2VTransformation: function computeS2VTransformation() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(computeS2VTransformation);if(l)console.log.apply(undefined,l);
		
		var mri = me.User;
		var v2w=mri.v2w;
		var wori=mri.wori;
		var wpixdim=me.subVecVec(me.mulMatVec(v2w,[1,1,1]),me.mulMatVec(v2w,[0,0,0]));
		var wvmax=me.addVecVec(me.mulMatVec(v2w,[mri.dim[0]-1,mri.dim[1]-1,mri.dim[2]-1]),wori);
		var wvmin=me.addVecVec(me.mulMatVec(v2w,[0,0,0]),wori);
		var wmin=[Math.min(wvmin[0],wvmax[0]),Math.min(wvmin[1],wvmax[1]),Math.min(wvmin[2],wvmax[2])];
		var wmax=[Math.max(wvmin[0],wvmax[0]),Math.max(wvmin[1],wvmax[1]),Math.max(wvmin[2],wvmax[2])];
		var w2s=[[1/Math.abs(wpixdim[0]),0,0],[0,1/Math.abs(wpixdim[1]),0],[0,0,1/Math.abs(wpixdim[2])]];
		var s2w=me.invMat(w2s);

		mri.s2v = {
			sdim: [(wmax[0]-wmin[0])/Math.abs(wpixdim[0])+1,(wmax[1]-wmin[1])/Math.abs(wpixdim[1])+1,(wmax[2]-wmin[2])/Math.abs(wpixdim[2])+1],
			s2w: s2w,
			sori: [-wmin[0]/Math.abs(wpixdim[0]),-wmin[1]/Math.abs(wpixdim[1]),-wmin[2]/Math.abs(wpixdim[2])],
			wpixdim: [Math.abs(wpixdim[0]),Math.abs(wpixdim[1]),Math.abs(wpixdim[2])],
			w2v: me.invMat(v2w),
			wori: wori
		};
		
		/**
		 * @todo Most of the code upstairs can be removed
		 */

        var i=v2w[0];
        var j=v2w[1];
        var k=v2w[2];
        var mi={i:0,v:0};i.map(function(o,n){if(Math.abs(o)>Math.abs(mi.v)) mi={i:n,v:o}});
        var mj={i:0,v:0};j.map(function(o,n){if(Math.abs(o)>Math.abs(mj.v)) mj={i:n,v:o}});
        var mk={i:0,v:0};k.map(function(o,n){if(Math.abs(o)>Math.abs(mk.v)) mk={i:n,v:o}});

        mri.s2v.sdim[mi.i] = mri.dim[0];
        mri.s2v.sdim[mj.i] = mri.dim[1];
        mri.s2v.sdim[mk.i] = mri.dim[2];
        mri.s2v.wpixdim[mi.i] = mri.pixdim[0];
        mri.s2v.wpixdim[mj.i] = mri.pixdim[1];
        mri.s2v.wpixdim[mk.i] = mri.pixdim[2];
        
	},
    /**
     * @function testS2VTransformation
     */
	testS2VTransformation: function testS2VTransformation() {
		var me=AtlasMakerWidget;
		var l=me.traceLog(testS2VTransformation);if(l)console.log.apply(undefined,l);
		
		/*
			check the S2V transformation to see if it looks correct.
			If it does not, reset it
		*/
		var mri=me.User; // this line is different from server
		var doReset=false;
	
		// console.log("Transformation TEST:");
		// console.log("  1. transformation volume");
		
		var vv=mri.dim[0]*mri.dim[1]*mri.dim[2];
		var vs=mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
		var diff=(vs-vv)/vv;
		if(Math.abs(diff)>0.001) {
			console.log("    ERROR: Difference is too large");
			console.log("    original volume:",vv);
			console.log("    rotated volume:",vs);
			console.log("    % difference:",diff*100);
			doReset=true;
		} else {
			// console.log("    ok.");
		}
	
		// console.log("  2. transformation origin");
		if(	mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
			mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
			mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
			// console.log("    Origin point is outside the dimensions of the data");
			doReset=true;
		} else {
			// console.log("    ok.");
		}

		if(doReset) {
			// console.log("THE TRANSFORMATION WILL BE RESET");
			mri.v2w=[[mri.pixdim[0],0,0],[0,-mri.pixdim[1],0],[0,0,-mri.pixdim[2]]];
			mri.wori=[0,mri.dim[1]-1,mri.dim[2]-1];

			// re-compute the transformation from voxel space to screen space
			me.computeS2VTransformation(); // this line is different from server
			/*
			console.log(mri.dir);
			console.log(mri.ori);
			console.log(mri.s2v);
			*/
		}
	},
    /**
     * @function S2I
     */
	S2I: function S2I(s,mri) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(S2I,3);if(l)console.log.apply(undefined,l);
		
        var i=mri.v2w[0];
        var j=mri.v2w[1];
        var k=mri.v2w[2];
        var mi={i:0,v:0};i.map(function(o,n){if(Math.abs(o)>Math.abs(mi.v)) mi={i:n,v:o}});
        var mj={i:0,v:0};j.map(function(o,n){if(Math.abs(o)>Math.abs(mj.v)) mj={i:n,v:o}});
        var mk={i:0,v:0};k.map(function(o,n){if(Math.abs(o)>Math.abs(mk.v)) mk={i:n,v:o}});
        
        var v=[];
        var f = function(m,i) {
            if(m.v>0) return s[m.i];
            else      return (mri.dim[i]-s[m.i]-1);
        };
        v=[f(mi,0),f(mj,1),f(mk,2)];
        index = v[0] + v[1]*mri.dim[0] + v[2]*mri.dim[0]*mri.dim[1];
		
	},
    /**
     * @function mulMatVec
     */
	mulMatVec: function mulMatVec(m,v) {
		return [
			m[0][0]*v[0]+m[0][1]*v[1]+m[0][2]*v[2],
			m[1][0]*v[0]+m[1][1]*v[1]+m[1][2]*v[2],
			m[2][0]*v[0]+m[2][1]*v[1]+m[2][2]*v[2]
		];
	},
    /**
     * @function invMat
     */
	invMat: function invMat(m) {
		var det;
		var w=[[],[],[]];

		det=m[0][1]*m[1][2]*m[2][0] + m[0][2]*m[1][0]*m[2][1] + m[0][0]*m[1][1]*m[2][2] - m[0][2]*m[1][1]*m[2][0] - m[0][0]*m[1][2]*m[2][1] - m[0][1]*m[1][0]*m[2][2];
	
		w[0][0]=(m[1][1]*m[2][2] - m[1][2]*m[2][1])/det;
		w[0][1]=(m[0][2]*m[2][1] - m[0][1]*m[2][2])/det;
		w[0][2]=(m[0][1]*m[1][2] - m[0][2]*m[1][1])/det;
	
		w[1][0]=(m[1][2]*m[2][0] - m[1][0]*m[2][2])/det;
		w[1][1]=(m[0][0]*m[2][2] - m[0][2]*m[2][0])/det;
		w[1][2]=(m[0][2]*m[1][0] - m[0][0]*m[1][2])/det;
	
		w[2][0]=(m[1][0]*m[2][1] - m[1][1]*m[2][0])/det;
		w[2][1]=(m[0][1]*m[2][0] - m[0][0]*m[2][1])/det;
		w[2][2]=(m[0][0]*m[1][1] - m[0][1]*m[1][0])/det;
	
		return w;
	},
    /**
     * @function subVecVec
     */
	subVecVec: function subVecVec(a,b) {
		return [a[0]-b[0],a[1]-b[1],a[2]-b[2]];
	},
    /**
     * @function addVecVec
     */
	addVecVec: function addVecVec(a,b) {
		return [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
	},
	/*
		Linear Algebra}
	*/
};