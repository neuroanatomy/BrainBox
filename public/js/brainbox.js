var BrainBox={
	version: 1,
	debug: 1,
	info:{},
	labelSets:null,
	access:["Read/Write","Read"],
	annotationType:["volume","text"],

	traceLog: function traceLog(f,l) {
		if(l==undefined || BrainBox.debug>l)
			return "bb> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root");
	},

	/*
		JavaScript implementation of Java's hashCode method from
		http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
	*/
	hash: function hash(str) {
		console.log(BrainBox.traceLog(hash));
		
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
	loadScript: function loadScript(path) {
	    var def = new $.Deferred();
        var s = document.createElement("script");
        s.src = path;
        s.onload=function () {
            def.resolve();
        };
        document.body.appendChild(s);
    	return def.promise();
	},
	initBrainBox: function initBrainBox() {
		console.log(BrainBox.traceLog(initBrainBox));
		
		var def=$.Deferred();

		// Add AtlasMaker and friends
		$("#stereotaxic").html('<div id="atlasMaker"></div>');
		$("#atlasMaker").addClass('edit-mode');
		
        $.when(
            BrainBox.loadScript('/js/atlasMaker-draw.js'),
            BrainBox.loadScript('/js/atlasMaker-interaction.js'),
            BrainBox.loadScript('/js/atlasMaker-io.js'),
            BrainBox.loadScript('/js/atlasMaker-paint.js'),
            BrainBox.loadScript('/js/atlasMaker-ui.js'),
            BrainBox.loadScript('/js/atlasMaker-ws.js'),
            BrainBox.loadScript('/js/atlasMaker.js')
        ).then(function () {
            $.extend(AtlasMakerWidget,AtlasMakerDraw);
            $.extend(AtlasMakerWidget,AtlasMakerInteraction);
            $.extend(AtlasMakerWidget,AtlasMakerIO);
            $.extend(AtlasMakerWidget,AtlasMakerPaint);
            $.extend(AtlasMakerWidget,AtlasMakerUI);
            $.extend(AtlasMakerWidget,AtlasMakerWS);
            AtlasMakerWidget.initAtlasMaker($("#atlasMaker"))
                .then(function() {
                    def.resolve();
                });
        });
		
		// store state on exit
		$(window).on('unload',BrainBox.unload);
		
		return def.promise();
	},
	configureBrainBox: function configureBrainBox(param) {
		console.log(BrainBox.traceLog(configureBrainBox));
		
		var def=$.Deferred();
		var date=new Date();
		var data=param.info;
	
		// Copy MRI from source
		$("#msgLog").html("<p>Downloading from source to server...");

					// Configure MRI into atlasMaker
					//data=JSON.parse(data);
					if(data.success===false) {
						date=new Date();
						$("#msgLog").append("<p>ERROR: "+data.message+".");
						console.log("<p>ERROR: "+data.message+".");
						return def.promise().reject();
					}
					BrainBox.info=data;
			
					var arr=param.url.split("/");
					var name=arr[arr.length-1];
					date=new Date();
					$("#msgLog").append("<p>Downloading from server...");
	
					param.dim=BrainBox.info.dim; // this allows to keep dim and pixdim through annotation changes
					param.pixdim=BrainBox.info.pixdim;

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
				
					AtlasMakerWidget.editMode=1;

					AtlasMakerWidget.configureAtlasMaker(BrainBox.info,0)
					.then(function() {
						def.resolve();
					});
		
		return def.promise();
	},
	unload: function unload() {
		console.log(BrainBox.traceLog(unload));
		var foundStored=false;
		var stored=localStorage.AtlasMaker;
		if(stored) {
			stored=JSON.parse(stored);
			if(stored.version && stored.version==BrainBox.version) {
				foundStored=true;
				for(var i=0;i<stored.history.length;i++) {
					if(stored.history[i].url==BrainBox.info.source) {
						stored.history.splice(i,1);
						break;
					}
				}
			}
		}
		if(foundStored==false)
			stored={version:BrainBox.version,history:[]};
		stored.history.push({	
			url:BrainBox.info.source,
			view:AtlasMakerWidget.User.view?AtlasMakerWidget.User.view.toLowerCase():"sag",
			slice:AtlasMakerWidget.User.slice?AtlasMakerWidget.User.slice:0,
			lastVisited:(new Date()).toJSON()
		});			
		localStorage.AtlasMaker=JSON.stringify(stored);
	},
    /*
		Annotation related functions
	*/
	selectAnnotationTableRow: function selectAnnotationTableRow() {
		console.log(BrainBox.traceLog(selectAnnotationTableRow));
	
		var table=$(this).closest("tbody");
		var currentIndex=$(table).find("tr.selected").index();
		var index=$(this).index();
		var nodeName=$(this).prop('nodeName');
	
		if(index>=0 && currentIndex!=index) {
			console.log("bb>>  change selected annotation");
			$(table).find("tr").removeClass("selected");
			$(this).addClass("selected");
			AtlasMakerWidget.configureAtlasMaker(BrainBox.info,index);
		}
	},
	appendAnnotationTableRow: function appendAnnotationTableRow(irow,param) {
		console.log(BrainBox.traceLog(appendAnnotationTableRow));
		
		$(param.table).append(param.trTemplate);

		for(var icol=0;icol<param.objTemplate.length;icol++) {
			switch(param.objTemplate[icol].typeOfBinding) {
				case 1:
					bind1(
						param.info_proxy,
						param.info,
						param.objTemplate[icol].path.replace("#",irow),
						$(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
						param.objTemplate[icol].format
					);
					break;
				case 2:
					bind2(
						param.info_proxy,
						param.info,
						param.objTemplate[icol].path.replace("#",irow),
						$(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
						param.objTemplate[icol].format,
						param.objTemplate[icol].parse
					);
					  break;
			}
		}
	},
	addAnnotation: function addAnnotation(param) {
		console.log(BrainBox.traceLog(addAnnotation));
		
		var date=new Date();
		// add data to annotations array
		BrainBox.info.mri.atlas.push({
			name:"",
			project:"",
			access: "Read/Write", 
			created: date.toJSON(), 
			modified: date.toJSON(), 
			filename: Math.random().toString(36).slice(2)+".nii.gz",	// automatically generated filename
			labels: "/labels/foreground.json",
			owner: AtlasMakerWidget.User.username,
			type: "volume"
		});
	
		// add and bind new table row
		var i=BrainBox.info.mri.atlas.length-1;
		BrainBox.appendAnnotationTableRow(i,param);
	
		// update in server
		BrainBox.saveAnnotations(param);
	},
	removeAnnotation: function removeAnnotation(param) {
		console.log(BrainBox.traceLog(removeAnnotation));

		// remove row from table
		var index=$(param.table).find("tbody .selected").index();
		$(param.table).find('tbody tr:eq('+index+')').remove();

		// remove binding
		JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
		var irow=BrainBox.info.mri.atlas.length-1;
		for(var icol=0; icol<param.objTemplate.length; icol++) {
			unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
		}
	
		// remove row from BrainBox.info.mri.atlas
		BrainBox.info.mri.atlas.splice(index,1);

		// update in server
		BrainBox.saveAnnotations(param);
	},
	saveAnnotations: function saveAnnotations(param) {
		console.log(BrainBox.traceLog(saveAnnotations));

		JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
		AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
		hash_old=BrainBox.hash(JSON.stringify(BrainBox.info));
		$(param.saveWarning).hide();
	},
	loadLabelsets: function loadLabelsets() {
		console.log(BrainBox.traceLog(loadLabelsets));
		
		return $.getJSON("/api/getLabelsets",function(data) {
			BrainBox.labelSets=data;
			/*
				If we wanted to filter out the location, we would use:
				BrainBox.labelSets=$.map(data,function(o){return new URL(o.source).pathname});
			*/
		});
	}
}