<<<<<<< HEAD
/* eslint-disable max-lines */
/* global infoProxy projectInfo annotationsAccessLevel BrainBox AtlasMakerWidget $ */
=======
/* global projectInfo loggedUser BrainBox AtlasMakerWidget annotationsAccessLevel */
/* eslint-disable max-lines */
>>>>>>> de61f64 (New project page)

import 'nwl-components/dist/style.css';
import * as Vue from 'vue';
import {
  AdjustSettings,
  Button,
  ButtonsGroup,
  Chat,
  Editor,
  OntologySelector,
  ProjectPage,
  RangeSlider,
  Row,
  Table,
  TextAnnotations,
  VolumeAnnotations
} from 'nwl-components';
import { forEach, get, set } from 'lodash';
import { initStore, waitForSync } from '../store';
import config from '../nwl-components-config';
import { enableVueBindings } from '@syncedstore/core';

// make SyncedStore use Vuejs internally
enableVueBindings(Vue);

const requireIconsMap = () => {
  const r = require.context(
    '!!url-loader!../../../atlasmaker/src/svg',
    false,
    /^.*\.svg$/
  );
  const icons = {};
  r.keys().forEach((key) => (icons[key.substr(2)] = r(key).default));

  return icons;
};

<<<<<<< HEAD
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
  $.getJSON('/project/json/' + projectInfo.shortname + '/files', {
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
    });
};

/**
 * @func saveAnnotations
 * @desc Save annotations if they have changed
 * @param {object} param Annotations
 * @returns {void}
 */
const saveAnnotations = function (param) {
  JSON.stringify(param.infoProxy); // update BrainBox.info from infoProxy
  AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
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
    const url = projectInfo.files.list[index].source;
    const params = { url: url, view: 'cor', slice: 180, fullscreen: false };
    $('#loadingIndicator p').text('Loading...');
    $('#loadingIndicator').show();

    /**
       * @todo The mri entry may correspond to a file that has not been downloaded yet!
       */
    const info = projectInfo.files.list[index];

    if ($.isEmptyObject(info) === false) {
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
            table: $('table#volAnnotations'),
            infoProxy: annvolProxy,
            info: BrainBox.info,
            trTemplate: $.map([
              '<tr>',
              ' <td></td>', // volume name
              ' <td></td>', // volume label set
              '</tr>'
            ], function (o) { return o; }).join(),
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
          $('#annotations tbody tr:eq(0)').addClass('selected');

          AtlasMakerWidget.User.projectPage = projectInfo.shortname;
          AtlasMakerWidget.sendUserDataMessage(JSON.stringify({ projectPage: projectInfo.shortname }));

          resolve();
        });
    } else {
      const msg = AtlasMakerWidget.container.querySelector('#text-layer');
      msg.innerHTML = '<text x=\'5\' y=\'15\' fill=\'white\'>ERROR: File is unreadable</text>';
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
  if ($('#resizeButton').data('flag') === 0) {
    $('#resizeButton').data({ flag: 1, x0: p.x, y0: p.y });
  } else if ($('#resizeButton').data('flag') === 1) {
    const d = $('#resizeButton').data('x0') - p.x;
    $('#left').css({ 'flex-basis': $('#left').width() - d });
    $('#resizeButton').data({ x0: p.x, y0: p.y });
    AtlasMakerWidget.resizeWindow();
  }
};
=======
const { store, webrtcProvider, doc } = initStore(projectInfo.shortname);

const PageContents = {
  template: '#template',
  setup() {
    const files = Vue.ref([]);
    doc.getArray('files').observe(() => {
      files.value.splice(0, files.value.length);
      files.value.push(...store.files);
    });

    return {
      files,
      currentFile: Vue.ref(null),
      currentSlice: Vue.ref(0),
      totalSlices: Vue.ref(0),
      title: Vue.ref('Loading…'),
      currentView: Vue.ref('sag'),
      currentTool: Vue.ref('Show'),
      currentPenSize: Vue.ref(1),
      doFill: Vue.ref(false),
      usePreciseCursor: Vue.ref(false),
      ontology: Vue.ref({}),
      displayOntology: Vue.ref(false),
      displayChat: Vue.ref(true),
      displayScript: Vue.ref(false),
      displayAdjustSettings: Vue.ref(false),
      currentLabel: Vue.ref(0),
      receivedMessages: Vue.ref([]),
      notification: Vue.ref(''),
      project: projectInfo,
      icons: requireIconsMap(),
      fullscreen: Vue.ref(false),
      alphaValue: Vue.ref(50),
      brightnessValue: Vue.ref(50),
      contrastValue: Vue.ref(50),
      linkPrefix: `${config.baseURL}/mri?url=`,
      // define a map associating annotations keys to value selectors
      // to extract content within the TextAnnotations component
      volumeAnnotations: Vue.ref([]),
      extractTextKeys: (_files) => {
        if (!_files) {
          return;
        }
        const keys = new Map();
        keys.set('Name', 'name');
        keys.set('File', 'source');
        _files.forEach((file) => {
          const annotations = get(file, ['mri', 'annotations', projectInfo.shortname]);
          if (!annotations) {
            return;
          }
          forEach(annotations, (value, key) => {
            if (value.type === 'text') {
              keys.set(key, ['mri', 'annotations', projectInfo.shortname, key, 'data']);
            }
          });
        });

        return keys;
      },
      extractVolumeKeys: () => {
        const keys = new Map();
        keys.set('Name', 'name');
        keys.set('Labels set', 'labels');

        return keys;
      }
    };
  },
>>>>>>> de61f64 (New project page)

  async mounted() {
    this.setupEventListeners();
    await waitForSync(webrtcProvider);
    await this.initBrainbox();
    await this.fetchFiles();
    this.selectFile(this.files[0]);
  },

<<<<<<< HEAD
// collect the project's text annotations
for (const k of projectInfo.annotations.list) {
  if (k.type === 'text' ||
    k.type === 'hidden text' ||
    k.type === 'multiple choices') {
    $('#projectFiles thead tr').append(`<th>${k.name}</th>`);
    annotations.text.push(k);
  }
}

// collect the project's volume annotations
for (const k of projectInfo.annotations.list) {
  if (k.type === 'volume') {
    annotations.volume.push(k);
  }
}
=======
  methods: {
    async initBrainbox() {
      await BrainBox.initBrainBox();
      await BrainBox.loadLabelsets();
    },

    async fetchFiles() {
      if (this.files.length === 0) {
        const files = await this.doFetchFiles([], 0);
        store.files.push(...this.populateTextAnnotations(files));
      }
    },
>>>>>>> de61f64 (New project page)

    async doFetchFiles(files, cursor) {
      const params = {
        start: cursor,
        length: 100
      };
      const url = new URL(
        `/project/json/${projectInfo.shortname}/files`,
        window.location.protocol + '//' + window.location.host
      );
      url.search = new URLSearchParams(params).toString();
      const res = await (await fetch(url)).json();
      if (res && res.length > 0) {
        files.push(...res);

<<<<<<< HEAD
$('#resizeButton').data({ flag: -1, x0: 0, y0: 0 });
$('#resizeButton').on('mousedown touchstart', function (e) { $(e.target).data({ flag: 0, x0: e.pageX, y0: e.pageY }); });
$('body').on('mousemove', function (e) { resizeButton({ x: e.pageX, y: e.pageY }); });
$('body').on('touchmove', function (e) { resizeButton({ x: e.originalEvent.changedTouches[0].pageX, y: e.originalEvent.changedTouches[0].pageY }); });
$('body').on('mouseup touchend', function () { $('#resizeButton').data({ flag: -1 }); });

$('#addProject').click(function () { location.assign('/project/new'); });
$('#settings').click(function () {
  const { pathname } = location;
  if (pathname.slice(-1) === '/') { location.assign(pathname + 'settings'); } else { location.assign(pathname + '/settings'); }
});

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
=======
        if (files.length % 100 === 0) {
          return this.doFetchFiles(files, cursor + 100);
        }
      }

      return files;
    },
>>>>>>> de61f64 (New project page)

    setupEventListeners() {
      window.addEventListener('brainImageConfigured', (e) => {
        this.title = `Slice ${e.detail.currentSlice}`;
        this.currentView = e.detail.currentView;
        this.currentSlice = e.detail.currentSlice;
        this.totalSlices = e.detail.totalSlices;
      });

<<<<<<< HEAD
    // configure the binding template for table row and object.
    // the 1st two columns are fixed: name and source
    trTemplate.push(['<td contentEditable=true class=\'noEmpty\'></td>']);
    objTemplate.push({ typeOfBinding: 2, path: 'files.list.#.name' });

    trTemplate.push(['<td><a></a></td>']);
    objTemplate.push({
      typeOfBinding: 1,
      path: 'files.list.#.source',
      format: function (e, d) {
        $(e).find('a')
          .prop('href', location.origin + '/mri?url=' + d);
        $(e).find('a')
          .html(d.split('/').pop());
=======
      window.addEventListener('newMessage', this.handleNewChatMessages);
      window.addEventListener('newNotification', this.handleNewNotification);
      document.addEventListener('keydown', function(event) {
        const selectedTr = document.querySelector('tr.selected');
        if (!selectedTr) { return; }
        switch(event.key) {
        case 'ArrowUp':
          if (selectedTr.previousElementSibling) {
            selectedTr.previousElementSibling.click();
          }
          break;
        case 'ArrowDown':
          if (selectedTr.nextElementSibling) {
            selectedTr.nextElementSibling.click();
          }
          break;
        default:
          break;
        }
      });
    },

    getDefaultAtlas(annotation) {
      const date = new Date();

      return {
        name: annotation.name,
        project: projectInfo.shortname,
        created: date.toJSON(),
        modified: date.toJSON(),
        modifiedBy: AtlasMakerWidget.User.username,
        filename: Math.random().toString(36)
          .slice(2) + '.nii.gz', // automatically generated filename
        labels: annotation.values,
        owner: AtlasMakerWidget.User.username,
        type: 'volume',
        access: annotationsAccessLevel
      };
    },

    getMRIParams(file) {
      // make sure we don't send proxified refs to AtlasMaker as it's bad for perfs
      const plainFile = JSON.parse(JSON.stringify(file));

      const url = plainFile.source;
      const params = { url, view: 'cor', slice: 180, fullscreen: false };

      // select the first annotation associated to this project
      const annotationIndex = plainFile.mri.atlas.findIndex(
        (atlas) => atlas.project === projectInfo.shortname
      );

      params.annotationItemIndex = annotationIndex;
      params.info = plainFile;

      return params;
    },

    async selectFile(file) {
      if (this.currentFile && this.currentFile.source === file.source) {
        return;
>>>>>>> de61f64 (New project page)
      }
      this.currentFile = file;
      this.title = 'Loading…';
      this.populateVolumeAnnotations(file);
      const params = this.getMRIParams(file);

<<<<<<< HEAD
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
=======
      await BrainBox.configureBrainBox(params);
      this.ontology = AtlasMakerWidget.ontology;
      this.currentLabel = 0;

      this.volumeAnnotations = file.mri.atlas.filter(
        (atlas) => atlas.project === projectInfo.shortname
      );

      AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
      AtlasMakerWidget.User.projectPage = projectInfo.shortname;
      AtlasMakerWidget.sendUserDataMessage(
        JSON.stringify({ projectPage: projectInfo.shortname })
      );
    },

    async selectVolumeAnnotation(selectedAtlas) {
      const index = this.currentFile.mri.atlas.findIndex(
        (atlas) =>
          atlas.name === selectedAtlas.name && atlas.project === projectInfo.shortname
      );
      if (index === -1) {
        return;
>>>>>>> de61f64 (New project page)
      }
      this.title = 'Loading…';
      await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
      this.ontology = AtlasMakerWidget.ontology;
      this.currentLabel = 0;
    },

<<<<<<< HEAD
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
  .then(function () {
    // Start with the 1st #numFilesQuery files, load and
    // display the 1st file, configure the tools position, and keep querying for the
    // rest of the files
    return $.getJSON('/project/json/' + projectInfo.shortname + '/files', {
      start: 0,
      length: numFilesQuery
    });
  })
  // append files progressively
  .then(function (list) {
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
    $(document).on('click touchstart', '#labels-close', function () { $('#labelset').hide(); });
  })
  // query all files
  .then(function () {
    queryFiles();
  })
  .catch((err) => {
    $('#msgLog').html('ERROR: Can\'t load data. ' + err);
    console.error(err);
  });

// Listen to changes that trigger a metadata save
//------------------------------------------------
// send data when focus is lost (on blur)
$(document).on('blur', '#projectFiles table tbody td', function (e) {
  const index = $(e.target).closest('tr')
    .index();
  JSON.stringify(infoProxy); // update content of projectInfo object from proxy by calling all getters
  AtlasMakerWidget.sendSaveMetadataMessage(projectInfo.files.list[index]);
});
// blur when [enter] is clicked, to trigger data sending
$(document).on('keydown', '#projectFiles table tbody td', function (e) {
  if (e.which === 13 && $(e.target).attr('contenteditable')) {
    e.preventDefault();
    $(e.target).blur();
  }
});
// blur when <select> changes value to trigger data sending
$('#projectFiles table tbody').on('change', 'select', function (e) {
  $(e.target).blur();
});

// Listen to changes in selected table row
//----------------------------------------
// listen to changes in file selection by clicking on the file table
$(document).on('click touchstart', '#projectFiles tbody tr', function (e) {
  const table = $(e.target).closest('table');
  const currentIndex = $(table).find('tr.selected')
    .index();
  const selRow = e.target.closest('tr');
  const index = $(selRow).index();

  if (index >= 0 && currentIndex !== index) {
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
$(document).on('keydown', function (e) {
  const table = $('#projectFiles tbody');
  let index = $(table).find('tr.selected')
    .index();

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
  $(table).find('tr')
    .removeClass('selected');
  $(table).find('tr:eq(' + index + ')')
    .addClass('selected');
=======
    // make sure that all mri files have volume annotations as set in the project info
    populateVolumeAnnotations(file) {
      const volumeAnnotations = projectInfo.annotations.list.filter(
        (anno) => anno.type === 'volume'
      );
      let annotationIndex = -1;
      volumeAnnotations.forEach((annotation) => {
        annotationIndex = file.mri.atlas.findIndex(
          (atlas) =>
            atlas.name === annotation.name &&
            atlas.project === projectInfo.shortname
        );

        if (annotationIndex >= 0) {
          return;
        }

        // If no layer was found, create it
        const atlas = this.getDefaultAtlas(annotation);

        file.mri.atlas.push(atlas);
      });

    },

    // make sure that all mri files have text annotations as set in the project info
    populateTextAnnotations(files) {
      return files.map((file) => {
        if (!file.mri) {
          file.mri = {};
        }
        if (!file.mri.annotations) {
          file.mri.annotations = {};
        }
        if (!file.mri.annotations[projectInfo.shortname]) {
          file.mri.annotations[projectInfo.shortname] = {};
        }

        const textAnnotations = projectInfo.annotations.list.filter(
          (annotation) => annotation.type === 'text'
        );
        for (let i = 0; i < textAnnotations.length; i++) {
          const annName = textAnnotations[i].name;
          if (!file.mri.annotations[projectInfo.shortname][annName]) {
            var date = new Date();
            file.mri.annotations[projectInfo.shortname][annName] = {
              created: date.toJSON(),
              modified: date.toJSON(),
              modifiedBy: AtlasMakerWidget.User.username,
              type: 'text'
            };
          }
        }

        return file;
      });
    },
>>>>>>> de61f64 (New project page)

    // on text annotations value change
    valueChange(content, index, selector) {
      const sel = (typeof selector === 'string') ? [index, selector] : [index, ...selector];
      set(store.files, sel, content);
    },

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

<<<<<<< HEAD
// listen to changes in selected volume annotation
// eslint-disable-next-line max-statements
$(document).on('click touchstart', '#volAnnotations tbody tr', function (e) {
  const table = $(e.target).closest('tbody');
  const targetRow = $(e.target).closest('tr');
  const targetIndex = targetRow.index();
  const currentIndex = $(table).find('tr.selected')
    .index();

  if (targetIndex >= 0 && currentIndex !== targetIndex) {
    $(table).find('tr')
      .removeClass('selected');
    targetRow.addClass('selected');

    let iarr;
    let found = false;
    for (iarr = 0; iarr < BrainBox.info.mri.atlas.length; iarr++) {
      if (BrainBox.info.mri.atlas[iarr].name === annotations.volume[targetIndex].name
        && BrainBox.info.mri.atlas[iarr].project === projectInfo.shortname) {
        found = true;
        break;
=======
    async handleLayoutChange() {
      await this.delay(250);
      AtlasMakerWidget.resizeWindow();
    },

    handleResize() {
      AtlasMakerWidget.resizeWindow();
    },

    sliceChange(slice) {
      this.title = `Slice ${slice}`;
      AtlasMakerWidget.changeSlice(slice);
    },

    changeView(view) {
      AtlasMakerWidget.changeView(view);
      this.currentView = view;
    },

    changeTool(tool) {
      AtlasMakerWidget.changeTool(tool);
      this.currentTool = tool;
      this.displayAdjustSettings = false;
      if(tool === 'Measure') {
        // remove focus from button
        document.activeElement.blur();
      }
    },

    changePenSize(size) {
      AtlasMakerWidget.changePenSize(size);
      this.currentPenSize = size;
    },

    async toggleFullscreen() {
      this.fullscreen = !this.fullscreen;
      await this.delay(250);
      AtlasMakerWidget.resizeWindow();
    },

    render3D() {
      AtlasMakerWidget.render3D();
    },

    toggleChat() {
      this.displayChat = !this.displayChat;
      if (this.displayChat) {
        this.displayScript = false;
>>>>>>> de61f64 (New project page)
      }
    },

    toggleScript() {
      this.displayScript = !this.displayScript;
      if (this.displayScript) {
        this.displayChat = false;
      }
    },

    link() {
      AtlasMakerWidget.link();
    },

    preciseCursor() {
      AtlasMakerWidget.togglePreciseCursor();
      this.usePreciseCursor = !this.usePreciseCursor;
    },

    fill() {
      this.doFill = !this.doFill;
      AtlasMakerWidget.toggleFill(this.doFill);
    },

    undo() {
      AtlasMakerWidget.sendUndoMessage();
    },

    upload() {
      AtlasMakerWidget.upload();
    },

    download() {
      AtlasMakerWidget.download();
    },

    save() {
      AtlasMakerWidget.sendSaveMessage();
    },

    toggleOntology() {
      this.displayOntology = !this.displayOntology;
    },

    handleOntologyLabelClick(index) {
      this.displayOntology = false;
      this.currentLabel = index;
      AtlasMakerWidget.changePenColor(index);
    },

    handleNewChatMessages(event) {
      this.receivedMessages.push(event.detail.message);
    },

    handleNewNotification(event) {
      this.notification = event.detail.notification;
    },

    sendChatMessage(message) {
      AtlasMakerWidget.sendChatMessage(message);
    },

    toggleImageSettings() {
      this.displayAdjustSettings = !this.displayAdjustSettings;
      this.currentTool = null;
    },

    changeAlpha(x) {
      AtlasMakerWidget.alphaLevel = x / 100;
      AtlasMakerWidget.drawImages();
    },

    changeBrightness(x) {
      const b = (2 * x / 100);
      const c = 2 * this.contrastValue / 100;
      document.querySelector('#canvas').style.filter = `brightness(${b}) contrast(${c})`;
    },

    changeContrast(x) {
      const b = 2 * this.brightnessValue / 100;
      const c = (2 * x / 100);
      document.querySelector('#canvas').style.filter = `brightness(${b}) contrast(${c})`;
    }
<<<<<<< HEAD
    if (found) {
      AtlasMakerWidget.configureAtlasMaker(BrainBox.info, iarr);
    } else {
      console.log('ERROR: A quite unexpected one too...');
    }
=======
  },

  compilerOptions: {
    delimiters: ['[[', ']]']
>>>>>>> de61f64 (New project page)
  }
};
const app = Vue.createApp(PageContents);
app.component('ProjectPage', ProjectPage);
app.component('OntologySelector', OntologySelector);
app.component('Editor', Editor);
app.component('RangeSlider', RangeSlider);
app.component('ButtonsGroup', ButtonsGroup);
app.component('Button', Button);
app.component('TextAnnotations', TextAnnotations);
app.component('VolumeAnnotations', VolumeAnnotations);
app.component('Table', Table);
app.component('Row', Row);
app.component('Chat', Chat);
app.component('AdjustSettings', AdjustSettings);
app.provide('displaySettings', true);
app.provide('config', config);
app.provide('user', loggedUser);

app.mount('#app');
