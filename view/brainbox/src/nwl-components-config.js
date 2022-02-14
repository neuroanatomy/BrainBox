export default {
  siteName: 'BrainBox',
  baseURL: window.location.protocol + '//' + window.location.host,
  logoURL: '/img/brainbox-logo-small_noFont.svg',
  githubURL: 'https://github.com/neuroanatomy/BrainBox',
  issuesURL: 'https://github.com/neuroanatomy/BrainBox/issues/new',
  searchURL: 'https://openneurolab.github.io/metasearch',
  docURL: 'https://github.com/neuroanatomy/BrainBox',
  userSearchURL: '/api/userNameQuery?q=',
  fetchLabelSets: async () => await (await fetch('/api/getLabelsets')).json()
};
