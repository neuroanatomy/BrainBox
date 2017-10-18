<!-- Thank you so much for your contribution to BrainBox! <3 -->

<!-- Please find a short title for your pull request and describe your changes on the following line: -->


---
<!-- Please go through our check list and check the functionalities which might be affected by your code changes. Replace each `[ ]` by `[X]` when the step is complete.-->
- [ ] These changes fix #__ (github issue number if applicable).
- [ ] All BrainBox tools behave as expected:
    * **KEYS**
        * right and left arrow keys
            - [ ] jump to next or previous slice within one brain, respectively
            - [ ] update the slider accordingly
            - [ ] update the slice number accordingly (upper left corner of the viewer window)
        * down and up arrow keys
            - [ ] jump to the next or previous brain within one project, respectively
            - [ ] update the selected subject in the annotation table
    * **TOOL BUTTONS**
        * minus
            - [ ] jumps to the previous slice within one brain
            - [ ] updates the slider accordingly
            - [ ] updates the slice number accordingly (upper left corner of the viewer window)
        * plus
            - [ ] jumps to the next slice within one brain
            - [ ] updates the slider accordingly
            - [ ] updates the slice number accordingly (upper left corner of the viewer window)
        * slider
            - [ ] updates slice view and slice number on the fly
        * sag / cor / axi buttons
            - [ ] switch view between the three orthogonal planes
        * show tool
            - [ ] when you click and drag in your browser window, this tool displays a cirlce at the position of your mouse click & drag as well as the user name in all browser windows connected to the same brain
        * the numbers at the bottom of the tool panel
            - [ ] change pencil size and eraser size accordingly
        * pencil tool
            - [ ] draws a line in the colour displayed in the color field
            - [ ] in combination with bucket tool filles a complete area with the chosen colour (be sure to have closed the contour line ;) Otherwise, the undo button will be your friend ;)
            - [ ] updates length and volume information (of what has been segmented) in the upper left corner of the viewer
        * erase tool
            - [ ] erases upon click drag from the annotation
            - [ ] in combination with the bucket tool erases the complete area of the color where you click
        * fill bucket tool
            * in combination with pencil tool
                - [ ] fills a complete area with the colour displayed in the colour field
            * in combination with erase tool
                - [ ] erases the complete area that is filled by the colour of where you click
        * colour field
            - [ ] displays the currently chosen colour to draw and fill
            - [ ] on click opens the set of colours available within the chosen label set where a new colour can be selected upon click
        * ruler tool
            - [ ] measures the distance between start and end of your defined path
                - [ ] points of mouse click appear and stay visible until you hit return key (this functionality is currently broken!) (you can click as many points as you wish to define the path you are interested in)
                - [ ] on return key, BrainBox will print the distance into the chat field (the ruler tool seems to be currently broken!!!)
        * adjust tool
            - [ ] slide opacity of overlaid annotation from 0 to 100%
            - [ ] increase or decrease brightness of the underlying MRI data
            - [ ] increase or decrease the contrast of the underlying MRI data
        * eyedropper tool
            - [ ] updates the colour field in the tool panel
            - [ ] displays/updates the region name in the upper left corner of the viewer
        * undo tool
            - [ ] undoes the user's actions in reverse chronological order and currently has the bug that it even undoes actions in slices you are currently not seeing! and there is currently no redo...
        * save button
            - [ ] saves the annotation of the data set into the data base
            - [ ] displays a message that user needs to login in case they are not (CHECK!)
            - [ ] display a message `Atlas saved Wed Oct 18 2017 12:49:12 GMT+0200 (CEST)`

        
            
<!-- Either or. Please replace `__` with appropriate data: -->
- [ ] I implemented tests for these changes OR
- [ ] These changes do not require tests because _____

<!-- Also, please make sure that "Allow edits from maintainers" checkbox is checked, so that we can help you if you get stuck somewhere along the way.-->

<!-- Pull requests that do not address these steps are welcome, but they will require additional verification as part of the review process. -->

<!-- Again, many many thanks for your work! \ö/ -->

