class VoxelWorld {
	constructor(options) {
		this.chunkSize = options.chunkSize;
		this.chunkHeight = options.chunkHeight;
		this.chunkSliceSize = options.chunkSize * options.chunkSize;
		// this.chunk = new Uint8Array(options.chunkHeight * options.chunkSize * options.chunkSize);
		this.chunks = {};

		// texture stuff
		this.tileSize = options.tileSize; // size of texture tile for a face
		this.tileTextureWidth = options.tileTextureWidth;
		this.tileTextureHeight = options.tileTextureHeight;
	}

	// chunks have ids associated with them in the format "x,y,z"
	computeChunkId(x, y, z) {
		const {chunkSize, chunkHeight} = this;
		const chunkX = Math.floor(x / chunkSize);
		const chunkY = Math.floor(y / chunkHeight);
		const chunkZ = Math.floor(z / chunkSize);
		return `${chunkX},${chunkY},${chunkZ}`;
	}

	// returns the chunk we are in
	getChunkForVoxel(x, y, z) {
		// const {chunkSize, chunkHeight} = this;
		// const chunkX = Math.floor(x / chunkSize);
		// const chunkY = Math.floor(y / chunkHeight);
		// const chunkZ = Math.floor(z / chunkSize);
		// if (chunkX !== 0 || chunkY !== 0 || chunkZ !== 0) {
		// 	return null;
		// }
		// return this.chunk;
		return this.chunks[this.computeChunkId(x, y, z)];
	}

	addChunkForVoxel(x, y, z) {
		const chunkId = this.computeChunkId(x, y, z);
		let chunk = this.chunks[chunkId];
		if (!chunk) {
			const {chunkSize, chunkHeight} = this;
			chunk = new Uint8Array(chunkHeight * chunkSize * chunkSize);
			this.chunks[chunkId] = chunk;
		}
		return chunk;
	}

	// set a voxel with value v
	setVoxel(x, y, z, v, addChunk = true) {
		// const chunk = this.getChunkForVoxel(x, y, z);
		let chunk = this.getChunkForVoxel(x, y, z);
		if (!chunk) {
			if (!addChunk) {
				return;
			}
			chunk = this.addChunkForVoxel(x, y, z);
		}

		const {chunkSize, chunkHeight, chunkSliceSize} = this;
		const voxelX = THREE.MathUtils.euclideanModulo(x, chunkSize) | 0;
		const voxelY = THREE.MathUtils.euclideanModulo(y, chunkHeight) | 0;
		const voxelZ = THREE.MathUtils.euclideanModulo(z, chunkSize) | 0;
		const voxelOffset = voxelY * chunkSliceSize + voxelZ * chunkSize + voxelX;

		chunk[voxelOffset] = v;
	}

	// returns the voxel given (it's an int)
	getVoxel(x, y, z) {
		const chunk = this.getChunkForVoxel(x, y, z);
		if (!chunk) {
			return 0;
		}
		const {chunkSize, chunkHeight, chunkSliceSize} = this;
		const voxelX = THREE.MathUtils.euclideanModulo(x, chunkSize) | 0;
		const voxelY = THREE.MathUtils.euclideanModulo(y, chunkHeight) | 0;
		const voxelZ = THREE.MathUtils.euclideanModulo(z, chunkSize) | 0;
		const voxelOffset = voxelY * chunkSliceSize + voxelZ * chunkSize + voxelX;

		return chunk[voxelOffset];
	}

	genChunkGeometryData(cX, cY, cZ) {
		const {chunkSize, chunkHeight, tileSize, tileTextureWidth, tileTextureHeight} = this;
	    const positions = [];
	    const normals = [];
	    const indices = [];
	    const uvs = [];
	    const startX = cX * chunkSize;
	    const startY = cY * chunkHeight;
	    const startZ = cZ * chunkSize;

	    for (let y = 0; y < chunkHeight; ++y) {
	      const voxelY = startY + y;
	      for (let z = 0; z < chunkSize; ++z) {
	        const voxelZ = startZ + z;
	        for (let x = 0; x < chunkSize; ++x) {
	          const voxelX = startX + x;
	          const voxel = this.getVoxel(voxelX, voxelY, voxelZ);
	          if (voxel) {
	          	const uvVoxel = voxel - 1; // voxel 0 is air, so UVs start at 0
	            for (const {dir, corners, uvRow} of VoxelWorld.faces) {
	              const neighbor = this.getVoxel(
	                  voxelX + dir[0],
	                  voxelY + dir[1],
	                  voxelZ + dir[2]);
	              if (!neighbor) {
						// need to generate a face since
						// there is no neigbhor
						const ndx = positions.length / 3;
						for (const {pos, uv} of corners) {
							positions.push(pos[0] + x, pos[1] + y, pos[2] + z);
							normals.push(...dir);
							uvs.push(
									(uvVoxel + uv[0]) * tileSize / tileTextureWidth,
									1 - (uvRow + 1 - uv[1]) * tileSize / tileTextureHeight
								);
						}
						indices.push(
							ndx, ndx + 1, ndx + 2,
							ndx + 2, ndx + 1, ndx + 3
						);

					}
	            }
	          }
	        }
	      }
	    }

	    return {
	      positions,
	      normals,
	      uvs,
	      indices,
	    };
	}

	// from
    // http://www.cse.chalmers.se/edu/year/2010/course/TDA361/grid.pdf
    intersectRay(start, end) {
    let dx = end.x - start.x;
    let dy = end.y - start.y;
    let dz = end.z - start.z;
    const lenSq = dx * dx + dy * dy + dz * dz;
    const len = Math.sqrt(lenSq);

    dx /= len;
    dy /= len;
    dz /= len;

    let t = 0.0;
    let ix = Math.floor(start.x);
    let iy = Math.floor(start.y);
    let iz = Math.floor(start.z);

    const stepX = (dx > 0) ? 1 : -1;
    const stepY = (dy > 0) ? 1 : -1;
    const stepZ = (dz > 0) ? 1 : -1;

    const txDelta = Math.abs(1 / dx);
    const tyDelta = Math.abs(1 / dy);
    const tzDelta = Math.abs(1 / dz);

    const xDist = (stepX > 0) ? (ix + 1 - start.x) : (start.x - ix);
    const yDist = (stepY > 0) ? (iy + 1 - start.y) : (start.y - iy);
    const zDist = (stepZ > 0) ? (iz + 1 - start.z) : (start.z - iz);

    // location of nearest voxel boundary, in units of t
    let txMax = (txDelta < Infinity) ? txDelta * xDist : Infinity;
    let tyMax = (tyDelta < Infinity) ? tyDelta * yDist : Infinity;
    let tzMax = (tzDelta < Infinity) ? tzDelta * zDist : Infinity;

    let steppedIndex = -1;

    // main loop along raycast vector
    while (t <= len) {
      const voxel = this.getVoxel(ix, iy, iz);
      if (voxel) {
        return {
          position: [
            start.x + t * dx,
            start.y + t * dy,
            start.z + t * dz,
          ],
          normal: [
            steppedIndex === 0 ? -stepX : 0,
            steppedIndex === 1 ? -stepY : 0,
            steppedIndex === 2 ? -stepZ : 0,
          ],
          voxel,
        };
      }

      // advance t to next nearest voxel boundary
      if (txMax < tyMax) {
        if (txMax < tzMax) {
          ix += stepX;
          t = txMax;
          txMax += txDelta;
          steppedIndex = 0;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      } else {
        if (tyMax < tzMax) {
          iy += stepY;
          t = tyMax;
          tyMax += tyDelta;
          steppedIndex = 1;
        } else {
          iz += stepZ;
          t = tzMax;
          tzMax += tzDelta;
          steppedIndex = 2;
        }
      }
    }
    return null;
  }
}

VoxelWorld.faces = [
	{ // left
		uvRow: 0,
    	dir: [ -1,  0,  0, ],
    	corners: [
			{ pos: [ 0, 1, 0 ], uv: [0, 1], },
			{ pos: [ 0, 0, 0 ], uv: [0, 0], },
			{ pos: [ 0, 1, 1 ], uv: [1, 1], },
			{ pos: [ 0, 0, 1 ], uv: [1, 0], },
	    ],

	},
	{ // right
		uvRow: 0,
		dir: [  1,  0,  0, ],
		corners: [
			{ pos: [ 1, 1, 1 ], uv: [0, 1], },
			{ pos: [ 1, 0, 1 ], uv: [0, 0], },
			{ pos: [ 1, 1, 0 ], uv: [1, 1], },
			{ pos: [ 1, 0, 0 ], uv: [1, 0], },
	    ],
	},
	{ // bottom
		uvRow: 1,
		dir: [  0, -1,  0, ],
		corners: [
			{ pos: [ 1, 0, 1 ], uv: [1, 0], },
			{ pos: [ 0, 0, 1 ], uv: [0, 0], },
			{ pos: [ 1, 0, 0 ], uv: [1, 1], },
			{ pos: [ 0, 0, 0 ], uv: [0, 1], },
	    ],
	},
	{ // top
		uvRow: 2,
		dir: [  0,  1,  0, ],
		corners: [
			{ pos: [ 0, 1, 1 ], uv: [1, 1], },
			{ pos: [ 1, 1, 1 ], uv: [0, 1], },
			{ pos: [ 0, 1, 0 ], uv: [1, 0], },
			{ pos: [ 1, 1, 0 ], uv: [0, 0], },
	    ],
	},
	{ // back
		uvRow: 0,
		dir: [  0,  0, -1, ],
		corners: [
			{ pos: [ 1, 0, 0 ], uv: [0, 0], },
			{ pos: [ 0, 0, 0 ], uv: [1, 0], },
			{ pos: [ 1, 1, 0 ], uv: [0, 1], },
			{ pos: [ 0, 1, 0 ], uv: [1, 1], },
	    ],
	},
	{ // front
		uvRow: 0,
		dir: [  0,  0,  1, ],
		corners: [
			{ pos: [ 0, 0, 1 ], uv: [0, 0], },
			{ pos: [ 1, 0, 1 ], uv: [1, 0], },
			{ pos: [ 0, 1, 1 ], uv: [0, 1], },
			{ pos: [ 1, 1, 1 ], uv: [1, 1], },
	    ],
	},
];

