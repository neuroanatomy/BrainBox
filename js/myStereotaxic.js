var sum;
var	view;
var brain_offcn;
var brain_offtx;
var canvas;
var context;
var brain_px;
var	brain_W,brain_H;
var	brain_Wdim,brain_Hdim;
var	max;
var	brain_dim;
var brain_pixdim;
var	brain_datatype;
var	slice;
var	brain;
var name;

var flagLoadingImg;

function init_stereotaxic(elem,param) {
	var width=param.width||'512px';
	console.log(width,param);
	var html=[
		'<div style="width:'+width+'">',
		'	<input id="url" type="text" placeholder="Enter the URL of an MRI (.nii.gz)" style="width:100%"></input>',
		'	<div id="msg"></div>',
		'	<div id="stereotaxic">',
		'		<canvas id="brainCanvas" style="width:100%;height:100%;background-color:#000"></canvas>',
		'		<div id="slider" style="width:100%;margin:5px 0 10px 0;" oninput="javascript:changeSlice()"></div>',
		'		<div id="radio">',
		'			<input type="radio" id="sagittal" name="radio" checked="checked"><label for="sagittal">Sagittal</label>',
		'			<input type="radio" id="coronal" name="radio"><label for="coronal">Coronal</label>',
		'			<input type="radio" id="axial" name="radio"><label for="axial">Axial</label>',
		'		</div>',
		'	</div>',
		'</div>'].join("\n");
	elem.html(html);

	$("#url").keyup(function (e) {
		if (e.keyCode == 13) {
			var url=$("#url").val();
			loadBrain(url,$("h2.MRI")).then(function(){
				$("#stereotaxic").show();
			});
		}
	});
	$("#slider").slider({slide: changeSlice,min:0,max:100,value:50});
	$("#radio").buttonset();
	$('#radio input[type=radio]').change(function(){changeView($(this).attr('id'))})

	sum=new Array();
	view='sag';
	brain_offcn=document.createElement('canvas');
	brain_offtx=brain_offcn.getContext('2d');
	canvas = document.getElementById('brainCanvas');
	context = canvas.getContext('2d');
	max=0;
	brain_dim=new Array(3); // [LR,PA,IS]=[180,216,180];
	brain_pixdim=new Array(3);
	slice=50;
	brain=0;
}
function changeView(theView)
{
	switch(theView)
	{
		case 'sagittal':
			view='sag';
			break;
		case 'coronal':
			view='cor';
			break;
		case 'axial':
			view='axi';
			break;
	}
	if(brain)
		configureBrainImage();
	drawImages();
}
function changeSlice(e,u)
{
	slice=$("#slider").slider("value");
	drawImages();
}

function configureBrainImage()
{
	// init query image
	switch(view)
	{	case 'sag':	brain_W=brain_dim[1]/*PA*/; brain_H=brain_dim[2]/*IS*/; brain_Wdim=brain_pixdim[1]; brain_Hdim=brain_pixdim[2]; break; // sagital
		case 'cor':	brain_W=brain_dim[0]/*LR*/; brain_H=brain_dim[2]/*IS*/; brain_Wdim=brain_pixdim[0]; brain_Hdim=brain_pixdim[2]; break; // coronal
		case 'axi':	brain_W=brain_dim[0]/*LR*/; brain_H=brain_dim[1]/*PA*/; brain_Wdim=brain_pixdim[0]; brain_Hdim=brain_pixdim[1]; break; // axial
	}
	brain_offcn.width=brain_W;
	brain_offcn.height=brain_H;
	canvas.width=brain_W;
	canvas.height=brain_H;
	brain_px=brain_offtx.getImageData(0,0,brain_offcn.width,brain_offcn.height);
}
function drawImages()
{
	context.clearRect(0,0,context.canvas.width,canvas.height);
	
	// draw brain
	if(brain) {
		// MRI volume downloaded: draw from it
		drawBrainImage();
	}
	else {
		/*
		// Not yet downloaded: get single slice as jpg
		flagLoadingImg=true;
		var currentSlice=slice;
		var img = new Image();

		console.log("loading slice jpg");
		img.src=[
			"/brainer/php/stereotaxic.php?",
			"action=drawNiiSlice&",
			"nii-file=MRI-n4.nii.gz&",
			"view="+view+"&",
			"slice-index="+slice
		].join("");
		console.log(img.src);


		img.onload = function(){
			flagLoadingImg=false;
			console.log("drawing slice jpg");
			var w=this.width;
			var h=this.height;
			canvas.width=w;
			canvas.height=h;
			context.drawImage(this,0,0);
			
			$('body').append(this);
			
			if(slice!=currentSlice)
				drawImages();
		};
		*/
	}
}
function drawBrainImage()
{
	ys=Math.floor(brain_dim[0]/*LR*/*slice/100);
	yc=Math.floor(brain_dim[1]/*PA*/*slice/100);
	ya=Math.floor(brain_dim[2]/*IS*/*slice/100);
	for(y=0;y<brain_H;y++)
	for(x=0;x<brain_W;x++)
	{
		switch(view)
		{	case 'sag':i= y*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+ x*brain_dim[0]/*LR*/+ys; break;
			case 'cor':i= y*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+yc*brain_dim[0]/*LR*/+x; break;
			case 'axi':i=ya*brain_dim[1]/*PA*/*brain_dim[0]/*LR*/+ y*brain_dim[0]/*LR*/+x; break;
		}
		val=brain[i];
//		val=255*(brain[i]-brain_min)/(brain_max-brain_min);
//		i=((brain_H-y-1)*brain_offcn.width+x)*4;
		i=(y*brain_offcn.width+x)*4;
		brain_px.data[ i ]  =val;
		brain_px.data[ i+1 ]=val;
		brain_px.data[ i+2 ]=val;
		brain_px.data[ i+3 ]=255;
	}
	brain_offtx.putImageData(brain_px, 0, 0);

	context.drawImage(brain_offcn,0,0,brain_W,brain_H);
}
function loadBrain(theName,progress)
{
	var def=$.Deferred();
	var date;
	name=theName;

	$.get("/brainer/php/stereotaxic.php",{
		action: "download",
		url: name
	}).done(function(data){
		console.log(data);
		data=JSON.parse(data);
		console.log(data);
		if(data.success==false) {
			date=new Date();
			$("#msg").append(date.toLocaleDateString()+" ERROR: "+data.message+".<br/>");
			return;
		}
		
		var arr=name.split("/");
		name="/brainer/data/"+arr[arr.length-1];
		console.log('name',name);

		date=new Date();
		$("#msg").append(date.toLocaleDateString()+" Downloading from server...<br/>");

		var oReq = new XMLHttpRequest();
		var progress=$("<div>");
		$("body").append(progress);
		oReq.addEventListener("progress", function(e){progress.html(parseInt(100*e.loaded/e.total)+"% Loaded")}, false);
		oReq.open("GET", name, true);
		oReq.responseType = "arraybuffer";
		oReq.onload = function(oEvent)
		{
			progress.remove();
			var	inflate=new pako.Inflate();
			inflate.push(new Uint8Array(this.response),true);
			var data=inflate.result.buffer;
			var	dv=new DataView(data);
			var	sizeof_hdr=dv.getInt32(0,true);
			var	dimensions=dv.getInt16(40,true);
			brain_dim[0]=dv.getInt16(42,true);
			brain_dim[1]=dv.getInt16(44,true);
			brain_dim[2]=dv.getInt16(46,true);
			brain_datatype=dv.getInt16(72,true);
			brain_pixdim[0]=dv.getFloat32(80,true);
			brain_pixdim[1]=dv.getFloat32(84,true);
			brain_pixdim[2]=dv.getFloat32(88,true);
			var	vox_offset=dv.getFloat32(108,true);

			switch(brain_datatype)
			{
				case 8:
					brain=new Uint8Array(data,vox_offset);
					break;
				case 16:
					brain=new Int16Array(data,vox_offset);
					break;
				case 32:
					brain=new Float32Array(data,vox_offset);
					break;
			}
	
			console.log("dim",brain_dim[0],brain_dim[1],brain_dim[2]);
			console.log("datatype",brain_datatype);
			console.log("pixdim",brain_pixdim[0],brain_pixdim[1],brain_pixdim[2]);
			console.log("vox_offset",vox_offset);
			configureBrainImage();
			progress.html("<a class='download' href='/data/"+name+"/MRI-n4.nii.gz'><img src='img/download.svg' style='vertical-align:middle;margin-bottom:5px'/></a>MRI");
			$("h2.MRI").append("&nbsp;<a class='download' href='"+name+"/Atlas'><img src='img/edit.svg' style='vertical-align:middle;margin-bottom:5px'/></a>Edit")
			date=new Date();
			$("#msg").html("");
			drawImages();
			def.resolve();
		};
		oReq.send();

	}).fail(function() {
		date=new Date();
		$("#msg").append(date.toLocaleDateString()+" ERROR: Cannot load MRI at specified URL.<br/>");
	});
	date=new Date();
	$("#msg").html(date.toLocaleDateString()+" Downloading from source to server...<br/>");

	return def;
}