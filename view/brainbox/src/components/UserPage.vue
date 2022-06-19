<template>
  <UserPage :user="user">
    <template v-slot:side> {{projects.length}} Projects </template>
    <template v-slot:content>
      <Tabs>
        <Tab title="Projects">
          <Table id="projects">
            <thead>
              <tr>
                <th>Name</th>
                <th>Files</th>
                <th>Collaborators</th>
                <th>Owner</th>
                <th>Last modified</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="project in projects" :key="project.name">
                <td>
                  <a :href="`${project.projectURL}/settings`" class="settings">
                    <img
                      style="width: 11px; margin: 3px 8px 0 0"
                      src="/img/settings.svg"
                    />
                  </a>
                  <a :href="project.projectURL"> {{ project.project }} </a>
                </td>
                <td>{{project.numFiles}}</td>
                <td>{{project.numCollaborators}}</td>
                <td>
                  <a :href="`/user/${project.owner}`"> {{project.owner}} </a>
                </td>
                <td>{{project.modified}}</td>
              </tr>
            </tbody>
          </Table>
        </Tab>
      </Tabs>
    </template>
  </UserPage>
</template>
<script setup>
import { ref, onMounted } from "vue";
import { UserPage, Tabs, Tab, Table } from "nwl-components";
const projects = ref([]);

const props = defineProps({
    user: Object,
})

onMounted(() => {
  let cursorProjects = 0;
  const url = new URL(
      `/user/json/${props.user.nickname}/projects`,
    window.location.protocol + "//" + window.location.host
  );
  const fetchProjects = async () => {
    const params = {
      start: cursorProjects,
      length: 100,
    };
    url.search = new URLSearchParams(params).toString();
    const res = await (await fetch(url)).json();
    if (res.success && res.list.length > 0) {
      projects.value.push(...res.list);
      cursorProjects += 100;
      fetchProjects();
    }
  };
  fetchProjects();
});
</script>
<style scoped>
#projects {
  table-layout: auto;
}
#projects td {
  padding: 0 4px;
}
#projects a {
  text-decoration: none;
}
.settings {
  opacity: 0.5;
  transition: opacity 500ms;
}
.settings:hover {
  opacity: 1;
}
</style>