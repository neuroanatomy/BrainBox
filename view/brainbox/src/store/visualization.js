/**
 * Shared state for the project page components
 */

import { reactive, toRefs } from 'vue';

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
  currentSlice: 0,
  totalSlices: 0,
  currentTool: null,
  currentPenSize: 1,
  currentView: 'sag',
  fullscreen: false,
  alpha: 50,
  brightness: 50,
  contrast: 50
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
      state.title = `Slice ${e.detail.currentSlice}`;
      state.currentView = e.detail.currentView;
      state.currentSlice = e.detail.currentSlice;
      state.totalSlices = e.detail.totalSlices;
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
