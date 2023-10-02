module.exports = {
  'env': {
    'mocha': true
  },
  'extends': ['naat', 'plugin:vue/vue3-strongly-recommended'],
  'rules': { 'vue/multi-word-component-names': 'off' },
  'overrides': [
    {
      files: ['view/brainbox/src/components/Tools.vue'],
      rules: {
        'max-lines': 'off'
      }
    }
  ]
};
