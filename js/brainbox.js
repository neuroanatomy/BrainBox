var BrainBox={
	version: 1,
	info:{},
	/*
		JavaScript implementation of Java's hashCode method from
		http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
	*/
	hash: function(str) {
		var v0=0,v1,abc="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
		for(i=0;i<str.length;i++) {
			ch=str.charCodeAt(i);
			v0=((v0<<5)-v0)+ch;
			v0=v0&v0;
		}
		var sz=abc.length,v,res="";
		for(i=0;i<8;i++) {
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
		var def=$.Deferred();
		$.getJSON("/php/brainbox.php",{
			action: "download",
			url: param.url //,hash: BrainBox.hash(param.url)
		}).done(function(data) {
			// Configure MRI into atlasMaker
			//data=JSON.parse(data);
			if(data.success==false) {
				date=new Date();
				$("#msgLog").append("<p>ERROR: "+data.message+".");
				console.log("<p>ERROR: "+data.message+".");
				def.reject();
				return;
			}
			BrainBox.info=data;
			
			var arr=param.url.split("/");
			var name=arr[arr.length-1];
			date=new Date();
			$("#msgLog").append("<p>Downloading from server...");
	
			param.dim=BrainBox.info.dim; // this allows to keep dim and pixdim through annotation changes
			param.pixdim=BrainBox.info.pixdim;

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
				
				// enact configuration in param, eventually overriding the stored one
				if(param.view) {
					AtlasMakerWidget.User.view=param.view;
					AtlasMakerWidget.User.slice=null; // this will set the slider to the middle slice in case no slice were specified
				}
				if(param.slice)
					AtlasMakerWidget.User.slice=param.slice;

				if(param.fullscreen)
					AtlasMakerWidget.fullscreen=param.fullscreen;
				else
					AtlasMakerWidget.fullscreen=false;
					
				AtlasMakerWidget.initAtlasMaker($("#atlasMaker"))
				.then(function() {
					AtlasMakerWidget.editMode=1;
					AtlasMakerWidget.configureAtlasMaker(BrainBox.info,0);
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
					slice:AtlasMakerWidget.User.slice,
					lastVisited:date.toJSON()
				});			
				localStorage.AtlasMaker=JSON.stringify(stored);
			});
			
			def.resolve();

		}).fail(function() {
			date=new Date();
			$("#msgLog").append("<p>ERROR: Cannot load MRI at specified URL.");
		});
		date=new Date();
		$("#msgLog").html("<p>Downloading from source to server...");
		
		return def.promise();
	}
}