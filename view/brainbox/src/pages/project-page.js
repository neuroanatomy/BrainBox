import freeform from '../tools/freeform.js';
import hidden from '../tools/hidden.js';
import multiple from '../tools/multiple.js';

const projShortname = projectInfo.shortname;
const numFilesQuery = 20;
const annotations = {
    text: [],   // collect text annotations
    volume: []  // collect volume annotations
};
let k, h, str, found, annType, annName, file;
let trTemplate;
let objTemplate;
let aParam;
let hashOld;


// Prevent zoom on double tap
$('body').on('touchstart', function preventZoom(e) {
    var t2 = e.timeStamp
      , t1 = $(this).data('lastTouch') || t2
      , dt = t2 - t1
      , fingers = e.originalEvent.touches.length;
    $(this).data('lastTouch', t2);
    if (!dt || dt > 500 || fingers > 1) return; // not double-tap
    e.preventDefault(); // double tap - prevent the zoom
    // also synthesize click events we just swallowed up
    $(this).trigger('click').trigger('click');
});

// collect the project's text annotations
for(k=0;k<projectInfo.annotations.list.length;k++) {
    if (projectInfo.annotations.list[k].type === "text" |
        projectInfo.annotations.list[k].type === "hidden text" |
        projectInfo.annotations.list[k].type === "multiple choices") {
        $("#projectFiles thead tr").append("<th>" + projectInfo.annotations.list[k].name + "</th>");
        annotations.text.push(projectInfo.annotations.list[k]);
    }
}
// collect the project's volume annotations
for(k=0;k<projectInfo.annotations.list.length;k++) {
    if (projectInfo.annotations.list[k].type === "volume") {
        annotations.volume.push(projectInfo.annotations.list[k]);
    }
}

$("#projectName").text(projectInfo.name);

$("#resizeButton").data({flag:-1,x0:0,y0:0});
$("#resizeButton").on('mousedown touchstart',function(e){$(this).data({flag:0,x0:e.pageX,y0:e.pageY})});
$("body").on('mousemove',function(e){resizeButton({x:e.pageX,y:e.pageY})});
$("body").on('touchmove',function(e){resizeButton({x:e.originalEvent.changedTouches[0].pageX,y:e.originalEvent.changedTouches[0].pageY})});
$("body").on('mouseup touchend',function(e){$("#resizeButton").data({flag:-1})});

$("#addProject").click(function(){location="/project/new"});
$("#settings").click(function(){
    var pathname=location.pathname;
    if(pathname.slice(-1)=="/")
        location=pathname+"settings";
    else
        location=pathname+"/settings";
});


// Init BrainBox
//---------------
    BrainBox.initBrainBox()
    .then(function from_project(){
        return BrainBox.loadLabelsets();
    })
    .then(function () {
        // Bind the project's files to the table within #projectFiles
        //------------------------------------------------------------
        trTemplate = ['<tr>'];
        objTemplate = [];

        // configure the binding template for table row and object.
        // the 1st two columns are fixed: name and source
        trTemplate.push(["<td contentEditable=true class='noEmpty'></td>"]);
        objTemplate.push({ typeOfBinding: 2, path: "files.list.#.name"});

        trTemplate.push(["<td><a></a></td>"]);
        objTemplate.push({
            typeOfBinding:1,
            path:"files.list.#.source",
            format:function(e, d){
                $(e).find("a").prop("href", location.origin+"/mri?url=" + d);
                $(e).find("a").html(d.split("/").pop());
            }
        });

        // the following columns are completed from the project's 'annotations' definitions:
        // determine their type of display (either select or freeform at the moment) based data type
        let g;
        for(g=0; g<annotations.text.length; g++) {
            annType = annotations.text[g].type;
            annName = annotations.text[g].name;

            if(annType === "multiple choices") {
                // array of values
                let {td, obj} = multiple(
                    annotations.text[g],
                    "files.list.#.mri.annotations." + projShortname + "." + annName,
                    AtlasMakerWidget.User.username
                );
                trTemplate.push(td);
                objTemplate.push(obj);
            } else if(annType === "text") {
                // freeform text
                let {td, obj} = freeform(
                    annotations.text[g],
                    "files.list.#.mri.annotations." + projShortname + "." + annName,
                    AtlasMakerWidget.User.username
                );
                trTemplate.push(td);
                objTemplate.push(obj);
            } else if(annType === "hidden text") {
                // freeform text
                let {td, obj} = hidden(
                    annotations.text[g],
                    "files.list.#.mri.annotations." + projShortname + "." + annName,
                    AtlasMakerWidget.User.username
                );
                trTemplate.push(td);
                objTemplate.push(obj);
            }
            /**
             * @todo This is the place where 'position' or 'length' annotations should be added
             */
        }
        trTemplate.push("</tr>");
        aParam = {
            table: $("#projectFiles table"),
            info_proxy: info_proxy,
            info: projectInfo,
            trTemplate: trTemplate.join("\n"),
            objTemplate: objTemplate
        };
    })
    .then(function() {

        // Append the project files progressively. Start with the 1st #numFilesQuery files, load and
        // display the 1st file, configure the tools position, and keep querying for the
        // rest of the files
        return $.getJSON("/project/json/"+projectInfo.shortname+"/files", {
            start: 0,
            length: numFilesQuery
        })
    })
    .then(function(list) {
        appendFilesToProject(list);

        // mark first row as selected
        $("#projectFiles tbody tr:eq(0)").addClass("selected");
    })
    .then(function from_project(){return loadProjectFile(0)})
    .then(function from_project(){
        $("#tools-side").detach().appendTo('#tools');
        // connect colours close button
        $(document).on('click touchstart', "#labels-close", function(){$("#labelset").hide()});
    })
    .then(function() {
        queryFiles();
    })
    .catch( err => {
        $("#msgLog").html("ERROR: Can't load data. " + err);
        console.error(err);
    });

// Listen to changes that trigger a metadata save
//------------------------------------------------
    // send data when focus is lost (on blur)
    $(document).on('blur', "#projectFiles table tbody td", function from_project(e) {
        var index = $(e.target).closest('tr').index();
        JSON.stringify(info_proxy); // update content of projectInfo object from proxy by calling all getters
        AtlasMakerWidget.sendSaveMetadataMessage(projectInfo.files.list[index]);
    });
    // blur when [enter] is clicked, to trigger data sending
    $(document).on('keydown', "#projectFiles table tbody td", function(e) {
        if(e.which==13 && $(e.target).attr('contenteditable')) {
            e.preventDefault();
            $(e.target).blur();
        }
    });
    // blur when <select> changes value to trigger data sending
    $("#projectFiles table tbody").on('change', "select", function(e) {
        $(e.target).blur();
    });

// Listen to changes in selected table row
//----------------------------------------
    // listen to changes in file selection by clicking on the file table
    $(document).on('click touchstart', "#projectFiles tbody tr",function() {
        var table=$(this).closest("table");
        var currentIndex=$(table).find("tr.selected").index();
        var index=$(this).index();

        if(index>=0 && currentIndex!=index) {
            $(table).find("tr").removeClass("selected");
            $(this).addClass("selected");
            // remove table with previous annotations
            $("table#volAnnotations tbody").html("");
            // load and bind new file
            loadProjectFile(index);
        }
    });

    // listen to changes in file selection by pressing the up/down arrows
    $(document).on('keydown', function(e){
        var table=$("#projectFiles tbody");
        var index=$(table).find("tr.selected").index();
    
        if(e.keyCode!=38 && e.keyCode!=40)
            return;

        switch(e.keyCode) {
            case 38: // up
                index=(index+projectInfo.files.list.length-1)%projectInfo.files.list.length;
                break;
            case 40: // down
                index=(index+1)%projectInfo.files.list.length;
                break;
        }
        $(table).find("tr").removeClass("selected");
        $(table).find("tr:eq("+index+")").addClass("selected");
    
        // remove table with previous annotations
        $("table#volAnnotations tbody").html("");

        // load and bind new file
        loadProjectFile(index);
    });

    // listen to changes in selected volume annotation
    $(document).on('click touchstart', "#volAnnotations tbody tr", function () {
        var table=$(this).closest("tbody");
        var currentIndex=$(table).find("tr.selected").index();
        var index=$(this).index();

        if(index>=0 && currentIndex!=index) {
            $(table).find("tr").removeClass("selected");
            $(this).addClass("selected");
    
            var iarr,found=false;
            for(iarr=0;iarr<BrainBox.info.mri.atlas.length;iarr++) {
                if(BrainBox.info.mri.atlas[iarr].name==annotations.volume[index].name
                    && BrainBox.info.mri.atlas[iarr].project==projectInfo.shortname) {
                    found=true;
                    break;
                }
            }
            if(found)
                AtlasMakerWidget.configureAtlasMaker(BrainBox.info,iarr);
            else
                console.log("ERROR: A quite unexpected one too...");
        }
    });

// Functions
//----------
function queryFiles() {
    $.getJSON("/project/json/"+projectInfo.shortname+"/files", {
        start: projectInfo.files.list.length,
        length: numFilesQuery
    })
    .then(function(list) {
        if(list.length) {
            appendFilesToProject(list);
            queryFiles();
        } else {
            console.log("All files downloaded. Length:",projectInfo.files.list.length);
        }
    })
}
function appendFilesToProject(list) {
    var i0, i, j;
    
    i0 = projectInfo.files.list.length;
    projectInfo.files.list.push.apply(projectInfo.files.list, list);
    
    // make sure that all mri files have a text annotations object for the project
    for(i=0;i<list.length;i++) {
        file = projectInfo.files.list[i0+i];
        if (!(file.mri)) {
            file.mri = {};
        }
        if (!(file.mri.annotations)) {
            file.mri.annotations = {};
        }
        if (!(file.mri.annotations[projShortname])) {
            file.mri.annotations[projShortname] = {};
        }
    }
    // initialise the relevant annotation entries in each mri file if required
    for(i=0;i<list.length;i++) {
        file = projectInfo.files.list[i0+i];
        for(j=0;j<annotations.text.length;j++) {
            annName = annotations.text[j].name;
            if(!file.mri.annotations[projShortname][annName]) {
                var date=new Date();
                file.mri.annotations[projShortname][annName] = {
                    created: date.toJSON(),
                    modified: date.toJSON(),
                    modifiedBy: AtlasMakerWidget.User.username,
                    type: "text"
                };
            }
        }
    }
    for(var i=0;i<list.length;i++) {
        BrainBox.appendAnnotationTableRow(i0+i,aParam);
    }
}

/**
 * @func loadProjectFile
 * @desc load a new mri from the project list
 */
function loadProjectFile(index) {
    return new Promise(function(resolve, reject) {
        var url=projectInfo.files.list[index].source;
        var params={url:url,view:"cor",slice:180,fullscreen:false};
        $("#loadingIndicator p").text("Loading...");
        $("#loadingIndicator").show();

        /**
         * @todo The mri entry may correspond to a file that has not been downloaded yet!
         */
        var info = projectInfo.files.list[index];

        if($.isEmptyObject(info) === false) {
            // check if the mri contains the required annotations
            var irow; // index of the table row
            var iarr; // index of the object in the data array
            for(irow=0;irow<annotations.volume.length;irow++) {
                found = false;
                if(!info.mri.atlas)
                    info.mri.atlas = [];
                for(iarr=0;iarr<info.mri.atlas.length;iarr++) {
                    if(annotations.volume[irow].name == info.mri.atlas[iarr].name
                       && projectInfo.shortname == info.mri.atlas[iarr].project) {
                        found=true;
                        break;
                    }
                }
                // if it doesn't, create them
                if(found == false) {
                    // add annotation
                    var date=new Date();
                    // add data to annotations array
                    var atlas = {
                        name: annotations.volume[irow].name,
                        project: projectInfo.shortname,
                        created: date.toJSON(),
                        modified: date.toJSON(),
                        modifiedBy: AtlasMakerWidget.User.username,
                        filename: Math.random().toString(36).slice(2)+".nii.gz",	// automatically generated filename
                        labels: annotations.volume[irow].values,
                        owner: AtlasMakerWidget.User.username,
                        type: "volume"
                    };

                    projectInfo.files.list[index].mri.atlas.push(atlas);
                }

                annotations.volume[irow].annotationItemIndex=iarr;
            }
            params.info=projectInfo.files.list[index];

            if(annotations.volume[0]) {
                params.annotationItemIndex = annotations.volume[0].annotationItemIndex;
            } else {
                params.annotationItemIndex = -1;
            }

            BrainBox.configureBrainBox(params)
            .then(function from_project(){

                // bind volume annotations to table#volAnnotations
                var annvol_proxy={};
                var aParam = {
                    table: $("table#volAnnotations"),
                    info_proxy: annvol_proxy,
                    info: BrainBox.info,
                    trTemplate: $.map([
                        "<tr>",
                        " <td></td>",           // volume name
                        " <td></td>",	        // volume label set
                        "</tr>"],function(o){return o}).join(),
                    objTemplate: [
                        {	typeOfBinding:1,
                            path:"mri.atlas.#.name"
                        },
                        {	typeOfBinding:1,
                            path:"mri.atlas.#.labels"
                        }
                    ]
                };

                // add and bind new table row
                for(irow=0;irow<annotations.volume.length;irow++) {
                    BrainBox.appendAnnotationTableRow2(irow,annotations.volume[irow].annotationItemIndex,aParam);
                }
                // update in server
                saveAnnotations(aParam);

                // select the first annotation by default
                // (should be read from project settings)
                $("#annotations tbody tr:eq(0)").addClass("selected");

                AtlasMakerWidget.User.projectPage = projectInfo.shortname;
                AtlasMakerWidget.sendUserDataMessage(JSON.stringify({projectPage:projectInfo.shortname}));

                resolve();
            });
        } else {
            var msg=AtlasMakerWidget.container.find("#text-layer");
            msg.html("<text x='5' y='15' fill='white'>ERROR: File is unreadable</text>");
            console.log("ERROR: Cannot read data. The file is maybe corrupt?");

            reject();
        }
    });
}
/**
 * @func saveAnnotations
 * @desc Save annotations if they have changed
 */
function saveAnnotations(param) {
    JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
    AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
    hashOld = BrainBox.hash(JSON.stringify(BrainBox.info));
}
/**
 * @func resizeButton
 * @desc Resize left tool bar
 */
function resizeButton(p) {
    if($("#resizeButton").data("flag")==0) {
        $("#resizeButton").data({flag:1,x0:p.x,y0:p.y});
    } else if($("#resizeButton").data("flag")==1) {
        var d=$("#resizeButton").data("x0")-p.x;
        $("#left").css({'flex-basis':$("#left").width()-d});
        $("#resizeButton").data({x0:p.x,y0:p.y});
        AtlasMakerWidget.resizeWindow();
    }
}
