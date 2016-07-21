var BrainBox={
	version: 1,
	info:{},
	labelSets:null,
	access:["Read/Write","Read"],
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
			s.src = "/js/atlasMaker.js";
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
					AtlasMakerWidget.progress=$("#stereotaxic").find(".download_MRI");
					$("#msgLog").html("");
					 return AtlasMakerWidget.configureAtlasMaker(BrainBox.info,0);
				})
				.then(function() {
					def.resolve();
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

		}).fail(function() {
			date=new Date();
			$("#msgLog").append("<p>ERROR: Cannot load MRI at specified URL.");
		});
		date=new Date();
		$("#msgLog").html("<p>Downloading from source to server...");
		
		return def.promise();
	},
	/*
		Annotations
	*/
	selectTableRow: function() {
		console.log(">> selectTableRow()");
	
		var table=$(this).closest("table");
		var currentIndex=$(table).find("tr.selected").index()-1;
		var index=$(this).index()-1;
		var nodeName=$(this).prop('nodeName');
	
		if(index>=0 && currentIndex!=index) {
			console.log(">>  change selected annotation");
			$(table).find("tr").removeClass("selected");
			$(this).addClass("selected");
			AtlasMakerWidget.configureAtlasMaker(BrainBox.info,index);
		}
	},
	appendTableRow: function(i,param) {
		/*
			This function is hard-wired for a unique annotation table structure.
			It should be made generic.
		*/
		$(param.table).append($.map([
			"<tr>",
			" <td contentEditable></td>",
			" <td contentEditable></td>",
			" <td><select>",BrainBox.labelSets.map(function(o){return "<option>"+o.name+"</option>"}),"</select></td>",	// append label sets
			" <td><a></a></td>",
			" <td></td>",
			" <td></td>",
			" <td><select>",BrainBox.access.map(function(o){return "<option>"+o+"</option>"}),"</select></td>",	// append label sets
			"</tr>"],function(o){return o}).join()
		);
		bind2(param.info_proxy,BrainBox.info,"mri.atlas."+i+".name",    $("table#info").find("tr:eq("+(i+1)+") td:eq(0)"));
		bind2(param.info_proxy,BrainBox.info,"mri.atlas."+i+".project", $("table#info").find("tr:eq("+(i+1)+") td:eq(1)"));
		bind2(param.info_proxy,BrainBox.info,"mri.atlas."+i+".labels",  $("table#info").find("tr:eq("+(i+1)+") td:eq(2)"),
			function(e,d){$(e).find("select").prop('selectedIndex',BrainBox.labelSets.map(function(o){return o.source}).indexOf(d))},
			function(e){var name=$(e).find("select").val();var i=BrainBox.labelSets.map(function(o){return o.name}).indexOf(name);return BrainBox.labelSets[i].source}
		);
		bind1(param.info_proxy,BrainBox.info,"mri.atlas."+i+".owner",   $("table#info").find("tr:eq("+(i+1)+") td:eq(3) a"),function(e,d){$.get(d+"/nickname",function(r){$(e).text(r);$(e).attr('href',d)})});
		bind1(param.info_proxy,BrainBox.info,"mri.atlas."+i+".created", $("table#info").find("tr:eq("+(i+1)+") td:eq(4)"),date_format);
		bind1(param.info_proxy,BrainBox.info,"mri.atlas."+i+".modified",$("table#info").find("tr:eq("+(i+1)+") td:eq(5)"),date_format);
		bind2(param.info_proxy,BrainBox.info,"mri.atlas."+i+".access",  $("table#info").find("tr:eq("+(i+1)+") td:eq(6)"),
			function(e,d){$(e).find("select").prop('selectedIndex',BrainBox.access.indexOf(d))},
			function(e){return $(e).find("select").val()}
		);
	},
	addAnnotation: function(param) {
		var date=new Date();
		// add data to annotations array
		BrainBox.info.mri.atlas.push({
			name:"Untitled",
			project:"Untitled",
			access: "Read/Write", 
			created: date.toJSON(), 
			modified: date.toJSON(), 
			filename: Math.random().toString(36).slice(2)+".nii.gz",	// automatically generated filename
			labels: "http://brainbox.dev/labels/foreground.json",
			owner: "/user/"+AtlasMakerWidget.User.username,
			type: "volume"
		});
	
		// add and bind new table row
		var i=BrainBox.info.mri.atlas.length-1;
		BrainBox.appendTableRow(i,param);
	
		// update in server
		BrainBox.saveAnnotations(param);
	},
	removeAnnotation: function(param) {
		/*
			This function is hard-wired for a unique annotation table structure.
			It should be made generic.
		*/

		// remove row from table
		var index=$(param.table).find(".selected").index()-1;
		$(param.table).find('tr:eq('+(index+1)+')').remove();

		// remove binding
		JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
		var i=BrainBox.info.mri.atlas.length-1;
		unbind2(param.info_proxy,"mri.atlas."+i+".name");
		unbind2(param.info_proxy,"mri.atlas."+i+".project");
		unbind2(param.info_proxy,"mri.atlas."+i+".labels");
		unbind2(param.info_proxy,"mri.atlas."+i+".owner");
		unbind2(param.info_proxy,"mri.atlas."+i+".created");
		unbind2(param.info_proxy,"mri.atlas."+i+".modified");
		unbind2(param.info_proxy,"mri.atlas."+i+".access");
	
		// remove row from BrainBox.info.mri.atlas
		BrainBox.info.mri.atlas.splice(index,1);

		// update in server
		BrainBox.saveAnnotations(param);
	},
	saveAnnotations: function(param) {
		console.log("save annotations");
		JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
		AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
		hash_old=BrainBox.hash(JSON.stringify(BrainBox.info));
		$(param.saveWarning).hide();
	},
	loadLabelsets: function() {
		return $.getJSON("/php/brainbox.php?action=getLabelsets",function(data) {
			BrainBox.labelSets=data;
		});
	}
}