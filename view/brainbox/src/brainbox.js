/* global AtlasMakerWidget*/
/*! BrainBox */

/**
 * @library BrainBox
 * @version 0.0.1
 * @brief Real-time collaboration in neuroimaging
 */

import * as tw from './twoWayBinding.js';
import $ from 'jquery';

var hashOld;

/**
 * @page BrainBox
 */
export var BrainBox={
    version: 1,
    debug: 1,
    hostname: 'http://localhost:3001', //'', // 'http://brainbox.pasteur.fr',
    info:{},
    labelSets:null,
    annotationType:["volume", "text", "multiple choices", "hidden text"],
    accessLevels: ["none", "view", "edit", "add", "remove"],

    /*
        JavaScript implementation of Java's hashCode method from
        http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
    */
    /**
     * @function hash
     * @param {string} str String to hash
     * @returns {string} A hash
     */
    hash: function hash(str) {
        let v0 = 0;
        let v1;
        const abc="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
        let i;
        for(i=0; i<str.length; i++) {
            const ch=str.charCodeAt(i);
            v0=((v0<<5)-v0)+ch;
            v0&=v0;
        }
        const sz=abc.length;
        let v;
        let res="";
        for(i=0; i<8; i++) {
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
     * @param {string} path Path to script, either a local path or a url
     * @param {function} testScriptPresent Function to test if the script is already present.
     *        If undefined, the script will be loaded.
     * @returns {object} A promise
     */
    loadScript: function loadScript(path, testScriptPresent) {
        return new Promise(function(resolve, reject) {
            if(testScriptPresent && testScriptPresent()) {
                console.log("[loadScript] Script", path, "already present, not loading it again");

                return resolve();
            }
            var s = document.createElement("script");
            s.src = path;
            s.onload=function () {
                console.log("Loaded", path);
                resolve();
            };
            document.body.appendChild(s);
        });
    },

    /**
     * @function initBrainBox
     * @returns {object} A promise
     */
    initBrainBox: function initBrainBox() {
        var pr = new Promise(function(resolve, reject) {
            // Add AtlasMaker and friends
            $("#stereotaxic").html('<div id="atlasMaker"></div>');
            $("#atlasMaker").addClass('edit-mode');

            AtlasMakerWidget.initAtlasMaker($("#atlasMaker"))
            .then(function() {
                resolve();
            })
            .catch( (err) => {
                console.error("ERROR:", err);
                reject(err);
            });

            // store state on exit
            $(window).on('unload', BrainBox.unload);
        });

        return pr;
    },

    /**
     * @function configureBrainBox
     * @param {object} param Configuration parameters
     * @returns {object} A promise
     */
    configureBrainBox: function configureBrainBox(param) {
        var pr=new Promise(function(resolve, reject) {
            var index=param.annotationItemIndex||0;

            // Copy MRI from source
            $("#msgLog").html("<p>Downloading from source to server...");

            // Configure MRI into atlasMaker
            if(param.info.success===false) {
                $("#msgLog").append("<p>ERROR: "+param.info.message+".");
                console.log("<p>ERROR: "+param.info.message+".");
                reject(new Error(param.info.message));

                return;
            }
            BrainBox.info=param.info;

            $("#msgLog").append("<p>Downloading from server...</p>");

            /**
            * @todo Check it these two lines are of any use...
            */
            param.dim=BrainBox.info.dim; // this allows to keep dim and pixdim through annotation changes
            param.pixdim=BrainBox.info.pixdim;

            // re-instance stored configuration
            var stored=localStorage.AtlasMaker;
            if(stored) {
                stored=JSON.parse(stored);
                if(stored.version && stored.version === BrainBox.version) {
                    for(var i=0; i<stored.history.length; i++) {
                        if(stored.history[i].url === param.url) {
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
            if(param.slice) { AtlasMakerWidget.User.slice=param.slice; }

            if(param.fullscreen) {
                AtlasMakerWidget.fullscreen=param.fullscreen;
            } else {
                AtlasMakerWidget.fullscreen=false;
            }

            AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index)
            .then(function(info2) {
                BrainBox.info = info2;

                // check 'edit' access
                var accessStr = BrainBox.info.mri.atlas[index].access;
                var accessLvl = BrainBox.accessLevels.indexOf(accessStr);
                if(accessLvl<0 || accessLvl>BrainBox.accessLevels.length-1) { accessLvl = 0; }
                if(accessLvl>=2) { AtlasMakerWidget.editMode = 1; } else { AtlasMakerWidget.editMode = 0; }
                resolve({success: true});


            })
            .catch( (err) => {
                console.log("ERROR:", err);
                reject(err);


            });
        });

        return pr;
    },

    /**
     * @function convertImgObjectURLToDataURL
     * @desc Encodes the ObjectURL obtained from the server jpg images as DataURL,
     *       suitable to be stored as a string in localStorage
     * @param {string} objURL Object URL
     * @returns {object} A promise
     */
    convertImgObjectURLToDataURL: function convertImgObjectURLToDataURL(objURL) {
        var pr = new Promise(function(resolve, reject) {
            const x = new XMLHttpRequest();
            const f = new FileReader();
            x.open('GET', objURL, true);
            x.responseType = 'blob';
            x.onload = function () {
                f.onload = function (evt) {
                    resolve(evt.target.result);
                };
                f.readAsDataURL(x.response);
            };
            x.onerror = function () {
                reject(new Error("Can't convert image to data URL"));
            };
            x.send();
        });

        return pr;
    },

    /**
     * @function addCurrentMRIToHistory
     * @returns {void}
     */
    addCurrentMRIToHistory: function addCurrentMRIToHistory() {
        BrainBox.convertImgObjectURLToDataURL(AtlasMakerWidget.brain_img.img.src)
        .then(function(data) {
            let foundStored=false;
            let stored=localStorage.AtlasMaker;
            if(stored) {
                stored=JSON.parse(stored);
                if(stored.version && stored.version === BrainBox.version) {
                    foundStored=true;
                    for(let i=0; i<stored.history.length; i++) {
                        if(stored.history[i].url === BrainBox.info.source) {
                            stored.history.splice(i, 1);
                            break;
                        }
                    }
                }
            }
            if(foundStored === false) {
                stored={version:BrainBox.version, history:[]};
            }
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
     * @returns {void}
     */
    unload: function unload() {

        /*
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

    /**
    * @function annotationsArrayToObject
    * @param {array} arr Array of annotations
    * @returns {object} Object of annotations
    */
    annotationsArrayToObject: function annotationsArrayToObject(arr) {
        let i;
        const obj={};
        for(i=0; i<arr.length; i++) {
            const {project, name} = arr[i];
            if(!obj[project]) { obj[project]={}; }
            obj[project][name]=JSON.parse(JSON.stringify(arr[i]));
            delete obj[project][name].project;
            delete obj[project][name].name;
        }

        return obj;
    },

    /**
    * @function annotationsArrayToObject
    * @param {object} obj Object of annotations
    * @returns {array} Array of annotations
    */
    annotationsObjectToArray: function annotationsObjectToArray(obj) {
        const arr=[];
        for(const i in obj) {
            if({}.hasOwnProperty.call(obj, i)) {
                for(const j in obj[i]) {
                    if({}.hasOwnProperty.call(obj[i], j)) {
                        var o=obj[i][j];
                        o.project=i;
                        o.name=j;
                        arr.push(o);
                    }
                }
            }
        }

        return arr;
    },

    /**
     * @function selectAnnotation
     * @param {string} annName Annotation name
     * @param {string} annProject Annotation project
     * @returns {void}
     */
    selectAnnotation: function selectAnnotation(annName, annProject) {
        let i;
        const {atlas} = BrainBox.info.mri;

        for(i=0; i<atlas.length; i++) {
            if(atlas[i].name === annName && atlas[i].project === annProject) {
                AtlasMakerWidget.configureAtlasMaker(BrainBox.info, i);

                return;
            }
        }
    },

    /**
     * @function selectAnnotationTableRow
     * @param {number} index Row index
     * @param {object} param Binding param
     * @returns {void}
     */
    selectAnnotationTableRow: function selectAnnotationTableRow(index, param) {
        var {table} = param;
        var currentIndex=$(table)
                          .find("tr.selected")
                          .index();
        if(index>=0 && currentIndex !== index) {
            console.log("bb>>  change selected annotation");
            $(table)
              .find("tr")
              .removeClass("selected");
            $(table)
              .find('tbody tr:eq('+index+')')
              .addClass("selected");
            AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
        }
    },

    /**
     * @function appendAnnotationTableRow
     * @param {number} irow Row index
     * @param {object} param Binding object
     * @returns {void}
     */
    appendAnnotationTableRow: function appendAnnotationTableRow(irow, param) {
        $(param.table).append(param.trTemplate);

        for(var icol=0; icol<param.objTemplate.length; icol++) {
            switch(param.objTemplate[icol].typeOfBinding) {
                case 1:
                    tw.bind1(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#", irow),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format
                    );
                    break;
                case 2:
                    tw.bind2(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#", irow),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format,
                        param.objTemplate[icol].parse
                    );
                    break;
            }
        }
    },

    /**
     * @function appendAnnotationTableRow2
     * @param {number} irow Row index
     * @param {number} iarr Array index
     * @param {object} param Binding object
     * @returns {void}
     */
    appendAnnotationTableRow2: function appendAnnotationTableRow2(irow, iarr, param) {
        $(param.table).append(param.trTemplate);

        for(var icol=0; icol<param.objTemplate.length; icol++) {
            switch(param.objTemplate[icol].typeOfBinding) {
                case 1:
                    tw.bind1(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#", iarr),
                        $(param.table).find("tr:eq("+(irow+1)+") td:eq("+icol+")"),
                        param.objTemplate[icol].format
                    );
                    break;
                case 2:
                    tw.bind2(
                        param.info_proxy,
                        param.info,
                        param.objTemplate[icol].path.replace("#", iarr),
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
     * @returns {object} A promise
     */
    loadLabelsets: function loadLabelsets() {
        return $.getJSON(BrainBox.hostname + "/api/getLabelsets", function(data) {
            BrainBox.labelSets=data;

            /*
                If we wanted to filter out the location, we would use:
                BrainBox.labelSets=$.map(data,function(o){return new URL(o.source).pathname});
            */
        });
    },

    /**
     * @function widget
     * @param {object} param Widget configuration parameters
     * @returns {object} A promise
     */
    widget: function widget(param) {
        AtlasMakerWidget.useFullTools=false;

        const pr = BrainBox.initBrainBox()
        .then(function() { return BrainBox.loadLabelsets(); })
        .then(function() {
             return $.get({
                url: BrainBox.hostname + '/mri/json',
                data: {
                    url: param.url,
                    download: true
                }
            });
        })
        .then(function(mriInfo) {
            param.info = mriInfo;
            const {mri} = mriInfo;
            let i;

            // if the brain has not been downloaded, mriInfo only contains a url
            // (this url is later used to trigger the file download)
            // if the brain has been downloaded, all the other fields are available,
            // in particular, the `mri` field. In this case, and if the widget aims
            // at loading a specific atlas, this choice can be enforced.

            if(mri && mri.atlas) {
                for(i=0; i<mri.atlas.length; i++) {
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
                '</a>'
            ].join(''));

            return BrainBox.configureBrainBox(param);
        })
        .catch((err) => {
            console.log("ERROR", err);
        });

        return pr;
    }
};
