<template>
  <Wrapper>
    <Header>
      <span class="title">BrainBox</span>
    </Header>
    <main>
      <div class="left">
        <div class="privilegedAccessInfo" v-if="displayPrivilegedAccessWarning">
          You are seeing this private MRI because you were added as a
          collaborator with access to files. Share with caution.
        </div>
        <div class="annotationsPane">
          <table class="info">
            <tbody>
              <tr>
                <th>Name</th>
                <td>
                  <span class="noEmpty">{{ name }}</span>
                </td>
              </tr>

              <tr>
                <th>Data&nbsp;source</th>
                <td>
                  <span style="word-break: break-all">{{ source }}</span>
                </td>
              </tr>

              <tr>
                <th>Inclusion&nbsp;date</th>
                <td>
                  <span>{{ date }}</span>
                </td>
              </tr>
            </tbody>
          </table>
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
                <td>
                  <a :href="`/project/${atlas.project}`">{{ atlas.project }}</a>
                </td>
                <td>{{ new Date(atlas.modified).toLocaleDateString() }}</td>
                <td><Access :collaborator="collaboratorAccess[atlas.filename]" type="files" readonly /></td>
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
                <td>
                  <a class="noEmpty" :href="`/project/${annotation.project}`">{{
                    annotation.project
                  }}</a>
                </td>
                <td class="noEmpty">{{ new Date(annotation.modified).toLocaleDateString() }}</td>
              </tr>
            </tbody>
          </Table>
        </div>
      </div>
      <div class="right">
        <Editor :title="title" :class="{fullscreen, reduced}" :toolsMinHeight="reduced ? 'auto' : '340px'">
          <template v-slot:tools>
            <Tools />
          </template>
          <template v-slot:content>
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
          </template>
        </Editor>
      </div>
    </main>
  </Wrapper>
</template>
<script setup>
import { ref, onMounted, watch, computed } from "vue";
import {
  Wrapper,
  Header,
  Editor,
  Table,
  Access,
  OntologySelector,
  AdjustSettings
} from "nwl-components/dist/nwl-components.umd.js";
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
  fullscreen,
  displayChat,
  displayScript,
  title,
  init: initVisualization,
} = useVisualization();

const selectedIndex = ref(0);
const reduced = computed(() => !displayChat.value && !displayScript.value);

watch(fullscreen, () => {
  if(!fullscreen.value) {
    const tools = document.querySelector('.area .tools');
    setTimeout(() => {
      tools.style.left = '10px';
      tools.style.top = '10px';
    }, 100);
  }
  setTimeout(() => {
    document.querySelector('#resizable').style = '';
    AtlasMakerWidget.resizeWindow();
  }, 100);
})

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
const { name, source } = mriInfo;
const date = new Date(mriInfo.included).toLocaleDateString();
const collaboratorAccess = mapValues(keyBy(mriInfo.mri.atlas, "filename"), (atlas) => ({ access: { files: atlas.access }}))
const displayPrivilegedAccessWarning = hasPrivilegedAccess;

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
  justify-content: center;
  flex-direction: column;
}

.container {
  position: relative;
}

:deep(.area.fullscreen) {
  position: absolute;
  width: 100%;
  height: calc(100vh - 82px);
  left: 0;
}

.left {
  flex-grow: 1;
  max-width: 900px;
}

.privilegedAccessInfo {
  background-color: #3B3B3B;
  padding: 10px 20px;
  margin-bottom: 15px;
  display: flex;
  align-items: center;
}
.privilegedAccessInfo:before {
    content: '\1F512';
    font-size: 25px;
    margin-right: 15px;
    background: #2B2B2B;
    border-radius: 50%;
    width: 50px;
    height: 50px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
}
.info {
  margin-bottom: 20px;
}
.info th {
  font-weight: bold;
}

.annotationsPane {
  background-color: #333;
  padding: 20px;
  margin-bottom: 20px;
}

.noEmpty:empty:before {
  content: "Empty";
  color: rgba(255, 255, 255, 0.4);
}
.tools {
  width: 100%;
}
:deep(button), :deep(.group) {
    height: 24px;
    margin: 1px;  
}

@media(max-width: 1300px) {
  .left, .right {
    max-width: 700px;
    width: 100%;
    margin: 0 auto;
  }
}


@media(min-width: 1300px) {
  main {
    flex-direction: row;
  }
  .left {
    margin-right: 20px;
    width: auto;
  }
  .right {
    max-width: 900px;
    width: 600px;
    flex-shrink: 0;
  }
}

</style>