import { Footer, Header, useProject } from 'nwl-components';
import { createApp, h } from 'vue';
import config from './nwl-components-config';

/*
  nwl-components' Header (with its Nav) and Footer on the viewer pages (UI kit step 10b).
  These pages are not Vue apps: the viewer owns the rest of the page. So each is a small
  Vue app of its own, mounted only on its placeholder (#bb-header-app, #bb-footer-app),
  never on an element that holds the viewer.

  They are render functions, not templates: the title is a text child, so a project name
  such as `{{ 1+1 }}` or `<b>` shows as typed, and is never compiled by Vue (nor, since it
  arrives as data, by Mustache).
*/

/**
 * Mount the nwl Header on a placeholder
 * @param {Element} el The placeholder
 * @param {Object} options The header's content
 * @param {string} options.title The title (text, shown as it is)
 * @param {Object|null} options.user The logged user (`publicLoggedUser`), null when logged out
 * @param {boolean} [options.displaySettings] Show the Nav's settings link (it also needs a project)
 * @param {Object} [options.project] The project of the settings link, `/project/<shortname>/settings`,
 *   set in nwl-components' project store
 * @returns {Object} The Vue app
 */
const mountViewerHeader = (el, { title, user, displaySettings = false, project = null }) => {
  const text = (typeof title === 'undefined' || title === null) ? '' : String(title);
  const app = createApp({
    render: () => h(Header, null, { default: () => h('span', { class: 'title' }, text) })
  });
  app.provide('config', config);
  app.provide('user', user);
  app.provide('displaySettings', displaySettings);
  if (project) {
    // the store injects config: inside the app's context, after config is provided
    app.runWithContext(() => useProject().setProject(project));
  }
  app.mount(el);

  return app;
};

/**
 * Mount the nwl Footer on a placeholder
 * @param {Element} el The placeholder
 * @returns {Object} The Vue app
 */
const mountViewerFooter = (el) => {
  const app = createApp({ render: () => h(Footer) });
  app.mount(el);

  return app;
};

export { mountViewerHeader, mountViewerFooter };
