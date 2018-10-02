/* global AtlasMakerWidget $ */
import html from './index.html';

// append HTML
AtlasMakerWidget.container.find("#resizable").append(html);

// Transparency
AtlasMakerWidget.slider($('.slider#alphaLevel'),function(x) {
    $('#alphaLevel').data('val',x);
    $('#alphaLevel .thumb')[0].style.left=x+'%';
    AtlasMakerWidget.alphaLevel=x/100;
    AtlasMakerWidget.drawImages();
});
$('.slider#alphaLevel').data({max:100,val:50});
$('#alphaLevel .thumb')[0].style.left=(AtlasMakerWidget.alphaLevel*100)+'%';

// Brightness
AtlasMakerWidget.slider($('.slider#minLevel'),function(x) {
    $('#minLevel').data('val',x);
    $('#minLevel .thumb')[0].style.left=x+'%';

    var b=(2*x/100);
    var c=(2*$('#maxLevel').data('val')/100);
    $('#canvas').css({
        'webkit-filter':'brightness('+b+') contrast('+c+')',
        'filter':'brightness('+b+') contrast('+c+')'
    });
});
$('.slider#minLevel').data({max:100,val:50});
$('#minLevel .thumb')[0].style.left='50%';

// Contrast
AtlasMakerWidget.slider($('.slider#maxLevel'),function(x) {
    $('#maxLevel').data('val',x);
    $('#maxLevel .thumb')[0].style.left=x+'%';

    var b=(2*$('#minLevel').data('val')/100);
    var c=(2*x/100);
    $('#canvas').css({
        'webkit-filter':'brightness('+b+') contrast('+c+')',
        'filter':'brightness('+b+') contrast('+c+')'
    });
});
$('.slider#maxLevel').data({max:100,val:50});
$('#maxLevel .thumb')[0].style.left='50%';

var observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.attributeName === 'class') {
            console.log('mutation',mutation);
            var attributeValue = $(mutation.target).prop(mutation.attributeName);
            if(attributeValue=='a')
                $('#adjust').remove();
                observer.disconnect();
                // delete observer;
        }
    });
});
observer.observe($('#paintTool [title="Adjust"]')[0], {
    attributes: true
});
