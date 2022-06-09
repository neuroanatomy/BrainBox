import './style.css';
import * as THREE from './three.js-r109/build/three.module.js';
import { TrackballControls } from './three.js-r109/examples/jsm/controls/TrackballControls.js';
import html from './index.html';
import pako from 'pako';

let camera, renderer, scene, trackball;
const level = 1;
let dot = 0; // dot for "wait" animation


import work from 'webworkify-webpack';
const snw = work(require.resolve('./surfacenets.worker.js'));
snw.addEventListener('message', (event) => {
  const [vertices, faces] = event.data;
  createMesh(vertices, faces);
  const splash = document.querySelector('#splash');
  if (splash) {
    splash.parentNode.removeChild(splash);
  }
  animate();
});

const onWindowResize = function () {
  const W = window.innerWidth;
  const H = window.innerHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
};

// eslint-disable-next-line max-statements
const createMesh = function (vertices, faces) {
  // console.log("creating mesh");
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setClearColor(0x000000);
  const W = window.innerWidth;
  const H = window.innerHeight;
  renderer.setSize(W, H);
  document.body.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(50, W / H, 1, 2000);
  camera.position.z = 200;
  scene = new THREE.Scene();

  trackball = new TrackballControls(camera, renderer.domElement);

  window.addEventListener('resize', onWindowResize, false);

  const geometry = new THREE.BufferGeometry();
  const verts = new Float32Array(vertices.flat());
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geometry.setIndex(faces.flat());
  geometry.center();

  geometry.computeFaceNormals();
  geometry.computeVertexNormals();
  const material = new THREE.MeshNormalMaterial();
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  console.log('mesh done.');
};

const render = function () {
  renderer.render(scene, camera);
  trackball.update();
};

const animate = function () {
  requestAnimationFrame(animate);
  render();
};

// eslint-disable-next-line max-statements
const configureNifti = function (niigz) {
  const inflate = new pako.Inflate();
  try {
    inflate.push(new Uint8Array(niigz), true);
  } catch (ex) {
    // self.postMessage({msg:"ERROR: cannot decompress segmentation data"});
    self.close();
  }
  const data = inflate.result.buffer;
  const dv = new DataView(data);
  const brain = {};
  brain.dim = [];
  brain.dim[0] = dv.getInt16(42, true);
  brain.dim[1] = dv.getInt16(44, true);
  brain.dim[2] = dv.getInt16(46, true);
  brain.datatype = dv.getInt16(72, true);
  brain.pixdim = [];
  brain.pixdim[0] = dv.getFloat32(80, true);
  brain.pixdim[1] = dv.getFloat32(84, true);
  brain.pixdim[2] = dv.getFloat32(88, true);
  const voxOffset = dv.getFloat32(108, true);

  switch (brain.datatype) {
  case 2:
  case 8:
    brain.data = new Uint8Array(data, voxOffset);
    break;
  case 16:
    brain.data = new Int16Array(data, voxOffset);
    break;
  case 32:
    brain.data = new Float32Array(data, voxOffset);
    break;
  }

  console.log('dim', brain.dim[0], brain.dim[1], brain.dim[2]);
  console.log('datatype', brain.datatype);
  console.log('pixdim', brain.pixdim[0], brain.pixdim[1], brain.pixdim[2]);
  console.log('voxOffset', voxOffset);

  return brain;
};

// function loadNifti(path, callback) {
//     var oReq = new XMLHttpRequest();
//     oReq.open("GET", path, true);
//     oReq.addEventListener("progress", function(e) { console.log(parseInt(100*e.loaded/e.total)+"% Loaded") ;}, false);
//     oReq.responseType = "arraybuffer";
//     oReq.onload = function() {
//         configureNifti(this.response, callback);
//     };
//     oReq.send();
// }

function startWaitingAnimation() {
  const dotEl = document.querySelector('#dot');
  if(!dotEl) {
    return;
  }
  setInterval(function() {
    dotEl.style.marginLeft= 50*(1+Math.sin(dot))+'%';
    dot += 0.1;
  }, 33);
}

const startRender3D = function () {
  const pr = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', localStorage.brainbox, true);
    xhr.responseType = 'blob';
    xhr.onload = function () {
      const blob = this.response;
      const reader = new FileReader();
      reader.addEventListener('loadend', function (e) {
        const niigz = e.currentTarget.result;
        const brain = configureNifti(niigz);
        brain.level = level;
        // mesh = me.loadNifti(path, me.computeMesh);

        snw.postMessage([
          brain.dim,
          brain.datatype,
          brain.pixdim,
          brain.level,
          brain.data
        ]);
        resolve();
      });
      reader.readAsArrayBuffer(blob);
    };
    xhr.onerror = function (e) {
      console.log('load from localStorage failed. Try to load from server');
      reject(e);
    };
    xhr.send();
  });

  return pr;
};

const loadHTML = function () {
  document.body.innerHTML = html;
};

const init = function () {
  loadHTML();
  startWaitingAnimation();
  startRender3D();
};

snw.addEventListener('message', (event) => {
  const [vertices, faces] = event.data;
  createMesh(vertices, faces);
  $('#splash').remove();
  animate();
});

init();
