/*! BrainBox */

/**
 * @library BrainBox
 * @version 0.0.1
 * @brief Real-time collaboration in neuroimaging
 */

import * as tw from './twoWayBinding.js';
var hashOld;

/**
 * @page BrainBox
 */
var BrainBox={
    version: 1,
    debug: 1,
    hostname: 'http://localhost:3001', //'', // 'http://brainbox.pasteur.fr',
    info:{},
    labelSets:null,
    annotationType:["volume","text"],
    accessLevels: ["none","view","edit","add","remove"],

    /**
     * @function traceLog
     */
    traceLog: function traceLog(f,l) {
    /*
        if(BrainBox.debug && (l==undefined || BrainBox.debug>l))
            // return "bb> "+(f.name)+" "+(f.caller?(f.caller.name||"annonymous"):"root");
            return "bb> ";//+(f.name);
    */
    },

    /*
        JavaScript implementation of Java's hashCode method from
        http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    */
    /**
     * @function hash
     */
    hash: function hash(str) {
        var l=BrainBox.traceLog(hash);if(l)console.log(l);
        
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
    /**
     * @function loadScript
     * @desc Loads script from path if test is not fulfilled
     * @param String path Path to script, either a local path or
     *        a url
     * @param function testScriptPresent Function to test if the script is already present.
     *        If undefined, the script will be loaded.
     */
    loadScript: function loadScript(path, testScriptPresent) {
        return new Promise(function(resolve, reject) {
            if(testScriptPresent && testScriptPresent()) {
                console.log("[loadScript] Script",path,"already present, not loading it again");
                return resolve();
            }
            var s = document.createElement("script");
            s.src = path;
            s.onload=function () {
                console.log("Loaded",path);
                resolve();
            };
            document.body.appendChild(s);
        });
    },
    /**
     * @function initBrainBox
     */
    initBrainBox: function initBrainBox() {
        var l=BrainBox.traceLog(initBrainBox);if(l)console.log(l);

        var pr = new Promise(function(resolve, reject) {
            // Add AtlasMaker and friends
            $("#stereotaxic").html('<div id="atlasMaker"></div>');
            $("#atlasMaker").addClass('edit-mode');

            AtlasMakerWidget.initAtlasMaker($("#atlasMaker"))
            .then(function() {
                resolve();
            })
            .catch( err => {
                reject();
                console.error("ERROR:", err);
            });

            // store state on exit
            $(window).on('unload',BrainBox.unload);
        });

        return pr;
    },
    /**
     * @function configureBrainBox
     */
    configureBrainBox: function configureBrainBox(param) {
        var l=BrainBox.traceLog(configureBrainBox);if(l)console.log(l);

        var pr=new Promise(function(resolve, reject) {
            var date=new Date();
            var index=param.annotationItemIndex||0;

            // Copy MRI from source
            $("#msgLog").html("<p>Downloading from source to server...");

            // Configure MRI into atlasMaker
            if(param.info.success===false) {
                date=new Date();
                $("#msgLog").append("<p>ERROR: "+param.info.message+".");
                console.log("<p>ERROR: "+param.info.message+".");
                reject("ERROR: "+param.info.message);

                return;
            }
            BrainBox.info=param.info;

            var arr=param.url.split("/");
            var name=arr[arr.length-1];
            date=new Date();
            $("#msgLog").append("<p>Downloading from server...</p>");

            /**
            * @todo Check it these two lines are of any use...
            */
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

            if(param.fullscreen) {
                AtlasMakerWidget.fullscreen=param.fullscreen;
            } else {
                AtlasMakerWidget.fullscreen=false;
            }

            AtlasMakerWidget.configureAtlasMaker(BrainBox.info,index)
            .then(function(info2) {
                BrainBox.info = info2;

                // check 'edit' access
                var accessStr = BrainBox.info.mri.atlas[index].access;
                var accessLvl = BrainBox.accessLevels.indexOf(accessStr);
                if(accessLvl<0 || accessLvl>BrainBox.accessLevels.length-1)
                    accessLvl = 0;
                if(accessLvl>=2)
                    AtlasMakerWidget.editMode = 1;
                else
                    AtlasMakerWidget.editMode = 0;
                resolve({success: true});

                return;
            })
            .catch( (err) => {
                console.log("ERROR:",err);
                reject("ERROR: "+err);

                return;
            });
        });

        return pr;
    },
    /**
     * @function convertImgObjectURLToDataURL
     * @desc Encodes the ObjectURL obtained from the server jpg images as DataURL,
     *       suitable to be stored as a string in localStorage
     */
    convertImgObjectURLToDataURL: function convertImgObjectURLToDataURL(objURL) {
        var pr = new Promise(function(resolve, reject) {
            var  x = new XMLHttpRequest(), f = new FileReader();
            x.open('GET',objURL,true);
            x.responseType = 'blob';
            x.onload = function (e) {
                f.onload = function (evt) {
                    resolve(evt.target.result);
                };
                f.readAsDataURL(x.response);
            };
            x.send();
        });
        return pr;
    },
    /**
     * @function addCurrentMRIToHistory
     */
    addCurrentMRIToHistory: function addCurrentMRIToHistory() {
        var l=BrainBox.traceLog(addCurrentMRIToHistory);if(l)console.log(l);

        BrainBox.convertImgObjectURLToDataURL(AtlasMakerWidget.brain_img.img.src)
        .then(function(data) {
            var i, foundStored=false;
            var stored=localStorage.AtlasMaker;
            if(stored) {
                stored=JSON.parse(stored);
                if(stored.version && stored.version==BrainBox.version) {
                    foundStored=true;
                    for(i=0;i<stored.history.length;i++) {
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
                url:         BrainBox.info.source,
                view:        AtlasMakerWidget.User.view?AtlasMakerWidget.User.view.toLowerCase():"sag",
                slice:       AtlasMakerWidget.User.slice?AtlasMakerWidget.User.slice:0,
                img:         data,
                lastVisited: (new Date()).toJSON()
            });
            localStorage.AtlasMaker=JSON.stringify(stored);
        });
    },
    /**
     * @function unload
     */
    unload: function unload() {
        /*
        var l=BrainBox.traceLog(unload);if(l)console.log(l);
        var i, obj0, obj1, foundStored=false;
        var stored=localStorage.AtlasMaker;
        if(stored) {
            stored=JSON.parse(stored);
            if(stored.version && stored.version==BrainBox.version) {
                foundStored=true;
                for(i=0;i<stored.history.length;i++) {
                    if(stored.history[i].url==BrainBox.info.source) {
                        obj0 = stored.history.splice(i,1);
                        break;
                    }
                }
            }
        }
        if(foundStored==false) {
            stored={version:BrainBox.version,history:[]};
            obj0 = {};
        }
        
        obj1 = {    
            url:BrainBox.info.source,
            view:AtlasMakerWidget.User.view?AtlasMakerWidget.User.view.toLowerCase():"sag",
            slice:AtlasMakerWidget.User.slice?AtlasMakerWidget.User.slice:0,
            lastVisited:(new Date()).toJSON()
        };
        $.extend(obj0, obj1);
        
        stored.history.push(obj0);
        localStorage.AtlasMaker=JSON.stringify(stored);
        */
    },
    /*
        Annotation related functions
    */
    annotationsArrayToObject: function annotationsArrayToObject(arr) {
        var i,j,project,name,obj={};
        for(i=0;i<arr.length;i++) {
            project = arr[i].project;
            name = arr[i].name;
            if(!obj[project])
                obj[project]={};
            obj[project][name]=JSON.parse(JSON.stringify(arr[i]));
            delete obj[project][name].project;
            delete obj[project][name].name;
        }
        return obj;
    },
    annotationsObjectToArray: function annotationsObjectToArray(obj) {
        var i,j,arr=[];
        for(i in obj) {
            for(j in obj[i]) {
                var o=obj[i][j];
                o.project=i;
                o.name=j;
                arr.push(o);
            }
        }
        return arr;
    },
    /**
     * @function selectAnnotation
     */
    selectAnnotation: function selectAnnotation(annName, annProject) {
        var l=BrainBox.traceLog(selectAnnotation);if(l)console.log(l);
        let i;
        const atlas=BrainBox.info.mri.atlas;

        for(i=0;i<atlas.length;i++) {
            if(atlas[i].name === annName && atlas[i].project === annProject) {
                AtlasMakerWidget.configureAtlasMaker(BrainBox.info,i);
                return;
            }
        }
    },
    /**
     * @function selectAnnotationTableRow
     */
    selectAnnotationTableRow: function selectAnnotationTableRow(index, param) {
        var l=BrainBox.traceLog(selectAnnotationTableRow);if(l)console.log(l);
    
        var table=param.table;
        var currentIndex=$(table).find("tr.selected").index();
    
        if(index>=0 && currentIndex!=index) {
            console.log("bb>>  change selected annotation");
            $(table).find("tr").removeClass("selected");
            $(table).find('tbody tr:eq('+index+')').addClass("selected");
            AtlasMakerWidget.configureAtlasMaker(BrainBox.info,index);
        }
    },
    /**
     * @function appendAnnotationTableRow
     */
    appendAnnotationTableRow: function appendAnnotationTableRow(irow,param) {
        var l=BrainBox.traceLog(appendAnnotationTableRow);if(l)console.log(l);
        
        $(param.table).append(param.trTemplate);

        for(var icol=0;icol<param.objTemplate.length;icol++) {
            switch(param.objTemplate[icol].typeOfBinding) {
                case 1:
                    tw.bind1(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#",irow),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format
                    );
                    break;
                case 2:
                    tw.bind2(
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
    /**
     * @function appendAnnotationTableRow
     */
    appendAnnotationTableRow2: function appendAnnotationTableRow(irow,iarr,param) {
        var l=BrainBox.traceLog(appendAnnotationTableRow);if(l)console.log(l);
        
        $(param.table).append(param.trTemplate);

        for(var icol=0;icol<param.objTemplate.length;icol++) {
            switch(param.objTemplate[icol].typeOfBinding) {
                case 1:
                    tw.bind1(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#",iarr),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format
                    );
                    break;
                case 2:
                    tw.bind2(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#",iarr),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format,
                        param.objTemplate[icol].parse
                    );
                      break;
            }
        }
    },
    /**
     * @function loadLabelsets
     */
    loadLabelsets: function loadLabelsets() {
        var l=BrainBox.traceLog(loadLabelsets);if(l)console.log(l);
        
        return $.getJSON(BrainBox.hostname + "/api/getLabelsets",function(data) {
            BrainBox.labelSets=data;
            /*
                If we wanted to filter out the location, we would use:
                BrainBox.labelSets=$.map(data,function(o){return new URL(o.source).pathname});
            */
        });
    },
    widget: function widget(param) {
        AtlasMakerWidget.useFullTools=false;

        let pr = BrainBox.initBrainBox()
        .then(function() {return BrainBox.loadLabelsets()})
        .then(function() {return $.get({
            url: BrainBox.hostname + '/mri/json',
            data: {
                url: param.url,
                download: true
            }
        })})
        .then(function(mriInfo) {
            param.info = mriInfo;
            let mri = mriInfo.mri;
            
            // if the brain has not been downloaded, mriInfo only contains a url
            // (this url is later used to trigger the file download)
            // if the brain has been downloaded, all the other fields are available,
            // in particular, the `mri` field. In this case, and if the widget aims
            // at loading a specific atlas, this choice can be enforced.

            if(mri && mri.atlas) {
                for(i=0;i<mri.atlas.length;i++) {
                    if(param.project
                       && param.annotation
                       && mri.atlas[i].project === param.project
                       && mri.atlas[i].name === param.annotation) {
                        param.annotationItemIndex = i;
                        break;
                    }
                }
            }

            $('#atlasMaker').append([
            `<a href="${BrainBox.hostname}/mri?url=${param.url}">`,
            '<div style="',
                'position:absolute;',
                'top:5px;',
                'right:5px;',
                'width:48px;',
                'height:48px;',
                'background-color:#222;',
                'border:thin solid #555;',
                'border-radius:32px;',
                'box-shadow: 0px 0px 10px 1px #000;',
                'z-index:10">',
            `<img style="width:32px;position: absolute;left:50%;top:50%;transform:translate(-50%, -50%)" src="${BrainBox.hostname}/img/brainbox-logo-small_noFont.svg"/>`,
            '</div>',
            '</a>'].join(''));

            return BrainBox.configureBrainBox(param)
        })
        .catch((err) => {
            console.log("ERROR",err);
        });

        return pr;
    }
}