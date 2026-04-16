/* eslint-disable max-lines */
import './style.css';
import * as THREE from 'three';
import { HTMLMesh } from 'three/examples/jsm/interactive/HTMLMesh.js';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import html from './index.html';
import pako from 'pako';

let camera, renderer, scene, trackball;
let brainMesh, htmlMesh;
const level = 1;
let dot = 0; // dot for "wait" animation

import work from 'webworkify-webpack';
const snw = work(require.resolve('./surfacenets.worker.js'));

const updatePanelPosition = () => {
  if (!htmlMesh || !camera) {

    return;
  }
  const vFov = camera.fov * Math.PI / 180;
  const dist = 1;
  const halfH = Math.tan(vFov / 2) * dist;
  const halfW = halfH * camera.aspect;
  htmlMesh.position.set(-halfW + 0.18, halfH - 0.12, -dist);
};

const onWindowResize = () => {
  const W = window.innerWidth;
  const H = window.innerHeight;
  renderer.setSize(W, H);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  updatePanelPosition();
};

const materials = {
  normal: new THREE.MeshNormalMaterial(),
  flat: new THREE.MeshPhongMaterial({ color: 0xdddddd, flatShading: true })
};

let activeShading = 'normal';

// eslint-disable-next-line max-statements
const createShadingPanel = () => {
  // Scale CSS dimensions by devicePixelRatio so the HTMLMesh canvas texture
  // has enough pixels for retina displays. The HTMLMesh scale is reduced to
  // compensate, keeping the apparent size the same.
  const dpr = window.devicePixelRatio || 1;
  const panel = document.createElement('div');
  panel.style.cssText = `width:${200 * dpr}px; padding:${16 * dpr}px; background:rgba(30,30,30,0.9); border-radius:${8 * dpr}px; font-family:Helvetica,Arial,sans-serif; font-size:${14 * dpr}px; color:#fff;`;

  const title = document.createElement('div');
  title.textContent = 'Shading';
  title.style.cssText = `margin-bottom:${12 * dpr}px; font-weight:bold; font-size:${16 * dpr}px; text-align:center;`;
  panel.appendChild(title);

  const btnStyle = `display:block; width:100%; padding:${8 * dpr}px 0; margin-bottom:${8 * dpr}px; border:${dpr}px solid #666; border-radius:${4 * dpr}px; font-size:${14 * dpr}px; cursor:pointer; text-align:center; `;
  const activeStyle = 'background:#4a9eff; color:#fff; border-color:#4a9eff;';
  const inactiveStyle = 'background:#333; color:#ccc; border-color:#666;';

  const btnNormal = document.createElement('button');
  btnNormal.textContent = 'Normal';
  btnNormal.style.cssText = btnStyle + activeStyle;
  panel.appendChild(btnNormal);

  const btnFlat = document.createElement('button');
  btnFlat.textContent = 'Flat';
  btnFlat.style.cssText = btnStyle + inactiveStyle;
  panel.appendChild(btnFlat);

  const setShading = (mode) => {
    if (!brainMesh) {

      return;
    }
    activeShading = mode;
    brainMesh.material = materials[mode];
    brainMesh.material.needsUpdate = true;

    if (mode === 'normal') {
      btnNormal.style.cssText = btnStyle + activeStyle;
      btnFlat.style.cssText = btnStyle + inactiveStyle;
    } else {
      btnNormal.style.cssText = btnStyle + inactiveStyle;
      btnFlat.style.cssText = btnStyle + activeStyle;
    }

    // refresh the HTMLMesh texture
    if (htmlMesh) {
      htmlMesh.material.map.update();
    }
  };

  btnNormal.addEventListener('click', () => { setShading('normal'); });
  btnFlat.addEventListener('click', () => { setShading('flat'); });

  document.body.appendChild(panel);

  return panel;
};

// eslint-disable-next-line max-statements
const createMesh = (vertices, faces) => {
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

  // lighting (needed for Phong/Standard materials)
  const ambientLight = new THREE.AmbientLight(0x404040);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
  directionalLight.position.set(0, 0, 1);
  camera.add(directionalLight);
  scene.add(camera);
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemiLight.position.set(0, 200, 0);
  scene.add(hemiLight);

  trackball = new TrackballControls(camera, renderer.domElement);

  window.addEventListener('resize', onWindowResize, false);

  const geometry = new THREE.BufferGeometry();
  const verts = new Float32Array(vertices.flat());
  geometry.setAttribute('position', new THREE.BufferAttribute(verts, 3));
  geometry.setIndex(faces.flat());
  geometry.center();

  geometry.computeVertexNormals();
  brainMesh = new THREE.Mesh(geometry, materials[activeShading]);
  scene.add(brainMesh);

  // HTMLMesh shading panel — attached to camera so it stays fixed on screen
  const panelDom = createShadingPanel();
  htmlMesh = new HTMLMesh(panelDom);
  // position in camera-local coordinates: top-left corner, just in front of near plane
  const vFov = camera.fov * Math.PI / 180;
  const dist = 1; // distance from camera
  const halfH = Math.tan(vFov / 2) * dist;
  const halfW = halfH * camera.aspect;
  const dpr = window.devicePixelRatio || 1;
  htmlMesh.scale.setScalar(1.5 / dpr);
  htmlMesh.position.set(-halfW + 0.18, halfH - 0.12, -dist);
  camera.add(htmlMesh);

  // Custom pointer handler: only intercept events that hit the panel,
  // let everything else through to TrackballControls.
  // Use stopImmediatePropagation so same-element listeners (TrackballControls)
  // don't fire. Track whether pointer is on the panel to also block moves/ups.
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let pointerOnPanel = false;

  const hitTestPanel = (event) => {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(event.clientY - rect.top) / rect.height * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObject(htmlMesh, false);
    if (intersects.length > 0) {
      const [{uv}] = intersects;
      htmlMesh.dispatchEvent({ type: event.type, data: new THREE.Vector2(uv.x, 1 - uv.y) });

      return true;
    }

    return false;
  };

  const onPointerDown = (event) => {
    if (hitTestPanel(event)) {
      pointerOnPanel = true;
      event.stopImmediatePropagation();
    }
  };

  const onPointerMove = (event) => {
    if (pointerOnPanel) {
      hitTestPanel(event);
      event.stopImmediatePropagation();
    }
  };

  const onPointerUp = (event) => {
    if (pointerOnPanel) {
      hitTestPanel(event);
      pointerOnPanel = false;
      event.stopImmediatePropagation();
    }
  };

  const onClick = (event) => {
    if (hitTestPanel(event)) {
      event.stopImmediatePropagation();
    }
  };

  renderer.domElement.addEventListener('pointerdown', onPointerDown, true);
  renderer.domElement.addEventListener('pointermove', onPointerMove, true);
  renderer.domElement.addEventListener('pointerup', onPointerUp, true);
  renderer.domElement.addEventListener('click', onClick, true);

  console.log('mesh done.');
};

const render = () => {
  renderer.render(scene, camera);
  trackball.update();
};

const animate = () => {
  requestAnimationFrame(animate);
  render();
};

// eslint-disable-next-line max-statements
const configureNifti = (niigz) => {
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

const startWaitingAnimation = () => {
  setInterval(() => {
    if(document.getElementById('dot')) {
      document.getElementById('dot').style.marginLeft = 50*(1+Math.sin(dot)) + '%';
    }
    dot+=0.1;
  }, 33);
};

const startRender3D = () => {
  const pr = new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', localStorage.brainbox, true);
    xhr.responseType = 'blob';
    xhr.onload = () => {
      const blob = xhr.response;
      const reader = new FileReader();
      reader.addEventListener('loadend', (e) => {
        const niigz = e.currentTarget.result;
        const brain = configureNifti(niigz);
        brain.level = level;

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
    xhr.onerror = (e) => {
      console.log('load from localStorage failed. Try to load from server');
      reject(e);
    };
    xhr.send();
  });

  return pr;
};

const loadHTML = () => {
  document.body.innerHTML = html;
};

const init = () => {
  loadHTML();
  startWaitingAnimation();
  startRender3D();
};

snw.addEventListener('message', (event) => {
  const [vertices, faces] = event.data;
  createMesh(vertices, faces);
  document.getElementById('splash').remove();
  animate();
});

init();
