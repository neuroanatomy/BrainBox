var BrainBox={
	version: 1,
	hash: function(str) {
		var i,v0,v1,abc="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		v0=0;
		for(i=0;i<str.length;i++) {
			v1=str.charCodeAt(i);
			v0+=v0+v0^v1;
		}
		var sz=abc.length,v,res="";
		for(i=0;i<5;i++) {
			v1=parseInt(v0/sz);
			v=Math.abs(v0-v1*sz);
			res+=abc[v];
			v0=v1;
		}
		return res;
	},
	initBrainBox: function(param) {
		var date;
	
		// Copy MRI from source
		var def=$.get("/brainbox/php/stereotaxic.php",{
			action: "download",
			url: param.url,
			hash: param.hash
		}).done(function(data){
			// Configure MRI into atlasMaker
			data=JSON.parse(data);
			if(data.success==false) {
				date=new Date();
				$("#msgLog").append("<p>ERROR: "+data.message+".");
				return;
			}
			var arr=param.url.split("/");
			var name=arr[arr.length-1];
			console.log('mripath',name);
			date=new Date();
			$("#msgLog").append("<p>Downloading from server...");
	
			var info={
				url: "data/"+param.hash+"/",
				mri: {
					atlas: [ { name: "Blank Atlas", description: "A blank atlas for testing", filename: "Atlas.nii.gz"}],
					brain: name,
					dim: data.dim,
					pixdim: data.pixdim
				},
				name:"Coco"
			};
			console.log(info);

			// Add AtlasMaker
			$("#stereotaxic").html('<div id="atlasMaker"></div>');
			$("#atlasMaker").addClass('edit-mode');
			var s = document.createElement("script");
			s.src = "js/atlasMaker.js";
			s.onload=function(){

				// re-instance stored configuration
				var stored=localStorage.AtlasMaker;
				if(stored) {
					var stored=JSON.parse(stored);
					if(stored.version && stored.version==BrainBox.version) {
						for(var i=0;i<stored.history.length;i++) {
							if(stored.history[i].url==param.url) {
								AtlasMakerWidget.User.view=stored.history[i].view;
								AtlasMakerWidget.User.slice=stored.history[i].slice;
								break;
							}
						}	
					}
				}

				AtlasMakerWidget.fullscreen=param.fullscreen;
				AtlasMakerWidget.initAtlasMaker($("#atlasMaker"))
				.then(function() {
					AtlasMakerWidget.editMode=1;
					AtlasMakerWidget.configureAtlasMaker(info,0);
					AtlasMakerWidget.progress=$("#stereotaxic").find(".download_MRI");
					$("#msgLog").html("");
				});
			}
			document.body.appendChild(s);
			
			// store state on exit
			$(window).unload(function(){
				var foundStored=false;
				var stored=localStorage.AtlasMaker;
				if(stored) {
					stored=JSON.parse(stored);
					if(stored.version && stored.version==BrainBox.version) {
						foundStored=true;
						for(var i=0;i<stored.history.length;i++) {
							if(stored.history[i].url==param.url) {
								stored.history.splice(i,1);
								break;
							}
						}
					}
				}
				if(foundStored==false)
					stored={version:BrainBox.version,history:[]};
				stored.history.push({	
					url:param.url,
					view:AtlasMakerWidget.User.view.toLowerCase(),
					slice:AtlasMakerWidget.User.slice
				});			
				localStorage.AtlasMaker=JSON.stringify(stored);
			});

		}).fail(function() {
			date=new Date();
			$("#msgLog").append("<p>ERROR: Cannot load MRI at specified URL.");
		});
		date=new Date();
		$("#msgLog").html("<p>Downloading from source to server...");
		
		return def;
	}
}