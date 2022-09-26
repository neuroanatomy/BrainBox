<template>
  <ProjectPage
    @resize="handleResize"
    @layout-change="handleLayoutChange"
    :project="{...project, title: projectName }"
    :fullscreen="fullscreen"
  >
    <template v-slot:left>
      <TextAnnotations
        :extract-keys="extractTextKeys"
        :link-prefix="linkPrefix"
        :files="files"
        @value-change="valueChange"
        @select-file="selectFile"
      />
      <VolumeAnnotations
        :extract-keys="extractVolumeKeys"
        :annotations="volumeAnnotations"
        @select-annotation="selectVolumeAnnotation"
      />
    </template>
    <template v-slot:right>
      <OntologySelector
        :ontology="ontology"
        :open="displayOntology"
        @on-close="displayOntology = false"
        @label-click="handleOntologyLabelClick"
      />
      <Editor :title="title" :class="{reduced: !displayChat && !displayScript}">
        <template v-slot:tools>
          <Tools />
        </template>
        <template v-slot:content>
          <div id="stereotaxic" style="width: 100%; height: 100%"></div>
          <AdjustSettings
            v-if="displayAdjustSettings"
            :alpha="alpha"
            @change-alpha="changeAlpha"
            :brightness="brightness"
            @change-brightness="changeBrightness"
            :contrast="contrast"
            @change-contrast="changeContrast"
          />
        </template>
      </Editor>
    </template>
  </ProjectPage>
</template>

<script setup>
import { forEach, get, set } from "lodash";
import { initSyncedStore, waitForSync } from "../store/synced";
import useVisualization from "../store/visualization";
import { enableVueBindings } from "@syncedstore/core";
import Tools from "./Tools.vue";
import {
  AdjustSettings,
  Editor,
  OntologySelector,
  ProjectPage,
  TextAnnotations,
  VolumeAnnotations,
} from "nwl-components/dist/nwl-components.umd.js";
import * as Vue from "vue";

const { annotationsAccessLevel, BrainBox, AtlasMakerWidget } = window;
const { store, webrtcProvider, doc } = initSyncedStore(projectInfo.shortname);
const { baseURL } = Vue.inject('config');

// make SyncedStore use Vuejs internally
enableVueBindings(Vue);

const props = defineProps({
  project: {
    type: Object,
    required: true,
  },
  projectName: String,
});

const files = Vue.ref([]);
doc.getArray("files").observe(() => {
  files.value.splice(0, files.value.length);
  files.value.push(...store.files);
});

const {
  title,
  displayAdjustSettings,
  displayOntology,
  displayChat,
  displayScript,
  currentLabel,
  ontology,
  currentView,
  currentSlice,
  currentFile,
  totalSlices,
  fullscreen,
  alpha,
  brightness,
  contrast,
  changeAlpha,
  changeBrightness,
  changeContrast,
  init: initVisualization,
} = useVisualization();
const linkPrefix = `${baseURL}/mri?url=`;
const volumeAnnotations = Vue.ref([]);

// define a map associating annotations keys to value selectors
// to extract content within the TextAnnotations component
const extractTextKeys = (_files) => {
  if (!_files) {
    return;
  }
  const keys = new Map();
  keys.set("Name", "name");
  keys.set("File", "source");
  _files.forEach((file) => {
    const annotations = get(file, [
      "mri",
      "annotations",
      projectInfo.shortname,
    ]);
    if (!annotations) {
      return;
    }
    forEach(annotations, (value, key) => {
      if (value.type === "text") {
        keys.set(key, [
          "mri",
          "annotations",
          projectInfo.shortname,
          key,
          "data",
        ]);
      }
    });
  });

  return keys;
};

const extractVolumeKeys = () => {
  const keys = new Map();
  keys.set("Name", "name");
  keys.set("Labels set", "labels");

  return keys;
};

const fetchFiles = async () => {
  if (files.value.length === 0) {
    const fetchedFiles = await doFetchFiles([], 0);
    store.files.push(...populateTextAnnotations(fetchedFiles));
  }
};

const syncBrainbox = () => {
  BrainBox.info = store.files.find(file => file.id === currentFile.id);
  AtlasMakerWidget.sendSaveMetadataMessage(BrainBox.info);
}

const valueChange = (content, index, selector) => {
  const sel =
    typeof selector === "string" ? [index, selector] : [index, ...selector];
  set(store.files, sel, content);
  syncBrainbox();
};

const doFetchFiles = async (files, cursor) => {
  const params = {
    start: cursor,
    length: 100,
  };
  const url = new URL(
    `/project/json/${projectInfo.shortname}/files`,
    window.location.protocol + "//" + window.location.host
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

const setupKeyDownListeners = () => {
  document.addEventListener("keydown", (event) => {
    const selectedTr = document.querySelector("tr.selected");
    switch (event.key) {
      case "ArrowUp":
        if (!selectedTr) {
          return;
        }
        if (selectedTr.previousElementSibling) {
          selectedTr.previousElementSibling.click();
        }
        break;
      case "ArrowDown":
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

const getDefaultAtlas = (annotation) => {
  const date = new Date();

  return {
    name: annotation.name,
    project: projectInfo.shortname,
    created: date.toJSON(),
    modified: date.toJSON(),
    modifiedBy: AtlasMakerWidget.User.username,
    filename: Math.random().toString(36).slice(2) + ".nii.gz", // automatically generated filename
    labels: annotation.values,
    owner: AtlasMakerWidget.User.username,
    type: "volume",
    access: annotationsAccessLevel,
  };
};

const getMRIParams = (file) => {
  // make sure we don't send proxified refs to AtlasMaker as it's bad for perfs
  const plainFile = JSON.parse(JSON.stringify(file));

  const url = plainFile.source;
  const params = { url, view: "cor", slice: 180, fullscreen: false };

  // select the first annotation associated to this project
  const annotationIndex = plainFile.mri.atlas.findIndex(
    (atlas) => atlas.project === projectInfo.shortname
  );

  params.annotationItemIndex = annotationIndex;
  params.info = plainFile;

  return params;
};

const selectFile = async (file) => {
  if (currentFile.value && currentFile.value.source === file.source) {
    return;
  }
  currentFile.value = file;
  title.value = "Loading…";
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
  title.value = "Loading…";
  await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
  ontology.value = AtlasMakerWidget.ontology;
  currentLabel.value = 0;
};

// make sure that all mri files have volume annotations as set in the project info
const populateVolumeAnnotations = (file) => {
  const volumeAnnotations = projectInfo.annotations.list.filter(
    (anno) => anno.type === "volume"
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
    const atlas = getDefaultAtlas(annotation);

    file.mri.atlas.push(atlas);
  });
};

// make sure that all mri files have text annotations as set in the project info
const populateTextAnnotations = (files) => {
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
      (annotation) => annotation.type === "text"
    );
    for (let i = 0; i < textAnnotations.length; i++) {
      const annName = textAnnotations[i].name;
      if (!file.mri.annotations[projectInfo.shortname][annName]) {
        const date = new Date();
        file.mri.annotations[projectInfo.shortname][annName] = {
          created: date.toJSON(),
          modified: date.toJSON(),
          modifiedBy: AtlasMakerWidget.User.username,
          type: "text",
        };
      }
    }

    return file;
  });
};

const delay = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

const handleLayoutChange = async () => {
  await delay(250);
  AtlasMakerWidget.resizeWindow();
};

const handleResize = () => {
  AtlasMakerWidget.resizeWindow();
};

const handleOntologyLabelClick = (index) => {
  displayOntology.value = false;
  currentLabel.value = index;
  AtlasMakerWidget.changePenColor(index);
};

Vue.onMounted(async () => {
  setupKeyDownListeners();
  await waitForSync(webrtcProvider);
  await initVisualization();
  await fetchFiles();
  selectFile(files.value[0]);
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