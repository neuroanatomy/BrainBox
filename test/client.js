var page = require('webpage').create();

//viewportSize being the actual size of the headless browser
page.viewportSize = { width: 1024, height: 768 };

//the clipRect is the portion of the page you are taking a screenshot of
page.clipRect = { top: 0, left: 0, width: 1024, height: 768 };

page.open('http://brainbox.dev', function(status) {
    if (status !== 'success') {
        console.log('Unable to access network');
    } else {
        // a screenshot of the home page
        page.render('index.jpg');
 
        // log the title
        var title = page.evaluate(function() {
            return document.title;
        });
        console.log(title);
    }

    phantom.exit();
});