/**
 * Shared state for the project page components
 */

import { reactive, toRefs, watch } from 'vue';

const state = reactive({
  title: 'Loading...',
  notification: '',
  receivedMessages: [],
  displayAdjustSettings: false,
  displayOntology: false,
  displayChat: true,
  displayScript: false,
  ontology: null,
  currentLabel: 0,
  currentFile: null,
  currentSlice: null,
  totalSlices: 0,
  currentTool: null,
  currentPenSize: 1,
  currentView: 'sag',
  fullscreen: false,
  alpha: 50,
  brightness: 50,
  contrast: 50
});

watch(() => state.currentSlice, (slice, prevSlice) => {
  if (slice < 0) {
    state.currentSlice = 0;

    return;
  } else if (slice > state.totalSlices) {
    state.currentSlice = state.totalSlices;

    return;
  }
  state.title = `Slice ${slice}`;
  if (prevSlice !== null && prevSlice !== slice) {
    window.AtlasMakerWidget.changeSlice(slice);
  }
});

export default function useVisualization () {
  const handleNewChatMessages = (event) => {
    state.receivedMessages.push(event.detail.message);
  };

  const handleNewNotification = (event) => {
    state.notification = event.detail.notification;
  };

  const setupEventListeners = () => {
    window.addEventListener('brainImageConfigured', (e) => {
      state.currentView = e.detail.currentView;
      state.totalSlices = e.detail.totalSlices;
      state.currentSlice = e.detail.currentSlice;
      state.title = `Slice ${e.detail.currentSlice}`;
    });

    window.addEventListener('newMessage', handleNewChatMessages);
    window.addEventListener('newNotification', handleNewNotification);
  };

  return {
    ...toRefs(state),
    changeAlpha () {
      const { AtlasMakerWidget } = window;
      AtlasMakerWidget.alphaLevel = state.alpha / 100;
      AtlasMakerWidget.drawImages();
    },
    changeBrightness () {
      const b = (2 * state.brightness) / 100;
      const c = (2 * state.contrast) / 100;
      document.querySelector(
        '#canvas'
      ).style.filter = `brightness(${b}) contrast(${c})`;
    },
    changeContrast () {
      const b = (2 * state.brightness) / 100;
      const c = (2 * state.contrast) / 100;
      document.querySelector(
        '#canvas'
      ).style.filter = `brightness(${b}) contrast(${c})`;
    },

    async init () {
      const { BrainBox } = window;
      await BrainBox.initBrainBox();
      setupEventListeners();
    }

  };
}
