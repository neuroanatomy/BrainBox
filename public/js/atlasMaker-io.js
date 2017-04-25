/**
 * @page AtlasMaker: Input/Output
 */
var AtlasMakerIO = {
    NiiHdrLE: Struct()
        .word32Sle('sizeof_hdr')        // Size of the header. Must be 348 (bytes)
        .chars('data_type',10)          // Not used; compatibility with analyze.
        .chars('db_name',18)            // Not used; compatibility with analyze.
        .word32Sle('extents')           // Not used; compatibility with analyze.
        .word16Sle('session_error')     // Not used; compatibility with analyze.
        .word8('regular')               // Not used; compatibility with analyze.
        .word8('dim_info')              // Encoding directions (phase, frequency, slice).
        .array('dim',8,'word16Sle')     // Data array dimensions.
        .floatle('intent_p1')           // 1st intent parameter.
        .floatle('intent_p2')           // 2nd intent parameter.
        .floatle('intent_p3')           // 3rd intent parameter.
        .word16Sle('intent_code')       // nifti intent.
        .word16Sle('datatype')	        // Data type.
        .word16Sle('bitpix')	        // Number of bits per voxel.
        .word16Sle('slice_start')	    // First slice index.
        .array('pixdim',8,'floatle')    // Grid spacings (unit per dimension).
        .floatle('vox_offset')	        // Offset into a .nii file.
        .floatle('scl_slope')	        // Data scaling, slope.
        .floatle('scl_inter')	        // Data scaling, offset.
        .word16Sle('slice_end')	        // Last slice index.
        .word8('slice_code')	        // Slice timing order.
        .word8('xyzt_units')	        // Units of pixdim[1..4].
        .floatle('cal_max')	            // Maximum display intensity.
        .floatle('cal_min')	            // Minimum display intensity.
        .floatle('slice_duration')	    // Time for one slice.
        .floatle('toffset')	            // Time axis shift.
        .word32Sle('glmax')	            // Not used; compatibility with analyze.
        .word32Sle('glmin')	            // Not used; compatibility with analyze.
        .chars('descrip',80)	        // Any text.
        .chars('aux_file',24)	        // Auxiliary filename.
        .word16Sle('qform_code')	    // Use the quaternion fields.
        .word16Sle('sform_code')	    // Use of the affine fields.
        .floatle('quatern_b')	        // Quaternion b parameter.
        .floatle('quatern_c')	        // Quaternion c parameter.
        .floatle('quatern_d')	        // Quaternion d parameter.
        .floatle('qoffset_x')	        // Quaternion x shift.
        .floatle('qoffset_y')	        // Quaternion y shift.
        .floatle('qoffset_z')	        // Quaternion z shift.
        .array('srow_x',4,'floatle')    // 1st row affine transform
        .array('srow_y',4,'floatle')    // 2nd row affine transform.
        .array('srow_z',4,'floatle')    // 3rd row affine transform.
        .chars('intent_name',16)	    // Name or meaning of the data.
        .chars('magic',4),	            // Magic string.
    NiiHdrBE: Struct()
        .word32Sbe('sizeof_hdr')        // Size of the header. Must be 348 (bytes)
        .chars('data_type',10)          // Not used; compatibility with analyze.
        .chars('db_name',18)            // Not used; compatibility with analyze.
        .word32Sbe('extents')           // Not used; compatibility with analyze.
        .word16Sbe('session_error')     // Not used; compatibility with analyze.
        .word8('regular')               // Not used; compatibility with analyze.
        .word8('dim_info')              // Encoding directions (phase, frequency, slice).
        .array('dim',8,'word16Sbe')     // Data array dimensions.
        .floatbe('intent_p1')           // 1st intent parameter.
        .floatbe('intent_p2')           // 2nd intent parameter.
        .floatbe('intent_p3')           // 3rd intent parameter.
        .word16Sbe('intent_code')       // nifti intent.
        .word16Sbe('datatype')	        // Data type.
        .word16Sbe('bitpix')	        // Number of bits per voxel.
        .word16Sbe('slice_start')	    // First slice index.
        .array('pixdim',8,'floatbe')    // Grid spacings (unit per dimension).
        .floatbe('vox_offset')	        // Offset into a .nii file.
        .floatbe('scl_slope')	        // Data scaling, slope.
        .floatbe('scl_inter')	        // Data scaling, offset.
        .word16Sbe('slice_end')	        // Last slice index.
        .word8('slice_code')	        // Slice timing order.
        .word8('xyzt_units')	        // Units of pixdim[1..4].
        .floatbe('cal_max')	            // Maximum display intensity.
        .floatbe('cal_min')	            // Minimum display intensity.
        .floatbe('slice_duration')	    // Time for one slice.
        .floatbe('toffset')	            // Time axis shift.
        .word32Sbe('glmax')	            // Not used; compatibility with analyze.
        .word32Sbe('glmin')	            // Not used; compatibility with analyze.
        .chars('descrip',80)	        // Any text.
        .chars('aux_file',24)	        // Auxiliary filename.
        .word16Sbe('qform_code')	    // Use the quaternion fields.
        .word16Sbe('sform_code')	    // Use of the affine fields.
        .floatbe('quatern_b')	        // Quaternion b parameter.
        .floatbe('quatern_c')	        // Quaternion c parameter.
        .floatbe('quatern_d')	        // Quaternion d parameter.
        .floatbe('qoffset_x')	        // Quaternion x shift.
        .floatbe('qoffset_y')	        // Quaternion y shift.
        .floatbe('qoffset_z')	        // Quaternion z shift.
        .array('srow_x',4,'floatbe')    // 1st row affine transform
        .array('srow_y',4,'floatbe')    // 2nd row affine transform.
        .array('srow_z',4,'floatbe')    // 3rd row affine transform.
        .chars('intent_name',16)	    // Name or meaning of the data.
        .chars('magic',4),	            // Magic string.
    MghHdr: Struct()
        .word32Sbe('v')
        .word32Sbe('ndim1')
        .word32Sbe('ndim2')
        .word32Sbe('ndim3')
        .word32Sbe('nframes')
        .word32Sbe('type')
        .word32Sbe('dof')
        .word16Sbe('ras_good_flag')
        .array('delta',3,'floatbe')
        .array('Mdc',9,'floatbe')
        .array('Pxyz_c',3,'floatbe'),
    MghFtr: Struct()
        .array('mrparms',4,'floatbe'),
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
		var	vox_offset=352;
		var bitsPerVoxel=8;
	
        var newHdr = {
            sizeof_hdr: sizeof_hdr,
                data_type: '', db_name: '', extents: 0, session_error: 0, regular: 0, dim_info: 0,
            dim: [3, me.User.dim[0], me.User.dim[1], me.User.dim[2], 1, 1, 1, 1],
                intent_p1: 0, intent_p2: 0, intent_p3: 0, intent_code: 0,
            datatype: datatype,    // uchar
            bitpix: bitsPerVoxel,
                slice_start: 0,
            pixdim: [-1, me.User.pixdim[0], me.User.pixdim[1], me.User.pixdim[2], 0, 1, 1, 1],
            vox_offset: vox_offset,
                scl_slope: 0, scl_inter: 0, slice_end: 0, slice_code: 0,
                xyzt_units: 10,
                cal_max: 0, cal_min: 0, slice_duration: 0, toffset: 0,
                glmax: 0, glmin: 0,
                descrip: 'BrainBox, 20 August 2016',
                aux_file: '',
                qform_code: 0,
                sform_code: 1,
                quatern_b: 0, quatern_c: 0, quatern_d: 0,
                qoffset_x: 0, qoffset_y: 0, qoffset_z: 0,
            srow_x: [me.User.v2w[0][0], me.User.v2w[1][0], me.User.v2w[2][0], me.User.wori[0]],
            srow_y: [me.User.v2w[0][1], me.User.v2w[1][1], me.User.v2w[2][1], me.User.wori[1]],
            srow_z: [me.User.v2w[0][2], me.User.v2w[1][2], me.User.v2w[2][2], me.User.wori[2]],
                intent_name: '',
                magic: 'n+1'
        };
        me.NiiHdrLE.allocate();
        niihdr = me.NiiHdrLE.buffer();
        for(i in newHdr)
            me.NiiHdrLE.fields[i] = newHdr[i];
        hdr = toArrayBuffer(niihdr);
        var	data=me.atlas.data;
        var nii = new Uint8Array(vox_offset+data.length);
        for(i=0;i<sizeof_hdr;i++)
            nii[i]=hdr[i];
        for(i=0;i<data.length;i++)
            nii[i+vox_offset]=data[i];

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
	swapInt16: function swapInt16(arr) {
	    var i,dv = new DataView(arr.buffer);
	    for(i=0;i<arr.length;i++) {
	        arr[i]= dv.getInt16(2*i,false);
	    }
	    return arr;
	},
	swapInt32: function swapInt32(arr) {
	    var i,dv = new DataView(arr.buffer);
	    for(i=0;i<arr.length;i++) {
	        arr[i]= dv.getInt32(4*i,false);
	    }
	    return arr;
	},
	swapFloat32: function swapFloat32(arr) {
	    var i,dv = new DataView(arr.buffer);
	    for(i=0;i<arr.length;i++) {
	        arr[i]= dv.getFloat32(4*i,false);
	    }
	    return arr;
	},
    /**
     * @function loadNifti
     */
	loadNifti: function loadNifti(nii) {
		var me=AtlasMakerWidget;
		var l=me.traceLog(loadNifti,1);if(l)console.log.apply(undefined,l);
		var endianness='le';

        me.NiiHdrLE._setBuff(toBuffer(nii));
        var h=JSON.parse(JSON.stringify(me.NiiHdrLE.fields));
        if(h.sizeof_hdr!=348) {
            me.NiiHdrBE._setBuff(toBuffer(nii));
            h=JSON.parse(JSON.stringify(me.NiiHdrBE.fields));   
            endianness='be';     
        }

		var	vox_offset=h.vox_offset;
        var	sizeof_hdr=h.sizeof_hdr;
	
		var mri={};
		mri.hdr=nii.slice(0,vox_offset);
		mri.datatype=h.datatype;
		mri.dim=[h.dim[1],h.dim[2],h.dim[3]];
		mri.pixdim=[h.pixdim[1],h.pixdim[2],h.pixdim[3]];
		
		switch(mri.datatype)
		{
			case 2: // UCHAR
				mri.data=new Uint8Array(nii,vox_offset);
				break;
			case 4: // SHORT
			    if(endianness=='le')
                    mri.data=new Int16Array(nii,vox_offset);
                else
                    mri.data=me.swapInt16(new Int16Array(nii,vox_offset));
				break;
			case 8:  // INT
				if(endianness=='le')
                    mri.data=new Int32Array(nii,vox_offset);
                else
                    mri.data=me.swapInt32(new Int32Array(nii,vox_offset));
				break;
			case 16: // FLOAT
			    if(endianness=='le')
    				mri.data=new Float32Array(nii,vox_offset);
    			else
    				mri.data=me.swapFloat32(new Float32Array(nii,vox_offset));
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
		
		/**
		 * @todo Much of the code downstairs can be removed
		 */

		var mri = me.User;
		var v2w=mri.v2w;
		var wori=mri.wori;
		var wpixdim=me.subVecVec(me.mulMatVec(v2w,[1,1,1]),me.mulMatVec(v2w,[0,0,0]));
		var wvmax=me.addVecVec(me.mulMatVec(v2w,[mri.dim[0]-1,mri.dim[1]-1,mri.dim[2]-1]),wori);
		var wvmin=me.addVecVec(me.mulMatVec(v2w,[0,0,0]),wori);
		var wmin=[Math.min(wvmin[0],wvmax[0]),Math.min(wvmin[1],wvmax[1]),Math.min(wvmin[2],wvmax[2])];
		var wmax=[Math.max(wvmin[0],wvmax[0]),Math.max(wvmin[1],wvmax[1]),Math.max(wvmin[2],wvmax[2])];
		var w2s=[[1/Math.abs(wpixdim[0]),0,0],[0,1/Math.abs(wpixdim[1]),0],[0,0,1/Math.abs(wpixdim[2])]];

        var i=v2w[0];
        var j=v2w[1];
        var k=v2w[2];
        var mi={i:0,v:0};i.map(function(o,n){if(Math.abs(o)>Math.abs(mi.v)) mi={i:n,v:o}});
        var mj={i:0,v:0};j.map(function(o,n){if(Math.abs(o)>Math.abs(mj.v)) mj={i:n,v:o}});
        var mk={i:0,v:0};k.map(function(o,n){if(Math.abs(o)>Math.abs(mk.v)) mk={i:n,v:o}});
		mri.s2v = {
    		// old s2v fields
			s2w: me.invMat(w2s),
			sdim: [],
			sori: [-wmin[0]/Math.abs(wpixdim[0]),-wmin[1]/Math.abs(wpixdim[1]),-wmin[2]/Math.abs(wpixdim[2])],
			wpixdim: [],
			w2v: me.invMat(v2w),
            wori: wori,

            // new s2v transformation
            x: mi.i, // correspondence between space coordinate x and voxel coordinate i
            y: mj.i, // same for y
            z: mk.i, // same for z
            dx: (mi.v>0)?1:(-1), // direction of displacement in space coordinate x with displacement in voxel coordinate i
            dy: (mj.v>0)?1:(-1), // same for y
            dz: (mk.v>0)?1:(-1), // same for z
            X: (mi.v>0)?0:(mri.dim[0]-1), // starting value for space coordinate x when voxel coordinate i starts
            Y: (mj.v>0)?0:(mri.dim[1]-1), // same for y
            Z: (mk.v>0)?0:(mri.dim[2]-1) // same for z
		};
        mri.v2w=v2w;
        mri.wori=wori;
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
		
        var s2v = mri.s2v;
        var v = [s2v.X+s2v.dx*s[s2v.x],s2v.Y+s2v.dy*s[s2v.y],s2v.Z+s2v.dz*s[s2v.z]];
        index = v[0] + v[1]*mri.dim[0] + v[2]*mri.dim[0]*mri.dim[1];
        return index;
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