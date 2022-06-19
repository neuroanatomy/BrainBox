<template>
  <Wrapper>
    <Header>
      <span class="title">BrainBox</span>
    </Header>
    <main>
      <div class="left">
        <h2>Volume annotations</h2>
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Project</th>
              <th>Modified</th>
              <th>Access</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="(atlas, index) in atlases"
              :class="{ selected: selectedIndex === index }"
              :key="atlas.filename"
              @click="selectVolumeAnnotation(index)"
            >
              <td>{{ atlas.name }}</td>
              <td>{{ labelsName[atlas.labels] }}</td>
              <td>{{ atlas.project }}</td>
              <td>{{ atlas.modified }}</td>
              <td>Access</td>
            </tr>
          </tbody>
        </Table>
        <h2>Text annotations</h2>
        <Table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Value</th>
              <th>Project</th>
              <th>Modified</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="annotation in formattedTextAnnotations"
              :key="annotation.name"
            >
              <td class="noEmpty">{{ annotation.name }}</td>
              <td class="noEmpty">{{ annotation.data }}</td>
              <td class="noEmpty">{{ annotation.project }}</td>
              <td class="noEmpty">{{ annotation.modified }}</td>
            </tr>
          </tbody>
        </Table>
      </div>
      <div class="right">
        <div class="container">
          <div id="stereotaxic" style="width: 100%; height: 100%"></div>
          <OntologySelector
            :ontology="ontology"
            :open="displayOntology"
            @on-close="displayOntology = false"
            @label-click="handleOntologyLabelClick"
          />
          <AdjustSettings
            v-if="displayAdjustSettings"
            :alpha="alpha"
            @change-alpha="changeAlpha"
            :brightness="brightness"
            @change-brightness="changeBrightness"
            :contrast="contrast"
            @change-contrast="changeContrast"
          />
        </div>
        <div class="tools">
            <Tools />
        </div>
      </div>
    </main>
  </Wrapper>
</template>
<script setup>
import { ref, onMounted } from "vue";
import {
  Wrapper,
  Header,
  Footer,
  Table,
  AdjustSettings,
  OntologySelector,
} from "nwl-components";
import Tools from "./Tools.vue";
import useVisualization from "../store/visualization";
import { keyBy, mapValues, flatten, map } from "lodash";

const {
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
  init: initVisualization,
} = useVisualization();

const selectedIndex = ref(0);

const selectVolumeAnnotation = async (index) => {
  selectedIndex.value = index;
  await AtlasMakerWidget.configureAtlasMaker(BrainBox.info, index);
  ontology.value = AtlasMakerWidget.ontology;
  currentLabel.value = 0;
};

const formattedTextAnnotations = flatten(
  map(mriInfo.mri.annotations, (nestedAnnotations, project) =>
    map(nestedAnnotations, (annotation, name) => ({
      ...annotation,
      project,
      name,
    }))
  )
);

const atlases = mriInfo.mri.atlas;
const labelsName = ref({});

const handleOntologyLabelClick = (index) => {
  displayOntology.value = false;
  currentLabel.value = index;
  AtlasMakerWidget.changePenColor(index);
};

onMounted(async () => {
  await initVisualization();
  const labels = await (await fetch("/api/getLabelsets")).json();
  labelsName.value = mapValues(keyBy(labels, "source"), "name");
  params.info = mriInfo;
  await BrainBox.configureBrainBox(params);
  ontology.value = AtlasMakerWidget.ontology;
  currentLabel.value = 0;
});
</script>
<style scoped>
main {
  display: flex;
  padding: 0;
  align-items: space-between;
}
.container {
  position: relative;
}
.left {
  width: 60%;
  margin-right: 20px;
}
.right {
  width: 40%;
}
.noEmpty:empty:before {
  content: "Empty";
  color: rgba(255, 255, 255, 0.4);
}

.tools {
    width: 100%;
}
</style>