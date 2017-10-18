function startIntro() {
    const intro = introJs();
    intro.setOptions({
        steps: [
            {
                intro: 'Welcome to BrainBox.' +
                'BrainBox allows you to visualise and segment collaboratively ' +
                'any brain MRI dataset available online. Follow this tutorial ' +
                'to learn how to enter data into BrainBox, view it, edit it, ' +
                'and create collaborative segmentation projects. BrainBox is an ' +
                'open project – you will learn how to help us improving it by ' +
                'reporting bugs and suggestions to our GitHub repository'
            },
            {
                element: '#url',
                intro: 'This is BrainBox\'s URL field. You can paste here a link ' +
                'to any MRI on the web. Currently, BrainBox supports Nifti ' +
                'format (.nii.gz files) and MGH format (.mgz files). Any link ' +
                'on the Web should work, from Zenodo, FigShare, DropBox, Amazon, ' +
                'etc. If you want to try BrainBox but you don\'t have any link to ' +
                'an MRI, you can select a brain from the "Take me to a brain" ' +
                'list, or browse among the community created projects.',
                position: 'top'
            },
            {
                element: '#go',
                intro: 'Once you have entered the link to an MRI in the URL field ' +
                'click the <b>Go</b> button to go to BrainBox\'s viewer'
            }
        ]
    });
    intro.start();
}
