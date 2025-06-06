<template>
  <main>
    <select
      @change="onFileSelect"
      class="fileSelector"
    >
      <option
        v-for="file in files"
        :key="file.source"
        :value="file.source"
      >
        {{ file.name || file.source }}
      </option>
    </select>
    <select
      @change="onVolumeAnnotationSelect"
      class="layerSelector"
    >
      <option
        v-for="annotation in volumeAnnotations"
        :key="annotation.name"
        :value="annotation.name"
      >
        {{ annotation.name }}
      </option>
    </select>
    <Editor
      :title="title"
      :class="{ fullscreen, reduced: !displayChat && !displayScript }"
    >
      <template #tools>
        <Tools />
      </template>
      <template #content>
        <div
          id="stereotaxic"
          style="width: 100%; height: 100%"
        />
        <OntologySelector
          :ontology="ontology"
          :open="displayOntology"
          @on-close="displayOntology = false"
          @label-click="handleOntologyLabelClick"
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
  </main>
</template>
<script setup>
/* global AtlasMakerWidget BrainBox projectInfo annotationsAccessLevel */
import {
  Editor,
  OntologySelector,
  AdjustSettings
} from 'nwl-components';
import { ref, onMounted, watch } from 'vue';

import useVisualization from '../store/visualization';

import Tools from './Tools.vue';

const {
  title,
  totalSlices,
  displayAdjustSettings,
  displayOntology,
  alpha,
  brightness,
  contrast,
  ontology,
  currentLabel,
  changeAlpha,
  changeBrightness,
  changeContrast,
  fullscreen,
  displayChat,
  displayScript,
  currentFile,
  init: initVisualization
} = useVisualization();

const files = ref([]);
const volumeAnnotations = ref([]);

const toggleFullScreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else if (document.exitFullscreen) {
    document.exitFullscreen();
  }
};

watch(fullscreen, toggleFullScreen);

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

// eslint-disable-next-line max-statements
const selectFile = async (file) => {
  if (currentFile.value && currentFile.value.source === file.source) {
    return;
  }
  currentFile.value = file;
  title.value = 'Loading…';
  totalSlices.value = 0;
  try {
    populateVolumeAnnotations(file);
    const params = getMRIParams(file);

    await BrainBox.configureBrainBox(params);
    ontology.value = AtlasMakerWidget.ontology;
    currentLabel.value = 0;

    volumeAnnotations.value = file.mri.atlas.filter(
      (atlas) => atlas.project === projectInfo.shortname
    );

    AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
    AtlasMakerWidget.User.projectPage = projectInfo.shortname;
    AtlasMakerWidget.sendUserDataMessage(
      JSON.stringify({ projectPage: projectInfo.shortname })
    );

  } catch (error) {
    console.error('Error configuring BrainBox:', error);
    title.value = 'Error';
  }
};

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
  totalSlices.value = 0;
  try {
    await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
    ontology.value = AtlasMakerWidget.ontology;
  } catch (error) {
    console.error('Error configuring AtlasMaker:', error);
    title.value = 'Error';
  }
  currentLabel.value = 0;
};

// eslint-disable-next-line no-shadow
const doFetchFiles = async (files, cursor) => {
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

    if (files.length % 100 === 0) {
      return doFetchFiles(files, cursor + 100);
    }
  }

  return files;
};

const fetchFiles = async () => {
  if (files.value.length === 0) {
    const fetchedFiles = await doFetchFiles([], 0);
    files.value.push(...fetchedFiles);
  }
};

const handleOntologyLabelClick = (index) => {
  displayOntology.value = false;
  currentLabel.value = index;
  AtlasMakerWidget.changePenColor(index);
};

onMounted(async () => {
  await initVisualization();
  await fetchFiles();
  selectFile(files.value[0]);
});

const onFileSelect = (event) => {
  const file = files.value.find((f) => f.source === event.target.value);
  selectFile(file);
};

const onVolumeAnnotationSelect = (event) => {
  selectVolumeAnnotation({ name: event.target.value });
};
</script>

<style>
.area {
  width: 100vw;
  height: 100vh;
}
.fileSelector {
  position: absolute;
  right: 10px;
  bottom: 35px;
  z-index: 100;
  background: black;
}
.layerSelector {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 100;
  background: black;
}
</style>
