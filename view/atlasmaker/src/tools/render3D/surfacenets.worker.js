import surfacenets from './surfacenets.js';

export default function worker (self) {
    self.addEventListener('message', (e) => {
        // console.log('Worker: Message received from main script:', e.data);
        const sn = surfacenets();
        const [dim, datatype, pixdim, level, data] = e.data;
        const g = sn.init({dim, datatype, pixdim, level, data});
        self.postMessage([g.vertices, g.faces]);
    });
}
