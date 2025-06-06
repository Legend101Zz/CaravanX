/**
 * VoxelEngine - 3D voxel-based rendering engine for blockchain visualization
 */
class VoxelEngine {
  constructor(container) {
    // Initialize Three.js scene
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb); // Sky blue

    // Initialize camera
    this.camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000,
    );
    this.camera.position.set(0, 5, 10);

    // Initialize renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Create a camera container for movement
    this.cameraContainer = new THREE.Object3D();
    this.cameraContainer.position.set(0, 5, 10);
    this.scene.add(this.cameraContainer);
    this.cameraContainer.add(this.camera);

    // Initialize pointer lock controls
    // Check if PointerLockControls is available, if not use a fallback
    if (typeof THREE.PointerLockControls === "function") {
      try {
        this.controls = new THREE.PointerLockControls(
          this.camera,
          document.body,
        );
        this.controls.pointerSpeed = 0.2;
      } catch (error) {
        console.error("Could not initialize PointerLockControls:", error);
        this.useFallbackControls();
      }
    } else {
      console.warn(
        "THREE.PointerLockControls not found, using fallback controls",
      );
      this.useFallbackControls();
    }

    // Player physics and movement
    this.playerVelocity = new THREE.Vector3();
    this.playerDirection = new THREE.Vector3();
    this.gravity = 0.2;
    this.playerSpeed = 0.1;
    this.jumpForce = 0.5;
    this.playerHeight = 1.8;
    this.playerRadius = 0.4;
    this.playerOnGround = false;

    // Input state
    this.keyStates = {
      moveForward: false,
      moveBackward: false,
      moveLeft: false,
      moveRight: false,
      jump: false,
    };

    // World data
    this.worldData = {};
    this.chunks = {};
    this.buildings = [];
    this.characters = [];

    // Current selected tool
    this.currentTool = "pickaxe";

    // Setup lights and environment
    this.setupLighting();

    // Initialize the clock for animations
    this.clock = new THREE.Clock();

    // Raycaster for block interactions
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Start animation loop
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);

    // Handle window resize
    window.addEventListener("resize", this.onWindowResize.bind(this));

    // Handle mouse click
    document.addEventListener("click", this.onMouseClick.bind(this));

    // Add click event to lock controls
    document.addEventListener("click", () => {
      if (this.controls && this.controls.isLocked === false) {
        this.controls.lock();
      }
    });

    // Generate noise for terrain
    this.noise = {
      simplex2: function (x, y) {
        // Simple placeholder noise function (would use a proper library in production)
        return Math.sin(x * 0.1) * Math.cos(y * 0.1) * 0.5;
      },
    };
  }

  animate() {
    const delta = this.clock.getDelta();

    // Update the player (movement, physics)
    this.updatePlayerPosition(delta);

    // Update any mining progress & particles
    this.updateMiningProgress(delta);
    if (this.miningParticles) {
      // you may want to animate your particles here
      this.miningParticles.children.forEach((p) => {
        p.position.add(p.userData.velocity.clone().multiplyScalar(delta * 60));
        p.userData.velocity.y -= this.gravity * delta * 60;
      });
    }

    // Render the scene
    this.renderer.render(this.scene, this.camera);

    // Schedule next frame
    requestAnimationFrame(this.animate);
  }

  // Create a fallback control mechanism if PointerLockControls doesn't work
  useFallbackControls() {
    this.controls = {
      isLocked: false,
      lock: function () {
        this.isLocked = true;
        document.body.requestPointerLock =
          document.body.requestPointerLock ||
          document.body.mozRequestPointerLock ||
          document.body.webkitRequestPointerLock;
        if (document.body.requestPointerLock) {
          document.body.requestPointerLock();
        }
      },
      unlock: function () {
        this.isLocked = false;
        document.exitPointerLock =
          document.exitPointerLock ||
          document.mozExitPointerLock ||
          document.webkitExitPointerLock;
        if (document.exitPointerLock) {
          document.exitPointerLock();
        }
      },
      getObject: function () {
        return this.cameraContainer;
      }.bind(this),
    };

    // Add pointer lock event listeners for the fallback controls
    document.addEventListener(
      "pointerlockchange",
      this.onPointerLockChange.bind(this),
      false,
    );
    document.addEventListener(
      "mozpointerlockchange",
      this.onPointerLockChange.bind(this),
      false,
    );
    document.addEventListener(
      "webkitpointerlockchange",
      this.onPointerLockChange.bind(this),
      false,
    );

    // Add mouse movement handler
    document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
  }

  onPointerLockChange() {
    if (
      document.pointerLockElement === document.body ||
      document.mozPointerLockElement === document.body ||
      document.webkitPointerLockElement === document.body
    ) {
      this.controls.isLocked = true;
    } else {
      this.controls.isLocked = false;
    }
  }

  onMouseMove(event) {
    if (this.controls.isLocked) {
      const movementX =
        event.movementX || event.mozMovementX || event.webkitMovementX || 0;
      const movementY =
        event.movementY || event.mozMovementY || event.webkitMovementY || 0;

      // Rotate camera based on mouse movement
      this.camera.rotation.y -= movementX * 0.002; // Horizontal rotation
      this.camera.rotation.x -= movementY * 0.002; // Vertical rotation

      // Limit vertical rotation to avoid flipping
      this.camera.rotation.x = Math.max(
        -Math.PI / 2,
        Math.min(Math.PI / 2, this.camera.rotation.x),
      );
    }
  }

  setupLighting() {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0x666666);
    this.scene.add(ambientLight);

    // Add directional light (sun)
    this.sunLight = new THREE.DirectionalLight(0xffffff, 1);
    this.sunLight.position.set(100, 100, 50);
    this.sunLight.castShadow = true;

    // Set shadow properties
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 0.5;
    this.sunLight.shadow.camera.far = 500;
    this.sunLight.shadow.camera.left = -100;
    this.sunLight.shadow.camera.right = 100;
    this.sunLight.shadow.camera.top = 100;
    this.sunLight.shadow.camera.bottom = -100;

    this.scene.add(this.sunLight);

    // Add hemisphere light
    const hemiLight = new THREE.HemisphereLight(0x0088ff, 0x00ff88, 0.5);
    this.scene.add(hemiLight);
  }

  onWindowResize() {
    // Update camera aspect ratio
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();

    // Update renderer size
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  onMouseClick(event) {
    // Only handle click if controls are locked
    if (!this.controls.isLocked) return;

    // Set raycaster from camera
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // Check for intersections with blocks
    const intersects = this.raycaster.intersectObjects(
      this.scene.children,
      true,
    );

    if (intersects.length > 0) {
      const intersection = intersects[0];
      const object = intersection.object;

      // Check if it's a block
      if (object.blockData) {
        this.handleBlockClick(object, intersection);
      }
      // Check if it's a character
      else if (object.characterType) {
        this.handleCharacterClick(object);
      }
    }
  }

  handleBlockClick(block, intersection) {
    console.log("Clicked on block:", block.blockData);

    // Handle based on current tool
    switch (this.currentTool) {
      case "pickaxe":
        this.mineBlock(block, intersection);
        break;
      case "shovel":
        // Handle shovel interaction
        break;
      case "compass":
        this.showBlockInfo(block);
        break;
      default:
        // Default interaction
        break;
    }
  }

  handleCharacterClick(character) {
    console.log("Clicked on character:", character.characterType);
    // Trigger interaction with character
    if (this.onCharacterInteraction) {
      this.onCharacterInteraction(character);
    }
  }

  mineBlock(block, intersection) {
    // Create mining effect
    this.createMiningParticles(intersection.point);

    // Start mining progress
    if (!this.miningProgress) {
      this.miningProgress = {
        block: block,
        progress: 0,
        position: intersection.point.clone(),
        complete: false,
      };
    }
  }

  showBlockInfo(block) {
    // Show information about the block
    if (this.onShowBlockInfo) {
      this.onShowBlockInfo(block);
    }
  }

  createMiningParticles(position) {
    // Create particle geometry
    const particleCount = 20;
    const particles = new THREE.Group();

    for (let i = 0; i < particleCount; i++) {
      const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.1);
      const material = new THREE.MeshBasicMaterial({
        color: 0xaaaaaa,
        transparent: true,
        opacity: 0.8,
      });

      const particle = new THREE.Mesh(geometry, material);

      // Set initial position
      particle.position.copy(position);

      // Add random velocity
      particle.userData.velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 0.1,
        Math.random() * 0.1 + 0.05,
        (Math.random() - 0.5) * 0.1,
      );

      // Add to group
      particles.add(particle);
    }

    // Add to scene
    this.scene.add(particles);

    // Store reference to remove later
    this.miningParticles = particles;

    // Set timeout to remove particles
    setTimeout(() => {
      this.scene.remove(particles);
      this.miningParticles = null;
    }, 1000);
  }

  updateMiningProgress(delta) {
    if (!this.miningProgress) return;

    // Update progress based on tool and block
    const miningSpeed = 0.5; // Base mining speed
    this.miningProgress.progress += miningSpeed * delta;

    // Check if mining is complete
    if (this.miningProgress.progress >= 1) {
      // Mining complete
      this.miningProgress.complete = true;

      // Remove the block
      this.scene.remove(this.miningProgress.block);

      // Call completion callback
      if (this.onBlockMined) {
        this.onBlockMined(this.miningProgress.block);
      }

      // Reset mining progress
      this.miningProgress = null;
    }
  }

  createBlock(x, y, z, type) {
    // Create block geometry and material
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = this.getBlockMaterial(type);

    // Create mesh
    const block = new THREE.Mesh(geometry, material);
    block.position.set(x, y, z);
    block.castShadow = true;
    block.receiveShadow = true;

    // Store block data
    block.blockData = { type, x, y, z };

    // Add to scene
    this.scene.add(block);

    // Store in world data
    this.setVoxel(x, y, z, { type });

    return block;
  }

  getBlockMaterial(type) {
    // Load texture for block type
    const textureLoader = new THREE.TextureLoader();
    let texture;

    try {
      texture = textureLoader.load(`assets/blocks/${type}.png`);
      // Set pixel texture filtering
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
    } catch (error) {
      console.warn(`Texture for ${type} not found, using fallback`);
    }

    // Create material based on block type
    switch (type) {
      case "grass":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0x55aa55,
        });
      case "stone":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0x888888,
        });
      case "gold":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0xffcc00,
          metalness: 0.7,
          roughness: 0.3,
        });
      case "building":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0xaa8866,
        });
      default:
        return new THREE.MeshStandardMaterial({
          color: 0xffffff,
        });
    }
  }

  setVoxel(x, y, z, data) {
    // Store voxel data in chunks
    const chunkSize = 16;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);

    const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

    if (!this.chunks[chunkKey]) {
      this.chunks[chunkKey] = {};
    }

    const localX = x - chunkX * chunkSize;
    const localY = y - chunkY * chunkSize;
    const localZ = z - chunkZ * chunkSize;

    const localKey = `${localX},${localY},${localZ}`;
    this.chunks[chunkKey][localKey] = data;
  }

  getVoxel(x, y, z) {
    // Get voxel data from chunks
    const chunkSize = 16;
    const chunkX = Math.floor(x / chunkSize);
    const chunkY = Math.floor(y / chunkSize);
    const chunkZ = Math.floor(z / chunkSize);

    const chunkKey = `${chunkX},${chunkY},${chunkZ}`;

    if (!this.chunks[chunkKey]) {
      return null;
    }

    const localX = x - chunkX * chunkSize;
    const localY = y - chunkY * chunkSize;
    const localZ = z - chunkZ * chunkSize;

    const localKey = `${localX},${localY},${localZ}`;
    return this.chunks[chunkKey][localKey];
  }

  generateTerrain(centerX, centerZ, radius) {
    // Generate flat terrain with some random elevation
    const blocks = [];

    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let z = centerZ - radius; z <= centerZ + radius; z++) {
        // Calculate base height using noise
        const height = Math.floor(this.noise.simplex2(x * 0.1, z * 0.1) * 3);

        // Create the ground block
        const block = this.createBlock(x, height, z, "grass");
        blocks.push(block);

        // Create stone blocks underneath
        for (let y = height - 1; y >= height - 3; y--) {
          const stoneBlock = this.createBlock(x, y, z, "stone");
          blocks.push(stoneBlock);
        }
      }
    }

    return blocks;
  }

  createBlockchainBuilding(blockData, x, z) {
    // Calculate building dimensions based on block data
    const height = Math.max(
      4,
      Math.min(16, Math.floor(blockData.size / 1000) + 4),
    );
    const width = Math.max(
      3,
      Math.min(7, Math.floor(blockData.txCount / 3) + 3),
    );
    const depth = width;

    const buildingBlocks = [];

    // Create foundation
    for (let bx = 0; bx < width; bx++) {
      for (let bz = 0; bz < depth; bz++) {
        const block = this.createBlock(x + bx, 0, z + bz, "stone");
        buildingBlocks.push(block);
      }
    }

    // Create walls
    for (let y = 1; y < height; y++) {
      for (let bx = 0; bx < width; bx++) {
        for (let bz = 0; bz < depth; bz++) {
          // Only create blocks for walls and floors
          if (
            bx === 0 ||
            bx === width - 1 ||
            bz === 0 ||
            bz === depth - 1 ||
            y % 3 === 0
          ) {
            const block = this.createBlock(x + bx, y, z + bz, "building");
            buildingBlocks.push(block);
          }
        }
      }
    }

    // Create roof
    for (let bx = 0; bx < width; bx++) {
      for (let bz = 0; bz < depth; bz++) {
        const block = this.createBlock(x + bx, height, z + bz, "building");
        buildingBlocks.push(block);
      }
    }

    // Add a gold block on top to represent the block hash
    const hashBlock = this.createBlock(
      x + Math.floor(width / 2),
      height + 1,
      z + Math.floor(depth / 2),
      "gold",
    );
    buildingBlocks.push(hashBlock);

    // Store building data
    const building = {
      blocks: buildingBlocks,
      data: blockData,
      position: new THREE.Vector3(x, 0, z),
      dimensions: { width, height, depth },
    };

    this.buildings.push(building);

    return building;
  }

  createCharacter(type, x, y, z) {
    // Create character model
    const geometry = new THREE.BoxGeometry(0.6, 1.8, 0.6);
    const material = this.getCharacterMaterial(type);

    const character = new THREE.Mesh(geometry, material);
    character.position.set(x, y, z);
    character.castShadow = true;
    character.receiveShadow = true;

    // Add character data
    character.characterType = type;
    character.userData.isCharacter = true;

    // Add to scene
    this.scene.add(character);
    this.characters.push(character);

    return character;
  }

  getCharacterMaterial(type) {
    // Load texture for character type
    const textureLoader = new THREE.TextureLoader();
    let texture;

    try {
      texture = textureLoader.load(`assets/characters/${type}.png`);
      // Set pixel texture filtering
      texture.magFilter = THREE.NearestFilter;
      texture.minFilter = THREE.NearestFilter;
    } catch (error) {
      console.warn(`Texture for character ${type} not found, using fallback`);
    }

    // Create material based on character type
    switch (type) {
      case "miner":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0xffaa00,
        });
      case "transaction":
        return new THREE.MeshStandardMaterial({
          map: texture || null,
          color: texture ? 0xffffff : 0x00aaff,
        });
      default:
        return new THREE.MeshStandardMaterial({
          color: 0xaaaaaa,
        });
    }
  }

  updatePlayerPosition(delta) {
    if (!this.controls.isLocked) return;

    // Get camera direction
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    direction.y = 0;
    direction.normalize();

    // Get right vector (perpendicular to direction)
    const right = new THREE.Vector3(-direction.z, 0, direction.x);

    // Update velocity based on input
    this.playerVelocity.x = 0;
    this.playerVelocity.z = 0;

    if (this.keyStates.moveForward) {
      this.playerVelocity.add(direction.multiplyScalar(this.playerSpeed));
    }
    if (this.keyStates.moveBackward) {
      this.playerVelocity.add(direction.multiplyScalar(-this.playerSpeed));
    }
    if (this.keyStates.moveRight) {
      this.playerVelocity.add(right.multiplyScalar(this.playerSpeed));
    }
    if (this.keyStates.moveLeft) {
      this.playerVelocity.add(right.multiplyScalar(-this.playerSpeed));
    }

    // Handle jumping
    if (this.keyStates.jump && this.playerOnGround) {
      this.playerVelocity.y = this.jumpForce;
      this.playerOnGround = false;
    }

    // Apply gravity
    if (!this.playerOnGround) {
      this.playerVelocity.y -= this.gravity;
    }

    // Update position
    const deltaPosition = this.playerVelocity
      .clone()
      .multiplyScalar(delta * 60);

    // Get the object to move (either controls object or camera container)
    const moveObject = this.controls.getObject
      ? this.controls.getObject()
      : this.cameraContainer;
    moveObject.position.add(deltaPosition);

    // Check collision with ground
    if (moveObject.position.y < this.playerHeight) {
      moveObject.position.y = this.playerHeight;
      this.playerVelocity.y = 0;
      this.playerOnGround = true;
    }

    // Check collision with walls
    // (This is a simplified collision check)
    this.checkCollisions();
  }

  checkCollisions() {
    // Simple collision check with blocks
    // Get the object to check (either controls object or camera container)
    const moveObject = this.controls.getObject
      ? this.controls.getObject()
      : this.cameraContainer;
    const position = moveObject.position.clone();

    // Check nearby voxels
    for (
      let x = Math.floor(position.x) - 1;
      x <= Math.floor(position.x) + 1;
      x++
    ) {
      for (
        let z = Math.floor(position.z) - 1;
        z <= Math.floor(position.z) + 1;
        z++
      ) {
        for (
          let y = Math.floor(position.y) - 1;
          y <= Math.floor(position.y) + 1;
          y++
        ) {
          const voxel = this.getVoxel(x, y, z);

          if (voxel) {
            // Calculate box collision
            const blockMin = new THREE.Vector3(x - 0.5, y - 0.5, z - 0.5);
            const blockMax = new THREE.Vector3(x + 0.5, y + 0.5, z + 0.5);

            // Player bounding box
            const playerMin = new THREE.Vector3(
              position.x - this.playerRadius,
              position.y - this.playerHeight / 2,
              position.z - this.playerRadius,
            );
            const playerMax = new THREE.Vector3(
              position.x + this.playerRadius,
              position.y + this.playerHeight / 2,
              position.z + this.playerRadius,
            );

            // Check collision
            if (
              playerMax.x > blockMin.x &&
              playerMin.x < blockMax.x &&
              playerMax.y > blockMin.y &&
              playerMin.y < blockMax.y &&
              playerMax.z > blockMin.z &&
              playerMin.z < blockMax.z
            ) {
              // Handle collision
              this.resolveCollision(position, x, y, z);
            }
          }
        }
      }
    }
  }
}
