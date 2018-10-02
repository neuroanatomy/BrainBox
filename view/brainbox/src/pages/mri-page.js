/*global AtlasMakerWidget BrainBox info_proxy mriInfo params*/
import $ from 'jquery';
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';
import * as jsonpatch from 'fast-json-patch';

import * as tw from '../twoWayBinding';
import freeform from '../tools/freeform';
import hidden from '../tools/hidden';
import multiple from '../tools/multiple';

import '../style/style.css';
import '../style/textAnnotations.css';
import '../style/mri-style.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

var mriInfoOrig;
var textAnnotationsArray = [];
var version=1;
var volAnnParam, textAnnParam;

// Prevent zoom on double tap
$('body').on('touchstart', function preventZoom(e) {
    var t2 = e.timeStamp,
        t1 = $(this).data('lastTouch') || t2,
        dt = t2 - t1,
        fingers = e.originalEvent.touches.length;
    $(this).data('lastTouch', t2);
    if (!dt || dt > 500 || fingers > 1) return; // not double-tap
    e.preventDefault(); // double tap - prevent the zoom
    // also synthesize click events we just swallowed up
    $(this).trigger('click').trigger('click');
});

if( $.isEmptyObject(mriInfo)) {
    $("#stereotaxic").prepend("<h2>ERROR: Cannot read the data.</h2><p>The file is maybe corrupt?</p>");
    console.log("ERROR: Cannot read data. The file is maybe corrupt?");

    $("#annotationsPane").hide();
    $("#data").show();

} else {
    params.info=mriInfo;

    var fullscreen=false;
    if(params.fullscreen)
        params.fullscreen=(params.fullscreen=="true");

    $("#loadingIndicator").show();

    // Load data
    BrainBox.initBrainBox()
    .then(function () { console.log("BrainBox initialised"); return BrainBox.loadLabelsets(); })
    .then(function () { console.log("Label sets loaded"); return BrainBox.configureBrainBox(params); })
    .then(function () {
        console.log("BrainBox configured");
        // backup the original MRI info
        mriInfoOrig = JSON.parse(JSON.stringify(BrainBox.info));
         
        // Serialise text annotations object (text annotations are stored as objects in the
        // database, but used as an array here)
        if(mriInfo.mri && mriInfo.mri.annotations) {
            textAnnotationsArray = BrainBox.annotationsObjectToArray(mriInfo.mri.annotations);
        }

    // Bind general information
    //--------------------------
        tw.bind2(info_proxy,BrainBox.info,"name",$("#name"));
        tw.bind1(info_proxy,BrainBox.info,"source",$("#source"));
        tw.bind1(info_proxy,BrainBox.info,"included",$("#included"), tw.date_format);


    // Bind volume-type annotations
    //------------------------------
        volAnnParam = {
            table: $("table#annotations"),
            info_proxy: info_proxy,
            info: BrainBox.info,
            trTemplate: $.map([
                "<tr>",
                " <td contentEditable=true class='noEmpty'></td>", // name
                " <td><select>",$.map(BrainBox.labelSets,function(o){return "<option>"+o.name+"</option>"}),"</select></td>",	// value
                " <td class='noEmpty'></td>", // project
                " <td></td>", // modified
                " <td>", // access
                "  <div class='access'>",
                "   <span class='view' title='view annotations'></span>",
                "   <span class='edit' title='edit annotations'></span>",
                "   <span class='add' title='add annotations'></span>",
                "   <span class='remove' title='remove annotations'></span>",
                "  </div>",
                " </td>",
                "</tr>"],function(o){return o}).join(""),
            objTemplate: [
                {   typeOfBinding:2,
                    path:"mri.atlas.#.name" // name
                },
                {   typeOfBinding:2,
                    path:"mri.atlas.#.labels", //value
                    format: function(e,d){$(e).find("select").prop('selectedIndex',$.map(BrainBox.labelSets,function(o){return o.source}).indexOf(d))},
                    parse: function(e){var name=$(e).find("select").val(),i=$.map(BrainBox.labelSets,function(o){return o.name}).indexOf(name);return BrainBox.labelSets[i].source}
                },
                {   typeOfBinding:1, // project
                    path:"mri.atlas.#.project",
                    format: function(e,d){$(e).html('<a href="/project/'+d+'">'+d+'</a>')}
                },
                {   typeOfBinding:1,
                    path:"mri.atlas.#.modified",
                    format: tw.date_format
                },
                {   typeOfBinding:1,
                    path:"mri.atlas.#.access",
                    format: function(e,d){$(e).find(".access").attr('data-level',["none","view","edit","add","remove"].indexOf(d))},
                    parse: function(e){var level=$(e).find(".access").attr("data-level");return ["none","view","edit","add","remove"][level]}
                }
            ]
        };
        for(var i=0;i<BrainBox.info.mri.atlas.length;i++) {
            BrainBox.appendAnnotationTableRow(i,volAnnParam);
        }
        // connect pop-down menus
        $(document).on('change', "table#annotations select", function(){
            var col=$("table#annotations tr:eq(0) th:eq("+$(this).closest('td')[0].cellIndex+")").text();
            var index=$(this).closest('tr')[0].rowIndex-1;
            switch(col) {
                case "Value":
                    var url="/labels/" + info_proxy["mri.atlas."+index+".labels"];
                    $.getJSON(url,function(json) {
                        AtlasMakerWidget.configureOntology(json);
                        AtlasMakerWidget.changePenColor(0);
                        AtlasMakerWidget.brain_img.img=null; // to force redraw with new colors
                        AtlasMakerWidget.drawImages();
                        $("#loadingIndicator").hide();
                    });
                    break;
            }
        });
        // volume annotation table: select row
        $(document).on('click touchstart', "#annotations tr",function(){BrainBox.selectAnnotationTableRow($(this).index(),volAnnParam)});
        // volume annotations table: add, remove and save annotations
        $(document).on('click touchstart', "#addAnnotation", function(){addAnnotation(volAnnParam)});
        $(document).on('click touchstart', "#removeAnnotation", function(){removeAnnotation(volAnnParam)});
        // volume annotations table: select the first row by default
        $("table#annotations tr").removeClass("selected");
        $("table#annotations tr").eq(1).addClass("selected");

    // Bind text annotations
    //-----------------------
        var trTemplate;
        var objTemplate;
        var i, j, p, n;

        trTemplate = [
            "<tr>",
            " <td contentEditable=true class='noEmpty'></td>", // name
            " <td contentEditable=true class='noEmpty'></td>", // value
            " <td class='noEmpty'></td>", // project
            " <td></td>", // modified
            " <td>", // access
            "  <div class='access'>",
            "   <span class='view' title='view annotations'></span>",
            "   <span class='edit' title='edit annotations'></span>",
            "   <span class='add' title='add annotations'></span>",
            "   <span class='remove' title='remove annotations'></span>",
            "  </div>",
            " </td>",
            "</tr>"
        ].join("");

        objTemplate = [
            {   typeOfBinding:2,
                path:"#.name", // name
            },
            {   typeOfBinding:2,
                path:"#.data" // value
            },
            {   typeOfBinding:1,
                path:"#.project", // project
                format: function(e,d){$(e).html('<a href="/project/'+d+'">'+d+'</a>')}
            },
            {   typeOfBinding:1,
                path:"#.modified", // modified
                format: tw.date_format
            },
            {   typeOfBinding:1,
                path:"#.access",
                format: function(e,d){$(e).find(".access").attr('data-level',BrainBox.accessLevels.indexOf(d))},
                parse: function(e){var level=$(e).find(".access").attr("data-level");return BrainBox.accessLevels[level]}
            }
        ];

        textAnnParam = {
            table: $("table#textAnnotations"),
            info_proxy: info_proxy,
            info: textAnnotationsArray,
            trTemplate: trTemplate,
            objTemplate: objTemplate
        };

        for(i=0;i<textAnnotationsArray.length;i++) {
            BrainBox.appendAnnotationTableRow(i,textAnnParam);
        }

        $(document).on('click touchstart', "#textAnnotations tr",function() {
            var table=$(this).closest("tbody");
            $(table).find("tr").removeClass("selected");
            $(this).addClass("selected");
        });
        $(document).on('click touchstart', "#addTextAnnotation", function(){addTextAnnotation(textAnnParam)});
        $(document).on('click touchstart', "#removeTextAnnotation", function(){removeTextAnnotation(textAnnParam)});

        // text annotations table: select the first row by default
        $("table#textAnnotations tr").removeClass("selected");
        $("table#textAnnotations tr").eq(1).addClass("selected");
        
        // connect close button in labels set
        $(document).on('click touchstart', "#labels-close", function(){$("#labelset").hide()});

        $("#data").show();

    // Listen to changes that trigger a metadata save
    //------------------------------------------------
        // send data when focus is lost (on blur)
        $(document).on('blur', "[contenteditable]", function from_project(e) {
            saveAnnotationsChange(BrainBox.info);
        });
        // blur when [enter] is clicked, to trigger data sending
        $(document).on('keydown', "[contenteditable]", function(e) {
            if(e.which==13 && $(e.target).attr('contenteditable')) {
                e.preventDefault();
                $(e.target).blur();
            }
        });
        // blur when <select> changes value to trigger data sending
        $("#annotations tbody, #textAnnotations tbody").on('change', "select", function(e) {
            $(e.target).blur();
            saveAnnotationsChange(BrainBox.info);
        });

    // WS Autocompletion
    //-------------------
        var cb, label;
        AtlasMakerWidget.receiveFunctions["similarProjectNamesQuery"] = function(data) {
            var arr = [];
            if(label=="similarProjectNames")
                arr=$.map(data.metadata,function(o){return {label:o.shortname,shortname:o.shortname,name:o.name}});
            cb(arr);
        };

        $(".autocomplete").autocomplete({
            minLength: 0,
            source: function(req,res) {
                var key = $(this.element).attr('data-autocomplete');
                switch(key) {
                    case "user.similarProjectNames":
                        AtlasMakerWidget.socket.send(JSON.stringify({"type":"similarProjectNamesQuery", "metadata":{"projectName":req.term}}));
                        label="similarProjectNames";
                        break;
                }
                cb=res;
            },
            select:function(e,ui) {
                var irow=$(e.target).closest('tr').index();
                info_proxy["mri.atlas."+irow+".project"]=ui.item.name;

                // add user to access objects
                // projectInfo.collaborators.list[irow].userID=ui.item.nickname;
            }
        });

    })
    .catch((err) => {
        $("#msgLog").html("ERROR: Can't load data. " + err);
        console.error(err);
    });
}

$("#addProject").click(function(){location="/project/new"});

/**
 * @function addAnnotation
 * @desc Add an empty volume annotation
 */
function addAnnotation(param) {
    var date=new Date();
    var i, found;

    // check that there is no other empty annotation already created
    found = false;
    for(i=0;i<BrainBox.info.mri.atlas.length;i++) {
        if(BrainBox.info.mri.atlas[i].name === "" && BrainBox.info.mri.atlas[i].project === "") {
            found = true;
            break;
        }
    }
    if(found) {
        $("#annotationMessage").text("An empty annotation already exists");
        setTimeout(function(){$("#annotationMessage").text("")},2000);
        return;
    }
    
    // add data to annotations array
    BrainBox.info.mri.atlas.push({
        name:"",
        project:"",
        access: "edit", 
        created: date.toJSON(), 
        modified: date.toJSON(), 
        filename: Math.random().toString(36).slice(2)+".nii.gz",	// automatically generated filename
        labels: "foreground.json",
        owner: AtlasMakerWidget.User.username,
        type: "volume"
    });

    // add and bind new table row
    var i=BrainBox.info.mri.atlas.length-1;
    BrainBox.appendAnnotationTableRow(i,param);
    
    //select new annotation
    BrainBox.selectAnnotationTableRow(i,param);

    // update in server
    saveAnnotationsChange(BrainBox.info);
}

/**
 * @function removeAnnotation
 */
function removeAnnotation(param) {
    // find row index
    var index=$(param.table).find("tbody .selected").index();

    // prevent removal of a last projet-less annotation
    if(BrainBox.info.mri.atlas[index].project == "") {
        var nPublicAnnotations = BrainBox.info.mri.atlas.map(function(o){return (o.project=="")}).length;
        if(nPublicAnnotations == 1) {
            $("#annotationMessage").text("There has to be at least 1 public volume annotation");
            setTimeout(function(){$("#annotationMessage").text("")},2000);
            return;
        }
    }

    // remove row from table
    $(param.table).find('tbody tr:eq('+index+')').remove();

    // select previous row (or 1st one)
    BrainBox.selectAnnotationTableRow(Math.max(0,index-1),param);

    // remove binding
    JSON.stringify(param.info_proxy); // update BrainBox.info from info_proxy
    var irow=BrainBox.info.mri.atlas.length-1;
    for(var icol=0; icol<param.objTemplate.length; icol++) {
        tw.unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
    }

    // remove row from BrainBox.info.mri.atlas
    BrainBox.info.mri.atlas.splice(index,1);

    // update in server
    saveAnnotationsChange(BrainBox.info);
}
/**
 * @function addTextAnnotation
 */
function addTextAnnotation(param) {
    var date=new Date();
    var i;
    
    // check that there is no other empty annotation already created
    if(BrainBox.info.mri.annotations[""] && BrainBox.info.mri.annotations[""][""]) {
        $("#textAnnotationMessage").text("An empty annotation already exists");
        setTimeout(function(){$("#textAnnotationMessage").text("")},2000);
        return;
    }

    // add data to annotations array
    textAnnotationsArray.push({
        name:"",
        project:"",
        access: "edit", 
        created: date.toJSON(), 
        modified: date.toJSON(), 
        owner: AtlasMakerWidget.User.username,
        type: "text",
        data: ""
    });
    // add and bind new table row
    var i=textAnnotationsArray.length-1;
    BrainBox.appendAnnotationTableRow(i,param);

    //select new annotation
    selectTextAnnotationTableRow(i,param);

    // save change
    saveAnnotationsChange(BrainBox.info);
}
/**
 * @function removeTextAnnotation
 */
function removeTextAnnotation(param) {
    var index=$(param.table).find("tbody .selected").index();
    $(param.table).find('tbody tr:eq('+index+')').remove();
    // remove binding
    JSON.stringify(param.info_proxy); // update textAnnotationsArray from info_proxy
    var irow=textAnnotationsArray.length-1;
    for(var icol=0; icol<param.objTemplate.length; icol++) {
        tw.unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
    }
    // remove row from textAnnotationsArray
    textAnnotationsArray.splice(index,1);

    // select previous row (or 1st one)
    selectTextAnnotationTableRow(Math.max(0,index-1),param);

    // save change
    saveAnnotationsChange(BrainBox.info);
}
function selectTextAnnotationTableRow(index,param) {
    var table=param.table;
    var currentIndex=$(table).find("tr.selected").index();

    if(index>=0 && currentIndex!=index) {
        $(table).find("tr").removeClass("selected");
        $(table).find('tbody tr:eq('+index+')').addClass("selected");
    }
}

/**
 * @function saveAnnotationsChange
 */
function saveAnnotationsChange(info) {
    var i, j;

    // update content of projectInfo object from proxy by calling all getters
    JSON.stringify(info_proxy);

    // check the info object for duplicate volume annotations
    for(i=0;i<info.mri.atlas.length-1;i++) {
        for(j=i+1;j<info.mri.atlas.length;j++) {
            if( info.mri.atlas[i].name === info.mri.atlas[j].name
                && info.mri.atlas[i].project === info.mri.atlas[j].project) {
                $("#annotationMessage").text("There is already an annotation with that name and project");
                setTimeout(function(){$("#annotationMessage").text("")},2000);
                //$.extend(true, info.mri, mriInfoOrig.mri);
                tw.resetBindingProxy(volAnnParam, mriInfoOrig);
                return;
            }
        }
    }

    // check the info object for duplicate text annotations
    for(i=0;i<textAnnotationsArray.length-1;i++) {
        for(j=i+1;j<textAnnotationsArray.length;j++) {
            if( textAnnotationsArray[i].name === textAnnotationsArray[j].name
                && textAnnotationsArray[i].project === textAnnotationsArray[j].project) {
                $("#textAnnotationMessage").text("There is already an annotation with that name and project");
                setTimeout(function(){$("#textAnnotationMessage").text("")},2000);
                //$.extend(true, textAnnotationsArray, BrainBox.annotationsObjectToArray(mriInfoOrig.mri.annotations));
                tw.resetBindingProxy(textAnnParam, BrainBox.annotationsObjectToArray(mriInfoOrig.mri.annotations));
                return;
            }
        }
    }
        
    // convert the text annotations array into an object
    info.mri.annotations = BrainBox.annotationsArrayToObject(textAnnotationsArray);
    
    // compute a diff patch between the new and old versions of the info object
    var patch = jsonpatch.compare(mriInfoOrig, info);
    if(patch.length == 0) {
        console.log("Nothing changed");
        return;
    }
    
    // send the patch to the server and update the stored version
    AtlasMakerWidget.sendSaveMetadataMessage(info,"patch",patch)
    .then(function() {
        mriInfoOrig = JSON.parse(JSON.stringify(info));
    });
}
