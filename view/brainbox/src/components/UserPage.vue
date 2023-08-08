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
        <Tab title="Settings" v-if="displaySettings">
            <form class="embed-preferences" action="/user/savePreferences" method="POST">
              <h3>Embed</h3>
              <p>Limit embedding of my contents to the following hosts (1 item by line):</p>
              <textarea placeholder="example.com" name="authorizedHosts">{{ user.authorizedHostsForEmbedding }}</textarea>
              <div class="action-buttons">
                <button className="push-button" type="submit">Save</button>
            </div>
            </form>
            <h3>Account</h3>
            <dialog ref="removeAccountDialog" class="removeAccountDialog">
              <form action="/user/delete" method="POST">
                <p>
                  Are you sure you want to delete your account?
                </p>
                <div class="action-buttons">
                  <button className="push-button" value="cancel" formmethod="dialog">Cancel</button>
                  <button className="push-button danger" type="submit" value="default">Delete account</button>
                </div>
              </form>
            </dialog>
            <button class="push-button danger" @click.prevent="showRemoveAccountDialog">Remove account</button>
          </Tab>
      </Tabs>
    </template>
  </UserPage>
</template>
<script setup>
import { ref, onMounted, computed } from "vue";
import { UserPage, Tabs, Tab, Table } from "nwl-components";
const projects = ref([]);
const removeAccountDialog = ref(null);

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

const displaySettings = computed(() => loggedUser && props.user.nickname === loggedUser.username);

const showRemoveAccountDialog = () => {
  removeAccountDialog.value.showModal();
};

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

.push-button {
  border: 1px solid #ccc;
  padding: 10px;
  background: #222;    
  color: white;
}
.push-button + .push-button {
  margin-left: 10px;
}
.push-button.danger {
  background: red;
  font-weight: bold;
}

.removeAccountDialog {
  background: #222;
  box-shadow: 0 0 5px rgba(200,200,200,0.6);
  border: 1px solid #333;
  width: 300px;
  padding: 20px;
}

.action-buttons {
  display: flex;
  justify-content: flex-end;
}

.embed-preferences p {
  text-align: left;
}

.embed-preferences textarea {
  height: 100px;
  width: 100%;
  margin-bottom: 10px;
  color: black;
}
</style>