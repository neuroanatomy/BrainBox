<template>
  <Row centered>
    <RangeSlider
      :max="totalSlices"
      v-model="currentSlice"
      @update:modelValue="sliceChange"
    />
  </Row>
  <Row centered>
    <ButtonsGroup>
      <Button
        :class="{ pressed: currentView === 'sag' }"
        @click="changeView('sag')"
        >Sag</Button
      >
      <Button
        :class="{ pressed: currentView === 'cor' }"
        @click="changeView('cor')"
        >Cor</Button
      >
      <Button
        :class="{ pressed: currentView === 'axi' }"
        @click="changeView('axi')"
        >Axi</Button
      >
    </ButtonsGroup>
    <ButtonsGroup>
      <Button
        @click="changeTool('Show')"
        :class="{ pressed: currentTool === 'Show' }"
      >
        <img class="icon" alt="Show" :src="icons['show.svg']" />
      </Button>
      <Button
        @click="changeTool('Paint')"
        :class="{ pressed: currentTool === 'Paint' }"
      >
        <img class="icon" alt="Paint" :src="icons['paint.svg']" />
      </Button>
      <Button
        @click="changeTool('Erase')"
        :class="{ pressed: currentTool === 'Erase' }"
      >
        <img class="icon" alt="Erase" :src="icons['erase.svg']" />
      </Button>
      <Button
        @click="changeTool('Landmark')"
        :class="{ pressed: currentTool === 'Landmark' }"
      >
        <img class="icon" alt="Landmark" :src="icons['landmark.svg']" />
      </Button>
      <Button
        @click="changeTool('Measure')"
        :class="{ pressed: currentTool === 'Measure' }"
      >
        <img class="icon" alt="ruler" :src="icons['ruler.svg']" />
      </Button>
      <Button
        @click="toggleImageSettings()"
        :class="{ pressed: displayAdjustSettings }"
      >
        <img class="icon" alt="Adjust" :src="icons['adjust.svg']" />
      </Button>
      <Button
        @click="changeTool('Eyedrop')"
        :class="{ pressed: currentTool === 'Eyedropper' }"
      >
        <img class="icon" alt="Eyedropper" :src="icons['eyedropper.svg']" />
      </Button>
    </ButtonsGroup>
  </Row>
  <Row centered>
    <Button @click="toggleFullscreen()" title="Full screen">
      <img class="icon" alt="Full screen" :src="icons['fullscreen.svg']" />
    </Button>
    <Button @click="render3D()" title="3D render">
      <img class="icon" alt="3D Render" :src="icons['3drender.svg']" />
    </Button>
    <ButtonsGroup>
      <Button
        @click="toggleChat()"
        title="Chat"
        :class="{ pressed: displayChat }"
      >
        <img class="icon" alt="Chat" :src="icons['chat.svg']" />
      </Button>
      <Button
        @click="toggleScript()"
        title="Script"
        :class="{ pressed: displayScript }"
      >
        <img class="icon" alt="Script" :src="icons['scroll.svg']" />
      </Button>
    </ButtonsGroup>
    <Button @click="link()" title="Link">
      <img class="icon" alt="Link" :src="icons['link.svg']" />
    </Button>
    <Button
      @click="preciseCursor()"
      title="Precise Cursor"
      :class="{ pressed: usePreciseCursor }"
    >
      <img
        class="icon"
        alt="Precise Cursor"
        :src="icons['preciseCursor.svg']"
      />
    </Button>
    <Button
      style="padding: 1px"
      @click="toggleOntology()"
      v-if="
        ontology != null &&
        ontology.labels != null &&
        ontology.labels[currentLabel] != null
      "
    >
      <div
        class="color"
        :style="`background-color: rgb(${ontology.labels[currentLabel].color[0]}, ${ontology.labels[currentLabel].color[1]}, ${ontology.labels[currentLabel].color[2]})`"
      ></div>
    </Button>
    <Button @click="fill()" title="Fill" :class="{ pressed: doFill }">
      <img class="icon" alt="Fill" :src="icons['fill.svg']" />
    </Button>
    <Button @click="undo()" title="Undo">
      <img class="icon" alt="Undo" :src="icons['undo.svg']" />
    </Button>
    <Button @click="upload()" title="Upload">
      <img class="icon" alt="Upload" :src="icons['upload.svg']" />
    </Button>
    <Button @click="download()" title="Download">
      <img class="icon" alt="Download" :src="icons['download.svg']" />
    </Button>
    <Button @click="save()" title="Save">
      <img class="icon" alt="Save" :src="icons['floppy.svg']" />
    </Button>
  </Row>
  <Row>
    <ButtonsGroup>
      <Button
        @click="changePenSize(1)"
        :class="{ pressed: currentPenSize === 1 }"
        title="Change pen size to 1"
        >1</Button
      >
      <Button
        @click="changePenSize(2)"
        :class="{ pressed: currentPenSize === 2 }"
        title="Change pen size to 2"
        >2</Button
      >
      <Button
        @click="changePenSize(3)"
        :class="{ pressed: currentPenSize === 3 }"
        title="Change pen size to 3"
        >3</Button
      >
      <Button
        @click="changePenSize(5)"
        :class="{ pressed: currentPenSize === 5 }"
        title="Change pen size to 5"
        >5</Button
      >
      <Button
        @click="changePenSize(10)"
        :class="{ pressed: currentPenSize === 10 }"
        title="Change pen size to 10"
        >10</Button
      >
      <Button
        @click="changePenSize(15)"
        :class="{ pressed: currentPenSize === 15 }"
        title="Change pen size to 15"
        >15</Button
      >
    </ButtonsGroup>
  </Row>
  <Row>
    <div class="text">
      <Chat
        v-if="displayChat"
        :receivedMessages="receivedMessages"
        :notification="notification"
        @send-message="sendChatMessage"
      />
      <ScriptConsole v-if="displayScript" />
    </div>
  </Row>
</template>
<script setup>
import {
  Button,
  ButtonsGroup,
  Chat,
  RangeSlider,
  Row,
  ScriptConsole,
} from "nwl-components";
import { ref, onMounted } from "vue";
import useVisualization from "../store/visualization";
const { AtlasMakerWidget } = window;

const requireIconsMap = () => {
  const r = require.context(
    "!!url-loader!../../../atlasmaker/src/svg",
    false,
    /^.*\.svg$/
  );
  const icons = {};
  r.keys().forEach((key) => (icons[key.substr(2)] = r(key).default));

  return icons;
};

const {
  title,
  notification,
  receivedMessages,
  displayAdjustSettings,
  displayOntology,
  ontology,
  currentLabel,
  currentView,
  currentTool,
  currentSlice,
  currentPenSize,
  totalSlices,
} = useVisualization();
const doFill = ref(false);
const usePreciseCursor = ref(false);
const displayChat = ref(true);
const displayScript = ref(false);
const fullscreen = ref(false);
const icons = requireIconsMap();

const sliceChange = (slice) => {
  title.value = `Slice ${slice}`;
  currentSlice.value = slice;
  AtlasMakerWidget.changeSlice(slice);
};

const changeView = (view) => {
  AtlasMakerWidget.changeView(view);
  currentView.value = view;
};

const changeTool = (tool) => {
  AtlasMakerWidget.changeTool(tool);
  currentTool.value = tool;
  displayAdjustSettings.value = false;
  if (tool === "Measure") {
    // remove focus from button
    document.activeElement.blur();
  }
};

const changePenSize = (size) => {
  AtlasMakerWidget.changePenSize(size);
  currentPenSize.value = size;
};

const toggleFullscreen = async () => {
  fullscreen.value = !fullscreen.value;
  setTimeout(() => {
    AtlasMakerWidget.resizeWindow();
  }, 250)
};

const render3D = () => {
  AtlasMakerWidget.render3D();
};

const toggleChat = () => {
  displayChat.value = !displayChat.value;
  if (displayChat.value) {
    displayScript.value = false;
  }
};

const toggleScript = () => {
  displayScript.value = !displayScript.value;
  if (displayScript.value) {
    displayChat.value = false;
  }
};

const link = () => {
  AtlasMakerWidget.link();
};

const preciseCursor = () => {
  AtlasMakerWidget.togglePreciseCursor();
  usePreciseCursor.value = !usePreciseCursor.value;
};

const fill = () => {
  doFill.value = !doFill.value;
  AtlasMakerWidget.toggleFill(doFill.value);
};

const undo = () => {
  AtlasMakerWidget.sendUndoMessage();
};

const upload = () => {
  AtlasMakerWidget.upload();
};

const download = () => {
  AtlasMakerWidget.download();
};

const save = () => {
  AtlasMakerWidget.sendSaveMessage();
};

const toggleOntology = () => {
  displayOntology.value = !displayOntology.value;
};

const sendChatMessage = (message) => {
  AtlasMakerWidget.sendChatMessage(message);
};

const toggleImageSettings = () => {
  displayAdjustSettings.value = !displayAdjustSettings.value;
  currentTool.value = null;
};
</script>
<style scoped>
button.pressed {
  background: #555;
}
button img.icon {
  width: 16px;
  height: 16px;
}
.color {
  height: 100%;
  width: 100%;
  min-width: 30px;
}
.text {
  opacity: 0.5;
  width: 100%;
}
.text:hover {
  opacity: 1;
}
:deep(.group), :deep(button) {
  flex-grow: 1;
}
</style>
