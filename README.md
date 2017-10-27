
# BrainBox - An application from the [Open Neuroimaging Laboratory](http://openneu.ro/)

BrainBox is a web application that lets you annotate and segment 3D brain 
imaging data in real time, collaboratively. You can try it 
at http://brainbox.pasteur.fr.

BrainBox is a web application to share, visualise and annotate MRI brain
 data collaboratively. BrainBox will provide the means to create a 
 layer of collaborative annotation over all the available MRI data without 
 having to rely on a centralised data repository or the necessity of 
 having to install software.

You can try it at http://brainbox.pasteur.fr. Log in with your github 
account and enter the URL to an MRI file you want to visualise, annotate 
and edit. You can also click one of the examples.


# Developer instructions

If you want to work on BrainBox's code, you'll need a local installation:

## Using Docker to install and run BrainBox

1. `git clone` this repository or download it
2. `mv BrainBox brainbox` to rename the directory 
3. `cd` to brainbox
4. get Github developer keys for your local brainbox url 
(http://localhost:3000 by default)
5. paste the keys into the github-keys.json.example file, change the `callbackURL` to `"http://localhost:3000/auth/github/callback"` and drop the .example
6. drop the `.example` from `blacklist.json.example`
7. drop the `.example` from `whitelist.json.example`
7. make sure Docker is installed
8. `docker-compose up`
9. Then open `http://localhost:3000` in your browser.

## Non docker developer install instructions

1. install and start `mongo` database
2. clone the repo and `cd` to the brainbox directory
<<<<<<< HEAD
3. `mkdir public/data`
4. get Github developer keys for your local brainbox url 
(http://localhost:3000 by default)
5. paste the keys into the github-keys.json.example file, and drop the .example
6. `npm install`
7. `npm start`

=======
4. [create a new OAuth application](https://github.com/settings/applications/new) for your local brainbox url (http://localhost:3000 by default)
5. paste the keys into the github-keys.json.example file, and drop the .example
6. drop the `.example` from `blacklist.json.example`
7. drop the `.example` from `whitelist.json.example`
8. `npm install`
9. `npm start`
10. To check that your code style is like the one we use,  enter `npm run lint`, or you can type `eslint` before committing, to do that install `eslint` globally using `npm i -g eslint` (our code style rules are in the file `.eslintrc`).

## Tests

For Docker users first start the containers with `docker-compose up -d`, then run `npm test`.

For non-Docker users you will need to ensure puppeteer can run correctly on your local system (please refer to the [documentation](https://github.com/GoogleChrome/puppeteer) for information). Then run the command `npm mocha-test`.
>>>>>>> OpenNeuroLab/master

