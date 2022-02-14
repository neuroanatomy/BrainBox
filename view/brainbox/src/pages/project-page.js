/* global infoProxy projectInfo BrainBox AtlasMakerWidget $ */

import 'jquery-ui/themes/base/core.css';
import 'jquery-ui/themes/base/theme.css';
import 'jquery-ui/themes/base/autocomplete.css';
import 'jquery-ui/ui/core';
import 'jquery-ui/ui/widgets/autocomplete';

import '../style/style.css';
import '../style/textAnnotations.css';
import '../style/ui.css';
import '../style/project-style.css';

import freeform from '../tools/freeform.js';
import hidden from '../tools/hidden.js';
import multiple from '../tools/multiple.js';

const projShortname = projectInfo.shortname;
const numFilesQuery = 20;
const annotations = {
  text: [], // collect text annotations
  volume: [] // collect volume annotations
};
let annType;
let annName;
let file;
let trTemplate;
let objTemplate;
let aParam;
// let hashOld;

function appendFilesToProject(list) {
  const i0 = projectInfo.files.list.length;
  projectInfo.files.list.push(...list);

  // make sure that all mri files have a text annotations object for the project
  for(let i=0; i<list.length; i++) {
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
  for(let i=0; i<list.length; i++) {
    file = projectInfo.files.list[i0+i];
    for(let j=0; j<annotations.text.length; j++) {
      annName = annotations.text[j].name;
      if(!file.mri.annotations[projShortname][annName]) {
        var date=new Date();
        file.mri.annotations[projShortname][annName] = {
          created: date.toJSON(),
          modified: date.toJSON(),
          modifiedBy: AtlasMakerWidget.User.username,
          type: 'text'
        };
      }
    }
  }
  for(let i=0; i<list.length; i++) {
    BrainBox.appendAnnotationTableRow(i0+i, aParam);
  }
}

function queryFiles() {
  $.getJSON('/project/json/'+projectInfo.shortname+'/files', {
    start: projectInfo.files.list.length,
    length: numFilesQuery
  })
    .then(function(list) {
      if(list.length) {
        appendFilesToProject(list);
        queryFiles();
      } else {
        console.log('All files downloaded. Length:', projectInfo.files.list.length);
      }
    });
}

/**
 * @func saveAnnotations
 * @desc Save annotations if they have changed
 * @param {object} param Annotations
 * @returns {void}
 */
function saveAnnotations(param) {
  JSON.stringify(param.infoProxy); // update BrainBox.info from infoProxy
  AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
  // hashOld = BrainBox.hash(JSON.stringify(BrainBox.info));
}

/**
 * @func loadProjectFile
 * @desc load a new mri from the project list
 * @param {number} index of the file in the project list
 * @returns {object} A promise
 */
function loadProjectFile(index) {
  const pr = new Promise((resolve, reject) => {
    var url=projectInfo.files.list[index].source;
    var params={url: url, view: 'cor', slice: 180, fullscreen: false};
    $('#loadingIndicator p').text('Loading...');
    $('#loadingIndicator').show();

    /**
       * @todo The mri entry may correspond to a file that has not been downloaded yet!
       */
    var info = projectInfo.files.list[index];

    if($.isEmptyObject(info) === false) {
      // check if the mri contains the required annotations
      var iarr; // index of the object in the data array
      for(let irow=0; irow<annotations.volume.length; irow++) {
        let found = false;
        if(!info.mri.atlas) { info.mri.atlas = []; }
        for(iarr=0; iarr<info.mri.atlas.length; iarr++) {
          if(annotations.volume[irow].name === info.mri.atlas[iarr].name
                     && projectInfo.shortname === info.mri.atlas[iarr].project) {
            found=true;
            break;
          }
        }
        // if it doesn't, create them
        if(found === false) {
          // add annotation
          const date=new Date();
          // add data to annotations array
          const atlas = {
            name: annotations.volume[irow].name,
            project: projectInfo.shortname,
            created: date.toJSON(),
            modified: date.toJSON(),
            modifiedBy: AtlasMakerWidget.User.username,
            filename: Math.random().toString(36)
              .slice(2)+'.nii.gz', // automatically generated filename
            labels: annotations.volume[irow].values,
            owner: AtlasMakerWidget.User.username,
            type: 'volume',
            access: annotationsAccessLevel
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
        .then(function () {

          // bind volume annotations to table#volAnnotations
          const annvolProxy={};
          const aParamVolAnnot = {
            table: $('table#volAnnotations'),
            infoProxy: annvolProxy,
            info: BrainBox.info,
            trTemplate: $.map([
              '<tr>',
              ' <td></td>', // volume name
              ' <td></td>', // volume label set
              '</tr>'
            ], function(o) { return o; }).join(),
            objTemplate: [
              { typeOfBinding:1,
                path:'mri.atlas.#.name'
              },
              { typeOfBinding:1,
                path:'mri.atlas.#.labels'
              }
            ]
          };

          // add and bind new table row
          for(let irow=0; irow<annotations.volume.length; irow++) {
            BrainBox.appendAnnotationTableRow2(irow, annotations.volume[irow].annotationItemIndex, aParamVolAnnot);
          }
          // update in server
          saveAnnotations(aParamVolAnnot);

          // select the first annotation by default
          // (should be read from project settings)
          $('#annotations tbody tr:eq(0)').addClass('selected');

          AtlasMakerWidget.User.projectPage = projectInfo.shortname;
          AtlasMakerWidget.sendUserDataMessage(JSON.stringify({projectPage:projectInfo.shortname}));

          resolve();
        });
    } else {
      var msg=AtlasMakerWidget.container.querySelector('#text-layer');
      msg.innerHTML = '<text x=\'5\' y=\'15\' fill=\'white\'>ERROR: File is unreadable</text>';
      reject(new Error('ERROR: Cannot read data. The file is maybe corrupt?'));
    }
  });

  return pr;
}

/**
 * @func resizeButton
 * @desc Resize left tool bar
 * @param {object} p Mouse coordinates
 * @returns {void}
 */
function resizeButton(p) {
  if($('#resizeButton').data('flag')===0) {
    $('#resizeButton').data({flag:1, x0:p.x, y0:p.y});
  } else if($('#resizeButton').data('flag')===1) {
    var d=$('#resizeButton').data('x0')-p.x;
    $('#left').css({'flex-basis':$('#left').width()-d});
    $('#resizeButton').data({x0:p.x, y0:p.y});
    AtlasMakerWidget.resizeWindow();
  }
}

// Prevent zoom on double tap
$('body').on('touchstart', function preventZoom(e) {
  const t2 = e.timeStamp;
  const t1 = $(e.target).data('lastTouch') || t2;
  const dt = t2 - t1;
  const fingers = e.originalEvent.touches.length;
  $(e.target).data('lastTouch', t2);
  if (!dt || dt > 500 || fingers > 1) { return; } // not double-tap
  e.preventDefault(); // double tap - prevent the zoom
  // also synthesize click events we just swallowed up
  $(e.target)
    .trigger('click')
    .trigger('click');
});

// collect the project's text annotations
for(const k of projectInfo.annotations.list) {
  if (k.type === 'text' ||
      k.type === 'hidden text' ||
      k.type === 'multiple choices' ) {
    $('#projectFiles thead tr').append(`<th>${k.name}</th>`);
    annotations.text.push(k);
  }
}

// collect the project's volume annotations
for(const k of projectInfo.annotations.list) {
  if (k.type === 'volume') {
    annotations.volume.push(k);
  }
}

$('#projectName').text(projectInfo.name);

$('#resizeButton').data({flag:-1, x0:0, y0:0});
$('#resizeButton').on('mousedown touchstart', function(e) { $(e.target).data({flag:0, x0:e.pageX, y0:e.pageY}); });
$('body').on('mousemove', function(e) { resizeButton({x:e.pageX, y:e.pageY}); });
$('body').on('touchmove', function(e) { resizeButton({x:e.originalEvent.changedTouches[0].pageX, y:e.originalEvent.changedTouches[0].pageY}); });
$('body').on('mouseup touchend', function() { $('#resizeButton').data({flag:-1}); });

$('#addProject').click(function() { location.assign('/project/new'); });
$('#settings').click(function() {
  var {pathname}=location;
  if(pathname.slice(-1)==='/') { location.assign(pathname+'settings'); } else { location.assign(pathname+'/settings'); }
});

function receiveMetadata(data) {
  const {shortname} = projectInfo;
  for (var i in projectInfo.files.list) {
    if (projectInfo.files.list[i].source === data.metadata.source) {
      for (var key in projectInfo.files.list[i].mri.annotations[shortname]) {
        if({}.hasOwnProperty.call(projectInfo.files.list[i].mri.annotations[shortname], key)) {
          infoProxy['files.list.' + i + '.mri.annotations.' + shortname + '.' + key] = data.metadata.mri.annotations[shortname][key];
        }
      }
      infoProxy['files.list.' + i + '.name'] = data.metadata.name;
      break;
    }
  }
}

// Init BrainBox
//---------------
BrainBox.initBrainBox()
  // load label sets
  .then(function () {
    return BrainBox.loadLabelsets();
  })
  // subscribe to metadata changes received by AtlasMaker
  .then(function () {
    AtlasMakerWidget._metadataChangeSubscribers.push(receiveMetadata);

    // Bind the project's files to the table within #projectFiles
    //------------------------------------------------------------
    trTemplate = ['<tr>'];
    objTemplate = [];

    // configure the binding template for table row and object.
    // the 1st two columns are fixed: name and source
    trTemplate.push(['<td contentEditable=true class=\'noEmpty\'></td>']);
    objTemplate.push({ typeOfBinding: 2, path: 'files.list.#.name'});

    trTemplate.push(['<td><a></a></td>']);
    objTemplate.push({
      typeOfBinding:1,
      path:'files.list.#.source',
      format:function(e, d) {
        $(e).find('a')
          .prop('href', location.origin+'/mri?url=' + d);
        $(e).find('a')
          .html(d.split('/').pop());
      }
    });

    // the following columns are completed from the project's 'annotations' definitions:
    // determine their type of display (multiple choices, freeform, etc.) based data type
    for(let g=0; g<annotations.text.length; g++) {
      annType = annotations.text[g].type;
      annName = annotations.text[g].name;

      if(annType === 'multiple choices') {
        // array of values
        const {td, obj} = multiple(
          annotations.text[g],
          'files.list.#.mri.annotations.' + projShortname + '.' + annName,
          AtlasMakerWidget.User.username
        );
        trTemplate.push(td);
        objTemplate.push(obj);
      } else if(annType === 'text') {
        // freeform text
        const {td, obj} = freeform(
          annotations.text[g],
          'files.list.#.mri.annotations.' + projShortname + '.' + annName,
          AtlasMakerWidget.User.username
        );
        trTemplate.push(td);
        objTemplate.push(obj);
      } else if(annType === 'hidden text') {
        // freeform text
        const {td, obj} = hidden(
          annotations.text[g],
          'files.list.#.mri.annotations.' + projShortname + '.' + annName,
          AtlasMakerWidget.User.username
        );
        trTemplate.push(td);
        objTemplate.push(obj);
      }

      /**
             * @todo This is the place where 'position' or 'length' annotations should be added
             */
    }
    trTemplate.push('</tr>');
    aParam = {
      table: $('#projectFiles table'),
      infoProxy,
      info: projectInfo,
      trTemplate: trTemplate.join('\n'),
      objTemplate: objTemplate
    };
  })
  // get list of project files
  .then(function() {
    // Start with the 1st #numFilesQuery files, load and
    // display the 1st file, configure the tools position, and keep querying for the
    // rest of the files
    return $.getJSON('/project/json/'+projectInfo.shortname+'/files', {
      start: 0,
      length: numFilesQuery
    });
  })
  // append files progressively
  .then(function(list) {
    appendFilesToProject(list);

    // mark first row as selected
    $('#projectFiles tbody tr:eq(0)').addClass('selected');
  })
  // load the 1st file
  .then(function () {
    return loadProjectFile(0);
  })
  // configure the UI
  .then(function () {
    $('#tools-side').detach()
      .appendTo('#tools');
    $(document).on('click touchstart', '#labels-close', function() { $('#labelset').hide(); });
  })
  // query all files
  .then(function() {
    queryFiles();
  })
  .catch( (err) => {
    $('#msgLog').html('ERROR: Can\'t load data. ' + err);
    console.error(err);
  });

// Listen to changes that trigger a metadata save
//------------------------------------------------
// send data when focus is lost (on blur)
$(document).on('blur', '#projectFiles table tbody td', function (e) {
  var index = $(e.target).closest('tr')
    .index();
  JSON.stringify(infoProxy); // update content of projectInfo object from proxy by calling all getters
  AtlasMakerWidget.sendSaveMetadataMessage(projectInfo.files.list[index]);
});
// blur when [enter] is clicked, to trigger data sending
$(document).on('keydown', '#projectFiles table tbody td', function(e) {
  if(e.which===13 && $(e.target).attr('contenteditable')) {
    e.preventDefault();
    $(e.target).blur();
  }
});
// blur when <select> changes value to trigger data sending
$('#projectFiles table tbody').on('change', 'select', function(e) {
  $(e.target).blur();
});

// Listen to changes in selected table row
//----------------------------------------
// listen to changes in file selection by clicking on the file table
$(document).on('click touchstart', '#projectFiles tbody tr', function(e) {
  var table=$(e.target).closest('table');
  var currentIndex=$(table).find('tr.selected')
    .index();
  const selRow = e.target.closest('tr');
  var index=$(selRow).index();

  if(index>=0 && currentIndex!==index) {
    $(table).find('tr')
      .removeClass('selected');
    $(selRow).addClass('selected');
    // remove table with previous annotations
    $('table#volAnnotations tbody').html('');
    // load and bind new file
    loadProjectFile(index);
  }
});

// listen to changes in file selection by pressing the up/down arrows
$(document).on('keydown', function(e) {
  var table=$('#projectFiles tbody');
  var index=$(table).find('tr.selected')
    .index();

  if(e.keyCode!==38 && e.keyCode!==40) {
    return;
  }

  switch(e.keyCode) {
  case 38: // up
    index=(index+projectInfo.files.list.length-1)%projectInfo.files.list.length;
    break;
  case 40: // down
    index=(index+1)%projectInfo.files.list.length;
    break;
  }
  $(table).find('tr')
    .removeClass('selected');
  $(table).find('tr:eq('+index+')')
    .addClass('selected');

  // remove table with previous annotations
  $('table#volAnnotations tbody').html('');

  // load and bind new file
  loadProjectFile(index);
});

// listen to changes in selected volume annotation
$(document).on('click touchstart', '#volAnnotations tbody tr', function (e) {
  const table=$(e.target).closest('tbody');
  const targetRow = $(e.target).closest('tr');
  const targetIndex = targetRow.index();
  const currentIndex = $(table).find('tr.selected')
    .index();

  if(targetIndex>=0 && currentIndex!==targetIndex) {
    $(table).find('tr')
      .removeClass('selected');
    targetRow.addClass('selected');

    let iarr;
    let found=false;
    for(iarr=0; iarr<BrainBox.info.mri.atlas.length; iarr++) {
      if(BrainBox.info.mri.atlas[iarr].name===annotations.volume[targetIndex].name
                    && BrainBox.info.mri.atlas[iarr].project===projectInfo.shortname) {
        found=true;
        break;
      }
    }
    if(found) {
      AtlasMakerWidget.configureAtlasMaker(BrainBox.info, iarr);
    } else {
      console.log('ERROR: A quite unexpected one too...');
    }
  }
});
