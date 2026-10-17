/* eslint-disable max-lines */
/* global infoProxy projectInfo annotationsAccessLevel BrainBox AtlasMakerWidget */

import '../style/style.css';
import '../style/textAnnotations.css';
import '../style/ui.css';
import '../style/project-style.css';
import '../style/tables.css';

import { getData, setData } from '../../../shared/domData.js';
import freeform from '../tools/freeform.js';
import geometryModule from '../../../shared/geometry.js';
import hidden from '../tools/hidden.js';
import multiple from '../tools/multiple.js';
import showHideModule from '../../../shared/showHide.js';

// jQuery's .show()/.hide(), .width() and .css({...}), without jQuery
const { hide } = showHideModule;
const { contentSize, setStyle } = geometryModule;

/**
 * jQuery's $.isEmptyObject: true if the object has no enumerable property, own or inherited
 * @param {object} obj Any object
 * @returns {boolean} Whether it is empty
 */
const isEmptyObject = (obj) => {
  // eslint-disable-next-line guard-for-in, no-unreachable-loop
  for (const name in obj) {
    return false;
  }

  return true;
};

/**
 * jQuery's $(elem).index(): the element's position among its siblings, -1 for none
 * @param {Element|null} elem The element
 * @returns {number} Its index
 */
const jqIndex = (elem) => ((elem && elem.parentNode) ? [...elem.parentNode.children].indexOf(elem) : -1);

/**
 * $.getJSON(url, params): rejects on HTTP errors and on a body that is not JSON
 * @param {string} url Request URL
 * @param {object} params Query parameters
 * @returns {Promise<object>} The parsed body
 */
const getJSON = async (url, params) => {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`);
  if (!res.ok) {
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
};

/**
 * jQuery's $(document).on(types, selector, handler) (or on another root): call
 * `handler(event, matched)` for events whose target is, or is inside, an element of
 * `root` matching `selector`
 * @param {EventTarget} root Where to listen
 * @param {string} types Space-separated event types
 * @param {string} selector CSS selector of the elements to watch
 * @param {function} handler Called with the event and the matched element
 * @returns {void}
 */
const delegate = (root, types, selector, handler) => {
  for (const type of types.split(' ')) {
    root.addEventListener(type, (e) => {
      const matched = (e.target instanceof Element) ? e.target.closest(selector) : null;
      if (matched && matched !== root && (root === document || root.contains(matched))) {
        handler(e, matched);
      }
    });
  }
};

/**
 * jQuery's $(elem).trigger('click'): run the element's click handlers. Like jQuery, a link
 * is not followed, other elements get their native click (as a checkbox toggles), and
 * elements without one (SVG) get the event only.
 * @param {Element} elem The element
 * @returns {void}
 */
const triggerClick = (elem) => {
  if (!(elem instanceof Element)) { return; }
  const isLink = elem.nodeName.toLowerCase() === 'a';
  if (!isLink && typeof elem.click === 'function') {
    elem.click();

    return;
  }
  const stopLink = (e) => { e.preventDefault(); };
  if (isLink) { window.addEventListener('click', stopLink); }
  elem.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  if (isLink) { window.removeEventListener('click', stopLink); }
};

/**
 * jQuery's $(elem).blur() for a delegated blur handler (which jQuery listens to as
 * 'focusout'): a focused element really loses focus; otherwise the focusout is only
 * simulated. Either way the handlers run once.
 * @param {Element} elem The element
 * @returns {void}
 */
const triggerBlur = (elem) => {
  if (elem === document.activeElement && typeof elem.blur === 'function') {
    elem.blur();

    return;
  }
  elem.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
};

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

// eslint-disable-next-line max-statements
const appendFilesToProject = function (list) {
  const i0 = projectInfo.files.list.length;
  projectInfo.files.list.push(...list);

  // make sure that all mri files have a text annotations object for the project
  for (let i = 0; i < list.length; i++) {
    file = projectInfo.files.list[i0 + i];
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
  for (let i = 0; i < list.length; i++) {
    file = projectInfo.files.list[i0 + i];
    for (let j = 0; j < annotations.text.length; j++) {
      annName = annotations.text[j].name;
      if (!file.mri.annotations[projShortname][annName]) {
        const date = new Date();
        file.mri.annotations[projShortname][annName] = {
          created: date.toJSON(),
          modified: date.toJSON(),
          modifiedBy: AtlasMakerWidget.User.username,
          type: 'text'
        };
      }
    }
  }
  for (let i = 0; i < list.length; i++) {
    BrainBox.appendAnnotationTableRow(i0 + i, aParam);
  }
};

const queryFiles = function () {
  getJSON('/project/json/' + projectInfo.shortname + '/files', {
    start: projectInfo.files.list.length,
    length: numFilesQuery
  })
    .then(function (list) {
      if (list.length) {
        appendFilesToProject(list);
        queryFiles();
      } else {
        console.log('All files downloaded. Length:', projectInfo.files.list.length);
      }
    }, () => null); // as with $.getJSON, a failed request is ignored
};

/**
 * @func saveAnnotations
 * @desc Save annotations if they have changed
 * @param {object} param Annotations
 * @returns {void}
 */
const saveAnnotations = function (param) {
  JSON.stringify(param.infoProxy); // update BrainBox.info from infoProxy
  // held until the connection is back if it is closed (see sendSaveMetadataMessage)
  AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info)
    .catch((err) => console.error('The annotations could not be saved', err));
  // hashOld = BrainBox.hash(JSON.stringify(BrainBox.info));
};

/**
 * @func loadProjectFile
 * @desc load a new mri from the project list
 * @param {number} index of the file in the project list
 * @returns {object} A promise
 */
const loadProjectFile = function (index) {
  // eslint-disable-next-line max-statements
  const pr = new Promise((resolve, reject) => {
    if (!projectInfo.files.list[index]) {
      const err = new Error('This project has no files.');
      AtlasMakerWidget.setViewerState({ state: 'error', message: err.message });
      reject(err);

      return;
    }
    const url = projectInfo.files.list[index].source;
    const params = { url: url, view: 'cor', slice: 180, fullscreen: false };
    AtlasMakerWidget.setViewerState({ state: 'loading' });

    /**
       * @todo The mri entry may correspond to a file that has not been downloaded yet!
       */
    const info = projectInfo.files.list[index];

    if (isEmptyObject(info) === false) {
      // check if the mri contains the required annotations
      let iarr; // index of the object in the data array
      for (let irow = 0; irow < annotations.volume.length; irow++) {
        let found = false;
        if (!info.mri.atlas) { info.mri.atlas = []; }
        for (iarr = 0; iarr < info.mri.atlas.length; iarr++) {
          if (annotations.volume[irow].name === info.mri.atlas[iarr].name
            && projectInfo.shortname === info.mri.atlas[iarr].project) {
            found = true;
            break;
          }
        }
        // if it doesn't, create them
        if (found === false) {
          // add annotation
          const date = new Date();
          // add data to annotations array
          const atlas = {
            name: annotations.volume[irow].name,
            project: projectInfo.shortname,
            created: date.toJSON(),
            modified: date.toJSON(),
            modifiedBy: AtlasMakerWidget.User.username,
            filename: Math.random().toString(36)
              .slice(2) + '.nii.gz', // automatically generated filename
            labels: annotations.volume[irow].values,
            owner: AtlasMakerWidget.User.username,
            type: 'volume',
            access: annotationsAccessLevel
          };

          projectInfo.files.list[index].mri.atlas.push(atlas);
        }

        annotations.volume[irow].annotationItemIndex = iarr;
      }
      params.info = projectInfo.files.list[index];

      if (annotations.volume[0]) {
        params.annotationItemIndex = annotations.volume[0].annotationItemIndex;
      } else {
        params.annotationItemIndex = -1;
      }

      BrainBox.configureBrainBox(params)
        .then(function () {

          // bind volume annotations to table#volAnnotations
          const annvolProxy = {};
          const aParamVolAnnot = {
            table: document.querySelector('table#volAnnotations'),
            infoProxy: annvolProxy,
            info: BrainBox.info,
            trTemplate: [
              '<tr>',
              ' <td></td>', // volume name
              ' <td></td>', // volume label set
              '</tr>'
            ].join(''),
            objTemplate: [
              {
                typeOfBinding: 1,
                path: 'mri.atlas.#.name'
              },
              {
                typeOfBinding: 1,
                path: 'mri.atlas.#.labels'
              }
            ]
          };

          // add and bind new table row
          for (let irow = 0; irow < annotations.volume.length; irow++) {
            BrainBox.appendAnnotationTableRow2(irow, annotations.volume[irow].annotationItemIndex, aParamVolAnnot);
          }
          // update in server
          saveAnnotations(aParamVolAnnot);

          // select the first annotation by default
          // (should be read from project settings)
          // $('#annotations tbody tr:eq(0)').addClass('selected');
          const firstRow = document.querySelector('#annotations tbody tr');
          if (firstRow) {
            firstRow.classList.add('selected');
          }

          AtlasMakerWidget.User.projectPage = projectInfo.shortname;
          AtlasMakerWidget.sendUserDataMessage(JSON.stringify({ projectPage: projectInfo.shortname }));

          resolve();
        })
        .catch(function (err) {
          console.error(err);
          AtlasMakerWidget.setViewerState({ state: 'error', message: 'This brain could not be loaded: ' + err.message });
          const textLayer = AtlasMakerWidget.container.querySelector('#text-layer');
          if (textLayer) {
            textLayer.innerHTML = '<text x=\'5\' y=\'15\' fill=\'white\'>ERROR: ' + err.message + '</text>';
          }
          reject(err);
        });
    } else {
      const msg = AtlasMakerWidget.container.querySelector('#text-layer');
      msg.innerHTML = '<text x=\'5\' y=\'15\' fill=\'white\'>ERROR: File is unreadable</text>';
      AtlasMakerWidget.setViewerState({ state: 'error', message: 'This brain could not be loaded: the file is maybe corrupt?' });
      reject(new Error('ERROR: Cannot read data. The file is maybe corrupt?'));
    }
  });

  return pr;
};

/**
 * @func resizeButton
 * @desc Resize left tool bar
 * @param {object} p Mouse coordinates
 * @returns {void}
 */
const resizeButton = function (p) {
  const resizeButtonElem = document.getElementById('resizeButton');
  if (getData(resizeButtonElem, 'flag') === 0) {
    setData(resizeButtonElem, { flag: 1, x0: p.x, y0: p.y });
  } else if (getData(resizeButtonElem, 'flag') === 1) {
    const d = getData(resizeButtonElem, 'x0') - p.x;
    const left = document.getElementById('left');
    setStyle(left, { flexBasis: contentSize(left, 'width') - d });
    setData(resizeButtonElem, { x0: p.x, y0: p.y });
    AtlasMakerWidget.resizeWindow();
  }
};

// Prevent zoom on double tap
document.body.addEventListener('touchstart', function preventZoom(e) {
  const t2 = e.timeStamp;
  const t1 = getData(e.target, 'lastTouch') || t2;
  const dt = t2 - t1;
  const fingers = e.touches.length;
  setData(e.target, {lastTouch: t2});
  if (!dt || dt > 500 || fingers > 1) { return; } // not double-tap
  e.preventDefault(); // double tap - prevent the zoom
  // also synthesize click events we just swallowed up
  triggerClick(e.target);
  triggerClick(e.target);
});

// collect the project's text annotations
for (const k of projectInfo.annotations.list) {
  if (k.type === 'text' ||
    k.type === 'hidden text' ||
    k.type === 'multiple choices') {
    document.querySelectorAll('#projectFiles thead tr').forEach((tr) => tr.insertAdjacentHTML('beforeend', `<th>${k.name}</th>`));
    annotations.text.push(k);
  }
}

// collect the project's volume annotations
for (const k of projectInfo.annotations.list) {
  if (k.type === 'volume') {
    annotations.volume.push(k);
  }
}

{
  // As $(...).text(name): nothing if there is no such element, or if name is undefined
  const projectName = document.getElementById('projectName');
  if (projectName && typeof projectInfo.name !== 'undefined') { projectName.textContent = projectInfo.name; }
}

const resizeButtonElem = document.getElementById('resizeButton');
setData(resizeButtonElem, { flag: -1, x0: 0, y0: 0 });
if (resizeButtonElem) {
  for (const type of ['mousedown', 'touchstart']) {
    resizeButtonElem.addEventListener(type, function (e) { e.preventDefault(); setData(e.target, { flag: 0, x0: e.pageX, y0: e.pageY }); });
  }
}
document.body.addEventListener('mousemove', function (e) { resizeButton({ x: e.pageX, y: e.pageY }); });
document.body.addEventListener('touchmove', function (e) { resizeButton({ x: e.changedTouches[0].pageX, y: e.changedTouches[0].pageY }); });
for (const type of ['mouseup', 'touchend']) {
  document.body.addEventListener(type, function () { setData(resizeButtonElem, { flag: -1 }); });
}

const addProjectButton = document.getElementById('addProject');
if (addProjectButton) { addProjectButton.addEventListener('click', function () { location.assign('/project/new'); }); }
const settingsButton = document.getElementById('settings');
if (settingsButton) {
  settingsButton.addEventListener('click', function () {
    const { pathname } = location;
    if (pathname.slice(-1) === '/') { location.assign(pathname + 'settings'); } else { location.assign(pathname + '/settings'); }
  });
}

const receiveMetadata = function (data) {
  const { shortname } = projectInfo;
  for (const i in projectInfo.files.list) {
    if (projectInfo.files.list[i].source === data.metadata.source) {
      for (const key in projectInfo.files.list[i].mri.annotations[shortname]) {
        if ({}.hasOwnProperty.call(projectInfo.files.list[i].mri.annotations[shortname], key)) {
          infoProxy['files.list.' + i + '.mri.annotations.' + shortname + '.' + key] = data.metadata.mri.annotations[shortname][key];
        }
      }
      infoProxy['files.list.' + i + '.name'] = data.metadata.name;
      break;
    }
  }
};

// Init BrainBox
//---------------
BrainBox.initBrainBox()
  // load label sets
  .then(function () {

    return BrainBox.loadLabelsets();
  })
  // subscribe to metadata changes received by AtlasMaker
  // eslint-disable-next-line max-statements
  .then(function () {
    AtlasMakerWidget._metadataChangeSubscribers.push(receiveMetadata);

    // Bind the project's files to the table within #projectFiles
    //------------------------------------------------------------
    trTemplate = ['<tr>'];
    objTemplate = [];

    // configure the binding template for table row and object.
    // the 1st two columns are fixed: name and source
    trTemplate.push(['<td contentEditable=true class=\'noEmpty\'></td>']);
    objTemplate.push({ typeOfBinding: 2, path: 'files.list.#.name' });

    trTemplate.push(['<td><a></a></td>']);
    objTemplate.push({
      typeOfBinding: 1,
      path: 'files.list.#.source',
      format: function (e, d) {
        e.querySelectorAll('a').forEach((a) => { a.href = location.origin + '/mri?url=' + d; });
        const text = d.split('/').pop();
        e.querySelectorAll('a').forEach((a) => { a.innerHTML = text; });
      }
    });

    // the following columns are completed from the project's 'annotations' definitions:
    // determine their type of display (multiple choices, freeform, etc.) based data type
    for (let g = 0; g < annotations.text.length; g++) {
      annType = annotations.text[g].type;
      annName = annotations.text[g].name;

      if (annType === 'multiple choices') {
        // array of values
        const { td, obj } = multiple(
          annotations.text[g],
          'files.list.#.mri.annotations.' + projShortname + '.' + annName,
          AtlasMakerWidget.User.username
        );
        trTemplate.push(td);
        objTemplate.push(obj);
      } else if (annType === 'text') {
        // freeform text
        const { td, obj } = freeform(
          annotations.text[g],
          'files.list.#.mri.annotations.' + projShortname + '.' + annName,
          AtlasMakerWidget.User.username
        );
        trTemplate.push(td);
        objTemplate.push(obj);
      } else if (annType === 'hidden text') {
        // freeform text
        const { td, obj } = hidden(
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
      table: document.querySelector('#projectFiles table'),
      infoProxy,
      info: projectInfo,
      trTemplate: trTemplate.join('\n'),
      objTemplate: objTemplate
    };
  })
  // get list of project files
  .then(function () {
    // Start with the 1st #numFilesQuery files, load and
    // display the 1st file, configure the tools position, and keep querying for the
    // rest of the files
    return getJSON('/project/json/' + projectInfo.shortname + '/files', {
      start: 0,
      length: numFilesQuery
    });
  })
  // append files progressively
  .then(function (list) {
    appendFilesToProject(list);

    // mark first row as selected
    // $('#projectFiles tbody tr:eq(0)').addClass('selected');
    const firstRow = document.querySelector('#projectFiles tbody tr');
    if (firstRow) {
      firstRow.classList.add('selected');
    }
  })
  // load the 1st file
  .then(function () {

    // A file that cannot be loaded is shown as an error in the viewer: the rest
    // of the page is still set up, so that another file can be chosen
    return loadProjectFile(0).catch(function () { /* handled in loadProjectFile */ });
  })
  // configure the UI
  .then(function () {
    // Move the viewer's toolbar into the page's tools panel (as .detach().appendTo(): left
    // detached if there is no such panel)
    const toolsSide = document.getElementById('tools-side');
    if (toolsSide) {
      toolsSide.remove();
      const tools = document.getElementById('tools');
      if (tools) { tools.appendChild(toolsSide); }
    }
    delegate(document, 'click touchstart', '#labels-close', function () { hide(document.getElementById('labelset')); });
  })
  // query all files
  .then(function () {
    queryFiles();
  })
  .catch((err) => {
    console.error(err);
    // Say it in the viewer, instead of "Loading brain…" forever
    if (AtlasMakerWidget.viewerState === 'loading') {
      AtlasMakerWidget.setViewerState({ state: 'error', message: 'This project could not be loaded: ' + err.message });
    }
  });

// Listen to changes that trigger a metadata save
//------------------------------------------------
// send data when focus is lost (on blur: jQuery delegated it as 'focusout', which bubbles)
delegate(document, 'focusout', '#projectFiles table tbody td', function (e) {
  const index = jqIndex(e.target.closest('tr'));
  JSON.stringify(infoProxy); // update content of projectInfo object from proxy by calling all getters
  AtlasMakerWidget.sendSaveMetadataMessage(projectInfo.files.list[index])
    .catch((err) => console.error('The file\'s information could not be saved', err));
});
// blur when [enter] is clicked, to trigger data sending
delegate(document, 'keydown', '#projectFiles table tbody td', function (e) {
  if (e.which === 13 && e.target.getAttribute('contenteditable')) {
    e.preventDefault();
    triggerBlur(e.target);
  }
});
// blur when <select> changes value to trigger data sending
{
  // Bound on the tbody that exists now, as $('#projectFiles table tbody').on(...) was
  const filesBody = document.querySelector('#projectFiles table tbody');
  if (filesBody) {
    delegate(filesBody, 'change', 'select', function (e) {
      triggerBlur(e.target);
    });
  }
}

/**
 * Empty the volume annotations table, as $('table#volAnnotations tbody').html('')
 * @returns {void}
 */
const clearVolumeAnnotationsTable = () => {
  document.querySelectorAll('table#volAnnotations tbody').forEach((tbody) => { tbody.innerHTML = ''; });
};

// Listen to changes in selected table row
//----------------------------------------
// listen to changes in file selection by clicking on the file table
delegate(document, 'click touchstart', '#projectFiles tbody tr', function (e) {
  const table = e.target.closest('table');
  const currentIndex = jqIndex(table ? table.querySelector('tr.selected') : null);
  const selRow = e.target.closest('tr');
  const index = jqIndex(selRow);

  if (index >= 0 && currentIndex !== index) {
    if (table) { table.querySelectorAll('tr').forEach((tr) => tr.classList.remove('selected')); }
    selRow.classList.add('selected');
    // remove table with previous annotations
    clearVolumeAnnotationsTable();
    // load and bind new file
    loadProjectFile(index).catch(function () { /* handled in loadProjectFile */ });
  }
});

// listen to changes in file selection by pressing the up/down arrows
document.addEventListener('keydown', function (e) {
  const table = document.querySelector('#projectFiles tbody');
  let index = jqIndex(table ? table.querySelector('tr.selected') : null);

  if (e.keyCode !== 38 && e.keyCode !== 40) {
    return;
  }

  switch (e.keyCode) {
  case 38: // up
    index = (index + projectInfo.files.list.length - 1) % projectInfo.files.list.length;
    break;
  case 40: // down
    index = (index + 1) % projectInfo.files.list.length;
    break;
  }
  if (table) {
    table.querySelectorAll('tr').forEach((tr) => tr.classList.remove('selected'));
    const row = table.querySelectorAll('tr')[index];
    if (row) { row.classList.add('selected'); }
  }

  // remove table with previous annotations
  clearVolumeAnnotationsTable();

  // load and bind new file
  loadProjectFile(index).catch(function () { /* handled in loadProjectFile */ });
});

// listen to changes in selected volume annotation
// eslint-disable-next-line max-statements
delegate(document, 'click touchstart', '#volAnnotations tbody tr', function (e) {
  const table = e.target.closest('tbody');
  const targetRow = e.target.closest('tr');
  const targetIndex = jqIndex(targetRow);
  const currentIndex = jqIndex(table ? table.querySelector('tr.selected') : null);

  if (targetIndex >= 0 && currentIndex !== targetIndex) {
    if (table) { table.querySelectorAll('tr').forEach((tr) => tr.classList.remove('selected')); }
    targetRow.classList.add('selected');

    let iarr;
    let found = false;
    for (iarr = 0; iarr < BrainBox.info.mri.atlas.length; iarr++) {
      if (BrainBox.info.mri.atlas[iarr].name === annotations.volume[targetIndex].name
        && BrainBox.info.mri.atlas[iarr].project === projectInfo.shortname) {
        found = true;
        break;
      }
    }
    if (found) {
      AtlasMakerWidget.configureAtlasMaker(BrainBox.info, iarr);
    } else {
      console.log('ERROR: A quite unexpected one too...');
    }
  }
});
