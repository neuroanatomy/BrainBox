
[![CircleCI](https://circleci.com/gh/neuroanatomy/BrainBox/tree/master.svg?style=shield)](https://circleci.com/gh/neuroanatomy/BrainBox/tree/master) [![Join the chat at https://gitter.im/OpenNeuroLab-Brainbox/Lobby](https://badges.gitter.im/Join%20Chat.svg)](https://gitter.im/OpenNeuroLab-Brainbox/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

# BrainBox - A platform for real-time collaboration in neuroimaging

[![Join the chat at https://gitter.im/OpenNeuroLab-Brainbox/Lobby](https://badges.gitter.im/OpenNeuroLab-Brainbox/Lobby.svg)](https://gitter.im/OpenNeuroLab-Brainbox/Lobby?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)

BrainBox is a Web application for the collaborative curation of neuroimaging data
 available online. You can share, visualise and annotate MRI brain
 data in real-time, collaboratively. BrainBox will provide the means to create a
 layer of collaborative annotation over all the available MRI data without
 having to rely on a centralised data repository or the necessity of
 having to install software. This manual annotation step is time-consuming but very
 important: on its correctness depends that the results of any analysis downstream will
 be sound and accurate.
 **Join us! Your contribution is invaluable!**

You can try BrainBox at http://brainbox.pasteur.fr. Log in with your github
account and enter the URL to an MRI file you want to visualise, annotate
and edit. You can also click one of the examples.

![](https://user-images.githubusercontent.com/6297454/32104270-96db0afa-bb1b-11e7-8911-786d420c308a.png)


#### Motivation  

We want to make it easy for anyone to participate in open science by launching or participating in collaborative projects using BrainBox. Automatic image-analysis algorithms still very often fail in tasks which are simple for humans. But the explosion in the number of data sets available prevents individual labs from engaging into time-consuming manual editing. This results in a large proportion of shared data not being analysed, wasting time and funding.
BrainBox makes it possible to work collaboratively, using real-time interaction on the Web. Like Wikipedia or Google docs, it allows creating distributed research teams to collaborate real-time in the segmentation and annotation of neuroimaging data. No data needs to be downloaded, no software to be installed. All you need is a Web browser.

Our aim is to make BrainBox into a reliable tool for open, reproducible, collaborative science.


#### Collaboration  

We will be happy to work with anyone who would love to join our effort.
While you can see in real-time what your collaborators are writing or drawing on a given data set, you can also chat with them, and ask for help or approval of your work. We want to open this scientific process to everyone with any background including citizen scientists and researchers. Join us!
**Join our segmentation sprint!** In our [GitHub issue #42](https://github.com/neuroanatomy/BrainBox/issues/177) you find detailed information on how to participate and get credit for your work. Currently, we are trying to complete the dolphin brain! Join our team of [BrainMappers](https://github.com/neuroanatomy/BrainBox/blob/master/BrainMappers.md)

And please also feel free to join our efforts on GitHub! Everybody very welcome!


#### Curious?  

More information about BrainBox can be found in our 3 min video on the OpenNeuroLab’s YouTube channel:
[“Open Neuroimaging Laboratory”](https://m.youtube.com/watch?v=kwsLoVKnw24)
And in several smaller specific videos:
[“Collaborative editing of brain masks in BrainBox”](https://m.youtube.com/watch?v=bFHXS-lya5M)
[“Collaborative creation of brain masks in BrainBox”](https://m.youtube.com/watch?v=mN0vGpy5kFg)

<!--
<a href="http://www.youtube.com/watch?feature=player_embedded&v=kwsLoVKnw24
" target="_blank"><img src="http://img.youtube.com/vi/kwsLoVKnw24/0.jpg" 
alt="IMAGE ALT TEXT HERE" width="640" height="480" border="10" /></a>
-->

#### Join us!  

Join our project on github any time
You can also e-mail us to get in touch at openneurobrainbox at gmail dot com!
Or launch your own collaborative project on [BrainBox](https://brainbox.pasteur.fr/project/new)


**We are looking forward to meeting you!**



# Developer instructions

If you want to work on BrainBox's code, you'll need a local installation:


## Non docker developer install instructions

1. install and start `mongo` database
2. clone the repo and `cd` to the brainbox directory
4. [create a new OAuth application](https://github.com/settings/applications/new) for your local brainbox url (http://localhost:3000 by default)
5. paste the keys into the github-keys.json.example file, and drop the .example
6. drop the `.example` from `controller/atlasmakerServer/blacklist.json.example`
7. drop the `.example` from `controller/atlasmakerServer/whitelist.json.example`
8. drop the `.example` from `blacklist.json.example`
9. drop the `.example` from `whitelist.json.example`
10. `npm install`
11. `npm run build`
12. `npm start`
13. To check that your code style is like the one we use,  enter `npm run lint`, or you can type `eslint` before committing, to do that install `eslint` globally using `npm i -g eslint` (our code style rules are in the file `.eslintrc`).


## Using Docker to install and run BrainBox
These installation instructions may need to be updated.  

1. `git clone` this repository or download it
2. `mv BrainBox brainbox` to rename the directory
3. `cd` to brainbox
4. [create a new OAuth application](https://github.com/settings/applications/new) for your local brainbox url (http://localhost:3000 by default)
5. paste the keys into the github-keys.json.example file, change the `callbackURL` to `"http://localhost:3000/auth/github/callback"` and drop the .example
6. drop the `.example` from `controller/atlasmakerServer/blacklist.json.example`
7. drop the `.example` from `controller/atlasmakerServer/whitelist.json.example`
7. make sure Docker is installed
8. `docker-compose up`
9. Then open `http://localhost:3000` in your browser.


## Tests

For Docker users first start the containers with `docker-compose up -d`, then run `npm test`.

For non-Docker users you will need to ensure puppeteer can run correctly on your local system (please refer to the [documentation](https://github.com/GoogleChrome/puppeteer) for information). Then run the command `npm mocha-test`.

Depending on your local developing settings, if you develop using secure web sockets, you may need to indicate Node the location of your Certification Authority using `export NODE_EXTRA_CA_CERTS="/path/to/rootCA.pem"`