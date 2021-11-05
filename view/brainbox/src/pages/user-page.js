/* globals userInfo, nickname */

import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';

import '../style/style.css';
import '../style/ui.css';
import '../style/user-style.css';

import $ from 'jquery';
// import * as tw from '../twoWayBinding.js';

var cursorProjects = 0;

const appendProjects = (list) => {
  userInfo.projects.push(...list);
  for(var i=0; i<list.length; i++) {
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
};

const queryProjects = () => {
  $.getJSON(`/user/json/${nickname}/projects`, { start: cursorProjects, length: 100 })
    .then(function(res) {
      if(res.success & res.list.length > 0) {
        appendProjects(res.list);
        cursorProjects += 100;
        queryProjects();
      }
    });
};

// eslint-disable-next-line no-global-assign, no-native-reassign
userInfo = JSON.parse(userInfo);
userInfo.projects = [];

$("#addProject").click(function() { location="/project/new"; });
$("#settings").click(function() {
  var {pathname}=location;
  if(pathname.slice(-1)==="/") { location=pathname+"settings"; } else { location=pathname+"/settings"; }
});

queryProjects();

$(".tab:eq(0)").addClass("selected");
$("#projects").show();
