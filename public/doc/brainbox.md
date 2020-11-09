# BrainBox Doc

<div id='wrapperToc' data-markdown="1">
<div id='toc' data-markdown="1">

## Table of Contents

1. [Introduction](#intro)
    * [Visualisation](#visu)
        * Stereotaxic viewer
            * Supported data formats
        * 3D render
    * [Segmentation and annotations](#annot)
        * Volume segmentation
            * Adding a new label set
        * Text annotations and tags
        * Length measurements
        * Auto-save
    * [Collaboration](#collab)
        * Projects
2. [Interface](#interf)
    * [Home page](#homep)
    * [MRI page](#mrip)
    * [Project page](#projp)
    * [Project settings page](#projsetp)
    * [User page](#userp)
    * [BrainBox API](#api)
3. [Tutorials](#tuto)
    * [Examples of uses of BrainBox](#examples)
    * [Visualise an MRI](#visMRI)
        * Log in
        * Enter the URL of an MRI
        * Upload a brain to internet
            * Your own website
            * Dropbox
            * FigShare
            * Zenodo
            * GitHub
    * [Collaboratively segment an MRI](#collabSeg)
        * Follow the steps to Visualise an MRI
        * Share the link with collaborators
        * Use the chat
        * Create, Duplicate and Delete atlases
    * [Create a project](#createProj)
        * Upload data to internet
        * Create a project
            * Add files
            * Add collaborators
            * Configure permissions
            * Configure text annotations
    * [A quality assessment project](#QCproj)
        * Upload precomputed atlases to BrainBox
        * Export the results
4. [BrainBox code development](#codeDev)
    * [Local setup](#local)
    * [Technologies](#technol)
    * [Code organisation](#codeOrga)
5. [Frequently asked questions](#FAQ)
    * [Auto-save](#autoSave)
6. [How to cite BrainBox](#cite)
</div>
</div>

<a class="link" name="intro"></a>
<p>
<br>
<br>
</p>

## 1. Introduction

BrainBox is a web platform to share, visualise and annotate MRI brain data collaboratively. BrainBox will provide the means to create a layer of collaborative annotation over all the available MRI data without having to rely on a centralised data repository or the necessity of having to install software. Check out our [3-min video about BrainBox](https://www.youtube.com/watch?v=kwsLoVKnw24&t=6s) for a quick overview and vision of the project.

To explore BrainBox, go to [https://brainbox.pasteur.fr](https://brainbox.pasteur.fr),
login with a github account,
click on your username and you will see your user information.

On the main page you can enter a URL to a new MRI file or  
click one of the examples or recently visited links
(you can try [http://files.figshare.com/2284784/MRI_n4.nii.gz](http://files.figshare.com/2284784/MRI_n4.nii.gz))


<a class="link" name="visu"></a>  
<p>
<br>
<br>
<br>
</p>

### Visualisation
BrainBox is an online, real-time, 3D stereotaxic viewer to visualise MRI data & multiple annotations. You can navigate in real time between slices within one brain or between individual brains inside a project using your arrow keys.  
You can change the orientation of your slices, adjust brightness & contrast of your data, view different annotations overlaid with your MRI data and adjust their opacity to your needs.  
You can view and annotate your data in fullscreen mode and generate a 3D rendering of your data on the fly in a separate tab.

<a class="link" name="annot"></a>
<p>
<br>
<br>
<br>
</p>

### Segmentation & annotations
With BrainBox you can easily modify pre-computed segmentations or create new annotations. You can edit available annotations by paint & fill, (try 'precise cursor' on iPad!), or erase & fill. You can check out our videos on how to collaboratively [create a mask](https://www.youtube.com/watch?v=mN0vGpy5kFg&t=13s) and how to collaboratively [edit masks](https://www.youtube.com/watch?v=bFHXS-lya5M&t=17s) with BrainBox.  
You will love the undo button :D! You can also upload annotation files & view them overlaid with your MRI data and adjust their opacity for optimally working, or create a new annotation layer or delete one, respectively.  
While the MRIs stay stored on the web, your changes & annotations will be saved to the BrainBox database. To save changes you made in the annotation table, just click the tab key. Changes in the atlas-files will be automatically saved every ten minutes or when you leave the page, and current changes will be stored in the RAM in the meantime. We encourage you, however, to click the save button to feel sure your segmentation has been saved to our server. To get back to your annotation once you left the page, there are two options: you will either find a link on the home page – if you were the person who added the MRI – or you will find it among the atlases on your user page.  
You can also download your annotations. A click on the download button will download the annotation file you are currently viewing. Downloading all annotation files from one project can also be done programmatically using [curl](#DLcurl). You can also use BrainBox API to download annotations using python scripts. Notebooks to do so will be added here soon.  

You can easily add new annotation layers to an MRI file inside a project. These can be new volume annotations, or text annotations such as comments. To add a new annotation layer, go to the settings page (cog icon upper right), add an annotation, set its type to either text or volume, and chose a label set for volume annotation.

<a class="link" name="collab"></a>
<p>
<br>
<br>
<br>
</p>

### Collaboration
BrainBox provides a toggleable chat window where you can talk to your collaborators or send them a direct link to your current working slice in your selected view. As an owner of a project, you can also add or remove collaborators and distribute rights to view, edit, add or delete annotations, MRIs & collaborators.

### Projects
BrainBox is a web application for real-time collaborative curation, quality control & annotation of huge MRI data sets. Once you enter a link to an online available MRI file, BrainBox will index it and keep the link. This way, a catalogue of online MRI data will be generated and make dormant data visible and accessible to a broader public. The MRI file will be visible in the MRI list on the user page of the user who first loaded the MRI in. Further, you can create projects in BrainBox and link MRIs & annotations inside of a project. [This video](https://www.youtube.com/watch?v=nu83U3QY4pA&t=10s) shows you, how to create a BrainBox project using MetaSearch. You can build & share your own project collections either with a restricted set of collaborators or with the world. While some sensitive MRI data may not be openly shared, all annotations shall eventually be freely available.

This video illustrates the [collaborative creation of masks](https://www.youtube.com/watch?v=mN0vGpy5kFg&t=13s) in BrainBox, and this one shows [collaborative mask editing](https://www.youtube.com/watch?v=bFHXS-lya5M&t=17s) on BrainBox.
**An illustration and user guide for project creation will soon be available on Youtube as well.**

### Measurement
BrainBox allows you to take length measurements, so you can get information about the extension of your region of interest or distances between regions with two clicks. For the time being the values are printed into the chat from where you can copy them.

### Supported data formats
Supported data formats: Currently, BrainBox supports nifti file format. Freesurfer segmentations can be loaded and annotated when having been converted to nifti.

### Data platforms
BrainBox already includes links to data from Zenodo, figshare, Dropbox, Google Drive, GitHub, AmazonS3.


<a class="link" name="interf"></a>
<p>
<br>
<br>
</p>

## 2. Interface
<a class="link" name="homep"></a>
<p>
<br>
<br>
<br>
</p>

### 2.1 Home Page

BrainBox wants to facilitate data discovery. On the home page, you will find the option to either enter a link to a new MRI file you'd like to view, or to choose from a list of previously visited links. Each will open an MRI page with the viewer and annotation tools. When visiting BrainBox for the first time, this list will hold example links to proposed brain data and, once you start working, will update to a list of links to your recently visited brains. In the URL field, you can point BrainBox to any MRI data available online, as for instance on Zenodo, FigShare, Dropbox, GitHub or your own website.

In the top menu, the ![](/img/plus.svg =13x13) icon is used to add a new project. Projects are collections of MRIs and annotations, and are discussed more deeply in the project page section below. The ![](/img/settings.svg =13x13) icon allows you to configure your existing projects, for example, to restrict access to a list of collaborators. In addition to that, BrainBox allows you to search for MRIs via their filename using the ![](/img/search.svg =13x13) icon, for a user or for a project.

In case you find a bug or would like to suggest a new feature we could add, open a [![](/img/bug.svg =13x13)Github issue](https://github.com/neuroanatomy/BrainBox/issues/new). And if you'd like to join our team of developers, head over to our [![](/img/github.svg =15x15)Gihub repo](https://github.com/neuroanatomy/BrainBox).

To be able to use full BrainBox functionalities, you need to login. BrainBox asks you to login with your GitHub account so that annotations can benefit from GitHub’s versioning system and be saved to your user account as well as easily be shared with the BrainBox GitHub repository. Once logged in, a click on your username will take you to your user page.

You can always come back to the home page by clicking on the BrainBox logo ![](/img/brainbox-logo-small_noFont.svg =20x20).

<a class="link" name="mrip"></a>
<p>
<br>
<br>
<br>
</p>

### 2.2 MRI page

#### General information

Once you enter the link to an  MRI in the home page, or if you click on a shared BrainBox link, you’ll be taken to the MRI’s page. This page contains a stereotaxic viewer with segmentation tools, as well as general information about the MRI and all text and volume annotations associated with this MRI.  

On the left side of the MRI page you can find a first table with general information about the MRI, such as its Name if it has been given one (or Empty if it has none). You can also see the URL to the MRI Data Source, as well as the Date when it was first added to BrainBox.

Below, you see the Annotations table which shows all the atlases that have been added to this MRI, and the project to which these atlases belong if any. Each row shows the Name of the atlas (or Empty if it has none), the name of the Project to which this atlas belongs (or Empty), the Label set used for this atlas (i.e., the set of regions used for the segmentation and their colors), the Owner of the atlas (the person that created it), the Date of Creation, date of Last Modification, and finally the Access rights that you have to this atlas. If you are the owner of the atlas, you can change here the access that you provide to anyone, and to specific collaborators.

There are currently 12 label sets available in BrainBox, but more can be added. The default label set is Foreground, it has only one color, and it is ment to be a general purpose labl set for the segmentation of a region or structure. The Name of the atlas should allow to better understand what is actually being segmented. The Corpus Callosum label set has 5 colors and can be used to segment the corpus callosum in 5 regions. The Cerebrum label set has 12 colors for some frequently used regions of the cerebrum. Finally, the Freesurfer label set has 48 colors corresponding the the 48 regions automatically segmented by Freesurfer in the aseg.mgz volume.

It is possible to add more label sets to BrainBox through GitHub. A label set is defined by a json file. In the GitHub repository, the label set files are stored in the directory `/public/labels/`. You can write a new json file based on the examples in that directory and submit a pull request. Once the pull request is accepted, the new label set will be available to all users of BrainBox.
You can add, duplicate or remove a label set by using the **[+]**, **[Copy]**, and **[-]** buttons at the bottom-right part of the Annotations table. The **[+]** button will add a new, empty, atlas. You can then set the Name, Project, Label Set, and Access rights to your atlas. You can also copy an existing atlas using the **[Copy]** button. Copying an existing atlas will allow you, for example, to edit a copy of an atlas for which you did not have editing rights. Finally, you can remove an atlas by clicking on the **[-]** button.

<p><br /></p>

#### Stereotaxic viewer and tools

On the right side of the MRI page the stereotaxic viewer displays a slice of your MRI data. The number of the slice is shown in the upper-left corner of the viewer along with information about the total segmentation volume and the total length that you have segmented.

Below the stereotaxic viewer there is a set of tools to navigate and segment the MRI volume. You can change the stereotaxic plane using the **[Sag]**, **[Cor]** and **[Axi]** buttons. The slice can be changed by clicking on the ![](/img/minus-small.svg =13x13) and ![](/img/plus-small.svg =13x13) buttons, or moving the slider ![](img/slider.png =18x15). You can also change the slice by pressing the left and right arrows in your keyboard. The BrainBox viewer allows you to change the brightness and contrast of the image, and to adapt the transparency level of the overlay segmentations with the ![](/doc/atlasmakersvg/adjust.svg =13x13) adjust tool.

The ![](/doc/atlasmakersvg/fullscreen.svg =13x13) fullscreen button lets you use the complete computer screen to display the MRI image (you can go back by clicking it again). By clicking on the ![](/doc/atlasmakersvg/link.svg =13x13) link button you can get a URL that you can send to your collaborators. The link will take them to the exact stereotaxic plane and slice where you are. Once your collaborators are also connected to BrainBox, you can chat with them using the integrated chat. You can toggle visibility of the chat window by clicking on the ![](/doc/atlasmakersvg/chat.svg =13x13) button.

To draw a segmentation on an MRI use the ![](/doc/atlasmakersvg/paint.svg =13x13) paint and ![](/doc/atlasmakersvg/erase.svg =13x13) erase tools. The size of the pen can be adjusted from 1x1 pixels to 15x15 pixels using the number panel from 1 to 15. By selecting ![](/doc/atlasmakersvg/fill.svg =13x13) fill you will be able to paint or erase large regions with a single click. The painting actions can be undone using the ![](/doc/atlasmakersvg/undo.svg =15x15) undo button.

The color of the pen represents the region that you are segmenting. It can be selected by clicking on the ![](/doc/img/color.png =18x11) color button. By default, the “Foreground” label set is used, where the regions painted in red are foreground and those not painted are the background. There are several label sets in BrainBox (available in the atlas table; more on that later).  
You can view a 3D representation of your segmentation by clicking the ![](/doc/atlasmakersvg/3drender.svg =13x13) 3D render button. This will open a new window and compute a surface model that you can interactively zoom, rotate and translate.

If you have a segmentation that you have computed offline (for example, using Freesurfer or FSL), you can upload it using the ![](/doc/atlasmakersvg/upload.svg =13x13) upload button. You can also ![](/doc/atlasmakersvg/download.svg =13x13) download the current segmentation for offline analyses.

Finally, you can also measure the length of regions in the image by using the ![](/doc/atlasmakersvg/ruler.svg =13x13)ruler. Click on one or more points and double click to finish: the length of the line or polygon will appear in the chat window.

You can use BrainBox in a desktop computer or in a tablet. In a desktop computer the best results are obtained using a graphic tablet such as the Wacom Cintiq. Tablets also work well with the use of a stylus. If you do not have a stylus you can use BrainBox’s ![](/doc/atlasmakersvg/preciseCursor.svg =13x13) Precise cursor. If you draw with your finger in tablet, your finger will hide the region where you are drawing making the segmentation difficult. The Precise cursor dissociates the place where you put your finger from the place where you draw. The Precise cursor has 3 states. When the finger disc is green you draw. If you touch the cursor and hold, it will turn orange: You can now move the position of the disc without changing the position of the drawing cursor. Finally, if you touch the finger disc only once, it will turn yellow: You can now move without drawing.


<p><br /></p>

#### **Table 1.** Summary of BrainBox’s tools

|Icon|Function|
|:-----|:--------|
|![](/img/minus-small.svg =13x13)|Move to the previous slice|
|![](img/slider.png =15x13)|Change slice|
|![](/img/plus-small.svg =13x13)|Move to the next slice|
|**Sag**|Change to Sagittal view|
|**Cor**|Change to Coronal Plane|
|**Axi**|Change to Axial plane|
|![](/doc/atlasmakersvg/paint.svg =13x13)|Select paint tool|
|![](/doc/atlasmakersvg/erase.svg =13x13)|Select erase tool|
|![](/doc/atlasmakersvg/ruler.svg =13x13)|Select measure tool|
|![](/doc/atlasmakersvg/adjust.svg =13x13)|Select image adjustment tool|
|![](/doc/atlasmakersvg/fullscreen.svg =13x13)|Toggle full screen|
|![](/doc/atlasmakersvg/3Drender.svg =13x13)|Open the 3D renderer|
|![](/doc/atlasmakersvg/chat.svg =13x13)|Toggle visibility of chat window|
|![](/doc/atlasmakersvg/link.svg =13x13)|Get shareble link to current MRI, view & slice|
|![](/doc/atlasmakersvg/upload.svg =13x13)|Upload a segmentation from disc|
|![](/doc/atlasmakersvg/download.svg =13x13)|Download current segmentation to disc|
|![](/doc/atlasmakersvg/preciseCursor.svg =13x13)|Use the precise cursor|
|![](img/color.png =18x11)|Change the pen color|
|![](/doc/atlasmakersvg/fill.svg =13x13)|Use click to fill or erase a region|
|![](/doc/atlasmakersvg/undo.svg =15x15)|Undo the last action|
|[Pen size]|Change the size of the painting pen|


<a class="link" name="projp"></a>
<p>
<br>
<br>
<br>
</p>

### 2.3 Project Page
    * General information
    * Tools
        * Segmentation tools
        * List of MRIs
        * List of atlases
    * Viewer


<a class="link" name="projsetp"></a>
<p>
<br>
<br>
<br>
</p>

### 2.4 Project Settings Page
        * Upload data to internet
        * Create a project
            * Add files
            * Add collaborators
            * Configure permissions
            * Configure text annotations
        * Upload precomputed atlases to BrainBox
        * Export the results


<a class="link" name="userp"></a>
<p>
<br>
<br>
<br>
</p>

### 2.5 User Page
    * General information
    * MRI tab
    * Atlases tab
    * Projects tab


<a class="link" name="api"></a>
<p>
<br>
<br>
<br>
</p>

### BrainBox API
        * GET mri
        * GET mri/json
        * GET mri/upload
        * POST mri/upload
        * GET user
        * GET user/json
        * GET project
        * GET project/json


<a class="link" name="tuto"></a>
<p>
<br>
<br>
</p>

## 3. Tutorials
We are creating Jupyter Notebooks and Google collabs to provide examples for working with the BrainBox API. [will be added here soon]


<a class="link" name="codeDev"></a>
<p>
<br>
<br>
</p>

## 4. BrainBox code development
You want to join our team of developers? \ö/ Come say hi in an issue on our [Github repo](https://github.com/neuroanatomy/BrainBox). You will find info and instructions for local setup in the Readme.


<a class="link" name="FAQ"></a>
<p>
<br>
<br>
</p>

## 5. Frequently asked questions
#### Does BrainBox auto-save?  
BrainBox saves about every 10 minutes, and when you close the Web page, it saves the latest state. However, we highly encourage everyone to save their work using the save button.


<a class="link" name="cite"></a>
<p>
<br>
<br>
</p>

## 6. How to cite BrainBox
Heuer, K., Ghosh, S., Robinson Sterling, A., & Toro, R. (2016). Open Neuroimaging Laboratory. Research Ideas and Outcomes 2: e9113. [https://doi.org/10.3897/rio.2.e9113](https://doi.org/10.3897/rio.2.e9113).  
🥰 Thank you.
