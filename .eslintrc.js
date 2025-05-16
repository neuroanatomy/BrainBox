module.exports = {
  'env': {
    'mocha': true
  },
  'extends': ['naat', 'plugin:vue/vue3-strongly-recommended'],
  'rules': { 'vue/multi-word-component-names': 'off' },
  'overrides': [
    {
      files: ['*.vue'],
      rules: {
        // 300 lines limit seems to short for *.vue files
        'max-lines': 'off'
      }
    }
  ]
};
