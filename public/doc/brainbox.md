#BrainBox

##Table of Contents

1. Introduction
    * Visualisation
    	* Stereotaxic viewer
			* Supported data formats 
    	* 3D render
	* Segmentation and annotations
		* Volume segmentation
			* Adding a new label set
		* Text annotations and tags
		* Length measurements
		* Auto-save
	* Collaboration
		* Projects
2. Interface
	* Home page
	* MRI page
	* Project page
	* User page
	* BrainBox API
		* GET mri
		* GET mri/json
		* GET mri/upload
		* POST mri/upload
		* GET user
		* GET user/json
		* GET project
		* GET project/json
3. Tutorials
	* Examples of uses of BrainBox
	* Visualise an MRI
		* Log in
		* Enter the URL of an MRI
		* Upload a brain to internet
			* Your own website
			* Dropbox
			* FigShare
			* Zenodo
			* GitHub
	* Collaboratively segment an MRI
		* Follow the steps to Visualise an MRI
		* Share the link with collaborators
		* Use the chat
		* Create, Duplicate and Delete atlases
	* Create a project
		* Upload data to internet
		* Create a project
			* Add files
			* Add collaborators
			* Configure permissions
			* Configure text annotations
	* A quality assessment project
		* Upload data to internet
		* Create a project
			* Add files
			* Add collaborators
			* Configure permissions
			* Configure text annotations
		* Upload precomputed atlases to BrainBox
		* Export the results
	* A collaborative segmentation project
		* Upload data to internet
		* Create a project
			* Add files
			* Add collaborators
			* Configure permissions
			* Configure volume segmentations
				* Atlas name
				* Atlas label set
		* Upload precomputed atlases to BrainBox
		* Download the results for offline analysis
4. BrainBox code development
	* Local setup
	* Technologies
	* Code organisation
5. Frequently asked questions
	* Auto-save

##1. Introduction

BrainBox is a web platform to share, visualise and annotate MRI brain data collaboratively. BrainBox will provide the means to create a layer of collaborative annotation over all the available MRI data without having to rely on a centralised data repository or the necessity of having to install software.

http://brainbox.pasteur.fr
login with a github account
click on your username you will see your user information 

on the main page you can
enter a URL to a new MRI file
or
click one of the examples or recently visited links
(you can try http://files.figshare.com/2284784/MRI_n4.nii.gz)


###Visualisation
BrainBox is an online, real-time, 3D stereotaxic viewer to visualize MRI data & multiple annotations. You can navigate in real time between slices within one brain or between individual brains inside a project with your arrow keys.
You can change the orientation of your slices, adjust brightness & contrast of your data, view different annotations overlaid with your MRI data and adjust their opacity to your needs.
view and annotate your data in fullscreen mode and view a 3D rendering of your data.

###Annotation
With BrainBox you can easily modify pre-computed segmentations or create new annotations. You can
edit available annotations by paint & fill, (try "precise cursor" on iPad!), or erase & fill.
You will love the undo button :D! You can also 
upload annotation files & view them overlaid with your MRI data and adjust their opacity for optimally working, or create a new annotation layer or delete one, respectively.
While the MRIs stay stored on the web, your changes & annotations will be saved to the BrainBox database. To save changes you made in the annotation table, just click 
save, while changes in the atlas-files will be automatically saved every ten minutes and current changes will be stored in the RAM in the meantime. To get back to your annotation once you left the page, you will either find a link on the home page – if you were the person who added the MRI – or you will find it among the atlases on your user page.You can also download your annotations.

###Collaboration
BrainBox provides a toggleable chat window where you can talk to your collaborators or send them a 
direct link to your current working slice in your selected view. As an owner of a project, you can also 
add or collaborators and distribute rights to view or edit MRIs & to add or remove collaborators 

###Projects
BrainBox is a web application for real-time collaborative curation, quality control & annotation of huge MRI data sets. Once you enter a link to an online available MRI file, BrainBox will index it and keep the link. This way, a catalogue of online MRI data will be generated and make dormant data visible and accessible to a broader public. The MRI file will be visible --here -- ??(global unsorted catalogue?), as well as on the user page of the user who first loaded the MRI in. Further, you can create projects in BrainBox and link MRIs & annotations inside of a project. You can build & share your own project collections either with a restricted set of collaborators or with the world. While some sensitive MRI data may not be openly shared, all annotations shall eventually be freely available.


*** short illustration and user guide below *** & also check out our video on YouTube! ***

###Measurement
BrainBox allows you to take length measurements, so you can get information about the extension of your region of interest or distances between regions with two clicks. For the time being the values are printed into the chat from where you can copy them.

###Supported data formats
Supported data formats: For the moment, BrainBox supports nifti file format. Freesurfer segmentations can be loaded and annotated when having been converted to nifti.

(?? include ?) Data platforms:  BrainBox already includes links to data from zenodo, figshare, and a few from dropbox



##2. Interface

###Home Page
 * Login
 * MRI URL field
 * List of brains to try
 * Recently visited brains
 * Add a project
 * Project settings
 * Search
 * Documentation

###MRI Page
 * Viewer
 	* Navigate through slices: Slider, Previous and next slice
 	* Change the view: Sagittal, Coronal and Axial
 	* Tools:
 		* Paint
 		* Erase
 		* Fill
 		* Measure
 		* Image adjustments
 		* Color/region
 		* Full screen
 		* Share link
 		* Render in 3D
 		* Upload
 		* Download
 		* Chat
 * Annotations
 	* MRI information
 		* Name
	 	* Source
	 	* Date of inclusion
	 	* Owner
 	* Atlases
 		* Name
 		* Project
 		* Label set
 		* Owner
 		* Date of creation
 		* Date of latest modification
 		* Add and delete atlases
 		
###2.2	MRI page

Once you enter the link to an  MRI in the home page, or if you click on a shared BrainBox link, you’ll be taken to the MRI’s page. This page contains a stereotaxic viewer with segmentation tools, as well as general information about the MRI and the annotations and segmentations available.

Stereotaxic viewer and tools

On the left side of the MRI page the stereotaxic viewer displays a slice of your MRI data. The number of the slice is shown in the upper-left corner of the viewer along with information about the total segmentation volume and the total length that you have segmented.

Under the stereotaxic viewer there is a set of tools to navigate and segment the MRI volume. You can change the stereotaxic plane using the **[Sag]**, **[Cor]** and **[Axi]** buttons. The slice can be changed by clicking on the **[-]** and **[+]** buttons, or moving the slider **[--o--]**. You can also change the slice by pressing the left and right arrows in your keyboard. You can click on the **[Adjustments]** icon to change the brightness and contrast of the image, as well as the transparency level of the segmentations.

The **[Full screen]** button lets you use the complete computer screen to display the MRI image (you can go back by clicking it again). By clicking on the **[Link]** button you can get a URL that you can send to your collaborators. The link will take them to the exact stereotaxic plane and slice where you are. Once your collaborators are also connected to BrainBox, you can chat with them using the integrated chat. You can toggle visibility of the chat window by clicking on the **[Chat]** button.

To draw a segmentation on an MRI use the **[Paint]** and **[Erase]** tools. The size of the pen can be adjusted from 1x1 pixels to 15x15 pixels using the **[Pen size]** buttons. By selecting **[Fill]** you will be able to paint or erase large regions with a single click. The painting actions can be undone using the **[Undo]** button.

The color of the pen represents the region that you are segmenting. It can be selected by clicking on the **[Color]** button. By default, the “Foreground” label set is used, where the regions painted in red are foreground and those do not painted are the background. There are several label sets in BrainBox (available in the atlas table; more on that later).
You can view a 3D representation of your segmentation by clicking the **[3D render]** button. This will open a new window and compute a surface model that you can interactively zoom, rotate and translate.

If you have a segmentation that you have computed offline (for example, using Freesurfer or FSL), you can upload it using the **[Upload]** button. You can also download the current segmentation for offline analyses by clicking on the **[Download]** button.

Finally, you can also measure the length of regions in the image by using the **[Measure]** tool. Click on one or more points and double click to finish: the length of the line or polygon will appear in the chat window.

You can use BrainBox in a desktop computer or in a tablet. In a desktop computer the best results are obtained using a graphic tablet such as the Wacom Cintiq. Tablets also work well with the use of a stylus. If you do not have a stylus you can use BrainBox’s **[Precise cursor]**. If you draw with your finger in tablet, your finger will hide the region where you are drawing making the segmentation difficult. The **[Precise cursor]** dissociates the place where you put your finger from the place where you draw. The **[Precise cursor]** has 3 states. When the finger disc is green you draw. If you touch the cursor and hold, it will turn orange: You can now move the position of the disc without changing the position of the drawing cursor. Finally, if you touch the finger disc only once, it will turn yellow: You can now move without drawing.


**Table 1.** Summary of BrainBox’s tools

| Icon|Function|
|-----|--------|
|**[-]**|Move to the previous slice|
|**[--o--]**|Change slice|
|**[+]**|Move to the next slice|
|**[Sag]**|Change to Sagittal view|
|**[Cor]**|Change to Coronal Plane|
|**[Axi]**|Change to Axial plane|
|**[Pen]**|Select the paint tool|
|**[Erase]**|Select the erase tool|
|**[Measure]**|Select the measure tool|
|**[Adjust]**|Select the image adjustment tool|
|**[Full screen]**|Toggle full screen|
|**[3D render]**|Open the 3D renderer|
|**[Chat]**|Toggle the visibility of the chat window|
|**[Link]**|Get a shareble link the the current MRI, view and slice|
|**[Upload]**|Upload a segmentation from disc|
|**[Download]**|Download the current segmentation to disc|
|**[Precise cursor]**|Use the precise cursor|
|**[Color]**|Change the pen color|
|**[Fill]**|Use click to fill or erase a region|
|**[Undo]**|Undo the last action|
|**[Pen size]**|Change the size of the painting pen|


General information

On the right side of the MRI page you can find general information about the MRI, such as its Name if it has been given one (or Empty if it has not). You can also see the URL to the MRI Data Source, as well as the Date when it was first added to BrainBox.

After this information, the Annotations table shows all the atlases that have been added to this MRI, and the project to which this atlases belong if any. Each row shows the Name of the atlas (or Empty if it has not), the name of the Project to which this atlas belongs (or Empty), the Label set used for this atlas (i.e., the set of regions used for the segmentation and their colors), the Owner of the atlas (most often, the person that created it), the Date of Creation, date of Last Modification, and finally the Access rights that you have to this atlas. If you are the owner of the atlas, you can change here the access that you provide.

There are currently 4 label sets available in BrainBox, but more can be added. The default label set is Foreground, it has only one color/region, and it is ment to be a general purpose labl set for the segmentation of a region or structure. The Name of the atlas should allow to better understand what is actually being segmented. The Corpus Callosum label set has 5 colors and can be used to segment the corpus callosum in 5 regions. The Cerebrum label set has 12 colors for a the some frequently used regions of the cerebrum. Finally, the Freesurfer label set has 48 colors corresponding the the 48 regions automatically segmented by Freesurfer in the aseg.mgz volume.

It is possible to add more label sets to BrainBox through GitHub. A label set is defined by a json file. In the GitHub repository, the label set files are stored in the directory /public/labels/. You can write a new json file based on the examples in that directory and submit a pull request. Once the pull request is accepted, the new label set will be available to all users of BrainBox.
You can add, duplicate or remove a label set by using the **[+]**, **[Copy]**, and **[-]** buttons at the bottom-right part of the Annotations table. The **[+]** button will add a new, empty, atlas. You can then set the Name, Project, Label Set, and Access rights to your atlas. You can also copy an existing atlas using the **[Copy]** button. Copying an existing atlas will allow you, for example, to edit a copy of an atlas for which you did not have editing rights. Finally, you can remove an atlas by clicking on the **[-]** button.


###Project Page
	* Tools
		* Segmentation tools
		* List of MRIs
		* List of atlases
	* Viewer

###User Page
	* General information
	* MRI tab
	* Atlases tab
	* Projects tab
	* Settings tab
		* Change password

##3. Tutorials

(?? include ?) Data platforms:  BrainBox already includes links to data from zenodo, figshare, and a few from dropbox

BrainBox functionalities/ tools / Workflow


YOU CAN DO ALL THIS

(see little description on overview/intro page, they have links to the following more detailed information:)







link: Conversion: with mri_convert for instance
mri_convert /pathToYourFreesurferFolder/subjects/subjectID/mri/orig/001.mgz /pathToYourNiftiData/MRI.nii.gz 
mri_convert /pathToYourFreesurferFolder/subjects/subjectID/mri/aseg.mgz /pathToYourNiftiData/subjectID/aseg.nii.gz



upload & download
	upload and download buttons to upload a local segmentation file or download one 
	from brainbox (this can be also done programmatically using curl)

link: we can UPLOAD BRAIN EXTRACTIONS PROGRAMMATICALLY USING CURL
	for example, this:
	curl -F "action=upload" -F "user=yourGithubUserName" -F "password=yourPassword" -F "url=http://braincatalogue.dev/data/Sloth_bear/MRI-n4.nii.gz" -F "atlas=@/Library/			WebServer/Documents/braincatalogue/data/Sloth_bear/Atlas.nii.gz" http://brainbox.dev/php/brainbox.php

PROJECT PAGES

toolbar divided in 3 parts: 
drawing tools, 
list of files in the project, 
list of atlases associated with the specific file
chat can collapse
upload and download buttons to upload a local segmentation file or download one from brainbox (this can be also done programmatically using curl)
projects can be found on the user page in the project tab

set up YOUR awesome project


LOOK AT META DATA
you can get metadata associated with an MRI file:	http://brainbox.pasteur.fr/api/mri?url=http://yourWeb.com/MRI.nii.gz

TO KEEP IN MIND

VALIDATION?
	tutorial intro with Mindboggle 101 brains, 
do one brain (maybe five slices?) then get authorized to go segment : )
	OR
every ten / 15 slices a neuroscienctist would do?

KEYBOARD SHORTCUTS
	could be added – but
	keyboard commands do not work on tablets...

BrainBox Code || Code
		for coders & interested people (like how some things work, which libs..)

BrainBox local setup || Setup locally
		for local setup

BrainBox media/ or about or something like this || Contact || Media
		(You can find us here, links to our article, open science prize?)
