/* eslint-disable max-lines */
//========================================================================================
// MRI I/O
//========================================================================================

const fs = require('fs');
const Struct = require('struct');
const zlib = require('zlib');
const { promisify } = require('util');
const gunzip = promisify(zlib.gunzip);
const la = require('./atlasmaker-linalg');

const NiiHdr = new Struct()
  .word32Sle('sizeof_hdr') // Size of the header. Must be 348 (bytes)
  .chars('data_type', 10) // Not used; compatibility with analyze.
  .chars('db_name', 18) // Not used; compatibility with analyze.
  .word32Sle('extents') // Not used; compatibility with analyze.
  .word16Sle('session_error') // Not used; compatibility with analyze.
  .word8('regular') // Not used; compatibility with analyze.
  .word8('dim_info') // Encoding directions (phase, frequency, slice).
  .array('dim', 8, 'word16Sle') // Data array dimensions.
  .floatle('intent_p1') // 1st intent parameter.
  .floatle('intent_p2') // 2nd intent parameter.
  .floatle('intent_p3') // 3rd intent parameter.
  .word16Sle('intent_code') // nifti intent.
  .word16Sle('datatype') // Data type.
  .word16Sle('bitpix') // Number of bits per voxel.
  .word16Sle('slice_start') // First slice index.
  .array('pixdim', 8, 'floatle') // Grid spacings (unit per dimension).
  .floatle('vox_offset') // Offset into a .nii file.
  .floatle('scl_slope') // Data scaling, slope.
  .floatle('scl_inter') // Data scaling, offset.
  .word16Sle('slice_end') // Last slice index.
  .word8('slice_code') // Slice timing order.
  .word8('xyzt_units') // Units of pixdim[1..4].
  .floatle('cal_max') // Maximum display intensity.
  .floatle('cal_min') // Minimum display intensity.
  .floatle('slice_duration') // Time for one slice.
  .floatle('toffset') // Time axis shift.
  .word32Sle('glmax') // Not used; compatibility with analyze.
  .word32Sle('glmin') // Not used; compatibility with analyze.
  .chars('descrip', 80) // Any text.
  .chars('aux_file', 24) // Auxiliary filename.
  .word16Sle('qform_code') // Use the quaternion fields.
  .word16Sle('sform_code') // Use of the affine fields.
  .floatle('quatern_b') // Quaternion b parameter.
  .floatle('quatern_c') // Quaternion c parameter.
  .floatle('quatern_d') // Quaternion d parameter.
  .floatle('qoffset_x') // Quaternion x shift.
  .floatle('qoffset_y') // Quaternion y shift.
  .floatle('qoffset_z') // Quaternion z shift.
  .array('srow_x', 4, 'floatle') // 1st row affine transform
  .array('srow_y', 4, 'floatle') // 2nd row affine transform.
  .array('srow_z', 4, 'floatle') // 3rd row affine transform.
  .chars('intent_name', 16) // Name or meaning of the data.
  .chars('magic', 4); // Magic string.

/*eslint-enable no-multi-spaces*/
const MghHdr = new Struct()
  .word32Sbe('v')
  .word32Sbe('ndim1')
  .word32Sbe('ndim2')
  .word32Sbe('ndim3')
  .word32Sbe('nframes')
  .word32Sbe('type')
  .word32Sbe('dof')
  .word16Sbe('ras_good_flag')
  .array('delta', 3, 'floatbe')
  .array('Mdc', 9, 'floatbe')
  .array('Pxyz_c', 3, 'floatbe');
// const MghFtr = Struct().array('mrparms', 4, 'floatbe');

// eslint-disable-next-line max-statements
const computeS2VTransformation = (mri) => {

  /*
            The basic transformation is w = v2w * v + wori
            Where:
            w: world coordinates
            wori: origin of the world coordinates
            v: voxel coordinates
            v2w: rotation matrix from v to w
            In what follows:
            v refers to native voxel coordinates
            w refers to world coordinates
            s refers screen pixel coordinates
        */
  const wori = mri.ori;
  // space directions are transposed!
  const v2w = [[], [], []];
  //for(b in mri.dir) for(a in mri.dir[b]) v2w[a][b] = mri.dir[b][a]; // transpose
  for (const b in mri.dir) {
    if ({}.hasOwnProperty.call(mri.dir, b)) {
      for (const a in mri.dir[b]) {
        if ({}.hasOwnProperty.call(mri.dir[b], a)) {
          v2w[a][b] = mri.dir[a][b]; // do not transpose
        }
      }
    }
  }
  const wpixdim = la.subVecVec(la.mulMatVec(v2w, [1, 1, 1]), la.mulMatVec(v2w, [0, 0, 0]));
  // min and max world coordinates
  const wvmax = la.addVecVec(la.mulMatVec(v2w, [mri.dim[0] - 1, mri.dim[1] - 1, mri.dim[2] - 1]), wori);
  const wvmin = la.addVecVec(la.mulMatVec(v2w, [0, 0, 0]), wori);
  const wmin = [Math.min(wvmin[0], wvmax[0]), Math.min(wvmin[1], wvmax[1]), Math.min(wvmin[2], wvmax[2])];
  //        var wmax = [Math.max(wvmin[0], wvmax[0]), Math.max(wvmin[1], wvmax[1]), Math.max(wvmin[2], wvmax[2])];
  const w2s = [[1 / Math.abs(wpixdim[0]), 0, 0], [0, 1 / Math.abs(wpixdim[1]), 0], [0, 0, 1 / Math.abs(wpixdim[2])]];

  // console.error(["v2w", v2w, "wori", wori, "wpixdim", wpixdim, "wvmax", wvmax, "wvmin", wvmin, "wmin", wmin, "wmax", wmax, "w2s", w2s]);

  const [i, j, k] = v2w;
  let mi = { i: 0, v: 0 }; i.forEach(function (o, n) { if (Math.abs(o) > Math.abs(mi.v)) { mi = { i: n, v: o }; } });
  let mj = { i: 0, v: 0 }; j.forEach(function (o, n) { if (Math.abs(o) > Math.abs(mj.v)) { mj = { i: n, v: o }; } });
  let mk = { i: 0, v: 0 }; k.forEach(function (o, n) { if (Math.abs(o) > Math.abs(mk.v)) { mk = { i: n, v: o }; } });

  mri.s2v = {
    // old s2v fields
    s2w: la.invMat(w2s),
    sdim: [],
    sori: [-wmin[0] / Math.abs(wpixdim[0]), -wmin[1] / Math.abs(wpixdim[1]), -wmin[2] / Math.abs(wpixdim[2])],
    w2v: la.invMat(v2w),
    wori: wori,

    // new s2v transformation
    x: mi.i, // correspondence between space coordinate x and voxel coordinate i
    y: mj.i, // same for y
    z: mk.i, // same for z
    dx: (mi.v > 0) ? 1 : (-1), // direction of displacement in space coordinate x with displacement in voxel coordinate i
    dy: (mj.v > 0) ? 1 : (-1), // same for y
    dz: (mk.v > 0) ? 1 : (-1), // same for z
    X: (mi.v > 0) ? 0 : (mri.dim[0] - 1), // starting value for space coordinate x when voxel coordinate i starts
    Y: (mj.v > 0) ? 0 : (mri.dim[1] - 1), // same for y
    Z: (mk.v > 0) ? 0 : (mri.dim[2] - 1) // same for z
  };
  mri.v2w = v2w;
  mri.wori = wori;
  [mri.s2v.sdim[mi.i], mri.s2v.sdim[mj.i], mri.s2v.sdim[mk.i]] = mri.dim;
};

// testS2VTransformation: function (mri) {
//     //  check the S2V transformation to see if it looks correct.
//     //  If it does not, reset it
//     var doReset = false;

//     console.error("    Transformation TEST:");

//     if(me.debug) {
//         process.stdout.write("  1. transformation volume: ");
//     }
//     var vv = mri.dim[0]*mri.dim[1]*mri.dim[2];
//     var vs = mri.s2v.sdim[0]*mri.s2v.sdim[1]*mri.s2v.sdim[2];
//     var diff = (vs-vv)/vv;
//     if(Math.abs(diff)>0.001) {
//         doReset = true;
//         if(me.debug) {
//             console.error("    fail. Voxel volume:", vv, "Screen volume:", vs, "Difference (%):", diff);
//         }
//     } else {
//         if(me.debug) {
//             console.error("    ok");
//         }
//     }

//     if(me.debug) {
//         process.stdout.write("  2. transformation origin: ");
//     }
//     if(    mri.s2v.sori[0]<0||mri.s2v.sori[0]>mri.s2v.sdim[0] ||
//         mri.s2v.sori[1]<0||mri.s2v.sori[1]>mri.s2v.sdim[1] ||
//         mri.s2v.sori[2]<0||mri.s2v.sori[2]>mri.s2v.sdim[2]) {
//         doReset = true;
//         if(me.debug) {
//             console.error("    fail");
//         }
//     } else {
//         if(me.debug) {
//             console.error("    ok");
//         }
//     }

//     if(doReset) {
//         console.error("    FAIL: TRANSFORMATION WILL BE RESET");
//         console.error(mri.dir);
//         console.error(mri.ori);
//         mri.dir = [[mri.pixdim[0], 0, 0], [0, -mri.pixdim[1], 0], [0, 0, -mri.pixdim[2]]];
//         mri.ori = [0, mri.dim[1]-1, mri.dim[2]-1];
//         computeS2VTransformation(mri);

//         if(me.debug>2) {
//             console.error("dir", mri.dir);
//             console.error("ori", mri.ori);
//             console.error("s2v", mri.s2v);
//         }
//     } else {
//         console.error("    ok");
//     }
// },

const filetypeFromFilename = (mriPath) => {
  if (mriPath.match(/.nii.gz$/)) {
    return 'nii.gz';
  } else
  if (mriPath.match(/.mgz$/)) {
    return 'mgz';
  }
};

// eslint-disable-next-line max-statements
const _readNiftiHeader = ({ nii, mri }) => {
  // read standard nii header
  let success = true;
  try {
    NiiHdr.allocate();
    NiiHdr._setBuff(nii);
    const h = JSON.parse(JSON.stringify(NiiHdr.fields));

    //var sizeof_hdr = h.sizeof_hdr;
    mri.dim = [h.dim[1], h.dim[2], h.dim[3]];
    mri.pixdim = [h.pixdim[1], h.pixdim[2], h.pixdim[3]];
    // eslint-disable-next-line camelcase
    mri.vox_offset = h.vox_offset;

    // nrrd-compatible header, computes space directions and space origin
    if (h.sform_code > 0) {
      mri.dir = [
        [h.srow_x[0], h.srow_y[0], h.srow_z[0]],
        [h.srow_x[1], h.srow_y[1], h.srow_z[1]],
        [h.srow_x[2], h.srow_y[2], h.srow_z[2]]
      ];
      mri.ori = [h.srow_x[3], h.srow_y[3], h.srow_z[3]];
    } else {
      mri.dir = [[mri.pixdim[0], 0, 0], [0, mri.pixdim[1], 0], [0, 0, mri.pixdim[2]]];
      mri.ori = [0, 0, 0];
    }
  } catch (err) {
    console.error('ERROR Cannot read nifti header:', err);
    success = false;
  }

  return success;
};

const _readNiftiData = ({ nii, mri }) => {
  let success = true;
  let j;
  let tmp;

  switch (mri.datatype) {
  case 2: // UCHAR
    mri.data = nii.slice(mri.vox_offset);
    break;
  case 4: // SHORT
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Int16Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readInt16LE(j * 2);
    }
    break;
  case 8: // INT
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Uint32Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readUInt32LE(j * 4);
    }
    break;
  case 16: // FLOAT
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Float32Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readFloatLE(j * 4);
    }
    break;
  case 64: // FLOAT64
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Float64Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readDoubleLE(j * 8);
    }
    break;
  case 256: // INT8
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Int8Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readInt8(j);
    }
    break;
  case 512: // UINT16
    tmp = nii.slice(mri.vox_offset);
    mri.data = new Uint16Array(mri.dim[0] * mri.dim[1] * mri.dim[2]);
    for (j = 0; j < mri.dim[0] * mri.dim[1] * mri.dim[2]; j += 1) {
      mri.data[j] = tmp.readUInt16LE(j * 2);
    }
    break;
  default:
    success = false;
    console.error('ERROR: Unknown dataType: ' + mri.datatype);
  }

  return success;
};

const _computeVolumeStats = ({ mri }) => {
  // eslint-disable-next-line max-lines
  let sum = 0;
  let [min, max] = [mri.data[0], mri.data[0]];
  for (let i = 0; i < mri.dim[0] * mri.dim[1] * mri.dim[2]; i += 1) {
    sum += mri.data[i];

    if (mri.data[i] < min) {
      min = mri.data[i];
    }

    if (mri.data[i] > max) {
      max = mri.data[i];
    }
  }
  [mri.sum, mri.min, mri.max] = [sum, min, max];
};

const readNifti = async (mriPath) => {

  /*
            readNifti
            input: path to a .nii.gz file
            output: an mri structure
        */

  const niigz = await fs.promises.readFile(mriPath);
  const nii = await gunzip(niigz);
  const mri = {};

  // read header
  if (!_readNiftiHeader({ nii, mri })) {
    throw (new Error('Cannot read nifti header'));
  }

  // compute the transformation from voxel space to screen space
  computeS2VTransformation(mri);

  // test if the transformation looks incorrect. Reset it if it does
  //testS2VTransformation(mri);

  // manually parsed information
  mri.hdr = nii.slice(0, 352);
  mri.hdrSz = 352;
  mri.datatype = nii.readUInt16LE(70);

  // read binary data
  if (!_readNiftiData({ nii, mri })) {
    throw (new Error('Cannot read nifti binary data'));
  }

  // compute stats: sum, min and max
  _computeVolumeStats({ mri });

  return (mri);
};

// eslint-disable-next-line max-statements
const _readMGZHeader = ({ mgh, mri, hdr }) => {
  let success = true;

  MghHdr.allocate();
  MghHdr._setBuff(mgh);
  const h = JSON.parse(JSON.stringify(MghHdr.fields));
  for (const prop in h) {
    if ({}.hasOwnProperty.call(h, prop)) {
      hdr[prop] = h[prop];
    }
  }

  // Test Header
  if (h.v < 1 || h.v > 100) {
    console.error('ERROR: Wrong MGH Header', h);
    success = false;
  } else {
    // Equations from freesurfer/matlab/load_mgh.m
    const PcrsC = [h.ndim1 / 2, h.ndim2 / 2, h.ndim3 / 2];
    //var D = [[h.delta[0], 0, 0], [0, h.delta[1], 0], [0, 0, h.delta[2]]];
    const MdcD = [
      [h.Mdc[0] * h.delta[0], h.Mdc[3] * h.delta[1], h.Mdc[6] * h.delta[2]],
      [h.Mdc[1] * h.delta[0], h.Mdc[4] * h.delta[1], h.Mdc[7] * h.delta[2]],
      [h.Mdc[2] * h.delta[0], h.Mdc[5] * h.delta[1], h.Mdc[8] * h.delta[2]]
    ];
    const Pxyz0 = la.subVecVec(h.Pxyz_c, la.mulMatVec(MdcD, PcrsC));
    const M = [
      h.Mdc[0] * h.delta[0], h.Mdc[3] * h.delta[1], h.Mdc[6] * h.delta[2], Pxyz0[0],
      h.Mdc[1] * h.delta[0], h.Mdc[4] * h.delta[1], h.Mdc[7] * h.delta[2], Pxyz0[1],
      h.Mdc[2] * h.delta[0], h.Mdc[5] * h.delta[1], h.Mdc[8] * h.delta[2], Pxyz0[2],
      0, 0, 0, 1
    ];

    mri.dim = [h.ndim1, h.ndim2, h.ndim3];
    mri.pixdim = [h.delta[0], h.delta[1], h.delta[2]];
    mri.dir = [[M[0], -M[1], -M[2]], [M[4], -M[5], -M[6]], [M[8], -M[9], -M[10]]];
    mri.ori = [M[3], M[7], M[11]];
  }

  return success;
};

const _readMGZData = ({ mgh, mri, hdr }) => {
  let success = true;
  const hdrSize = 284;
  let tmp;

  const sz = mri.dim[0] * mri.dim[1] * mri.dim[2];
  const bpv = [1, 4, 0, 4, 2][hdr.type]; // bytes per voxel

  // keep the header
  mri.hdr = mgh.slice(0, hdrSize);
  mri.hdrSz = hdrSize;

  // keep the footer
  const ftrSz = mgh.length - hdrSize - sz * bpv;
  mri.ftr = mgh.slice(hdrSize + sz * bpv);

  // print info
  // console.error("    mgh.length:", mgh.length);
  // console.error("       hdrSize:", hdrSize);
  // console.error("        sz*bpv:", sz*bpv);
  // console.error("         ftrSz:", ftrSz);
  // console.error("mri.ftr.length:", mri.ftr.length);

  switch (hdr.type) {
  case 0: // MGHUCHAR
    mri.data = mgh.slice(hdrSize, -ftrSz);
    break;
  case 1: // MGHINT
    tmp = mgh.slice(hdrSize, -ftrSz);
    mri.data = new Uint32Array(sz);
    for (let j = 0; j < sz; j += 1) {
      mri.data[j] = tmp.readUInt32BE(j * 4);
    }
    break;
  case 3: // MGHFLOAT
    tmp = mgh.slice(hdrSize, -ftrSz);
    mri.data = new Float32Array(sz);
    for (let j = 0; j < sz; j += 1) {
      mri.data[j] = tmp.readFloatBE(j * 4);
    }
    break;
  case 4: // MGHSHORT
    tmp = mgh.slice(hdrSize, -ftrSz);
    mri.data = new Int16Array(sz);
    for (let j = 0; j < sz; j += 1) {
      mri.data[j] = tmp.readInt16BE(j * 2);
    }
    break;
  default:
    success = false;
    console.error('ERROR: Unknown dataType: ' + hdr.type);
  }

  return success;
};

/*
        readMGZ
        input: path to a .mgz file
        output: an mri structure
    */
const readMGZ = (mriPath) => {
  const pr = new Promise(function (resolve, reject) {
    try {

      /*
        MGZ data sometimes has an error which makes gunzip throw
        a "invalid compressed data--crc error" message. However,
        the data is correctly uncompressed. We will ignore errors.
      */

      const bufs = [];
      const readable = fs.createReadStream(mriPath).pipe(zlib.createGunzip());
      readable.on('data', function (d) { bufs.push(d); });
      readable.on('error', function (err) {
        if (err.code === 'Z_DATA_ERROR') {
          readable.emit('end');
        } else {
          reject(err);
        }
      });
      readable.on('end', function () {
        const mgh = Buffer.concat(bufs);
        const mri = {};
        const hdr = {};

        // read header
        if (!_readMGZHeader({ mgh, mri, hdr })) {
          reject(new Error('Failed to read MGZ header'));

          return;
        }

        // compute the transformation from voxel space to screen space
        computeS2VTransformation(mri);

        // test if the transformation looks incorrect. Reset it if it does
        //testS2VTransformation(mri);

        // read binary data
        if (!_readMGZData({ mgh, mri, hdr })) {
          reject(new Error('Failed to read MGZ binary data'));

          return;
        }

        // compute volume stats
        _computeVolumeStats({ mri });

        resolve(mri);
      });
    } catch (e) {
      reject(new Error('ERROR Cannot uncompress mgz file: ', e));
    }
  });

  return pr;
};

/*
        createNifti
        input: a template mri structure
        output: a new empty mri structure, datatype = 2 (1 byte per voxel), same dimensions as template
    */
// eslint-disable-next-line max-statements
const createNifti = (templateMRI) => {

  /*eslint-disable camelcase*/
  const mri = {};
  const props = ['dim', 'pixdim', 'hdr'];
  const datatype = 2;
  const vox_offset = 352;
  let i;
  const newHdr = {
    sizeof_hdr: 348,
    data_type: '',
    db_name: '',
    extents: 0,
    session_error: 0,
    regular: 0,
    dim_info: 0,
    dim: [3, templateMRI.dim[0], templateMRI.dim[1], templateMRI.dim[2], 1, 1, 1, 1],
    intent_p1: 0,
    intent_p2: 0,
    intent_p3: 0,
    intent_code: 0,
    datatype: 2, // uchar
    bitpix: 8,
    slice_start: 0,
    pixdim: [-1, templateMRI.pixdim[0], templateMRI.pixdim[1], templateMRI.pixdim[2], 0, 1, 1, 1],
    vox_offset: 352,
    scl_slope: 1,
    scl_inter: 0,
    slice_end: 0,
    slice_code: 0,
    xyzt_units: 10,
    cal_max: 0,
    cal_min: 0,
    slice_duration: 0,
    toffset: 0,
    glmax: 0,
    glmin: 0,
    descrip: 'BrainBox, 20 August 2016',
    aux_file: '',
    qform_code: 0,
    sform_code: 1,
    quatern_b: 0,
    quatern_c: 0,
    quatern_d: 0,
    qoffset_x: 0,
    qoffset_y: 0,
    qoffset_z: 0,
    srow_x: [templateMRI.dir[0][0], templateMRI.dir[0][1], templateMRI.dir[0][2], templateMRI.ori[0]],
    srow_y: [templateMRI.dir[1][0], templateMRI.dir[1][1], templateMRI.dir[1][2], templateMRI.ori[1]],
    srow_z: [templateMRI.dir[2][0], templateMRI.dir[2][1], templateMRI.dir[2][2], templateMRI.ori[2]],
    intent_name: '',
    magic: 'n+1\0'
  };
  /*eslint-enable camelcase*/

  NiiHdr.allocate();
  const niihdr = NiiHdr.buffer();
  for (i in newHdr) {
    if ({}.hasOwnProperty.call(newHdr, i)) {
      NiiHdr.fields[i] = newHdr[i];
    }
  }

  // copy information from templateMRI
  for (i in props) {
    if ({}.hasOwnProperty.call(props, i)) {
      mri[props[i]] = templateMRI[props[i]];
    }
  }

  // get volume size
  const sz = mri.dim[0] * mri.dim[1] * mri.dim[2];

  // update the header
  mri.hdr = niihdr;
  mri.hdr.writeUInt16LE(datatype, 70, 2); // set datatype to 2:unsigned char (8 bits/voxel)
  mri.hdr.writeFloatLE(vox_offset, 108, 4); // set voxel_offset to 352 (minimum size of a nii header)
  // eslint-disable-next-line camelcase
  mri.hdrSz = vox_offset;

  // zero the data
  mri.data = Buffer.alloc(sz);
  for (i = 0; i < sz; i += 1) {
    mri.data[i] = 0;
  }

  // zero statistics
  mri.sum = 0;
  mri.min = 0;
  mri.max = 0;

  return Promise.resolve(mri);
};

const loadMRI = (mriPath) => {

  /*
            loadMRI
            input: path to an mri file, .nii.gz and .mgz formats are recognised
            output: an mri structure
        */
  const pr = new Promise(function (resolve, reject) {
    switch (filetypeFromFilename(mriPath)) {
    case 'nii.gz':
      readNifti(mriPath)
        .then(function (mri) {
          resolve(mri);
        })
        .catch(function (err) {
          reject(err);
        });
      break;
    case 'mgz':
      readMGZ(mriPath)
        .then(function (mri) {
          resolve(mri);
        })
        .catch(function (err) {
          console.error('ERROR reading mgz file:', err);
          reject(err);
        });
      break;
    default:
      console.error('ERROR: nothing we can read');
      reject(new Error('ERROR: nothing we can read'));
    }
  });

  return pr;
};

module.exports = {
  filetypeFromFilename,
  createNifti,
  readNifti,
  readMGZ,
  loadMRI
};
