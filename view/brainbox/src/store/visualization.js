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

export default function useVisualization() {
  return {
    ...toRefs(state)
  };
}
