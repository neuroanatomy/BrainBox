import $ from 'jquery'
import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';
import * as tw from '../twoWayBinding.js';

import '../style/style.css';
import '../style/ui.css';
import '../style/user-style.css';

var cursorFiles = 0;
var cursorAtlas = 0;
var cursorProjects = 0;

userInfo = JSON.parse(userInfo);
userInfo.MRIFiles = [];
userInfo.atlasFiles = [];
userInfo.projects = [];

// switch tabs
$("a.tab").click(function() {
    $("a.tab").removeClass("selected");
    $(this).addClass("selected");
    $(".tabContent").hide();
    selectTab($(this).attr('value'));
});

queryFiles();
queryAtlas();
queryProjects();

$("#addProject").click(function(){location="/project/new"});
$("#settings").click(function(){
    var pathname=location.pathname;
    if(pathname.slice(-1)=="/")
        location=pathname+"settings";
    else
        location=pathname+"/settings";
});

selectTab(tab);

function selectTab(tab) {
    $(".tab").removeClass("selected");
    switch(tab) {
        case "mri":
            $(".tab:eq(0)").addClass("selected");
            $("#MRIFiles").show();
            break;
        case "atlas":
            $(".tab:eq(1)").addClass("selected");
            $("#atlasFiles").show();
            break;
        case "projects":
            $(".tab:eq(2)").addClass("selected");
            $("#projects").show();
            break;
    }
}
function queryFiles() {
    $.getJSON(`/user/json/${nickname}/files`, {start:cursorFiles, length:100})
    .then(function(res) {
        if(res.success) {
            appendFiles(res.list);
            cursorFiles += 100;
            queryFiles();
        }
    });
}
function appendFiles(list) {
    userInfo.MRIFiles.push.apply(userInfo.MRIFiles, list);
    for(var i=0;i<list.length;i++) {
        $('#MRIFiles tbody').append([
            '<tr><td><a href="/mri?url=',
            list[i].url,
            '">',
            (list[i].name?list[i].name:list[i].url),
            '</a></td><td>',
            list[i].volDimensions,
            '</td><td>',
            list[i].included,
            '</td></tr>'
        ].join(""));
    }
    $("#numMRI").text(userInfo.MRIFiles.length);
}
function queryAtlas(list) {
    $.getJSON(`/user/json/${nickname}/atlas`, {start:userInfo.atlasFiles.length, length:100})
    .then(function(res) {
        if(res.success) {            
            appendAtlas(res.list);
            cursorAtlas += 100;
            queryAtlas();
        }
    });
}
function appendAtlas(list) {
    userInfo.atlasFiles.push.apply(userInfo.atlasFiles, list);
    for(var i=0;i<list.length;i++) {
        $('#atlasFiles tbody').append([
            '<tr><td><a href="/mri?url=',
            list[i].url,
            '">',
            (list[i].parentName?list[i].parentName:list[i].url),
            '</a></td><td class="noEmpty">',
            list[i].name,
            '</td><td><a href="',
            list[i].projectURL,
            '" class="noEmpty">',
            list[i].project,
            '</a></td><td>',
            list[i].modified,
            '</td></tr>'
        ].join(""));
    }
    $("#numAtlas").text(userInfo.atlasFiles.length);
}
function queryProjects() {
    $.getJSON(`/user/json/${nickname}/projects`, {start:userInfo.projects.length, length:100})
    .then(function(res) {
        if(res.success) {
            appendProjects(res.list);
            cursorProject += 100;
            queryProjects();
        }
    });
}
function appendProjects(list) {
    userInfo.projects.push.apply(userInfo.projects, list);
    for(var i=0;i<list.length;i++) {
        $('#projects tbody').append([
            '<tr><td><div style="position:relative"><a style="margin-left:15px" class="projectName" href="',
            list[i].projectURL,
            '">',
            list[i].project,
            '</a><a href="',
            list[i].projectURL,
            '/settings" class="settings" title="Settings" style="position:absolute;top:0;left:0"><img style="width:11px; margin:3px 8px 0 0" src="/img/settings.svg"/></a></div></td><td>',
            list[i].numFiles,
            '</td><td>',
            list[i].numCollaborators,
            '</td><td><a href="/user/',
            list[i].owner,
            '">',
            list[i].owner,
            '</a></td><td>',
            list[i].modified,
            '</td></tr>'
        ].join(""));
    }
    $("#numProjects").text(userInfo.projects.length);
}
