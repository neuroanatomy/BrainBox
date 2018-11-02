/*globals projectInfo BrainBox projectShortname*/

// @todo check and be sure the user picks a username from the dropdown menu
// @todo  implement the placeholder for the select tags in the anotation table
// @todo  find a way for the user to give a set of values for the annotations and make it obvious that it works this way
import $ from 'jquery';
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';
import jdenticon from 'jdenticon'
import md5 from 'md5'
import * as tw from '../twoWayBinding.js';

import '../style/style.css';
import '../style/ui.css';
import '../style/projectSettings-style.css';
import '../style/access-style.css';
import '../style/dropdown-style.css';

// Add avatar based on project's name
jdenticon.update($("svg")[0],md5(projectShortname));

// WS Autocompletion
var cb, label;
let ws;
var host = "ws://" + window.location.hostname + ":8080/";
if (window.WebSocket) {
    ws = new WebSocket(host);
} else if (window.MozWebSocket) {
    ws = new MozWebSocket(host);
}
ws.onopen = function(msg) {
    ws.send(JSON.stringify({"type":"autocompleteClient"}));
}
ws.onmessage = function(message) {
    message = JSON.parse(message.data);
    if (message.type === "userNameQuery") {
        var arr;
        if(label=="nickname")
            arr=$.map(message.metadata,function(o){return {label:o.nickname,nickname:o.nickname,name:o.name}});
        if(label=="name")
            arr=$.map(message.metadata,function(o){return {label:o.name,nickname:o.nickname,name:o.name}});
        cb(arr);
    }
}

var projectInfoProxy={};

tw.bind2(projectInfoProxy,projectInfo,"url",$("#projDescription #url"));
tw.bind2(projectInfoProxy,projectInfo,"description",$("#projDescription #description"));
tw.bind2(projectInfoProxy,projectInfo,"name",$("#projectName"));

var accParam = {
    table: $("table#access"),
    info_proxy: projectInfoProxy,
    info: projectInfo,
    trTemplate: $.map([
        "<tr>",
        "    <td contentEditable=true class='noEmpty autocomplete' data-autocomplete='user.nickname'></td>",
        "    <td contentEditable=true class='noEmpty autocomplete' data-autocomplete='user.name'></td>",
        "    <td>",
        "        <div class='access' data-level=2>",
        "            <span class='view' title='view collaborators'></span>",
        "            <span class='edit' title='edit collaborators'></span>",
        "            <span class='add' title='add collaborators'></span>",
        "            <span class='remove' title='remove collaborators'></span>",
        "        </div>",
        "    </td>",
        "    <td>",
        "        <div class='access' data-level=2>",
        "            <span class='view' title='view annotations'></span>",
        "            <span class='edit' title='edit annotations'></span>",
        "            <span class='add' title='add annotations'></span>",
        "            <span class='remove' title='remove annotations'></span>",
        "        </div>",
        "    </td>",
        "    <td>",
        "        <div class='access' data-level=2>",
        "            <span class='view' title='view MRI files'></span>",
        "            <span class='edit' title='edit MRI files' ></span>",
        "            <span class='add' title='add MRI files'></span>",
        "            <span class='remove' title='remove MRI files'></span>",
        "        </div>",
        "    </td>",
        "</tr>"],function(o){return o}).join(""),
    objTemplate: [
        {   typeOfBinding:2,
            path:"collaborators.list.#.username" // nickname
        },
        {   typeOfBinding:2,
            path:"collaborators.list.#.name" // full name
        },
        {   typeOfBinding:2,
            path:"collaborators.list.#.access.collaborators",
            format: function(e,d){$(e).find(".access").attr('data-level',["none","view","edit","add","remove"].indexOf(d))},
            parse: function(e){var level=$(e).find(".access").attr("data-level");return ["none","view","edit","add","remove"][level]}
        },
        {   typeOfBinding:2,
            path:"collaborators.list.#.access.annotations",
            format: function(e,d){$(e).find(".access").attr('data-level',["none","view","edit","add","remove"].indexOf(d))},
            parse: function(e){var level=$(e).find(".access").attr("data-level");return ["none","view","edit","add","remove"][level]}
        },
        {   typeOfBinding:2,
            path:"collaborators.list.#.access.files",
            format: function(e,d){$(e).find(".access").attr('data-level',["none","view","edit","add","remove"].indexOf(d))},
            parse: function(e){var level=$(e).find(".access").attr("data-level");return ["none","view","edit","add","remove"][level]}
        }
    ]
};
for(var i=0;i<projectInfo.collaborators.list.length;i++) {
    BrainBox.appendAnnotationTableRow(i,accParam);
}

var annParam;
BrainBox.loadLabelsets()
.then(function () {
    annParam = {
        table: $("table#annotations"),
        info_proxy: projectInfoProxy,
        info: projectInfo,
        trTemplate: $.map([
            "<tr>",
            " <td contentEditable=true class='noEmpty'></td>",
            " <td><select class='mui-select'>",BrainBox.annotationType.map(function(o){return "<option>"+o+"</option>"}),"</select></td>",    // append annotation types
            " <td contentEditable=true class='noEmpty'>",
            "  <select class='mui-select'>",BrainBox.labelSets.map(function(o){return "<option>"+o.name+"</option>"}),"</select>",
            " </td>", // append label sets
            " <td>","<div class='display' data-check=0></div>","</td>",
//            " <td>","<div class='display' data-check=0>","<span class='check' title='display'></span>","</div>","</td>",
            "</tr>"],function(o){return o}).join(""),
        objTemplate: [
            {   typeOfBinding:2,
                path:"annotations.list.#.name"
            },
            {   typeOfBinding:2,
                path:"annotations.list.#.type",
                format: function(e,d){$(e).find("select").prop('selectedIndex',BrainBox.annotationType.indexOf(d))},
                parse: function(e){return $(e).find("select").val()}
            },
            {   typeOfBinding:2,
                path:"annotations.list.#.values",
                format: function (e,d) {
                    var t=$(e).closest("tr").find("td:eq(1) select").prop('selectedIndex');
                    if(t==0)
                        $(e).find("select").prop('selectedIndex',BrainBox.labelSets.map(function(o){return o.source}).indexOf(d));
                    else
                        $(e).html(d)
                },
                parse: function(e) {
                    var t=$(e).closest("tr").find("td:eq(1) select").prop('selectedIndex');
                    if(t==0)
                        return BrainBox.labelSets[$(e).find("select").prop('selectedIndex')].source;
                    else
                        return $(e).text();
                }
            },
            {   typeOfBinding:2,
                path:"annotations.list.#.display",
                format: function(e,d){$(e).find(".display").attr("data-check",(d=='true')?"1":"0")},
                parse: function(e){return ($(e).find(".display").attr("data-check")=="1"?'true':'false')}
            }
        ]
    };
    var i;
    for(i=0;i<projectInfo.annotations.list.length;i++) {
        BrainBox.appendAnnotationTableRow(i,annParam);
    }
    
    // Each project requires at least 1 volume-type annotation
    // Add a default one if there is none.
    var volAnnFound = false;
    for(i=0;i<projectInfo.annotations.list.length;i++) {
        if(projectInfo.annotations.list[i].type == "volume") {
            volAnnFound = true;
            break;
        }
    }
    if(volAnnFound == false) {
        addAnnotation(annParam);
    }
});

var filesParam = {
    table: $("table#MRIFiles"),
    info_proxy: projectInfoProxy,
    info: projectInfo,
    trTemplate: $.map([
        "<tr>",
        "    <td contentEditable=true class='noEmpty'></td>",
        "    <td contentEditable=true class='noEmpty'></td>",
        "</tr>"],function(o){return o}).join(""),
    objTemplate: [
        {   typeOfBinding:2,
            path:"files.list.#.source"
        },
        {   typeOfBinding:2,
            path:"files.list.#.name"
        }
    ]
};

var cursorFiles = 0;
queryFiles();

function queryFiles() {
    $.get("/project/json/"+projectInfo.shortname+"/files", {start:cursorFiles,length:100,name:true})
    .then(function(list) {
        if(list.length) {
            appendFiles(list);
            cursorFiles += 100;
            queryFiles();
        }
    });
}
function appendFiles(list) {
    projectInfo.files.list.push.apply(projectInfo.files.list, list);
    for(var i=0;i<list.length;i++) {
        BrainBox.appendAnnotationTableRow(cursorFiles + i, filesParam);
    }
    $("#numFiles").text(projectInfo.files.list.length);
}


$("#projDescription #numFiles").text(projectInfo.files.list.length);
$("#projDescription #numAnnotations").text(projectInfo.annotations.list.length);
$("#projDescription #numCollaborators").text(projectInfo.collaborators.list.length);

// for the access widget
$("body").on('click',".view",function(e){onAccessClicked(e,0)});
$("body").on('click',".edit",function(e){onAccessClicked(e,1)});
$("body").on('click',".add",function(e){onAccessClicked(e,2)});
$("body").on('click',".remove",function(e){onAccessClicked(e,3)});
$("#access tbody").on('click','tr',function(e){selectRow(e);disableDeleteOnAnyoneUser(e);});

$("#annotations tbody").on('click','tr',selectRow);
$("#MRIFiles tbody").on('click','tr',selectRow);

$("#saveChanges").click(saveChanges);
$("#deleteProject").click(deleteProject);
$("#goToProject").click(function goToProject(){location.pathname=`/project/${projectShortname}`});

$("body").on('click',".display",function(e){onCheckClicked(e)}); // for the display option

$(document).on('click', "#addCollaborator", function(){addCollaborator(accParam)});
$(document).on('click', "#removeCollaborator", function(){removeCollaborator(accParam)});
$("table#access tr").removeClass("selected");
$("table#access tbody tr").eq(0).addClass("selected");
$("table#access tbody tr:eq(0) td").removeAttr("contentEditable");
$("#removeCollaborator").addClass("disabled");

$(document).on('click', "#addAnnotation", function(){addAnnotation(annParam)});
$(document).on('click', "#removeAnnotation", function(){removeAnnotation(annParam)});
$("table#annotations tr").removeClass("selected");
$("table#annotations tbody tr").eq(0).addClass("selected");

$(document).on('click', "#addFile", function(){addFile(filesParam)});
$(document).on('click', "#removeFile", function(){removeFile(filesParam)});
$(document).on('click', "#importFiles", function(){importFiles()});
$(document).on('click', "#exportFiles", function(){exportFiles()});
$("table#MRIFiles tr").removeClass("selected");
$("table#MRIFiles tbody tr").eq(0).addClass("selected");

$("#importFilesDialogOk").click(importFilesDialog);
$("#importFilesDialogCancel").click(function() {
    $("#importFilesDialog").hide();
});
$("#addProject").click(function(){location="/project/new"});

// listen to type of annotation changes
$("#annotations tbody").on('change', "td:nth-child(2) select", function(e) {
    var irow=$(e.target).closest("tr").index();
    var t=$(e.target).prop('selectedIndex');
    if(t==0) {
        var arr= [
            "<select>",
            BrainBox.labelSets.map(function(o){return "<option>"+o.name+"</option>"}),
            "</select>"
        ];
        var str=$.map(arr,function(o){return o}).join("");
        $("#annotations tbody  tr:eq("+irow+") td:eq(2)").html(str);
    } else {
        $("#annotations tbody  tr:eq("+irow+") td:eq(2)").html("");
    }
});

/**
 * @function onAccessClicked
 * @desc Handles click on one of the 5 access levels: 0=none, 1=view, 2=edit, 3=add, 4=remove
 * @param {Event} e Event triggered by the click
 * @param {int} l Base level of the access icon clicked
 */
function onAccessClicked( e, l ) {
    // access level 
    var al = $( e.target ).closest( "div" ).attr( "data-level" );
    $( e.target ).closest( "div" ).attr( "data-level",l+( al != (l+1) ) );
}

/** 
 * @function onCheckClicked
 * @desc Handles click on 'display' option for annotations in the project settings; 0=do not display; 1=display
 * @param {Event} e Event triggered by click
 */
function onCheckClicked( e, l ) {
    // checkbox toggle for 'display' option
    var checkbox = ($( e.target ).closest("div").attr( "data-check" ) === "1");
    if( checkbox == false ) {
        $( e.target ).closest("div").attr( "data-check", "1" );
    }
    else {
        $( e.target ).closest("div").attr( "data-check", "0" );
    }
}

function selectRow(e) {
    $(e.currentTarget).closest("tbody").find("tr").each(function(index, tag) {
        $(tag).removeClass("selected");
    })
    $(e.currentTarget).addClass("selected");
}
function disableDeleteOnAnyoneUser(e) {
    var curTable = $(e.currentTarget).closest("table").attr("id");

    // check if the selected row belongs to the #access table
    if(curTable === "access") {
        // check if the selected user is 'anyone'
        var rowIndex = $(e.currentTarget).closest("tbody").find("tr.selected").index();
        if(projectInfo.collaborators.list[rowIndex].userID === 'anyone') {
            // if yes, disable the 'remove' button
            $("#removeCollaborator").addClass('disabled');
        } else {
            $("#removeCollaborator").removeClass('disabled');
        }
    }
}

function importFilesDialog() {
    var sum=0;
    $("#importFilesDialog tbody tr").each(function(i,o) {
        var url=$(o).find("td:eq(0)").text();
        var name=$(o).find("td:eq(1)").text();
        var i,found;

        if(url.length<10)
            return;
        
        // update the projectInfo object by calling the proxy's getters
        JSON.stringify(projectInfoProxy);
        
        // look if the MRI file is not already in the list
        found=false;
        for(i in projectInfo.files.list) {
            if(projectInfo.files.list[i].source==url) {
                if(projectInfo.files.list[i].name=="")
                    projectInfoProxy["files.list."+i+".name"]=name;
                found=true;
                break;
            }
        }
        if(found===false) {
            projectInfo.files.list.push({source:url, name:name});

            // add and bind new table row
            var i=projectInfo.files.list.length-1;
            BrainBox.appendAnnotationTableRow(i,filesParam);

            $("#projDescription #numFiles").text(projectInfo.files.list.length);
            
            sum++;
        }
    });
    $("#importFilesDialog").hide();
    console.log(sum,"files added");
}

function exportFiles() {
    // @todo Implement this function
    alert("implement export csv with files in project");
}

function addCollaborator(param) {
    projectInfo.collaborators.list.push({
        userID: "",
        access: {
            collaborators:"view",
            annotations:"view",
            files:"view"
        }
    });

    // add and bind new table row
    var i=projectInfo.collaborators.list.length-1;
    BrainBox.appendAnnotationTableRow(i,param);
    
    /** @todo Fix: This is adding the autocompletion listener again and again to previously
     *        added collaborators
     */
    // configure autocompletion
    $(".autocomplete").autocomplete({
        minLength: 0,
        source: function(req,res) {
            var key = $(this.element).attr('data-autocomplete');
            switch(key) {
                case "user.nickname":
                    ws.send(JSON.stringify({"type":"userNameQuery", "metadata":{"nickname":req.term}}));
                    label="nickname";
                    break;
                case "user.name":
                    ws.send(JSON.stringify({"type":"userNameQuery", "metadata":{"name":req.term}}));
                    label="name";
                    break;
            }
            cb=res;
        },
        select:function(e,ui) {
            var irow=$(e.target).closest('tr').index();
            projectInfoProxy["collaborators.list."+irow+".name"]=ui.item.name;
            projectInfoProxy["collaborators.list."+irow+".userID"]=ui.item.nickname;

            // add user to access objects
            projectInfo.collaborators.list[irow].userID=ui.item.nickname;
        }
    });

    // update number of collaborators counter
    $("#projDescription #numCollaborators").text(projectInfo.collaborators.list.length);
}
function removeCollaborator(param) {
    // remove row from table
    var index=$(param.table).find("tbody .selected").index();
    $(param.table).find('tbody tr:eq('+index+')').remove();
    
    // remove binding
    JSON.stringify(param.info_proxy); // update projectInfo from projectInfoProxy
    var irow=projectInfo.collaborators.list.length-1;
    for(var icol=0; icol<param.objTemplate.length; icol++) {
        tw.unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
    }
    
    // remove row from BrainBox.info.mri.atlas
    projectInfo.collaborators.list.splice(index,1);

    $("#projDescription #numCollaborators").text(projectInfo.collaborators.list.length);
}
function addAnnotation(param) {
    projectInfo.annotations.list.push({
        type:"volume",
        values:BrainBox.labelSets[0].source,
        display:"true"
    });

    // add and bind new table row
    var i=projectInfo.annotations.list.length-1;
    BrainBox.appendAnnotationTableRow(i,param);

    $("#projDescription #numAnnotations").text(projectInfo.annotations.list.length);
}
function removeAnnotation(param) {
    // remove row from table
    var index=$(param.table).find("tbody .selected").index();
    $(param.table).find('tbody tr:eq('+index+')').remove();
    
    // remove binding
    JSON.stringify(param.info_proxy); // update projectInfo from projectInfoProxy
    var irow=projectInfo.annotations.list.length-1;
    for(var icol=0; icol<param.objTemplate.length; icol++) {
        tw.unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
    }
    
    // remove row from BrainBox.info.mri.atlas
    projectInfo.annotations.list.splice(index,1);

    $("#projDescription #numAnnotations").text(projectInfo.annotations.list.length);
}
function addFile(param) {
    projectInfo.files.list.push({});

    // add and bind new table row
    var i=projectInfo.files.list.length-1;
    BrainBox.appendAnnotationTableRow(i,param);

    $("#projDescription #numFiles").text(projectInfo.files.list.length);
}
function removeFile(param) {
    // remove row from table
    var index=$(param.table).find("tbody .selected").index();
    $(param.table).find('tbody tr:eq('+index+')').remove();
    
    // remove binding
    JSON.stringify(param.info_proxy); // update projectInfo from projectInfoProxy
    var irow=projectInfo.files.list.length-1;
    for(var icol=0; icol<param.objTemplate.length; icol++) {
        tw.unbind2(param.info_proxy,param.objTemplate[icol].path.replace("#", irow));
    }
    
    // remove row from BrainBox.info.mri.atlas
    projectInfo.files.list.splice(index,1);

    $("#projDescription #numFiles").text(projectInfo.files.list.length);
    
    // select the closest remaining column
    $(param.table).find('tbody tr:eq('+(Math.min(index,projectInfo.files.list.length-1))+')').addClass('selected');
}
function importFiles() {
    // var input=document.getElementById("i-open-mesh");
    console.log("importing files...");
    $("body").append("<input id='importFilesInput' style='display:none'>");
    var input=$("#importFilesInput")[0];
    console.log(input);
    input.type="file";
    input.onchange=function(e){
        var file=this.files[0];
        var reader = new FileReader();
        reader.onload = function(e) {
            $("#importFilesInput").remove();
            $("#importFilesDialog").show();
            var result=e.target.result;
            var lines=result.split("\n");
            var html=[];
            let cols;
            for(i in lines) {
                cols=lines[i].split(/[ ]*,[ ]*/);
                html.push("<tr><td contentEditable='true'>"+cols[0]+"</td><td>"+cols[1]+"</td></tr>");
            }
            $("#importFilesDialog tbody").append(html.join("\n"));
        }
        reader.readAsText(file);
    }
    input.click();
}
function saveChanges() {
    // update projectInfo from projectInfoProxy
    JSON.stringify(projectInfoProxy);

    $.post("/project/json/"+projectInfo.shortname, {
            data:JSON.stringify(projectInfo)
    }).done(function(a, b) {
        if(a.success) {
            $("#saveFeedback").text("Successfully saved");
            setTimeout(function() {
                $("#saveFeedback").text("");
            },2000);
        } else {
            $("#saveFeedback").text("Unable to save. Please try again later");
            setTimeout(function() {
                $("#saveFeedback").text("");
            },3000);
        }
    }).catch(function(err) {
        $("#saveFeedback").text("Unable to save. Please try again later ("+JSON.stringify(err.responseJSON.message)+")");
        setTimeout(function() {
            $("#saveFeedback").text("");
        },3000);
        console.log(err);
    });
}
function deleteProject() {
    // update projectInfo from projectInfoProxy
    JSON.stringify(projectInfoProxy);

    var res = confirm(
        "Are you sure you want to delete project "
        + projectInfo.shortname+"? "
        + "This operation cannot be undone."
    );
    
    if (res !== true) {
        return;
    }
    
    $.ajax({
        url: "/project/json/"+projectInfo.shortname,
        method: "delete",
        data:JSON.stringify(projectInfo)
    }).done(function(response) {
        if(response.success) {
            $("#saveFeedback").text("Successfully deleted");
            setTimeout(function() {
                $("#saveFeedback").text("");
                location="/";
            },2000);
        } else {
            $("#saveFeedback").text("Unable to delete ("+response.message+")");
            setTimeout(function() {
                $("#saveFeedback").text("");
            },3000);
        }
        console.log(response.message);
    }).catch(function(err) {
        $("#saveFeedback").text("Unable to delete. Please try again later ("+JSON.stringify(err.responseJSON.error.error)+")");
        setTimeout(function() {
            $("#saveFeedback").text("");
        },3000);
        console.log(err);
    });
}
