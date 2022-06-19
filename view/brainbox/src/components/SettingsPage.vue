<template>
    <SettingsPage :project="project" :files="files" />
</template>

<script setup>
import { onMounted, ref  } from 'vue';
import { SettingsPage } from 'nwl-components';
const files = ref([]);
const props = defineProps({
    project: {
        type: Object,
        required: true,
    }
});

let cursorFiles = 0;
const queryFiles = async (files) => {
  const res = await fetch(`/project/json/${project.shortname}/files?start=${cursorFiles}&length=100&name=true`);
  const list = await res.json();
  if(list.length) {
    files.push(...list);
    cursorFiles += 100;

    if(list.length === 100) {
      return queryFiles(files);
    }
  }

  return files;
};

onMounted(async () => {
    files.value.push(...await queryFiles([]));
});
</script>