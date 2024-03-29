<template>
  <SettingsPage
    :project="project"
    :files="files"
  />
</template>

<script setup>
/* global project */
import { SettingsPage } from 'nwl-components';
import { onMounted, ref } from 'vue';
const files = ref([]);
defineProps({
  project: {
    type: Object,
    required: true
  }
});

let cursorFiles = 0;
const queryFiles = async (fileArray) => {
  const res = await fetch(`/project/json/${project.shortname}/files?start=${cursorFiles}&length=100&name=true`);
  const list = await res.json();
  if (list.length) {
    fileArray.push(...list);
    cursorFiles += 100;

    if (list.length === 100) {
      return queryFiles(fileArray);
    }
  }

  return fileArray;
};

onMounted(async () => {
  files.value.push(...await queryFiles([]));
});
</script>
