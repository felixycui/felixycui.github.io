
// THREEJS RELATED VARIABLES

var scene, camera, renderer, controls, texture;
var canvas;

// SCREEN AND MOUSE VARIABLES

var HEIGHT, WIDTH,
    mousePos = { x: 0, y: 0 };

const gui = new dat.GUI();

// WORLD VARS

var chunkSize, chunkHeight, world, voxelWorldMaterial;
var numChunks;
var heightmap = [[], []];
const seed = 'seeds'; // arbitrary seed string
var sky, newSun;

// Voxel World Functions 

function createScene() {
  chunkSize = 16; // originally set chunk size to be 32 x 32 x 32
  chunkHeight = 180;
  numChunks = 6; // number of chunks in our n x n world

  scene = new THREE.Scene();
  scene.background = new THREE.Color('lightblue');
  // scene.fog = new THREE.Fog(0xf7d9aa, 100, 950);
  camera = new THREE.PerspectiveCamera( 75, window.innerWidth / window.innerHeight, 0.1, 1000 );
  // renderer = new THREE.WebGLRenderer({ antialias: true});

  canvas = document.querySelector('#c');
  renderer = new THREE.WebGLRenderer({canvas, antialias: true});
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.5;

  // renderer.setSize( window.innerWidth, window.innerHeight );
  // sets renderer background color
  // renderer.setClearColor("#222222");
  // document.body.appendChild( renderer.domElement )

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
  // texture = loader.load('resources/sample_tex.png', animate);
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
    // inclination: 0.49, // elevation / inclination
    azimuth: 0.25, // Facing front,
    exposure: renderer.toneMappingExposure
  };

  function guiChanged() {

    var uniforms = sky.material.uniforms;
    uniforms[ "turbidity" ].value = effectController.turbidity;
    uniforms[ "rayleigh" ].value = effectController.rayleigh;
    uniforms[ "mieCoefficient" ].value = effectController.mieCoefficient;
    uniforms[ "mieDirectionalG" ].value = effectController.mieDirectionalG;

    // var theta = Math.PI * ( effectController.inclination - 0.5 );
    var phi = 2 * Math.PI * ( effectController.azimuth - 0.5 );

    newSun.x = Math.cos( phi );
    // newSun.y = Math.sin( phi ) * Math.sin( theta );
    // newSun.z = Math.sin( phi ) * Math.cos( theta );

    uniforms[ "sunPosition" ].value.copy( newSun );

    renderer.toneMappingExposure = effectController.exposure;
    requestRenderIfNotRequested();

  }

  const folder = gui.addFolder("Sun Variables")
  folder.add( effectController, "turbidity", 0.0, 20.0, 0.1 ).onChange( guiChanged );
  folder.add( effectController, "rayleigh", 0.0, 4, 0.001 ).onChange( guiChanged );
  folder.add( effectController, "mieCoefficient", 0.0, 0.1, 0.001 ).onChange( guiChanged );
  folder.add( effectController, "mieDirectionalG", 0.0, 1, 0.001 ).onChange( guiChanged );
  // gui.add( effectController, "inclination", 0, 1, 0.0001 ).onChange( guiChanged );
  // gui.add( effectController, "azimuth", 0, 1, 0.0001 ).onChange( guiChanged );
  folder.add( effectController, "exposure", 0, 1, 0.0001 ).onChange( guiChanged );

  guiChanged();


}


const chunkIdToMesh = {};

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

function placeVoxel(event) {
  const pos = getCanvasRelativePosition(event);
  const x = (pos.x / canvas.width ) *  2 - 1;
  const y = (pos.y / canvas.height) * -2 + 1;  // note we flip Y
 
  const start = new THREE.Vector3();
  const end = new THREE.Vector3();
  start.setFromMatrixPosition(camera.matrixWorld);
  end.set(x, y, 1).unproject(camera);


  const intersection = world.intersectRay(start, end);  
  if (intersection) {
    const voxelId = 1; // for now
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
  folder.open();
}

function makeXYZGUI(gui, vector3, name, onChangeFunction) {
  const folder = gui.addFolder(name);
  folder.add(vector3, 'x', -numChunks * chunkSize * .5, numChunks * chunkSize).onChange(onChangeFunction);
  folder.add(vector3, 'y', 0, 10).onChange(onChangeFunction);
  folder.add(vector3, 'z', -10, 10).onChange(onChangeFunction);
  folder.open();
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
  // tcube.mesh.position.y = -1;
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
  // TODO: only move the material specified in the voxelType. That is,
  // remove only voxelType blocks and don't remove non-voxelType voxels.
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

function createVoxelWorld() {
  const tileSize = 16;
  const tileTextureWidth = 16 * tileSize;
  const tileTextureHeight = 4 * tileSize;
  world = new VoxelWorld({chunkSize, chunkHeight, tileSize,
    tileTextureWidth, tileTextureHeight,});

  noise.seed(1234);

  //This is where the world gen will happen.  
  for (let y = 0; y < chunkHeight; ++y) {
    for (let x = 0; x < numChunks * chunkSize; ++x) {
      heightmap[x] = [];

      for (let z = 0; z < numChunks * chunkSize; ++z) {
        let nx = x / (numChunks * chunkSize) - 0.5, ny = y / chunkHeight - 0.5, nz = z / (numChunks * chunkSize);
        // const height = Math.floor((
        //   noise1(nx, nz) + .5 * noise1(2 * nx, 2 * ny) + .25 * noise1(4 * nx, 4 * ny)
        //   ) * chunkHeight) - 20;

        let height = Math.floor(
          noise.perlin2(nx, nz) + 
          (.25 * noise.perlin2(4 * nx, 4 * nz) + .5 * noise.perlin2(2 * nx, 2 * nz) 
            + .125 * noise.perlin2(8 * nx, 8 * nz))
         * chunkHeight) + 30;

        // height = Math.floor(Math.pow(height, 1.05));
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

        // old gen code
        // if (y == height) {
        //   world.setVoxel(x, height, z, 14);
        // }
        // else if (y < height && y > 30) {
        //   world.setVoxel(x, y, z, 15);
        // }
        // else if (y <= 30 && y < height - 1) {
        //   world.setVoxel(x, y, z, 3);
        // }

        // const height = (Math.sin(x / (numChunks * chunkSize) * Math.PI * 2) + Math.sin(z / (numChunks * chunkSize) * Math.PI * 3)) * (chunkSize / 6) + (chunkSize / 2);
        // if (y < height + 64 && y >= height + 63) {
        //   world.setVoxel(x, y, z, 14);
        // }
        // else if (y < height + 63 && y > 30) {
        //   world.setVoxel(x, y, z, 15);
        // }
        // else if (y <= 30) {
        //   world.setVoxel(x, y, z, 3);
        // }
      }
    }
  }

  console.log("done!");

  // thermal erosion sim
  let alpha = 55 // angle of repose in degrees; in this case we will just move dirt
  let tan_alpha = Math.tan(alpha * Math.PI / 180);

  for (let pass = 0; pass < 4; ++pass) {
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

  // one more iteration to convert dirt blocks to grass
  // for (let i = 0; i < heightmap[0].length; ++i) {
  //   for (let j = 0; j < heightmap.length; ++j) {
  //     let h = heightmap[i][j];
  //     if (world.getVoxel(i, h, j) == 15) {
  //       world.setVoxel(i, h, j, 14);
  //     }
  //   }
  // }
  console.log("done2!");

  // need to update the chunk geometry for each chunk
  // i'm just choosing an arbitrary voxel to call updateVoxelGeometry on,
  // which in turn calls updateChunkGeometry
  for (let i = 0; i < numChunks; ++i) {
    for (let j = 0; j < numChunks; ++j) {
      updateVoxelGeometry(chunkSize * i + 1, chunkHeight / 2, chunkSize * j + 1);
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

function init() {

  createScene();
  initSky();

  createLights();
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
  if (mouse.moveX < 5 && mouse.moveY < 5) {
    placeVoxel(event);
  }
  window.removeEventListener('mousemove', recordMovement);
  window.removeEventListener('mouseup', placeVoxelIfNoMovement);
}
