self.addEventListener('message', function(e) {
	var data = e.data;
	switch (data.cmd) {
		case 'start':
			init(data.path,data.level);
			break;
	};
});

var cube_edges = new Int32Array(24);	// surfacenets
var edge_table = new Int32Array(256);	// surfacenets
var buffer = new Int32Array(4096);		// surfacenets
var brain={};

function init(path,level) {
	init_surfacenets();

	importScripts("/lib/pako/pako.min.js");
	loadNifti(path,function(){
		var g=SurfaceNets(brain.data,brain.dim,brain.pixdim,level);
		self.postMessage({msg:"success",geometry:g});
	});
}

function init_surfacenets()
{
	var k = 0;
	for(var i=0; i<8; ++i) {
		for(var j=1; j<=4; j<<=1) {
			var p = i^j;
			if(i <= p) {
				cube_edges[k++] = i;
				cube_edges[k++] = p;
			}
		}
	}
	for(var i=0; i<256; ++i) {
		var em = 0;
		for(var j=0; j<24; j+=2) {
			var a = !!(i & (1<<cube_edges[j]));
			var b = !!(i & (1<<cube_edges[j+1]));
			em |= a !== b ? (1 << (j >> 1)) : 0;
		}
		edge_table[i] = em;
	}
}
function SurfaceNets(data, dims, pixdims, level)
{ 
	var vertices = [];
	var faces = [];
	var n = 0;
	var x = new Int32Array(3);
	var R = new Int32Array([1, (dims[0]+1), (dims[0]+1)*(dims[1]+1)]);
	var grid = new Float32Array(8);
	var buf_no = 1;

	if(R[2] * 2 > buffer.length)
		buffer = new Int32Array(R[2] * 2);

	for(x[2]=0; x[2]<dims[2]-1; ++x[2], n+=dims[0], buf_no ^= 1, R[2]=-R[2])
	{
		var m = 1 + (dims[0]+1) * (1 + buf_no * (dims[1]+1));
		for(x[1]=0; x[1]<dims[1]-1; ++x[1], ++n, m+=2)
		for(x[0]=0; x[0]<dims[0]-1; ++x[0], ++n, ++m)
		{
			var mask = 0, g = 0, idx = n;
			for(var k=0; k<2; ++k, idx += dims[0]*(dims[1]-2))
			for(var j=0; j<2; ++j, idx += dims[0]-2)      
			for(var i=0; i<2; ++i, ++g, ++idx)
			{
				var p = data[idx]-level;
				grid[g] = p;
				mask |= (p < 0) ? (1<<g) : 0;
			}
			if(mask === 0 || mask === 0xff)
				continue;
			var edge_mask = edge_table[mask];
			var v = [0.0,0.0,0.0];
			var e_count = 0;
			for(var i=0; i<12; ++i)
			{
				if(!(edge_mask & (1<<i)))
					continue;
				++e_count;
				var e0 = cube_edges[ i<<1 ];       //Unpack vertices
				var e1 = cube_edges[(i<<1)+1];
				var g0 = grid[e0];                 //Unpack grid values
				var g1 = grid[e1];
				var t  = g0 - g1;                  //Compute point of intersection
				if(Math.abs(t) > 1e-6)
					t = g0 / t;
				else
					continue;
				for(var j=0, k=1; j<3; ++j, k<<=1)
				{
					var a = e0 & k;
					var b = e1 & k;
					if(a !== b)
						v[j] += a ? 1.0 - t : t;
					else
						v[j] += a ? 1.0 : 0;
				}
			}
			var s = 1.0 / e_count;
			for(var i=0; i<3; ++i)
				v[i] = x[i] + s * v[i];
			buffer[m] = vertices.length;
			vertices.push(v);
			for(var i=0; i<3; ++i)
			{
				if(!(edge_mask & (1<<i)) )
					continue;
				var iu = (i+1)%3;
				var iv = (i+2)%3;
				if(x[iu] === 0 || x[iv] === 0)
					continue;
				var du = R[iu];
				var dv = R[iv];
				if(mask & 1)
				{
					faces.push([buffer[m], buffer[m-du-dv], buffer[m-du]]);
					faces.push([buffer[m], buffer[m-dv], buffer[m-du-dv]]);
				}
				else
				{
					faces.push([buffer[m], buffer[m-du-dv], buffer[m-dv]]);
					faces.push([buffer[m], buffer[m-du], buffer[m-du-dv]]);
				}
			}
		}
	}
	return { vertices: vertices, faces: faces };
}

function loadNifti(path,callback) {
	var oReq = new XMLHttpRequest();
	oReq.open("GET", path, true);
	oReq.addEventListener("progress", function(e){console.log(parseInt(100*e.loaded/e.total)+"% Loaded")}, false);
	oReq.responseType = "arraybuffer";
	oReq.onload = function(oEvent)
	{
		var	inflate=new pako.Inflate();
		inflate.push(new Uint8Array(this.response),true);
		var data=inflate.result.buffer;
		var	dv=new DataView(data);
		var	sizeof_hdr=dv.getInt32(0,true);
		var	dimensions=dv.getInt16(40,true);
		
		brain={dim:[],pixdim:[]};
		brain.dim[0]=dv.getInt16(42,true);
		brain.dim[1]=dv.getInt16(44,true);
		brain.dim[2]=dv.getInt16(46,true);
		brain.datatype=dv.getInt16(72,true);
		brain.pixdim[0]=dv.getFloat32(80,true);
		brain.pixdim[1]=dv.getFloat32(84,true);
		brain.pixdim[2]=dv.getFloat32(88,true);
		var	vox_offset=dv.getFloat32(108,true);

		self.postMessage({msg:"datatype: "+brain.datatype});
		switch(brain.datatype)
		{
			case 2:
			case 8:
				brain.data=new Uint8Array(data,vox_offset);
				break;
			case 16:
				brain.data=new Int16Array(data,vox_offset);
				break;
			case 32:
				brain.data=new Float32Array(data,vox_offset);
				break;
		}

		console.log("dim",brain.dim[0],brain.dim[1],brain.dim[2]);
		console.log("datatype",brain.datatype);
		console.log("pixdim",brain.pixdim[0],brain.pixdim[1],brain.pixdim[2]);
		console.log("vox_offset",vox_offset);
		callback();		
	};
	oReq.send();
}