<template>
  <ProjectPage
    @resize="handleResize"
    @layout-change="handleLayoutChange"
    :project="{...project, title: projectName }"
    :fullscreen="fullscreen"
  >
    <template #left>
      <TextAnnotations
        :extract-keys="extractTextKeys"
        :link-prefix="linkPrefix"
        :files="files"
        @value-change="debouncedValueChange"
        v-model:selected-index="selectedIndex"
      />
      <VolumeAnnotations
        :extract-keys="extractVolumeKeys"
        :annotations="volumeAnnotations"
        @select-annotation="selectVolumeAnnotation"
      />
    </template>
    <template #right>
      <OntologySelector
        :ontology="ontology"
        :open="displayOntology"
        @on-close="displayOntology = false"
        @label-click="handleOntologyLabelClick"
      />
      <Editor
        :title="title"
        :class="{reduced}"
      >
        <template #tools>
          <Tools />
        </template>
        <template #content>
          <div
            id="stereotaxic"
            style="width: 100%; height: 100%"
          />
          <AdjustSettings
            v-if="displayAdjustSettings"
            v-model:alpha="alpha"
            @update:alpha="changeAlpha"
            v-model:brightness="brightness"
            @update:brightness="changeBrightness"
            v-model:contrast="contrast"
            @update:contrast="changeContrast"
          />
        </template>
      </Editor>
    </template>
  </ProjectPage>
</template>

<script setup>
/* global projectInfo */
/* eslint-disable max-lines */

import DOMPurify from 'dompurify';
import jsonpatch from 'fast-json-patch';
import { forEach, get, set, debounce } from 'lodash';
//import { initSyncedStore, waitForSync } from "../store/synced";
import {
  AdjustSettings,
  Editor,
  OntologySelector,
  ProjectPage,
  TextAnnotations,
  VolumeAnnotations
} from 'nwl-components';
import * as Vue from 'vue';


import useVisualization from '../store/visualization';

import Tools from './Tools.vue';

const { annotationsAccessLevel, BrainBox, AtlasMakerWidget } = window;
const { baseURL } = Vue.inject('config');

defineProps({
  project: {
    type: Object,
    required: true
  },
  projectName: {
    type: String,
    default: ''
  }
});

const {
  title,
  displayAdjustSettings,
  displayOntology,
  displayChat,
  displayScript,
  currentLabel,
  ontology,
  files,
  currentFile,
  fullscreen,
  alpha,
  brightness,
  contrast,
  changeAlpha,
  changeBrightness,
  changeContrast,
  init: initVisualization
} = useVisualization();
const linkPrefix = `${baseURL}/mri?url=`;
const volumeAnnotations = Vue.ref([]);
const selectedIndex = Vue.ref(null);

// define a map associating annotations keys to value selectors
// to extract content within the TextAnnotations component
const extractTextKeys = (_files) => {
  if (!_files) {
    return;
  }
  const keys = new Map();
  keys.set('Name', 'name');
  keys.set('File', 'source');
  _files.forEach((file) => {
    const annotations = get(file, [
      'mri',
      'annotations',
      projectInfo.shortname
    ]);
    if (!annotations) {
      return;
    }
    forEach(annotations, (value, key) => {
      if (value.type === 'text') {
        keys.set(key, [
          'mri',
          'annotations',
          projectInfo.shortname,
          key,
          'data'
        ]);
      }
    });
  });

  return keys;
};

const extractVolumeKeys = () => {
  const keys = new Map();
  keys.set('Name', 'name');
  keys.set('Labels set', 'labels');

  return keys;
};

const getDefaultAtlas = (annotation) => {
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
};

// make sure that all mri files have volume annotations as set in the project info
const populateVolumeAnnotations = (file) => {
  const volumeAnnotationsUnproxified = projectInfo.annotations.list.filter(
    (anno) => anno.type === 'volume'
  );
  if (!file.mri.atlas) { file.mri.atlas = []; }
  volumeAnnotationsUnproxified.forEach((annotation) => {
    const annotationIndex = file.mri.atlas.findIndex(
      (atlas) =>
        atlas.name === annotation.name &&
        atlas.project === projectInfo.shortname
    );

    if (annotationIndex >= 0) {
      return;
    }

    // If no layer was found, create it
    const atlas = getDefaultAtlas(annotation);

    file.mri.atlas.push(atlas);
  });
};


// make sure that all mri files have text annotations as set in the project info
const populateTextAnnotations = (fetchedFiles) => fetchedFiles.map((file) => {
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
      const date = new Date();
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

const doFetchFiles = async (fetchedFiles, cursor) => {
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
    fetchedFiles.push(...res);

    if (fetchedFiles.length % 100 === 0) {
      return doFetchFiles(fetchedFiles, cursor + 100);
    }
  }

  return fetchedFiles;
};

const fetchFiles = async () => {
  const fetchedFiles = await doFetchFiles([], 0);
  files.value.push(...populateTextAnnotations(fetchedFiles));
};

const reduced = Vue.computed(() => !displayChat.value && !displayScript.value);

const valueChange = (content, index, selector) => {
  const path = Array.isArray(selector) ? '/' + selector.join('/') : '/' + selector;
  AtlasMakerWidget.sendSaveMetadataMessage(files.value[index], 'patch', [
    {
      op: 'replace',
      path,
      value: content
    }
  ]);
  set(files.value[index], selector, content);
};

const debouncedValueChange = debounce(valueChange, 1000);

const setupKeyDownListeners = () => {
  document.addEventListener('keydown', (event) => {
    const selectedTr = document.querySelector('tr.selected');
    switch (event.key) {
    case 'ArrowUp':
      if (!selectedTr) {
        return;
      }
      if (selectedTr.previousElementSibling) {
        selectedTr.previousElementSibling.click();
      }
      break;
    case 'ArrowDown':
      if (!selectedTr) {
        return;
      }
      if (selectedTr.nextElementSibling) {
        selectedTr.nextElementSibling.click();
      }
      break;
    default:
      break;
    }
  });
};

const getMRIParams = (file) => {
  // make sure we don't send proxified refs to AtlasMaker as it's bad for perfs
  const plainFile = JSON.parse(JSON.stringify(file));

  const url = plainFile.source;
  const params = { url, view: 'cor', slice: 180, fullscreen: false };

  // select the first annotation associated to this project
  const annotationIndex = plainFile.mri.atlas?.findIndex(
    (atlas) => atlas.project === projectInfo.shortname
  );

  params.annotationItemIndex = annotationIndex;
  params.info = plainFile;

  return params;
};

// eslint-disable-next-line max-statements
Vue.watch(selectedIndex, async (newIndex) => {
  const selectedFile = files.value[newIndex];
  if (!selectedFile) {
    return;
  }
  const openFile = {...currentFile.value};
  if (selectedFile.source === openFile.source) {
    return;
  }
  currentFile.value = selectedFile;
  title.value = 'Loading…';
  populateVolumeAnnotations(selectedFile);
  const params = getMRIParams(selectedFile);

  await BrainBox.configureBrainBox(params);
  ontology.value = AtlasMakerWidget.ontology;
  currentLabel.value = 0;

  volumeAnnotations.value = selectedFile.mri.atlas.filter(
    (atlas) => atlas.project === projectInfo.shortname
  );

  AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
  AtlasMakerWidget.User.projectPage = projectInfo.shortname;
  AtlasMakerWidget.sendUserDataMessage(
    JSON.stringify({ projectPage: projectInfo.shortname })
  );
});

const selectVolumeAnnotation = async (selectedAtlas) => {
  const index = currentFile.value.mri.atlas.findIndex(
    (atlas) =>
      atlas.name === selectedAtlas.name &&
      atlas.project === projectInfo.shortname
  );
  if (index === -1) {
    return;
  }
  title.value = 'Loading…';
  await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
  ontology.value = AtlasMakerWidget.ontology;
  currentLabel.value = 0;
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const handleLayoutChange = async () => {
  await delay(250);
  AtlasMakerWidget.resizeWindow();
};

const handleResize = () => {
  AtlasMakerWidget.resizeWindow();
  AtlasMakerWidget.drawImages();
};

const handleOntologyLabelClick = (index) => {
  displayOntology.value = false;
  currentLabel.value = index;
  AtlasMakerWidget.changePenColor(index);
};

const receiveMetadata = function (data) {
  if (data.method !== 'patch') {
    // only deal with patch
    return;
  }
  const json = data.metadata;
  // find the matching file
  const file = files.value.find((f) => f.source === json.source);
  if (!file) { return; }
  // apply patch
  jsonpatch.applyPatch(file, data.patch);
  // sanitise file in-place without losing its ref
  Object.assign(file, JSON.parse(DOMPurify.sanitize(JSON.stringify(file))));
};

Vue.onMounted(async () => {
  setupKeyDownListeners();
  await initVisualization();
  AtlasMakerWidget._metadataChangeSubscribers.push(receiveMetadata);
  console.log('brainbox intialized');
  if (files.value.length === 0) {
    await fetchFiles();
  }
  if (files.value.length > 0) {
    selectedIndex.value = 0;
  }
});
</script>
<style>
table {
  width: 100%;
}
table + table {
  margin-top: 20px;
}
.adjust-settings {
  position: absolute;
  bottom: 0;
  left: 0;
  padding: 10px;
  width: 200px;
}
</style>
