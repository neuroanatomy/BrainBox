module.exports = function(grunt) {
    grunt.initConfig({
        eslint: {					
            src: ["public/**/*.js"],
            options: {
                configFile: 'eslint.json'
            }
        },
        watch: {
            scripts: {
                files: "public/**/*.js",
                tasks: ['eslint']
            },
        }
    });

    grunt.loadNpmTasks("grunt-eslint");
    grunt.loadNpmTasks('grunt-contrib-watch');

    grunt.registerTask("default", ["eslint"]);
};