
// THREEJS RELATED VARIABLES

var scene, camera, renderer, controls, texture;
var canvas;

// SCREEN AND MOUSE VARIABLES

var HEIGHT, WIDTH,
    mousePos = { x: 0, y: 0 };

const gui = new dat.GUI();

// WORLD VARS

var chunkSize, chunkHeight, world, voxelWorldMaterial;
var previousNumChunks; // this is necessary because i need to clear chunk geometry from previous load
var numChunks;
var heightmap = [[], []];
var seed = 1234; // arbitrary seed string
var sky, newSun;
var erosion_iterations = 0
var alpha = 55 // angle of repose in degrees; in this case we will just move dirt
var voxelToPlace = 1 // voxel the player has selected


// Voxel World Functions 

function createScene() {
  chunkSize = 16; // originally set chunk size to be 32 x 32 x 32
  chunkHeight = 180;
  numChunks = 6; // number of chunks in our n x n world

  scene = new THREE.Scene();
  scene.background = new THREE.Color('lightblue');
  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );

  canvas = document.querySelector('#c');
  renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;

  controls = new THREE.OrbitControls( camera, renderer.domElement );
  controls.target.set(numChunks * chunkSize / 2, chunkHeight / 2, numChunks * chunkSize / 2);
  controls.enableDamping = true;
  
  camera.position.set(
    -chunkSize * .3, chunkHeight * .8, -chunkSize * .3
  );

  controls.update()

  var axesHelper = new THREE.AxesHelper( 15 );
  scene.add( axesHelper );

  // load texture
  const loader = new THREE.TextureLoader();
  texture = loader.load('https://threejsfundamentals.org/threejs/resources/images/minecraft/flourish-cc-by-nc-sa.png', animate);

  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;



  // resize canvas on resize window
  window.addEventListener( 'resize', () => {
    let width = window.innerWidth
    let height = window.innerHeight
    renderer.setSize( width, height )
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  });
}

const neighborOffsets = [
  [ 0,  0,  0], // self
  [-1,  0,  0], // left
  [ 1,  0,  0], // right
  [ 0, -1,  0], // down
  [ 0,  1,  0], // up
  [ 0,  0, -1], // back
  [ 0,  0,  1], // front
];

function updateVoxelGeometry(x, y, z) {
  var updatedChunkIds = {};
  for (const offset of neighborOffsets) {
    const ox = x + offset[0];
    const oy = y + offset[1];
    const oz = z + offset[2];
    const chunkId = world.computeChunkId(ox, oy, oz);
    if (!updatedChunkIds[chunkId]) {
      updatedChunkIds[chunkId] = true;
      updateChunkGeometry(ox, oy, oz);
    }
  }  
}

function initSky() {
  sky = new Sky();
  sky.scale.setScalar(450000);
  scene.add(sky);

  newSun = new THREE.Vector3();

  /// GUI

  var effectController = {
    turbidity: 10,
    rayleigh: 3,
    mieCoefficient: 0.005,
    mieDirectionalG: 0.7,
    azimuth: 0.25, // Facing front,
    exposure: renderer.toneMappingExposure
  };

  function sunGuiChanged() {

    var uniforms = sky.material.uniforms;
    uniforms[ "turbidity" ].value = effectController.turbidity;
    uniforms[ "rayleigh" ].value = effectController.rayleigh;
    uniforms[ "mieCoefficient" ].value = effectController.mieCoefficient;
    uniforms[ "mieDirectionalG" ].value = effectController.mieDirectionalG;

    var phi = 2 * Math.PI * ( effectController.azimuth - 0.5 );

    newSun.x = Math.cos( phi );

    uniforms[ "sunPosition" ].value.copy( newSun );

    renderer.toneMappingExposure = effectController.exposure;
    requestRenderIfNotRequested();

  }

  const folder = gui.addFolder("Sun Variables")
  folder.add( effectController, "turbidity", 0.0, 20.0, 0.1 ).onChange( sunGuiChanged );
  folder.add( effectController, "rayleigh", 0.0, 4, 0.001 ).onChange( sunGuiChanged );
  folder.add( effectController, "mieCoefficient", 0.0, 0.1, 0.001 ).onChange( sunGuiChanged );
  folder.add( effectController, "mieDirectionalG", 0.0, 1, 0.001 ).onChange( sunGuiChanged );
  
  folder.add( effectController, "exposure", 0, 1, 0.0001 ).onChange( sunGuiChanged );

  sunGuiChanged();
}

var chunkIdToMesh = {};

function updateChunkGeometry(x, y, z) {
  const cX = Math.floor(x / chunkSize);
  const cY = Math.floor(y / chunkHeight);
  const cZ = Math.floor(z / chunkSize);
  const chunkId = world.computeChunkId(x, y, z);
  let mesh = chunkIdToMesh[chunkId];
  const geometry = mesh ? mesh.geometry : new THREE.BufferGeometry();
  const {positions, normals, uvs, indices} = world.genChunkGeometryData(cX, cY, cZ);
  
  voxelWorldMaterial = new THREE.MeshStandardMaterial({
    map: texture,
    side: THREE.DoubleSide,
    alphaTest: 0.1,
    transparent: true,
  });

  const positionNumComponents = 3;
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), positionNumComponents));
  const normalNumComponents = 3;

  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(normals), normalNumComponents));
  const uvNumComponents = 2;

  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), uvNumComponents));
  geometry.setIndex(indices);  
  geometry.computeBoundingSphere();

  if (!mesh) {
    mesh = new THREE.Mesh(geometry, voxelWorldMaterial);
    mesh.name = chunkId;
    chunkIdToMesh[chunkId] = mesh;
    scene.add(mesh);
    mesh.position.set(cX * chunkSize, cY * chunkHeight, cZ * chunkSize);

  }
}

function placeVoxel(event, voxelToPlace = 1) {
  const pos = getCanvasRelativePosition(event);
  const x = (pos.x / canvas.width ) *  2 - 1;
  const y = (pos.y / canvas.height) * -2 + 1;  // note we flip Y
 
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  start.setFromMatrixPosition(camera.matrixWorld);
  end.set(x, y, 1).unproject(camera);


  const intersection = world.intersectRay(start, end);  
  if (intersection) {
    const voxelId = voxelToPlace; // for now
    // the intersection point is on the face. That means
    // the math imprecision could put us on either side of the face.
    // so go half a normal into the voxel if removing (currentVoxel = 0)
    // our out of the voxel if adding (currentVoxel  > 0)
    const pos = intersection.position.map((v, ndx) => {
      return v + intersection.normal[ndx] * (voxelId > 0 ? 0.5 : -0.5);
    });
    world.setVoxel(...pos, voxelId); 
    updateVoxelGeometry(...pos);
    requestRenderIfNotRequested();
  }
}

function getVoxelFromRaycast(event) {
  // gets the voxel after ray trace if it exists
  const pos = getCanvasRelativePosition(event);
  const x = (pos.x / canvas.width ) *  2 - 1;
  const y = (pos.y / canvas.height) * -2 + 1;  // note we flip Y
 
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  start.setFromMatrixPosition(camera.matrixWorld);
  end.set(x, y, 1).unproject(camera);


  const intersection = world.intersectRay(start, end);
  if (intersection) {
    return intersection.voxel // return the voxel if it exists
  }

  return 1
}

function placeTree(x, y, z) {
  let logVoxel = 10; // log is voxel id of 10
  let leafVoxel = 12;
  let treeHeight = 2 + Math.floor(Math.random() * Math.floor(3));

  // trunk
  world.setVoxel(x, y - 2, z, logVoxel);
  world.setVoxel(x, y - 1, z, logVoxel);
  world.setVoxel(x, y, z, logVoxel);
  world.setVoxel(x, y + 1, z, logVoxel);
  world.setVoxel(x, y + 2, z, logVoxel);
  world.setVoxel(x, y + 3, z, logVoxel);
  world.setVoxel(x, y + 4, z, logVoxel);
  world.setVoxel(x, y + 5, z, logVoxel);

  //leaves
  world.setVoxel(x - 1, y + treeHeight, z - 1, leafVoxel);
  world.setVoxel(x - 1, y + treeHeight, z, leafVoxel);
  world.setVoxel(x - 1, y + treeHeight, z + 1, leafVoxel);
  world.setVoxel(x, y + treeHeight, z - 1, leafVoxel);
  world.setVoxel(x, y + treeHeight, z + 1, leafVoxel);
  world.setVoxel(x + 1, y + treeHeight, z - 1, leafVoxel);
  world.setVoxel(x + 1, y + treeHeight, z, leafVoxel);
  world.setVoxel(x + 1, y + treeHeight, z + 1, leafVoxel);


  for (let i = treeHeight + 1; i < treeHeight + 4; i++) {
    world.setVoxel(x - 1, y + i, z - 1, leafVoxel);
    world.setVoxel(x - 1, y + i, z, leafVoxel);
    world.setVoxel(x - 1, y + i, z + 1, leafVoxel);
    world.setVoxel(x, y + i, z - 1, leafVoxel);
    world.setVoxel(x, y + i, z + 1, leafVoxel);
    world.setVoxel(x + 1, y + i, z - 1, leafVoxel);
    world.setVoxel(x + 1, y + i, z, leafVoxel);
    world.setVoxel(x + 1, y + i, z + 1, leafVoxel);
    world.setVoxel(x - 2, y + i, z - 2, leafVoxel);
    world.setVoxel(x - 2, y + i, z - 1, leafVoxel);
    world.setVoxel(x - 2, y + i, z, leafVoxel);
    world.setVoxel(x - 2, y + i, z + 1, leafVoxel);
    world.setVoxel(x - 2, y + i, z + 2, leafVoxel);
    world.setVoxel(x - 1, y + i, z - 2, leafVoxel);
    world.setVoxel(x - 1, y + i, z - 1, leafVoxel);
    world.setVoxel(x - 1, y + i, z, leafVoxel);
    world.setVoxel(x - 1, y + i, z + 1, leafVoxel);
    world.setVoxel(x - 1, y + i, z + 2, leafVoxel);
    world.setVoxel(x, y + i, z - 2, leafVoxel);
    world.setVoxel(x, y + i, z - 1, leafVoxel);
    world.setVoxel(x, y + i, z + 1, leafVoxel);
    world.setVoxel(x, y + i, z + 2, leafVoxel);
    world.setVoxel(x + 1, y + i, z - 2, leafVoxel);
    world.setVoxel(x + 1, y + i, z - 1, leafVoxel);
    world.setVoxel(x + 1, y + i, z, leafVoxel);
    world.setVoxel(x + 1, y + i, z + 1, leafVoxel);
    world.setVoxel(x + 1, y + i, z + 2, leafVoxel);
    world.setVoxel(x + 2, y + i, z - 2, leafVoxel);
    world.setVoxel(x + 2, y + i, z - 1, leafVoxel);
    world.setVoxel(x + 2, y + i, z, leafVoxel);
    world.setVoxel(x + 2, y + i, z + 1, leafVoxel);
    world.setVoxel(x + 2, y + i, z + 2, leafVoxel);
  }

  world.setVoxel(x - 2, y + treeHeight + 3, z - 2, 0);
  world.setVoxel(x - 2, y + treeHeight + 3, z + 2, 0);
  world.setVoxel(x + 2, y + treeHeight + 3, z + 2, 0);
  world.setVoxel(x + 2, y + treeHeight + 3, z - 2, 0);
  world.setVoxel(x, y + treeHeight + 2, z, leafVoxel);
  world.setVoxel(x, y + treeHeight + 3, z, leafVoxel);
  world.setVoxel(x, y + treeHeight + 4, z, leafVoxel);
  world.setVoxel(x - 1, y + treeHeight + 4, z, leafVoxel);
  world.setVoxel(x + 1, y + treeHeight + 4, z, leafVoxel);
  world.setVoxel(x, y + treeHeight + 4, z + 1, leafVoxel);
  world.setVoxel(x, y + treeHeight + 4, z - 1, leafVoxel);

}

const map = (val, smin, smax, emin, emax) => (emax-emin)*(val-smin)/(smax-smin) + emin
const jitter = (geo,per) => geo.vertices.forEach(v => {
    v.x += map(Math.random(),0,1,-per,per)
    v.y += map(Math.random(),0,1,-per,per)
    v.z += map(Math.random(),0,1,-per,per)
})
const chopBottom = (geo,bottom) => geo.vertices.forEach(v => v.y = Math.max(v.y,bottom))

function makeCloud() {

    const geo = new THREE.Geometry()

    const tuft1 = new THREE.SphereGeometry(1.5,7,8)
    tuft1.translate(-2,0,0)
    geo.merge(tuft1)

    const tuft2 = new THREE.SphereGeometry(1.5,7,8)
    tuft2.translate(2,0,0)
    geo.merge(tuft2)

    const tuft3 = new THREE.SphereGeometry(2.0,7,8)
    tuft3.translate(0,0,0)
    geo.merge(tuft3)


    jitter(geo,0.2)
    chopBottom(geo,-0.5)
    geo.computeFlatVertexNormals()
    geo.scale(4, 4, 4);

    return new THREE.Mesh(
        geo,
        new THREE.MeshLambertMaterial({
            color:'white',
            flatShading:true,
            opacity: 0.75,
            transparent: true
        })
    )
}

// GUI

// helper class for GUI
class SunController {
  constructor(degree) {
    this.degree = degree;
  }
}

function makeSunGUI(gui, sun, name, onChangeFunction) {
  const folder = gui.addFolder(name);
  folder.add(sun, 'degree', 0, 359).onChange(onChangeFunction);
}

function makeXYZGUI(gui, vector3, name, onChangeFunction) {
  const folder = gui.addFolder(name);
  folder.add(vector3, 'x', -numChunks * chunkSize * .5, numChunks * chunkSize).onChange(onChangeFunction);
  folder.add(vector3, 'y', 0, 10).onChange(onChangeFunction);
  folder.add(vector3, 'z', -10, 10).onChange(onChangeFunction);
  folder.open();
}

const params = {
  seed: "1234",
  numErosionIterations: 0,
  reposeAngle: 55,
  numChunks: 6
}

function makeWorldParamGUI() {
  const folder = gui.addFolder("World Params");
  folder.add(params, "seed").onFinishChange(function (value) {
    seed = value;
  });

  folder.add(params, "numChunks").onFinishChange(function (value) {
    previousNumChunks = numChunks;
    numChunks = value;
  });

  folder.add(params, "numErosionIterations").onFinishChange(function (value) {
    erosion_iterations = value;
  });

  folder.add(params, "reposeAngle").onFinishChange(function (value) {
    alpha = value;
  });
}

function makeReloadGUI() {
  var obj = { Reload:function(){ 
      reloadLevel()
    }};
  gui.add(obj, 'Reload');
}

function makeErodeGUI() {
  var obj = { Erode:function(){ 
      erodeOneIteration()
    }};
  gui.add(obj, 'Erode');
}

// LIGHTS

var ambientLight, directLight1, directLight2, hemiLight; //, helper, helper2;
var sun = new SunController(60);

function createLights() {
  // ambient light
  ambientLight = new THREE.AmbientLight ( 0xffffff, 0.2);
  scene.add( ambientLight );

  directLight1 = new THREE.DirectionalLight(0xFFFFFF, 0.9);
  directLight1.position.set(numChunks * chunkSize * .5, chunkHeight, -30);
  directLight1.target.position.set(numChunks * chunkSize * .5, chunkHeight * 1 / 3, numChunks * chunkSize * .5)
  directLight1.color.setHSL( 0.1, 0.7, 0.5 );
  scene.add(directLight1);
  scene.add(directLight1.target);

  directLight2 = new THREE.DirectionalLight(0xFFFFFF, 0.3);
  directLight2.position.set(numChunks * chunkSize * .5, -chunkHeight, numChunks * chunkSize * .5 + 30);
  directLight2.target.position.set(numChunks * chunkSize * .5, chunkHeight * 1 / 3, numChunks * chunkSize * .5)
  directLight2.position.set(1, -1, -2);
  scene.add(directLight2);

  // helper = new THREE.DirectionalLightHelper(directLight1);
  // scene.add(helper);

  // helper2 = new THREE.DirectionalLightHelper(directLight2);
  // scene.add(helper2);

  makeSunGUI(gui, sun, 'Sun Position', requestRenderIfNotRequested);
}

// OBJECTS

TestCube = function(){
  var geometry = new THREE.BoxGeometry();
  var material = new THREE.MeshStandardMaterial( { color: 0x00ff00 } );
  this.mesh = new THREE.Mesh( geometry, material );
  this.mesh.receiveShadow = true;
}

function createTestObjects() {
  tcube = new TestCube();
  scene.add(tcube.mesh);
}

// noise for heightmap
var rando1 = new Alea(seed);
let gen1 = new SimplexNoise(rando1);
function noise1(nx, ny) {
  return gen1.noise2D(nx, ny) / 2 + 0.5;
}

// noise for heightmap
var rando4 = new Alea('lolzers');
let gen4 = new SimplexNoise(rando4);
function noise4(nx, ny) {
  return gen4.noise2D(nx, ny) / 2 + 0.5;
}

//noise for dirtThickness
var rando2 = new Alea('seeddees');
let gen2 = new SimplexNoise(rando2);
function noise2(x, z) {
  let scale = 0.007; // without scale, very unsmooth.
  return gen2.noise2D(scale * x, scale * z) * 256 - 128;
}

//noise for stoneThickness
var rando3 = new Alea('seed3');
let gen3 = new SimplexNoise(rando3);
function noise3(x, z) {
  let scale = 0.007; // without scale, very unsmooth.
  return gen3.noise2D(scale * x, scale * z) * 256 - 128;
}

function moveMaterial(amount, i, j, i2, j2, voxelType) {
  amount = Math.floor(amount);
  if (amount == 0) { return; }
  let h_center = heightmap[i][j];
  for (let h = h_center; h > h_center - amount; --h) {
    let currType = world.getVoxel(i, h, j);
    if (currType !== voxelType && currType !== 14) {
      amount = h_center - h;
      break;
    }
    else {
      world.setVoxel(i, h, j, 0); // delete the block
    }

  }
  heightmap[i][j] = h_center - amount;

  let h_nbr = heightmap[i2][j2];
  for (let h = h_nbr; h < h_nbr + amount; ++h) {
    world.setVoxel(i2, h, j2, voxelType);
  }
  heightmap[i2][j2] = h_nbr + amount;
}

function erodeOneIteration() {
  // thermal erosion sim
  let tan_alpha = Math.tan(alpha * Math.PI / 180);
  
  for (let i = 0; i < heightmap[0].length; ++i) {
    for (let j = 0; j < heightmap.length; ++j) {
      if (typeof heightmap[i - 1] !== 'undefined') {
        var h00 = heightmap[i - 1][j - 1];
        var h10 = heightmap[i - 1][j];
        var h20 = heightmap[i - 1][j + 1];
      }
      
      if (typeof heightmap[i] !== 'undefined') {
        var h01 = heightmap[i][j - 1];
        var h11 = heightmap[i][j];
        var h21 = heightmap[i][j + 1];
      }

      if (typeof heightmap[i + 1] !== 'undefined') {
        var h02 = heightmap[i + 1][j - 1];
        var h12 = heightmap[i + 1][j];
        var h22 = heightmap[i + 1][j + 1];
      }
      
      let neighbors = [h00, h01, h02, h10, h12, h20, h21, h22];
      let diff_max = 0;
      let diff_total = 0;
      let willMove = false;

      function helper(e) {
        if (typeof e == 'undefined') { return; }
        let d = h11 - e;
        if (d > tan_alpha) {
          willMove = true;
          if (d > diff_max) {
            diff_max = d;
          }

          diff_total += d;
        }
      }

      neighbors.forEach(element => helper(element));
      if (willMove) {
        for (let i2 = i - 1; i2 <= i + 1; ++i2) {
          for (let j2 = j - 1; j2 <= j + 1; ++j2) {
            if (i2 == i && j2 == j) { continue; }

            if (i2 < 0 || i2 >= heightmap.length || j2 < 0 || j2 >= heightmap[0].length) {
              continue;
            }

            let d = h11 - heightmap[i2][j2]
            if (d <= tan_alpha) { continue; }

            let amount = (diff_max - tan_alpha) * d / diff_total;
            let voxelType = 15;
            moveMaterial(amount, i, j, i2, j2, voxelType);
          }
        }
      }
    }
  }

  // need to update the chunk geometry for each chunk
  // i'm just choosing an arbitrary voxel to call updateVoxelGeometry on,
  // which in turn calls updateChunkGeometry
  for (let i = 0; i < numChunks; ++i) {
    for (let j = 0; j < numChunks; ++j) {
      updateVoxelGeometry(chunkSize * i + 1, chunkHeight / 2, chunkSize * j + 1);
    }
  }

  requestRenderIfNotRequested();
}

function createVoxelWorld() {
  const tileSize = 16;
  const tileTextureWidth = 16 * tileSize;
  const tileTextureHeight = 4 * tileSize;
  world = new VoxelWorld({chunkSize, chunkHeight, tileSize,
    tileTextureWidth, tileTextureHeight,});

  noise.seed(seed);

  //This is where the world gen will happen.  
  for (let y = 0; y < chunkHeight; ++y) {
    for (let x = 0; x < numChunks * chunkSize; ++x) {
      heightmap[x] = [];

      for (let z = 0; z < numChunks * chunkSize; ++z) {
        let nx = x / (numChunks * chunkSize) - 0.5, ny = y / chunkHeight - 0.5, nz = z / (numChunks * chunkSize);

        let height = Math.floor(
          noise.perlin2(nx, nz) + 
          (.25 * noise.perlin2(4 * nx, 4 * nz) + .5 * noise.perlin2(2 * nx, 2 * nz) 
            + .125 * noise.perlin2(8 * nx, 8 * nz))
         * chunkHeight) + 30;

        if (height <= 5) {
          height = 5 - Math.floor(.5 * noise4(2 * nx, 2 * nz) * 5);
        }

        heightmap[x][z] = height + 60; //increase elevation

        let dirtThickness = noise2(x, z) / 24 - 4;
        let dirtTransition = heightmap[x][z];
        let mossThickness = noise3(x, z) / 12 - 4;
        let mossTransition = dirtTransition + dirtThickness;
        let stoneThickness = noise3(x, z) / 12 - 4;
        let stoneTransition = mossTransition + mossThickness;
        let baseTransition = stoneTransition + stoneThickness;

        let voxelValue = 0;
        if (y <= baseTransition) {
          voxelValue = 3;
        }
        else if (y <= stoneTransition) {
          voxelValue = 4;
        }
        else if (y <= mossTransition) {
          voxelValue = 5;
        }
        else if (y <= dirtTransition - 1) {
          voxelValue = 15;
        }
        else if (y == dirtTransition) {
          voxelValue = 14;
        }

        world.setVoxel(x, y, z, voxelValue);
      }
    }
  }

  // thermal erosion sim
  let tan_alpha = Math.tan(alpha * Math.PI / 180);

  for (let pass = 0; pass < erosion_iterations; ++pass) {
    for (let i = 0; i < heightmap[0].length; ++i) {
      for (let j = 0; j < heightmap.length; ++j) {
        if (typeof heightmap[i - 1] !== 'undefined') {
          var h00 = heightmap[i - 1][j - 1];
          var h10 = heightmap[i - 1][j];
          var h20 = heightmap[i - 1][j + 1];
        }
        
        if (typeof heightmap[i] !== 'undefined') {
          var h01 = heightmap[i][j - 1];
          var h11 = heightmap[i][j];
          var h21 = heightmap[i][j + 1];
        }

        if (typeof heightmap[i + 1] !== 'undefined') {
          var h02 = heightmap[i + 1][j - 1];
          var h12 = heightmap[i + 1][j];
          var h22 = heightmap[i + 1][j + 1];
        }
        
        let neighbors = [h00, h01, h02, h10, h12, h20, h21, h22];
        let diff_max = 0;
        let diff_total = 0;
        let willMove = false;

        function helper(e) {
          if (typeof e == 'undefined') { return; }
          let d = h11 - e;
          if (d > tan_alpha) {
            willMove = true;
            if (d > diff_max) {
              diff_max = d;
            }

            diff_total += d;
          }
        }

        neighbors.forEach(element => helper(element));
        if (willMove) {
          for (let i2 = i - 1; i2 <= i + 1; ++i2) {
            for (let j2 = j - 1; j2 <= j + 1; ++j2) {
              if (i2 == i && j2 == j) { continue; }

              if (i2 < 0 || i2 >= heightmap.length || j2 < 0 || j2 >= heightmap[0].length) {
                continue;
              }

              let d = h11 - heightmap[i2][j2]
              if (d <= tan_alpha) { continue; }

              let amount = (diff_max - tan_alpha) * d / diff_total;
              let voxelType = 15;
              moveMaterial(amount, i, j, i2, j2, voxelType);
            }
          }
        }
      }
    }
  }

  
  // Plant Trees
  for (let horX = 0; horX < numChunks * chunkSize; horX += 5) {
    for (let horZ = 0; horZ < numChunks * chunkSize; horZ += 5) {
      let sample = noise1(horX, horZ);
      if (sample > 0.5) {
        continue;
      }

      let treeX = horX + Math.floor(Math.random() * Math.floor(3));
      let treeZ = horZ + Math.floor(Math.random() * Math.floor(3));

      if (treeX < 0) { treeX = 1; }
      if (treeX >= numChunks * chunkSize) { treeX = numChunks * chunkSize - 1; }
      if (treeZ < 0) { treeZ = 1; }
      if (treeZ >= numChunks * chunkSize) { treeZ = numChunks * chunkSize - 1; }

      // first, check bounding box around area we want to plant tree in
      // by making sure there are air blocks in a certain radius around the 
      // tree center
      let treeY = heightmap[treeX][treeZ];

      if (world.getVoxel(treeX - 4, treeY + 5, treeZ) == 0 &&
        world.getVoxel(treeX + 4, treeY + 5, treeZ) == 0 &&
        world.getVoxel(treeX, treeY + 5, treeZ + 4) == 0 &&
        world.getVoxel(treeX, treeY + 5, treeZ - 4) == 0 &&
        world.getVoxel(treeX - 4, treeY + 5, treeZ - 4) == 0 &&
        world.getVoxel(treeX + 4, treeY + 5, treeZ - 4) == 0 &&
        world.getVoxel(treeX - 4, treeY + 5, treeZ + 4) == 0 &&
        world.getVoxel(treeX + 4, treeY + 5, treeZ + 4) == 0) {
        // then, plant it if legal
        placeTree(treeX, treeY, treeZ);
      }
    }
  }

  // need to update the chunk geometry for each chunk
  // i'm just choosing an arbitrary voxel to call updateVoxelGeometry on,
  // which in turn calls updateChunkGeometry
  for (let i = 0; i < numChunks; ++i) {
    for (let j = 0; j < numChunks; ++j) {
      updateVoxelGeometry(chunkSize * i + 1, chunkHeight / 2, chunkSize * j + 1);
    }
  }

  // add clouds

  let cloudHeight = 110;

  for (let horX = 0; horX < numChunks * chunkSize; horX += 10) {
    for (let horZ = 0; horZ < numChunks * chunkSize; horZ += 10) {
      let sample = noise1(horX, horZ);
      if (sample > .2) {
        continue
      }

      let cloudX = horX + Math.floor(Math.random() * Math.floor(3));
      let cloudZ = horZ + Math.floor(Math.random() * Math.floor(3));

      if (cloudX < 0) { treeX = 1; }
      if (cloudX >= numChunks * chunkSize) { cloudX = numChunks * chunkSize - 1; }
      if (cloudZ < 0) { treeZ = 1; }
      if (cloudZ >= numChunks * chunkSize) { cloudZ = numChunks * chunkSize - 1; }

      let cloud = makeCloud();
      cloud.position.x = cloudX;
      cloud.position.z = cloudZ;
      cloud.position.y = cloudHeight + Math.floor(Math.random() * Math.floor(8)) - 4;

      scene.add(cloud);
    }
  }
}

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}

let renderRequested = false;

function animate() {
  renderRequested = undefined;

  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  let sunRadius = chunkSize * numChunks;
  directLight1.position.y = sunRadius * Math.sin(sun.degree * Math.PI / 180) + chunkHeight * 1 / 3;
  directLight1.position.z = sunRadius * Math.cos(sun.degree * Math.PI / 180) + numChunks * chunkSize / 2;
  directLight1.position.x = chunkSize * numChunks * .5;

  directLight2.position.y = -sunRadius * Math.sin(sun.degree * Math.PI / 180) + chunkHeight * 1 / 3;
  directLight2.position.z = -sunRadius * Math.cos(sun.degree * Math.PI / 180) + numChunks * chunkSize / 2;
  directLight2.position.x = chunkSize * numChunks * .5;

  newSun.y = Math.sin(sun.degree * Math.PI / 180);
  newSun.z = Math.cos(sun.degree * Math.PI / 180);
  var uniforms = sky.material.uniforms;
  uniforms[ "sunPosition" ].value.copy( newSun );


  directLight1.target.updateMatrixWorld();
  directLight2.target.updateMatrixWorld();

  controls.update();
  renderer.render( scene, camera );
}

function requestRenderIfNotRequested() {
  if (!renderRequested) {
    renderRequested = true;
    requestAnimationFrame(animate);
  }
}

function reloadLevel() {
  heightmap = [[], []];
  createVoxelWorld()
  for (let i = 0; i < previousNumChunks; ++i) {
    for (let j = 0; j < previousNumChunks; ++j) {
      updateVoxelGeometry(chunkSize * i + 1, chunkHeight / 2, chunkSize * j + 1);
    }
  }
  controls.target.set(numChunks * chunkSize / 2, chunkHeight / 2, numChunks * chunkSize / 2);  
  camera.position.set(
    -chunkSize * .3, chunkHeight * .8, -chunkSize * .3
  );
  controls.update()
  animate()
}

// this is our main function
function init() {

  createScene();
  initSky();
  createLights();
  makeWorldParamGUI();
  makeErodeGUI();
  makeReloadGUI();

  createVoxelWorld();
  animate();

  // need to add event listeners since we are only
  // animating on demand - no animation loop.
  controls.addEventListener('change', requestRenderIfNotRequested);
  window.addEventListener('resize', animate);

  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    recordStartPosition(event);
    window.addEventListener('pointermove', recordMovement);
    window.addEventListener('pointerup', placeVoxelIfNoMovement);
  }, {passive: false});
  canvas.addEventListener('touchstart', (event) => {
    event.preventDefault();
    recordStartPosition(event.touches[0]);
  }, {passive: false});
  canvas.addEventListener('touchmove', (event) => {
    event.preventDefault();
    recordMovement(event.touches[0]);
  }, {passive: false});
  canvas.addEventListener('touchend', () => {
    placeVoxelIfNoMovement({
      clientX: mouse.x,
      clientY: mouse.y,
    });
  });

}

window.addEventListener('load', init);

// RAY CASTING CODE

function getCanvasRelativePosition(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width  / rect.width,
    y: (event.clientY - rect.top ) * canvas.height / rect.height,
  };
}

const mouse = {
  x: 0,
  y: 0,
};
 
function recordStartPosition(event) {
  mouse.x = event.clientX;
  mouse.y = event.clientY;
  mouse.moveX = 0;
  mouse.moveY = 0;
}
function recordMovement(event) {
  mouse.moveX += Math.abs(mouse.x - event.clientX);
  mouse.moveY += Math.abs(mouse.y - event.clientY);
}
function placeVoxelIfNoMovement(event) {
  if (event.which == 2 || event.button == 4) {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      voxelToPlace = getVoxelFromRaycast(event);
    }
  }
  else if (event.wich == 3 || event.button == 2) {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      placeVoxel(event, voxelToPlace);
    }
  }
  else {
    if (mouse.moveX < 5 && mouse.moveY < 5) {
      placeVoxel(event, 0); // delete block
    }
  }
  
  window.removeEventListener('mousemove', recordMovement);
  window.removeEventListener('mouseup', placeVoxelIfNoMovement);
}