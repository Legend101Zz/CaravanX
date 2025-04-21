/**
 * CaravanXBlockchain - A pixel art visualization of the blockchain as a trading caravan journey
 *
 * This class creates an interactive visualization where:
 * - Blocks are represented as caravans traveling along a chain
 * - Transactions are traders waiting to join caravans
 * - Mining is visualized as prospectors creating new caravans
 * - The environment changes with time (day/night cycle, weather)
 */
class CaravanXBlockchain {
  constructor() {
    // Initialize PixiJS
    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0a1a,
      resolution: window.devicePixelRatio || 1,
      antialias: false,
    });
    document.getElementById("game-container").appendChild(this.app.view);

    // Game state
    this.state = {
      blocks: [],
      mempool: [],
      caravans: [],
      traders: [],
      miners: [],
      outposts: [],
      focusedEntity: null,
      timeOfDay: 8, // 0-24 for day-night cycle
      gameTime: 0,
      weather: "clear", // clear, cloudy, rainy
      weatherTimer: 0,
      weatherDuration: 300, // 5 minutes in game time before weather changes
      isTutorialShown: false,
      soundEnabled: true,
      camera: {
        x: 0,
        y: 0,
        scale: 1,
        targetScale: 1,
        dragging: false,
        lastPosition: null,
      },
    };

    // Container for all game objects
    this.worldContainer = new PIXI.Container();
    this.app.stage.addChild(this.worldContainer);

    // Separate containers for layers
    this.backgroundLayer = new PIXI.Container();
    this.trailLayer = new PIXI.Container();
    this.caravanLayer = new PIXI.Container();
    this.traderLayer = new PIXI.Container();
    this.minerLayer = new PIXI.Container();
    this.outpostLayer = new PIXI.Container();
    this.effectsLayer = new PIXI.Container();
    this.uiLayer = new PIXI.Container();

    this.worldContainer.addChild(this.backgroundLayer);
    this.worldContainer.addChild(this.trailLayer);
    this.worldContainer.addChild(this.caravanLayer);
    this.worldContainer.addChild(this.traderLayer);
    this.worldContainer.addChild(this.minerLayer);
    this.worldContainer.addChild(this.outpostLayer);
    this.worldContainer.addChild(this.effectsLayer);
    this.app.stage.addChild(this.uiLayer);

    // Sound effects
    this.sounds = {
      mining: new Howl({
        src: ["sounds/mining.mp3"],
        volume: 0.5,
        loop: false,
      }),
      transaction: new Howl({
        src: ["sounds/transaction.mp3"],
        volume: 0.5,
        loop: false,
      }),
      click: new Howl({ src: ["sounds/click.mp3"], volume: 0.5, loop: false }),
      caravan: new Howl({
        src: ["sounds/caravan.mp3"],
        volume: 0.5,
        loop: false,
      }),
      ambient: new Howl({
        src: ["sounds/blockchain_ambient.mp3"],
        volume: 0.3,
        loop: true,
      }),
      rain: new Howl({ src: ["sounds/rain.mp3"], volume: 0.2, loop: true }),
    };

    // Connect to WebSocket (socket.io)
    this.socket = io();

    // Set up event listeners
    this.setupEventListeners();

    // Start game loop
    this.app.ticker.add(this.gameLoop.bind(this));

    // Initialize game
    this.initialize();
  }

  // Ensure all container layers exist
  ensureContainersExist() {
    // Main containers
    if (!this.worldContainer) {
      console.warn("World container not initialized");
      this.worldContainer = new PIXI.Container();
      this.app.stage.addChild(this.worldContainer);
    }

    // Create all necessary layers
    const layers = [
      { name: "backgroundLayer", container: this.backgroundLayer },
      { name: "trailLayer", container: this.trailLayer },
      { name: "caravanLayer", container: this.caravanLayer },
      { name: "traderLayer", container: this.traderLayer },
      { name: "minerLayer", container: this.minerLayer },
      { name: "outpostLayer", container: this.outpostLayer },
      { name: "effectsLayer", container: this.effectsLayer },
      { name: "uiLayer", container: this.uiLayer },
    ];

    // Initialize any missing layers
    layers.forEach((layer) => {
      if (!layer.container) {
        console.warn(`${layer.name} not initialized, creating now`);
        this[layer.name] = new PIXI.Container();
        this.worldContainer.addChild(this[layer.name]);
      }
    });

    // UI layer goes directly on stage
    if (!this.uiLayer) {
      this.uiLayer = new PIXI.Container();
      this.app.stage.addChild(this.uiLayer);
    }

    console.log("Container initialization complete");
  }

  // Initialize the game
  async initialize() {
    try {
      // Ensure all container layers are properly created
      this.ensureContainersExist();

      // Load assets
      await this.loadAssets();

      // Create the world
      this.createWorld();

      // Fetch initial blockchain data
      await this.fetchBlockchainData();

      // Hide loading screen
      document.getElementById("loading-screen").style.display = "none";

      // Add intro animation
      this.playIntroAnimation();

      // Start ambient sound
      if (this.state.soundEnabled) {
        this.sounds.ambient.play();
      }

      // Show tutorial if first visit
      const hasTutorialBeenShown = localStorage.getItem(
        "caravanXTutorialShown",
      );
      if (!hasTutorialBeenShown) {
        this.showTutorial();
        localStorage.setItem("caravanXTutorialShown", "true");
      }
    } catch (error) {
      console.error("Error initializing game:", error);
      document.getElementById("loading-text").textContent =
        "Error loading caravan: " + error.message;
    }
  }

  // Load game assets
  async loadAssets() {
    return new Promise((resolve, reject) => {
      // For a full implementation, we'd load sprites, textures, sounds here
      // For this demo, we'll simulate the loading process
      let progress = 0;
      const loadingInterval = setInterval(() => {
        progress += 5;
        document.getElementById("loading-bar").style.width = `${progress}%`;
        document.getElementById("loading-text").textContent =
          `Loading the caravan... ${progress}%`;

        if (progress >= 100) {
          clearInterval(loadingInterval);
          resolve();
        }
      }, 100);
    });
  }

  // Create the world environment
  createWorld() {
    // Add safety checks for container initialization
    if (!this.backgroundLayer) {
      console.warn("Background layer not initialized, creating now");
      this.backgroundLayer = new PIXI.Container();
      this.worldContainer.addChild(this.backgroundLayer);
    }

    if (!this.trailLayer) {
      console.warn("Trail layer not initialized, creating now");
      this.trailLayer = new PIXI.Container();
      this.worldContainer.addChild(this.trailLayer);
    }

    // Create sky background with gradient
    this.createSky();

    // Create distant mountains
    this.createMountains();

    // Create the blockchain trail (the path that caravans follow)
    this.createBlockchainTrail();

    // Create ground
    this.createGround();

    // Add environmental elements
    this.addEnvironmentalElements();
  }

  // Create the sky with gradient and day/night cycle capability
  createSky() {
    // Create sky gradient
    const sky = new PIXI.Graphics();
    sky.beginFill(0x4477aa); // Day sky color
    sky.drawRect(
      -window.innerWidth,
      -window.innerHeight,
      window.innerWidth * 3,
      window.innerHeight * 2,
    );
    sky.endFill();
    this.backgroundLayer.addChild(sky);
    this.sky = sky;

    // Add sun
    const sun = new PIXI.Graphics();
    sun.beginFill(0xffdd88);
    sun.drawCircle(0, 0, 40);
    sun.endFill();
    sun.x = window.innerWidth * 0.7;
    sun.y = 100;
    this.backgroundLayer.addChild(sun);
    this.sun = sun;

    // Add moon
    const moon = new PIXI.Graphics();
    moon.beginFill(0xddddff);
    moon.drawCircle(0, 0, 30);
    moon.endFill();
    moon.x = window.innerWidth * 0.3;
    moon.y = 100;
    moon.alpha = 0;
    this.backgroundLayer.addChild(moon);
    this.moon = moon;

    // Add some stars (visible at night)
    this.stars = new PIXI.Container();
    for (let i = 0; i < 100; i++) {
      const star = new PIXI.Graphics();
      star.beginFill(0xffffff);
      const size = Math.random() * 2 + 1;
      star.drawRect(0, 0, size, size);
      star.endFill();
      star.x = Math.random() * window.innerWidth * 3 - window.innerWidth;
      star.y = (Math.random() * window.innerHeight) / 2;
      star.alpha = 0; // Stars start invisible during day
      this.stars.addChild(star);
    }
    this.backgroundLayer.addChild(this.stars);

    // Add clouds
    this.clouds = new PIXI.Container();
    for (let i = 0; i < 10; i++) {
      this.createCloud(
        Math.random() * window.innerWidth * 3 - window.innerWidth,
        Math.random() * 200,
        0.1 + Math.random() * 0.2,
      );
    }
    this.backgroundLayer.addChild(this.clouds);
  }

  // Create a single cloud
  createCloud(x, y, speed) {
    const cloud = new PIXI.Graphics();
    cloud.beginFill(0xffffff, 0.8);

    // Create fluffy cloud shape
    const cloudWidth = 30 + Math.random() * 70;
    const cloudHeight = 20 + Math.random() * 30;

    // Draw multiple overlapping circles for a cloud shape
    for (let i = 0; i < 5; i++) {
      const circleSize = cloudHeight / 2 + (Math.random() * cloudHeight) / 2;
      const offsetX = (i / 5) * cloudWidth - cloudWidth / 2;
      const offsetY = Math.random() * 10 - 5;
      cloud.drawCircle(offsetX, offsetY, circleSize);
    }

    cloud.x = x;
    cloud.y = y;
    cloud.speed = speed;
    cloud.cloudWidth = cloudWidth;

    this.clouds.addChild(cloud);
    return cloud;
  }

  // Create distant mountains for background
  createMountains() {
    const mountains = new PIXI.Graphics();

    // Draw several mountain ranges with different colors
    for (let range = 0; range < 3; range++) {
      // Use progressively lighter colors for distant ranges
      const color = range === 0 ? 0x303656 : range === 1 ? 0x424c78 : 0x5a6291;
      const baseY = 300 - range * 40; // Each range is higher on screen (more distant)
      const peakHeight = 100 - range * 20; // More distant mountains are shorter

      mountains.beginFill(color);

      // Start at the left edge below the terrain line
      mountains.moveTo(-window.innerWidth, baseY + 50);

      // Create a series of peaks
      const numPeaks = 20;
      const peakWidth = (window.innerWidth * 3) / numPeaks;

      for (let i = 0; i <= numPeaks; i++) {
        const x = -window.innerWidth + i * peakWidth;

        // Randomize peak heights for a natural look
        const heightVariation = Math.random() * peakHeight;
        const y = baseY - heightVariation;

        // For smoother mountains, use quadraticCurveTo instead of lineTo
        if (i === 0) {
          mountains.lineTo(x, y);
        } else {
          const cpX = x - peakWidth / 2;
          const cpY = baseY - (Math.random() * peakHeight) / 2;
          mountains.quadraticCurveTo(cpX, cpY, x, y);
        }
      }

      // Close the shape by extending to the right edge and down
      mountains.lineTo(window.innerWidth * 2, baseY + 50);
      mountains.lineTo(-window.innerWidth, baseY + 50);

      mountains.endFill();
    }

    this.backgroundLayer.addChild(mountains);
    this.mountains = mountains;
  }

  // Create the blockchain trail (path for caravans)
  createBlockchainTrail() {
    // Make sure trailLayer exists
    if (!this.trailLayer) {
      console.warn("Trail layer still not initialized, creating again");
      this.trailLayer = new PIXI.Container();
      this.worldContainer.addChild(this.trailLayer);
    }
    const trail = new PIXI.Graphics();

    // Main dirt path
    trail.beginFill(0x8b4513, 0.7);

    // Create a winding path using bezier curves
    const pathPoints = [];
    let x = -window.innerWidth;
    const baseY = 300;

    // Generate winding path points
    for (let i = 0; i < 50; i++) {
      const segment = {
        x: x,
        y: baseY + Math.sin(i * 0.2) * 30,
      };
      pathPoints.push(segment);
      x += 200;
    }

    // Draw the path as a series of quadratic curves
    trail.moveTo(pathPoints[0].x, pathPoints[0].y);

    for (let i = 1; i < pathPoints.length; i++) {
      const prev = pathPoints[i - 1];
      const current = pathPoints[i];

      // Control point halfway between points
      const cpX = (prev.x + current.x) / 2;
      const cpY = prev.y + (Math.random() * 20 - 10); // Slight random variation

      trail.quadraticCurveTo(cpX, cpY, current.x, current.y);
    }

    // Make the path wider by drawing another line slightly offset
    const pathWidth = 30;
    for (let i = pathPoints.length - 1; i >= 0; i--) {
      const point = pathPoints[i];
      trail.lineTo(point.x, point.y + pathWidth);
    }

    trail.endFill();

    // Add some small stones along the path edges
    trail.beginFill(0x999999, 0.5);
    for (let i = 0; i < 200; i++) {
      const pathIndex = Math.floor(Math.random() * pathPoints.length);
      const point = pathPoints[pathIndex];
      const offsetY =
        (Math.random() > 0.5 ? 1 : -1) * (pathWidth / 2 + Math.random() * 5);
      const stoneSize = 2 + Math.random() * 3;
      trail.drawCircle(
        point.x + Math.random() * 100 - 50,
        point.y + offsetY,
        stoneSize,
      );
    }
    trail.endFill();

    this.trailLayer.addChild(trail);
    this.trail = trail;
    this.pathPoints = pathPoints;
  }

  // Create ground with grass and texture
  createGround() {
    const ground = new PIXI.Graphics();

    // Main ground
    ground.beginFill(0x225522);
    ground.drawRect(
      -window.innerWidth,
      300,
      window.innerWidth * 3,
      window.innerHeight,
    );
    ground.endFill();

    // Add texture to the ground with small grass tufts
    ground.beginFill(0x338833);
    for (let x = -window.innerWidth; x < window.innerWidth * 2; x += 20) {
      for (let y = 320; y < window.innerHeight + 300; y += 20) {
        if (Math.random() > 0.8) {
          const grassTuft = new PIXI.Graphics();
          const size = 3 + Math.random() * 3;

          // Draw a small tuft of grass (3-5 blades)
          for (let i = 0; i < 3 + Math.random() * 2; i++) {
            const bladeOffset = Math.random() * size - size / 2;
            grassTuft.moveTo(x + bladeOffset, y);
            grassTuft.lineTo(x + bladeOffset, y - (size + Math.random() * 3));
          }
          ground.drawRect(x, y, size, size);
        }
      }
    }
    ground.endFill();

    this.backgroundLayer.addChild(ground);
    this.ground = ground;
  }

  // Add various environmental elements to the scene
  addEnvironmentalElements() {
    // Add outposts (representing blockchain nodes)
    this.createOutposts();

    // Add miners' camps
    this.createMinerCamps();

    // Add decorative elements like trees, rocks, etc.
    this.addDecorations();
  }

  // Create outposts (blockchain nodes)
  createOutposts() {
    // Create 3 outposts along the blockchain path
    for (let i = 0; i < 3; i++) {
      const pathIndex = Math.floor(this.pathPoints.length / 3) * i + 5;
      const point = this.pathPoints[pathIndex];

      // Create outpost building
      const outpost = new PIXI.Graphics();

      // Main building
      outpost.beginFill(0x8b4513);
      outpost.drawRect(-15, -30, 30, 30);
      outpost.endFill();

      // Roof
      outpost.beginFill(0x555555);
      outpost.moveTo(-18, -30);
      outpost.lineTo(0, -45);
      outpost.lineTo(18, -30);
      outpost.lineTo(-18, -30);
      outpost.endFill();

      // Window
      outpost.beginFill(0xffdd88);
      outpost.drawRect(-5, -25, 10, 10);
      outpost.endFill();

      // Antenna (for node connectivity)
      outpost.lineStyle(2, 0xaaaaaa);
      outpost.moveTo(0, -45);
      outpost.lineTo(0, -60);
      outpost.lineStyle(0);

      // Small dish on top
      outpost.beginFill(0xcccccc);
      outpost.drawCircle(0, -60, 5);
      outpost.endFill();

      // Position outpost
      outpost.x = point.x;
      outpost.y = point.y - 10; // Slightly above the path

      // Add a sign
      const sign = new PIXI.Graphics();
      sign.beginFill(0x8b4513);
      sign.drawRect(-10, -25, 20, 15);
      sign.endFill();

      sign.beginFill(0xffdd88);
      sign.drawRect(-8, -23, 16, 11);
      sign.endFill();

      sign.x = point.x + 25;
      sign.y = point.y;

      // Store outpost data
      outpost.outpostData = {
        id: `outpost_${i}`,
        name: `Node ${i + 1}`,
        type: i === 0 ? "Full Node" : i === 1 ? "Mining Node" : "Light Client",
        connections: Math.floor(Math.random() * 8) + 3,
      };

      // Make interactive
      outpost.interactive = true;
      outpost.buttonMode = true;

      outpost.on("pointerover", (event) => {
        this.showTooltip(
          `${outpost.outpostData.name} (${outpost.outpostData.type})`,
          event.data.global.x,
          event.data.global.y,
        );
      });

      outpost.on("pointerout", () => {
        this.hideTooltip();
      });

      outpost.on("pointerdown", () => {
        this.showOutpostDetails(outpost.outpostData);
        if (this.state.soundEnabled) this.sounds.click.play();
      });

      this.outpostLayer.addChild(outpost);
      this.outpostLayer.addChild(sign);
      this.state.outposts.push(outpost);

      // Add connectivity animation
      this.addConnectivityEffect(outpost);
    }
  }

  // Add pulsing connectivity animation to outposts
  addConnectivityEffect(outpost) {
    const connectivityPulse = new PIXI.Graphics();
    connectivityPulse.x = outpost.x;
    connectivityPulse.y = outpost.y - 60; // At the antenna

    // Animation function
    const animate = () => {
      connectivityPulse.clear();
      connectivityPulse.beginFill(0x44aaff, 0.5);
      connectivityPulse.drawCircle(0, 0, 5);
      connectivityPulse.endFill();

      // Animate size and opacity
      gsap.to(connectivityPulse, {
        alpha: 0,
        duration: 1.5,
        ease: "sine.out",
        onComplete: () => {
          connectivityPulse.alpha = 1;
          setTimeout(animate, Math.random() * 2000 + 1000);
        },
      });

      gsap.to(connectivityPulse.scale, {
        x: 3,
        y: 3,
        duration: 1.5,
        ease: "sine.out",
        onComplete: () => {
          connectivityPulse.scale.set(1);
        },
      });
    };

    this.effectsLayer.addChild(connectivityPulse);
    animate();
  }

  // Create miner camps
  createMinerCamps() {
    // Create 4 mining camps around the trail
    for (let i = 0; i < 4; i++) {
      const pathIndex = Math.floor(this.pathPoints.length / 5) * (i + 1);
      const point = this.pathPoints[pathIndex];

      // Determine position (alternate sides of the trail)
      const side = i % 2 === 0 ? -1 : 1;
      const x = point.x + side * (40 + Math.random() * 30);
      const y = point.y + (Math.random() * 30 - 15);

      // Create miner camp
      const minerCamp = new PIXI.Graphics();

      // Main tent
      minerCamp.beginFill(0x8b4513);
      minerCamp.drawRect(-10, -5, 20, 15);
      minerCamp.endFill();

      // Tent top
      minerCamp.beginFill(0xaa5533);
      minerCamp.moveTo(-15, -5);
      minerCamp.lineTo(0, -20);
      minerCamp.lineTo(15, -5);
      minerCamp.lineTo(-15, -5);
      minerCamp.endFill();

      // Mining equipment
      minerCamp.beginFill(0x555555);
      minerCamp.drawRect(-15, 5, 10, 5);
      minerCamp.endFill();

      // Pickaxe
      minerCamp.lineStyle(2, 0x888888);
      minerCamp.moveTo(10, 0);
      minerCamp.lineTo(20, -15);
      minerCamp.lineStyle(0);

      minerCamp.beginFill(0x444444);
      minerCamp.drawRect(17, -19, 6, 4);
      minerCamp.endFill();

      // Campfire
      const campfire = new PIXI.Graphics();
      campfire.beginFill(0x555555);
      campfire.drawCircle(0, 0, 5);
      campfire.endFill();

      // Logs
      campfire.beginFill(0x8b4513);
      campfire.drawRect(-6, -1, 12, 2);
      campfire.drawRect(-1, -6, 2, 12);
      campfire.endFill();

      campfire.x = x - 20;
      campfire.y = y + 10;

      // Position miner camp
      minerCamp.x = x;
      minerCamp.y = y;

      // Miner character
      const miner = this.createMinerCharacter(x + 15, y + 10);

      // Store miner data
      miner.minerData = {
        id: `miner_${i}`,
        name: `Miner ${i + 1}`,
        hashPower: Math.floor(Math.random() * 100) + 10,
        blocksFound: Math.floor(Math.random() * 5),
        active: Math.random() > 0.3, // 70% chance of being active
      };

      // Make interactive
      miner.interactive = true;
      miner.buttonMode = true;

      miner.on("pointerover", (event) => {
        this.showTooltip(
          `${miner.minerData.name} (Hashpower: ${miner.minerData.hashPower})`,
          event.data.global.x,
          event.data.global.y,
        );
      });

      miner.on("pointerout", () => {
        this.hideTooltip();
      });

      miner.on("pointerdown", () => {
        this.showMinerDetails(miner.minerData);
        if (this.state.soundEnabled) this.sounds.click.play();
      });

      this.minerLayer.addChild(minerCamp);
      this.minerLayer.addChild(campfire);
      this.state.miners.push(miner);

      // Add fire animation
      this.addFireAnimation(campfire);

      // Add mining animation if active
      if (miner.minerData.active) {
        this.addMiningAnimation(miner);
      }
    }
  }

  // Create miner character
  createMinerCharacter(x, y) {
    const miner = new PIXI.Graphics();

    // Body
    miner.beginFill(0x8b4513);
    miner.drawRect(-5, -15, 10, 15);
    miner.endFill();

    // Head
    miner.beginFill(0xffcc99);
    miner.drawCircle(0, -20, 5);
    miner.endFill();

    // Mining hat
    miner.beginFill(0x444444);
    miner.drawRect(-6, -25, 12, 3);
    miner.drawCircle(0, -25, 5);
    miner.endFill();

    // Position miner
    miner.x = x;
    miner.y = y;

    this.minerLayer.addChild(miner);
    return miner;
  }

  // Add fire animation to campfire
  addFireAnimation(campfire) {
    const fireAnimation = new PIXI.Graphics();
    fireAnimation.x = campfire.x;
    fireAnimation.y = campfire.y;

    // Animation function
    const animate = () => {
      fireAnimation.clear();
      fireAnimation.beginFill(0xff6600, 0.8);

      // Flame shape (randomized)
      fireAnimation.moveTo(-2, 0);
      fireAnimation.quadraticCurveTo(
        -3 + Math.random() * 6,
        -5 - Math.random() * 5,
        2,
        -8 - Math.random() * 4,
      );
      fireAnimation.quadraticCurveTo(
        3 + Math.random() * 2,
        -5 - Math.random() * 5,
        2,
        0,
      );
      fireAnimation.lineTo(-2, 0);

      fireAnimation.endFill();

      // Add smaller yellow inner flame
      fireAnimation.beginFill(0xffcc00, 0.9);
      fireAnimation.moveTo(-1, 0);
      fireAnimation.quadraticCurveTo(
        -1 + Math.random() * 2,
        -3 - Math.random() * 3,
        1,
        -5 - Math.random() * 2,
      );
      fireAnimation.quadraticCurveTo(
        1 + Math.random() * 1,
        -3 - Math.random() * 3,
        1,
        0,
      );
      fireAnimation.lineTo(-1, 0);
      fireAnimation.endFill();

      // Schedule next frame
      requestAnimationFrame(animate);
    };

    this.effectsLayer.addChild(fireAnimation);
    animate();
  }

  // Add mining animation to miner
  addMiningAnimation(miner) {
    // Create pickaxe
    const pickaxe = new PIXI.Graphics();
    pickaxe.lineStyle(2, 0x888888);
    pickaxe.moveTo(0, 0);
    pickaxe.lineTo(15, -10);
    pickaxe.lineStyle(0);

    pickaxe.beginFill(0x444444);
    pickaxe.drawRect(12, -14, 6, 4);
    pickaxe.endFill();

    pickaxe.x = miner.x;
    pickaxe.y = miner.y - 5;
    pickaxe.pivot.set(0, 0);

    this.minerLayer.addChild(pickaxe);

    // Mining animation
    gsap.to(pickaxe, {
      rotation: -0.5,
      duration: 0.5,
      repeat: -1,
      yoyo: true,
      ease: "power1.inOut",
    });

    // Occasionally play mining sound
    const playMiningSound = () => {
      if (this.state.soundEnabled && Math.random() > 0.7) {
        this.sounds.mining.play();
      }
      setTimeout(playMiningSound, Math.random() * 10000 + 5000);
    };

    setTimeout(playMiningSound, Math.random() * 5000);

    return pickaxe;
  }

  // Add decorative elements to the world
  addDecorations() {
    // Add trees, rocks, cacti, etc.
    this.addTrees();
    this.addRocks();

    // Add occasional landmarks
    this.addLandmarks();
  }

  // Add trees to the scene
  addTrees() {
    // Create different types of trees scattered around
    for (let i = 0; i < 40; i++) {
      // Position away from the path
      const x = Math.random() * window.innerWidth * 2 - window.innerWidth;
      const y = 300 + Math.random() * 200;

      // Skip if too close to the path
      let tooClose = false;
      for (const point of this.pathPoints) {
        const distance = Math.sqrt(
          Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2),
        );
        if (distance < 60) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      // Randomly choose tree type
      const treeType = Math.floor(Math.random() * 3);

      const tree = new PIXI.Graphics();

      switch (treeType) {
        case 0: // Pine tree
          tree.beginFill(0x8b4513);
          tree.drawRect(-3, 0, 6, 15);
          tree.endFill();

          tree.beginFill(0x006400);
          for (let j = 0; j < 3; j++) {
            const size = 15 - j * 4;
            tree.drawPolygon([
              -size,
              -j * 10 - 5,
              0,
              -j * 10 - 15,
              size,
              -j * 10 - 5,
            ]);
          }
          tree.endFill();
          break;

        case 1: // Oak tree
          tree.beginFill(0x8b4513);
          tree.drawRect(-3, 0, 6, 10);
          tree.endFill();

          tree.beginFill(0x228b22);
          tree.drawCircle(0, -10, 10);
          tree.endFill();
          break;

        case 2: // Dead tree
          tree.beginFill(0x8b4513);
          tree.drawRect(-2, 0, 4, 15);
          tree.endFill();

          tree.lineStyle(2, 0x8b4513);
          tree.moveTo(0, -15);
          tree.lineTo(8, -25);
          tree.moveTo(0, -10);
          tree.lineTo(-6, -20);
          tree.moveTo(0, -5);
          tree.lineTo(5, -15);
          tree.lineStyle(0);
          break;
      }

      tree.x = x;
      tree.y = y;

      this.backgroundLayer.addChild(tree);
    }
  }

  // Add rocks to the scene
  addRocks() {
    // Add scattered rocks
    for (let i = 0; i < 30; i++) {
      const x = Math.random() * window.innerWidth * 2 - window.innerWidth;
      const y = 300 + Math.random() * 200;

      // Skip if too close to the path
      let tooClose = false;
      for (const point of this.pathPoints) {
        const distance = Math.sqrt(
          Math.pow(point.x - x, 2) + Math.pow(point.y - y, 2),
        );
        if (distance < 40) {
          tooClose = true;
          break;
        }
      }

      if (tooClose) continue;

      const rock = new PIXI.Graphics();

      // Determine rock size
      const size = 3 + Math.random() * 8;

      // Draw rock with slight variations
      rock.beginFill(0x888888);

      if (Math.random() > 0.5) {
        // Rounded rock
        rock.drawCircle(0, 0, size);
      } else {
        // Angular rock
        const points = [];
        const numPoints = 5 + Math.floor(Math.random() * 3);

        for (let j = 0; j < numPoints; j++) {
          const angle = (j / numPoints) * Math.PI * 2;
          const distance = size * (0.8 + Math.random() * 0.4);
          points.push(Math.cos(angle) * distance, Math.sin(angle) * distance);
        }

        rock.drawPolygon(points);
      }

      rock.endFill();

      // Add some texture/highlights
      rock.beginFill(0xaaaaaa, 0.5);
      rock.drawCircle(size * 0.3, -size * 0.3, size * 0.3);
      rock.endFill();

      rock.x = x;
      rock.y = y;

      this.backgroundLayer.addChild(rock);
    }
  }

  // Add special landmarks to the world
  addLandmarks() {
    // Add a mysterious blockchain monument
    this.addBlockchainMonument();

    // Add an oasis trading post
    this.addTradingOasis();
  }

  // Add a blockchain monument (decorative landmark)
  addBlockchainMonument() {
    // Position at a specific point on the path
    const pathIndex = Math.floor(this.pathPoints.length * 0.7);
    const point = this.pathPoints[pathIndex];
    const x = point.x + 80;
    const y = point.y - 20;

    const monument = new PIXI.Graphics();

    // Stone base
    monument.beginFill(0x888888);
    monument.drawRect(-20, 0, 40, 10);
    monument.endFill();

    // Monument pillar
    monument.beginFill(0x777777);
    monument.drawRect(-10, -40, 20, 40);
    monument.endFill();

    // Decorative elements
    monument.beginFill(0xffcc00);

    // Bitcoin-inspired symbol
    monument.drawRect(-5, -35, 10, 2);
    monument.drawRect(-5, -30, 10, 2);
    monument.drawRect(-5, -25, 10, 2);
    monument.drawRect(-5, -20, 10, 2);

    // Angle marks
    monument.drawRect(-8, -35, 3, 2);
    monument.drawRect(5, -25, 3, 2);
    monument.endFill();

    monument.x = x;
    monument.y = y;

    // Add ambient glow effect
    const glow = new PIXI.Graphics();
    glow.beginFill(0xffcc00, 0.2);
    glow.drawCircle(0, 0, 30);
    glow.endFill();

    glow.x = x;
    glow.y = y - 20;

    // Animate glow
    gsap.to(glow, {
      alpha: 0.4,
      duration: 2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });

    this.backgroundLayer.addChild(monument);
    this.effectsLayer.addChild(glow);

    // Make interactive
    monument.interactive = true;
    monument.buttonMode = true;

    monument.on("pointerover", (event) => {
      this.showTooltip(
        "Ancient Blockchain Monument",
        event.data.global.x,
        event.data.global.y,
      );
    });

    monument.on("pointerout", () => {
      this.hideTooltip();
    });

    monument.on("pointerdown", () => {
      this.showNotification(
        "The monument contains inscriptions from the genesis block.",
      );
      if (this.state.soundEnabled) this.sounds.click.play();
    });
  }

  // Add a trading oasis (a gathering place for traders)
  addTradingOasis() {
    // Position at a specific point on the path
    const pathIndex = Math.floor(this.pathPoints.length * 0.3);
    const point = this.pathPoints[pathIndex];
    const x = point.x - 60;
    const y = point.y + 20;

    const oasis = new PIXI.Graphics();

    // Water pool
    oasis.beginFill(0x4477aa);
    oasis.drawCircle(0, 0, 15);
    oasis.endFill();

    // Sand around the water
    oasis.beginFill(0xddcc88);
    oasis.drawCircle(0, 0, 20);
    oasis.endFill();

    // Add palm trees
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const treeX = Math.cos(angle) * 18;
      const treeY = Math.sin(angle) * 18;

      // Tree trunk
      oasis.beginFill(0x8b4513);
      oasis.drawRect(treeX - 2, treeY - 15, 4, 15);
      oasis.endFill();

      // Slight curve to trunk
      oasis.beginFill(0x8b4513);
      oasis.drawRect(treeX - 1, treeY - 22, 3, 7);
      oasis.endFill();

      // Palm leaves
      oasis.beginFill(0x00aa00);
      for (let j = 0; j < 4; j++) {
        const leafAngle = (j / 4) * Math.PI * 2;
        oasis.moveTo(treeX, treeY - 22);

        // Create curved palm leaf
        const controlX = treeX + Math.cos(leafAngle) * 10;
        const controlY = treeY - 22 + Math.sin(leafAngle) * 5;
        const endX = treeX + Math.cos(leafAngle) * 15;
        const endY = treeY - 22 + Math.sin(leafAngle) * 10;

        oasis.quadraticCurveTo(controlX, controlY, endX, endY);
        oasis.quadraticCurveTo(
          controlX + Math.cos(leafAngle + 0.2) * 3,
          controlY + Math.sin(leafAngle + 0.2) * 3,
          treeX,
          treeY - 22,
        );
      }
      oasis.endFill();
    }

    // Add a small trading stand
    oasis.beginFill(0x8b4513);
    oasis.drawRect(10, -5, 15, 10);
    oasis.endFill();

    // Stand roof
    oasis.beginFill(0xaa5533);
    oasis.drawRect(8, -10, 19, 5);
    oasis.endFill();

    oasis.x = x;
    oasis.y = y;

    this.backgroundLayer.addChild(oasis);

    // Add a trader character
    const trader = this.createTrader(x + 20, y + 5, {
      id: "oasis_trader",
      name: "Oasis Merchant",
      speciality: "Rare Tokens",
      inventory: Math.floor(Math.random() * 10) + 5,
    });

    // Add ambient effects
    this.addWaterAnimation(x, y);
  }

  // Add water ripple animation for the oasis
  addWaterAnimation(x, y) {
    const waterEffect = new PIXI.Graphics();
    waterEffect.x = x;
    waterEffect.y = y;

    // Animation function
    const animate = () => {
      waterEffect.clear();
      waterEffect.beginFill(0x4477aa, 0.5);
      waterEffect.drawCircle(0, 0, 5 + Math.sin(Date.now() / 500) * 2);
      waterEffect.endFill();

      // Ripple effect (periodic)
      if (Math.random() > 0.98) {
        const ripple = new PIXI.Graphics();
        ripple.x = x + (Math.random() * 10 - 5);
        ripple.y = y + (Math.random() * 10 - 5);

        const drawRipple = (radius, alpha) => {
          ripple.clear();
          ripple.lineStyle(1, 0x4477aa, alpha);
          ripple.drawCircle(0, 0, radius);
          ripple.lineStyle(0);
        };

        drawRipple(2, 0.8);

        gsap.to(ripple, {
          alpha: 0,
          duration: 1.5,
          ease: "sine.out",
          onUpdate: () => {
            drawRipple(2 + (1 - ripple.alpha) * 8, ripple.alpha);
          },
          onComplete: () => {
            this.effectsLayer.removeChild(ripple);
          },
        });

        this.effectsLayer.addChild(ripple);
      }

      // Schedule next frame
      requestAnimationFrame(animate);
    };

    this.effectsLayer.addChild(waterEffect);
    animate();
  }

  // Create a trader character
  createTrader(x, y, data) {
    const trader = new PIXI.Graphics();

    // Body
    trader.beginFill(0xaa5500);
    trader.drawRect(-5, -15, 10, 15);
    trader.endFill();

    // Head
    trader.beginFill(0xffcc99);
    trader.drawCircle(0, -20, 5);
    trader.endFill();

    // Hat
    trader.beginFill(0xaa0000);
    trader.drawCircle(0, -23, 6);
    trader.endFill();

    // Position trader
    trader.x = x;
    trader.y = y;

    // Store trader data
    trader.traderData = data;

    // Make interactive
    trader.interactive = true;
    trader.buttonMode = true;

    trader.on("pointerover", (event) => {
      this.showTooltip(
        `${trader.traderData.name} (${trader.traderData.speciality})`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    trader.on("pointerout", () => {
      this.hideTooltip();
    });

    trader.on("pointerdown", () => {
      this.showTraderDetails(trader.traderData);
      if (this.state.soundEnabled) this.sounds.click.play();
    });

    this.traderLayer.addChild(trader);
    return trader;
  }

  // Fetch blockchain data from API
  async fetchBlockchainData() {
    try {
      console.log("Fetching blockchain data...");

      // Add timeout for fetch
      const fetchPromise = fetch("/api/blockchain");
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Fetch timeout")), 10000),
      );

      const response = await Promise.race([fetchPromise, timeoutPromise]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log("Blockchain data received:", data);

      // Validate the data structure
      if (!data || typeof data !== "object") {
        throw new Error("Invalid data format received");
      }

      // Use default values if properties are missing
      const safeData = {
        stats: data.stats || { blockCount: 0, totalTxCount: 0, mempoolSize: 0 },
        blocks: Array.isArray(data.blocks) ? data.blocks : [],
        mempool: data.mempool || { txids: [] },
      };

      // Update stats display
      this.updateStats(safeData.stats);

      // Process blocks
      this.processBlocks(safeData.blocks);

      // Process mempool
      this.processMempool(safeData.mempool);

      return safeData;
    } catch (error) {
      console.error("Error fetching blockchain data:", error);

      // Create fallback data
      const fallbackData = {
        stats: { blockCount: 3, totalTxCount: 10, mempoolSize: 5 },
        blocks: [
          {
            height: 2,
            hash: "000000000000000000000000000000000000000000000000000000000000002",
            time: Date.now() / 1000,
            txCount: 3,
            size: 1500,
          },
          {
            height: 1,
            hash: "000000000000000000000000000000000000000000000000000000000000001",
            time: Date.now() / 1000 - 600,
            txCount: 2,
            size: 1200,
          },
          {
            height: 0,
            hash: "000000000000000000000000000000000000000000000000000000000000000",
            time: Date.now() / 1000 - 1200,
            txCount: 1,
            size: 1000,
          },
        ],
        mempool: {
          txids: [
            "tx1111111111111111111111111111111111111111111111111111111111111111",
            "tx2222222222222222222222222222222222222222222222222222222222222222",
            "tx3333333333333333333333333333333333333333333333333333333333333333",
            "tx4444444444444444444444444444444444444444444444444444444444444444",
            "tx5555555555555555555555555555555555555555555555555555555555555555",
          ],
        },
      };

      // Show notification
      this.showNotification("Using demo data - couldn't connect to blockchain");

      // Use fallback data
      this.updateStats(fallbackData.stats);
      this.processBlocks(fallbackData.blocks);
      this.processMempool(fallbackData.mempool);

      return fallbackData;
    }
  }

  // Update stats display
  updateStats(stats) {
    document.getElementById("block-count").textContent = stats.blockCount || 0;
    document.getElementById("tx-count").textContent = stats.totalTxCount || 0;
    document.getElementById("mempool-size").textContent =
      stats.mempoolSize || 0;

    // Update compass direction based on mining activity
    this.updateCompassDirection(stats.mempoolSize || 0);
  }

  // Update compass direction
  updateCompassDirection(mempoolSize) {
    // Transform mempool size into an angle (more txs = more north/east)
    const angle = (mempoolSize / 20) * 360; // 1 full rotation per 20 txs

    // Update compass arrow
    document.getElementById("compass-arrow").style.transform =
      `rotate(${angle}deg)`;

    // Update label based on quadrant
    const compassLabel = document.getElementById("compass-label");
    const direction = Math.floor(((angle + 45) % 360) / 90);

    switch (direction) {
      case 0:
        compassLabel.textContent = "MINING NORTH";
        break;
      case 1:
        compassLabel.textContent = "MINING EAST";
        break;
      case 2:
        compassLabel.textContent = "MINING SOUTH";
        break;
      case 3:
        compassLabel.textContent = "MINING WEST";
        break;
    }
  }

  // Process blocks into caravans
  processBlocks(blocks) {
    // Safety check for blocks data
    if (!blocks || !Array.isArray(blocks)) {
      console.warn("Invalid blocks data received:", blocks);
      return;
    }

    console.log("Processing", blocks.length, "blocks");

    // Clear existing caravans if needed
    if (this.state.caravans.length === 0) {
      // First time - add all blocks as caravans
      blocks.forEach((block, index) => {
        this.addCaravan(block, index);
      });
    } else {
      // Check for new blocks
      const knownHashes = this.state.blocks.map((b) => b.hash);

      blocks.forEach((block, index) => {
        if (!knownHashes.includes(block.hash)) {
          // New block found - add at the beginning
          this.addCaravan(block, 0, true);
        }
      });
    }

    // Update state
    this.state.blocks = [...blocks];
  }

  // Process mempool into traders
  processMempool(mempool) {
    // Safety check
    if (!mempool || !mempool.txids || !Array.isArray(mempool.txids)) {
      console.warn("Invalid mempool data:", mempool);
      return;
    }

    console.log(
      "Processing mempool with",
      mempool.txids.length,
      "transactions",
    );

    // Clear existing traders if needed
    if (this.traderLayer) {
      this.traderLayer.removeChildren();
    } else {
      console.warn("Trader layer not initialized");
      this.traderLayer = new PIXI.Container();
      this.worldContainer.addChild(this.traderLayer);
    }

    // Ensure traders array exists
    this.state.traders = [];

    // Calculate starting point for traders (near the first caravan)
    let startX, startY;

    if (this.state.caravans && this.state.caravans.length > 0) {
      startX = this.state.caravans[0].x - 300;
      startY = this.state.caravans[0].y;
    } else if (this.pathPoints && this.pathPoints.length > 0) {
      startX = this.pathPoints[0].x - 300;
      startY = this.pathPoints[0].y;
    } else {
      // Fallback position
      startX = -300;
      startY = 300;
    }

    // Add traders for each mempool transaction (limit to avoid performance issues)
    mempool.txids.slice(0, 20).forEach((txid, index) => {
      if (!txid) return;

      // Random position around the starting area
      const x = startX + Math.random() * 250 - 120;
      const y = startY + Math.random() * 40 - 20;

      // Add a trader for this transaction
      this.addTrader(txid, x, y, "waiting");
    });
  }

  // Add a caravan to represent a blockchain block
  addCaravan(block, position, isNew = false) {
    // Safety check - initialize pathPoints if it doesn't exist
    if (
      !this.pathPoints ||
      !Array.isArray(this.pathPoints) ||
      this.pathPoints.length === 0
    ) {
      console.warn("Path points not initialized, creating default path");
      // Create a default straight path
      this.pathPoints = [];
      const baseY = 300;
      for (let i = 0; i < 50; i++) {
        this.pathPoints.push({
          x: -window.innerWidth + i * 200,
          y: baseY,
        });
      }
    }

    // Calculate position along the path
    const pathPosition = Math.min(this.pathPoints.length - 1, position);
    const pathPoint = this.pathPoints[pathPosition];

    // Create caravan container
    const caravan = new PIXI.Container();

    // Main wagon (size based on block size)
    const baseWidth = 60;
    const baseHeight = 40;
    const sizeMultiplier = 0.5 + (block.txCount / 20) * 0.5; // Size based on tx count
    const width = baseWidth * sizeMultiplier;
    const height = baseHeight * sizeMultiplier;

    // Wagon body
    const wagon = new PIXI.Graphics();

    // Wagon bed
    wagon.beginFill(0x8b4513);
    wagon.drawRect(-width / 2, -height / 2, width, height / 2);
    wagon.endFill();

    // Wagon sides
    wagon.beginFill(0x8b4513);
    wagon.drawRect(-width / 2, -height, width, height / 2);
    wagon.endFill();

    // Wagon roof/cover (arched)
    wagon.beginFill(0xffcc00);

    // Create an arch shape for the cover
    wagon.moveTo(-width / 2, -height / 2);

    for (let i = 0; i <= 10; i++) {
      const progress = i / 10;
      const x = -width / 2 + width * progress;
      const y = -height / 2 - Math.sin(progress * Math.PI) * (height / 2);
      wagon.lineTo(x, y);
    }

    wagon.lineTo(width / 2, -height / 2);
    wagon.lineTo(-width / 2, -height / 2);

    wagon.endFill();

    // Wheels
    const wheelRadius = height / 4;

    // Left wheel
    wagon.beginFill(0x444444);
    wagon.drawCircle(-width / 3, 0, wheelRadius);
    wagon.endFill();

    wagon.beginFill(0x222222);
    wagon.drawCircle(-width / 3, 0, wheelRadius / 1.5);
    wagon.endFill();

    // Right wheel
    wagon.beginFill(0x444444);
    wagon.drawCircle(width / 3, 0, wheelRadius);
    wagon.endFill();

    wagon.beginFill(0x222222);
    wagon.drawCircle(width / 3, 0, wheelRadius / 1.5);
    wagon.endFill();

    // Block height number on the wagon
    const blockText = new PIXI.Text(`#${block.height}`, {
      fontFamily: "PixelFont, monospace",
      fontSize: 12,
      fill: 0x000000,
      align: "center",
    });
    blockText.anchor.set(0.5);
    blockText.x = 0;
    blockText.y = -height / 4;

    // Add block hash segment as a flag on top
    const hashFlag = new PIXI.Graphics();
    hashFlag.beginFill(0x1e3b70);
    hashFlag.drawRect(0, 0, 20, 15);
    hashFlag.endFill();

    // First characters of hash in yellow
    const hashText = new PIXI.Text(block.hash.substring(0, 3), {
      fontFamily: "PixelFont, monospace",
      fontSize: 8,
      fill: 0xffcc00,
      align: "center",
    });
    hashText.anchor.set(0.5);
    hashText.x = 10;
    hashText.y = 7;

    hashFlag.addChild(hashText);
    hashFlag.x = width / 4;
    hashFlag.y = -height - 20;

    // Add wagon components to caravan
    caravan.addChild(wagon);
    caravan.addChild(blockText);
    caravan.addChild(hashFlag);

    // Create a driver character
    const driver = new PIXI.Graphics();

    // Driver body
    driver.beginFill(0xaa5500);
    driver.drawRect(-5, -15, 10, 15);
    driver.endFill();

    // Driver head
    driver.beginFill(0xffcc99);
    driver.drawCircle(0, -20, 5);
    driver.endFill();

    // Driver hat
    driver.beginFill(0x8b4513);
    driver.drawCircle(0, -23, 5);
    driver.endFill();

    driver.x = -width / 4;
    driver.y = -height / 2;

    caravan.addChild(driver);

    // Position caravan
    caravan.x = pathPoint.x;
    caravan.y = pathPoint.y - 10; // Slightly above the path

    // Store block data with the caravan
    caravan.blockData = block;

    // Add to layer
    if (isNew) {
      this.caravanLayer.addChildAt(caravan, 0);
    } else {
      this.caravanLayer.addChild(caravan);
    }

    // Store in state
    if (isNew) {
      this.state.caravans.unshift(caravan);
    } else {
      this.state.caravans.push(caravan);
    }

    // Add animation for new caravans
    if (isNew) {
      // Start offscreen
      caravan.x = pathPoint.x - 500;

      // Play caravan sound
      if (this.state.soundEnabled) {
        this.sounds.caravan.play();
      }

      // Animate the caravan appearing
      gsap.to(caravan, {
        x: pathPoint.x,
        duration: 3,
        ease: "power2.out",
        onComplete: () => {
          // Add flag waving animation
          this.addFlagWavingAnimation(hashFlag);

          // Add wheel rotation animation
          this.addWheelRotationAnimation(wagon);
        },
      });
    } else {
      // Add flag waving animation
      this.addFlagWavingAnimation(hashFlag);

      // Add wheel rotation animation
      this.addWheelRotationAnimation(wagon);
    }

    // Make caravan interactive
    caravan.interactive = true;
    caravan.buttonMode = true;

    caravan.on("pointerover", (event) => {
      this.showTooltip(
        `Caravan #${block.height} (${block.hash.substring(0, 8)}...)`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    caravan.on("pointerout", () => {
      this.hideTooltip();
    });

    caravan.on("pointerdown", () => {
      this.showBlockDetails(block);
      if (this.state.soundEnabled) this.sounds.click.play();
    });

    return caravan;
  }

  // Add flag waving animation to caravan
  addFlagWavingAnimation(flag) {
    gsap.to(flag, {
      rotation: 0.1,
      duration: 0.8 + Math.random() * 0.4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  // Add wheel rotation animation to caravan
  addWheelRotationAnimation(wagon) {
    // This would animate the wheels, but would need specific wheel sprites
    // For this demonstration we'll skip the actual implementation
  }

  // Add a trader to represent a transaction
  addTrader(txid, x, y, state = "waiting") {
    // Create trader character
    const trader = new PIXI.Graphics();

    // Determine trader appearance
    const traderType = parseInt(txid.substring(0, 2), 16) % 3;

    // Basic body
    trader.beginFill(
      traderType === 0 ? 0x44aa88 : traderType === 1 ? 0xaa4488 : 0xaaaa44,
    );
    trader.drawRect(-8, -20, 16, 20);
    trader.endFill();

    // Head
    trader.beginFill(0xffcc99);
    trader.drawCircle(0, -25, 7);
    trader.endFill();

    // Different hat based on type
    switch (traderType) {
      case 0: // Merchant
        trader.beginFill(0x8b4513);
        trader.drawRect(-10, -30, 20, 3);
        trader.drawCircle(0, -30, 7);
        trader.endFill();
        break;
      case 1: // Nomad
        trader.beginFill(0xaa0000);
        trader.drawRect(-8, -35, 16, 5);
        trader.endFill();
        break;
      case 2: // Scout
        trader.beginFill(0x00aa00);
        trader.drawCircle(0, -32, 5);
        trader.endFill();
        break;
    }

    // Cargo items (scrolls/packages)
    trader.beginFill(0xddcc88);
    trader.drawRect(-10, -10, 5, 10);
    trader.drawRect(5, -15, 5, 15);
    trader.endFill();

    // Position trader
    trader.x = x;
    trader.y = y;

    // Store transaction data
    trader.txid = txid;
    trader.state = state;
    trader.traderType = ["merchant", "nomad", "scout"][traderType];

    // Add to layer
    this.traderLayer.addChild(trader);

    // Add to state
    this.state.traders.push(trader);

    // Add idle animation
    if (state === "waiting") {
      // Walking in place animation
      gsap.to(trader, {
        y: trader.y - 3,
        duration: 0.4,
        repeat: -1,
        yoyo: true,
        ease: "sine.inOut",
      });
    }

    // Make trader interactive
    trader.interactive = true;
    trader.buttonMode = true;

    trader.on("pointerover", (event) => {
      this.showTooltip(
        `Trader (TXID: ${txid.substring(0, 8)}...)`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    trader.on("pointerout", () => {
      this.hideTooltip();
    });

    trader.on("pointerdown", () => {
      this.showTransactionDetails(txid);
      if (this.state.soundEnabled) this.sounds.click.play();
    });

    return trader;
  }

  // Move a trader to join a caravan (for transaction confirmation)
  moveTraderToCaravan(trader, caravan) {
    // Set state to moving
    trader.state = "moving";

    // Stop existing animations
    gsap.killTweensOf(trader);

    // Play transaction sound
    if (this.state.soundEnabled) {
      this.sounds.transaction.play();
    }

    // Calculate path to caravan
    // For simplicity, we'll move directly, but in a full implementation
    // you'd want to calculate a path along the trail

    // Animate movement
    gsap.to(trader, {
      x: caravan.x,
      y: caravan.y,
      duration: 2,
      ease: "power1.inOut",
      onComplete: () => {
        // Trader reached the caravan
        trader.state = "confirmed";

        // Flash effect when joining
        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, 0.7);
        flash.drawCircle(0, 0, 30);
        flash.endFill();
        flash.x = caravan.x;
        flash.y = caravan.y;
        this.effectsLayer.addChild(flash);

        gsap.to(flash, {
          alpha: 0,
          duration: 0.5,
          onComplete: () => {
            this.effectsLayer.removeChild(flash);
          },
        });

        // Fade out and remove trader
        gsap.to(trader, {
          alpha: 0,
          duration: 0.5,
          onComplete: () => {
            this.traderLayer.removeChild(trader);
            this.state.traders = this.state.traders.filter((t) => t !== trader);
          },
        });
      },
    });

    return trader;
  }

  // Show tooltip
  showTooltip(text, x, y) {
    const tooltip = document.getElementById("tooltip");
    tooltip.textContent = text;
    tooltip.style.left = `${x + 10}px`;
    tooltip.style.top = `${y - 30}px`;
    tooltip.style.opacity = "1";
  }

  // Hide tooltip
  hideTooltip() {
    const tooltip = document.getElementById("tooltip");
    tooltip.style.opacity = "0";
  }

  // Show block details
  showBlockDetails(block) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    const detailsTitle = document.getElementById("details-title");

    detailsTitle.textContent = `CARAVAN #${block.height}`;

    // Format time as pixel-style date
    const date = new Date(block.time * 1000);
    const pixelDate = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

    detailsContent.innerHTML = `
      <div class="detail-section">
        <div class="detail-item">
          <span class="detail-label">ROUTE:</span>
          <span class="detail-value">${block.hash.substring(0, 20)}...</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">DEPARTED:</span>
          <span class="detail-value">${pixelDate}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">CARGO COUNT:</span>
          <span class="detail-value">${block.txCount || 0}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">CARAVAN SIZE:</span>
          <span class="detail-value">${(block.size / 1024).toFixed(2)} KB</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">JOURNEY DIFFICULTY:</span>
          <span class="detail-value">${block.difficulty.toFixed(2)}</span>
        </div>
      </div>

      <div class="detail-section">
        <h4>CARGO MANIFEST</h4>
        <div class="cargo-list">
          ${this.generateCargoItems(block)}
        </div>
      </div>

      <button id="forge-next-btn" class="pixel-button detail-action-btn">
        FORGE NEXT CARAVAN
      </button>
    `;

    detailsPanel.style.display = "block";

    // Add button handler
    document.getElementById("forge-next-btn").addEventListener("click", () => {
      this.triggerMineBlock();
      detailsPanel.style.display = "none";
    });
  }

  // Generate cargo items for block details
  generateCargoItems(block) {
    // For a full implementation, this would show actual transactions
    // For demo, we'll generate some placeholder items

    let html = "";

    const cargoTypes = [
      "GOLD COINS",
      "SPICES",
      "SILK",
      "GEMSTONES",
      "SCROLLS",
      "RARE METALS",
      "ARTIFACTS",
      "TEXTS",
      "TOOLS",
      "MAPS",
    ];

    const numItems = Math.min(block.txCount || 5, 10);

    for (let i = 0; i < numItems; i++) {
      const cargoType =
        cargoTypes[Math.floor(Math.random() * cargoTypes.length)];
      const value = (Math.random() * 2).toFixed(4);

      html += `
        <div class="cargo-item">
          <span class="cargo-icon"></span>
          <span class="cargo-name">${cargoType}</span>
          <span class="cargo-value">${value} BTC</span>
        </div>
      `;
    }

    if (block.txCount > 10) {
      html += `<div class="cargo-more">AND ${block.txCount - 10} MORE ITEMS...</div>`;
    }

    return html;
  }

  // Show transaction details
  async showTransactionDetails(txid) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    const detailsTitle = document.getElementById("details-title");

    detailsTitle.textContent = "TRADER CARGO";

    // Loading state
    detailsContent.innerHTML = `
      <div class="loading-indicator">
        LOADING TRADER DATA...
      </div>
    `;

    detailsPanel.style.display = "block";

    try {
      // Fetch transaction details
      const response = await fetch(`/api/tx/${txid}`);
      const tx = await response.json();

      // Update panel with details
      detailsContent.innerHTML = `
        <div class="detail-section">
          <div class="detail-item">
            <span class="detail-label">CARGO ID:</span>
            <span class="detail-value">${tx.txid.substring(0, 16)}...</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">WEIGHT:</span>
            <span class="detail-value">${tx.size} BYTES</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">SOURCES:</span>
            <span class="detail-value">${tx.vin.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">DESTINATIONS:</span>
            <span class="detail-value">${tx.vout.length}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">STATUS:</span>
            <span class="detail-value status-${tx.confirmations ? "confirmed" : "pending"}">
              ${tx.confirmations ? `DELIVERED (${tx.confirmations})` : "WAITING"}
            </span>
          </div>
        </div>

        <div class="detail-section">
          <h4>CARGO CONTENTS</h4>
          <div class="cargo-list">
            ${this.generateTransactionDetails(tx)}
          </div>
        </div>

        <button id="deliver-cargo-btn" class="pixel-button detail-action-btn">
          DELIVER CARGO NOW
        </button>
      `;

      // Add button handler
      document
        .getElementById("deliver-cargo-btn")
        .addEventListener("click", () => {
          // Find first caravan to attach to
          if (this.state.caravans.length > 0) {
            const caravan = this.state.caravans[0];

            // Find the trader
            const trader = this.state.traders.find((t) => t.txid === txid);

            if (trader) {
              this.moveTraderToCaravan(trader, caravan);
            }

            detailsPanel.style.display = "none";
            this.triggerMineBlock();
          } else {
            this.showNotification(
              "No caravans available. Forge a new one first!",
            );
          }
        });
    } catch (error) {
      detailsContent.innerHTML = `
        <div class="error-message">
          ERROR LOADING TRADER DATA
        </div>
      `;
    }
  }

  // Generate transaction details
  generateTransactionDetails(tx) {
    let html = "";

    // For a full implementation, we'd show actual inputs and outputs
    // For simplicity, we'll just show a summary

    if (tx.vin && tx.vin.length > 0) {
      html += '<div class="tx-section-label">SOURCES:</div>';

      tx.vin.slice(0, 3).forEach((input, index) => {
        if (input.coinbase) {
          html += `
            <div class="cargo-item special">
              <span class="cargo-icon"></span>
              <span class="cargo-name">NEW COINS (REWARD)</span>
              <span class="cargo-value">MINTED</span>
            </div>
          `;
        } else {
          html += `
            <div class="cargo-item">
              <span class="cargo-icon"></span>
              <span class="cargo-name">SOURCE #${index + 1}</span>
              <span class="cargo-value">${input.txid ? input.txid.substring(0, 8) + "..." : "Unknown"}</span>
            </div>
          `;
        }
      });

      if (tx.vin.length > 3) {
        html += `<div class="cargo-more">AND ${tx.vin.length - 3} MORE SOURCES...</div>`;
      }
    }

    if (tx.vout && tx.vout.length > 0) {
      html += '<div class="tx-section-label">DESTINATIONS:</div>';

      tx.vout.slice(0, 3).forEach((output, index) => {
        const address =
          output.scriptPubKey.address ||
          (output.scriptPubKey.addresses
            ? output.scriptPubKey.addresses[0]
            : "Unknown");

        html += `
          <div class="cargo-item">
            <span class="cargo-icon"></span>
            <span class="cargo-name">DEST #${index + 1}: ${address.substring(0, 8)}...</span>
            <span class="cargo-value">${output.value} BTC</span>
          </div>
        `;
      });

      if (tx.vout.length > 3) {
        html += `<div class="cargo-more">AND ${tx.vout.length - 3} MORE DESTINATIONS...</div>`;
      }
    }

    return html;
  }

  // Show miner details
  showMinerDetails(minerData) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    const detailsTitle = document.getElementById("details-title");

    detailsTitle.textContent = minerData.name.toUpperCase();

    detailsContent.innerHTML = `
      <div class="detail-section">
        <div class="detail-item">
          <span class="detail-label">HASH POWER:</span>
          <span class="detail-value">${minerData.hashPower} UNITS</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">BLOCKS FOUND:</span>
          <span class="detail-value">${minerData.blocksFound}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">STATUS:</span>
          <span class="detail-value status-${minerData.active ? "active" : "inactive"}">
            ${minerData.active ? "ACTIVE" : "INACTIVE"}
          </span>
        </div>
      </div>

      <div class="miner-actions">
        <button id="mine-with-btn" class="pixel-button detail-action-btn">
          FORGE WITH THIS MINER
        </button>
      </div>
    `;

    detailsPanel.style.display = "block";

    // Add button handler
    document.getElementById("mine-with-btn").addEventListener("click", () => {
      this.triggerMineBlock();
      detailsPanel.style.display = "none";
    });
  }

  // Show outpost details
  showOutpostDetails(outpostData) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    const detailsTitle = document.getElementById("details-title");

    detailsTitle.textContent = outpostData.name.toUpperCase();

    detailsContent.innerHTML = `
      <div class="detail-section">
        <div class="detail-item">
          <span class="detail-label">TYPE:</span>
          <span class="detail-value">${outpostData.type}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">CONNECTIONS:</span>
          <span class="detail-value">${outpostData.connections}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">ROLE:</span>
          <span class="detail-value">${
            outpostData.type === "Full Node"
              ? "VERIFICATION & ROUTING"
              : outpostData.type === "Mining Node"
                ? "BLOCK PRODUCTION"
                : "WALLET SERVICES"
          }</span>
        </div>
      </div>

      <div class="outpost-description">
        ${
          outpostData.type === "Full Node"
            ? "This outpost maintains a complete copy of the blockchain and relays transactions and blocks to other nodes."
            : outpostData.type === "Mining Node"
              ? "This outpost works to solve the proof-of-work puzzle and create new blocks in the blockchain."
              : "This light client helps users connect to the network without needing to download the entire blockchain."
        }
      </div>
    `;

    detailsPanel.style.display = "block";
  }

  // Show trader details
  showTraderDetails(traderData) {
    const detailsPanel = document.getElementById("details-panel");
    const detailsContent = document.getElementById("details-content");
    const detailsTitle = document.getElementById("details-title");

    detailsTitle.textContent = traderData.name.toUpperCase();

    detailsContent.innerHTML = `
      <div class="detail-section">
        <div class="detail-item">
          <span class="detail-label">SPECIALITY:</span>
          <span class="detail-value">${traderData.speciality}</span>
        </div>
        <div class="detail-item">
          <span class="detail-label">INVENTORY:</span>
          <span class="detail-value">${traderData.inventory} ITEMS</span>
        </div>
      </div>

      <div class="trader-inventory">
        <h4>AVAILABLE ITEMS</h4>
        <div class="inventory-list">
          ${this.generateTraderInventory(traderData)}
        </div>
      </div>

      <button id="create-tx-btn" class="pixel-button detail-action-btn">
        CREATE TRANSACTION
      </button>
    `;

    detailsPanel.style.display = "block";

    // Add button handler
    document.getElementById("create-tx-btn").addEventListener("click", () => {
      this.triggerCreateTransaction();
      detailsPanel.style.display = "none";
    });
  }

  // Generate trader inventory
  generateTraderInventory(traderData) {
    // For demo, we'll create some random inventory
    const items = [];
    const itemTypes = [
      "GOLD COINS",
      "SPICES",
      "SILK",
      "GEMSTONES",
      "RARE TOKENS",
      "DIGITAL ASSETS",
      "NFT SCROLLS",
      "SMART CONTRACTS",
    ];

    for (let i = 0; i < traderData.inventory; i++) {
      const item = {
        name: itemTypes[Math.floor(Math.random() * itemTypes.length)],
        price: (Math.random() * 0.1).toFixed(4),
        quantity: Math.floor(Math.random() * 10) + 1,
      };
      items.push(item);
    }

    let html = "";
    items.forEach((item) => {
      html += `
        <div class="inventory-item">
          <span class="item-name">${item.name}</span>
          <span class="item-details">x${item.quantity} (${item.price} BTC)</span>
        </div>
      `;
    });

    return html;
  }

  // Show a notification
  showNotification(message) {
    try {
      const container = document.getElementById("notification-container");

      if (!container) {
        console.warn("Notification container not found, creating it");
        const newContainer = document.createElement("div");
        newContainer.id = "notification-container";
        newContainer.className = "notification-container";
        document.body.appendChild(newContainer);

        // Try again with the new container
        return this.showNotification(message);
      }

      const notification = document.createElement("div");
      notification.className = "notification";
      notification.textContent = message;

      container.appendChild(notification);

      // Remove after animation completes
      setTimeout(() => {
        if (notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 4000);
    } catch (error) {
      console.warn("Could not show notification:", message, error);
    }
  }

  // Show the tutorial
  showTutorial() {
    document.getElementById("tutorial").style.display = "block";

    // Add close button handler
    document.getElementById("tutorial-close").addEventListener("click", () => {
      document.getElementById("tutorial").style.display = "none";
      this.state.isTutorialShown = true;
    });
  }

  // Play intro animation
  playIntroAnimation() {
    // Pan camera to show the world
    gsap.to(this.state.camera, {
      x: -200,
      y: -50,
      duration: 3,
      ease: "power2.inOut",
    });

    // Zoom out slightly
    gsap.to(this.state.camera, {
      targetScale: 0.8,
      duration: 3,
      ease: "power2.inOut",
    });

    // Highlight the first caravan
    if (this.state.caravans.length > 0) {
      const firstCaravan = this.state.caravans[0];

      // Add highlight effect
      const highlight = new PIXI.Graphics();
      highlight.beginFill(0xffcc00, 0.3);
      highlight.drawCircle(0, 0, 50);
      highlight.endFill();
      highlight.x = firstCaravan.x;
      highlight.y = firstCaravan.y;
      this.effectsLayer.addChild(highlight);

      // Animate highlight
      gsap.to(highlight, {
        alpha: 0,
        duration: 1.5,
        repeat: 2,
        yoyo: true,
        onComplete: () => {
          this.effectsLayer.removeChild(highlight);
        },
      });
    }
  }

  // Setup event listeners
  setupEventListeners() {
    // Socket events
    this.socket.on("connect", () => {
      console.log("Connected to server");
      this.showNotification("Connected to blockchain network");
    });

    this.socket.on("disconnect", () => {
      console.log("Disconnected from server");
      this.showNotification("Disconnected from blockchain network");
    });

    this.socket.on("blockchain_update", (data) => {
      console.log("Received blockchain update", data);
      this.updateStats(data.stats);
      this.processBlocks(data.blocks);
      this.processMempool(data.mempool);
    });

    this.socket.on("new_block", (block) => {
      console.log("New block mined", block);
      this.processNewBlock(block);
      this.showNotification(`New caravan formed: Block #${block.height}`);
    });

    this.socket.on("new_transaction", (tx) => {
      console.log("New transaction", tx);
      this.processNewTransaction(tx);
      this.showNotification(`New cargo ready: ${tx.txid.substring(0, 8)}...`);
    });

    this.socket.on("mining_started", (data) => {
      console.log("Mining started", data);
      this.showMiningActivity(data);
    });

    this.socket.on("mining_complete", (data) => {
      console.log("Mining complete", data);
      this.completeMiningActivity(data);
    });

    // UI button events
    document.getElementById("mine-btn").addEventListener("click", () => {
      this.triggerMineBlock();
    });

    document.getElementById("tx-btn").addEventListener("click", () => {
      this.triggerCreateTransaction();
    });

    document.getElementById("zoom-in-btn").addEventListener("click", () => {
      this.state.camera.targetScale = Math.min(
        2,
        this.state.camera.targetScale + 0.2,
      );
    });

    document.getElementById("zoom-out-btn").addEventListener("click", () => {
      this.state.camera.targetScale = Math.max(
        0.5,
        this.state.camera.targetScale - 0.2,
      );
    });

    // Close details panel
    document.getElementById("details-close").addEventListener("click", () => {
      document.getElementById("details-panel").style.display = "none";
    });

    // View toggle buttons
    document.getElementById("view-toggle").addEventListener("click", () => {
      window.location.href = "index.html";
    });

    document
      .getElementById("minecraft-toggle")
      .addEventListener("click", () => {
        window.location.href = "index-minecraft.html";
      });

    // Sound toggle
    document.getElementById("toggle-sound").addEventListener("click", () => {
      this.toggleSound();
    });

    // Dragging functionality
    this.app.view.addEventListener("mousedown", (e) => {
      this.state.camera.dragging = true;
      this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
    });

    this.app.view.addEventListener("touchstart", (e) => {
      this.state.camera.dragging = true;
      this.state.camera.lastPosition = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    });

    window.addEventListener("mouseup", () => {
      this.state.camera.dragging = false;
    });

    window.addEventListener("touchend", () => {
      this.state.camera.dragging = false;
    });

    this.app.view.addEventListener("mousemove", (e) => {
      if (this.state.camera.dragging && this.state.camera.lastPosition) {
        const dx = e.clientX - this.state.camera.lastPosition.x;
        const dy = e.clientY - this.state.camera.lastPosition.y;

        this.state.camera.x += dx;
        this.state.camera.y += dy;

        this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
      }
    });

    this.app.view.addEventListener("touchmove", (e) => {
      if (this.state.camera.dragging && this.state.camera.lastPosition) {
        const dx = e.touches[0].clientX - this.state.camera.lastPosition.x;
        const dy = e.touches[0].clientY - this.state.camera.lastPosition.y;

        this.state.camera.x += dx;
        this.state.camera.y += dy;

        this.state.camera.lastPosition = {
          x: e.touches[0].clientX,
          y: e.touches[0].clientY,
        };
      }
    });

    // Window resize
    window.addEventListener("resize", () => {
      this.app.renderer.resize(window.innerWidth, window.innerHeight);
    });
  }

  // Process a new block
  processNewBlock(block) {
    // Add the block to our state
    this.state.blocks.unshift(block);

    // Create a new caravan
    this.addCaravan(block, 0, true);

    // Update stats
    const blockCount = document.getElementById("block-count");
    blockCount.textContent = (parseInt(blockCount.textContent) + 1).toString();

    // Move some traders into the new caravan
    if (this.state.caravans.length > 0) {
      const caravan = this.state.caravans[0];

      // Find traders in waiting state
      const waitingTraders = this.state.traders
        .filter((trader) => trader.state === "waiting")
        .slice(0, 5); // Limit to 5 traders

      // Move traders to the caravan
      waitingTraders.forEach((trader) => {
        this.moveTraderToCaravan(trader, caravan);
      });
    }

    // Update mempool display
    document.getElementById("mempool-size").textContent = Math.max(
      0,
      parseInt(document.getElementById("mempool-size").textContent) - 5,
    ).toString();
  }

  // Process a new transaction
  processNewTransaction(tx) {
    // Create a new trader at a random entry point
    const startX =
      this.state.caravans.length > 0
        ? this.state.caravans[0].x - 300 - Math.random() * 200
        : this.pathPoints[0].x - 300 - Math.random() * 200;

    const startY = this.pathPoints[0].y + Math.random() * 40 - 20;

    this.addTrader(tx.txid, startX, startY, "waiting");

    // Update mempool display
    document.getElementById("mempool-size").textContent = (
      parseInt(document.getElementById("mempool-size").textContent) + 1
    ).toString();

    // Play transaction sound
    if (this.state.soundEnabled) {
      this.sounds.transaction.play();
    }
  }

  // Show mining activity
  showMiningActivity(data) {
    // Add visual effects to miners
    this.state.miners.forEach((miner) => {
      // Add mining particles
      this.addMiningParticles(miner);
    });

    // Show notification
    this.showNotification(`Forging ${data.blocks} caravans...`);
  }

  // Complete mining activity
  completeMiningActivity(data) {
    // Show success effect
    this.showNotification(
      `Successfully forged ${data.blockHashes.length} caravans!`,
    );
  }

  // Add mining particles
  addMiningParticles(miner) {
    // Creates floating particles around the miner
    const particleCount = 10;
    const particles = [];

    for (let i = 0; i < particleCount; i++) {
      const particle = new PIXI.Graphics();
      particle.beginFill(0xffcc00, 0.8);
      particle.drawCircle(0, 0, 2);
      particle.endFill();

      particle.x = miner.x;
      particle.y = miner.y;

      this.effectsLayer.addChild(particle);
      particles.push(particle);

      // Animate particle
      gsap.to(particle, {
        x: miner.x + Math.random() * 40 - 20,
        y: miner.y + Math.random() * 40 - 20,
        alpha: 0,
        duration: 1 + Math.random(),
        onComplete: () => {
          this.effectsLayer.removeChild(particle);
        },
      });
    }
  }

  // Trigger mining a new block
  triggerMineBlock() {
    // Play mining sound
    if (this.state.soundEnabled) {
      this.sounds.mining.play();
    }

    // Add visual effects to miners
    this.state.miners.forEach((miner) => {
      // Add mining particles
      this.addMiningParticles(miner);
    });

    // Call the API to mine a new block
    fetch("/api/mine-block", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ blocks: 1 }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Mining block result:", data);
        this.showNotification(
          `Caravan forge request sent. Waiting for formation...`,
        );
      })
      .catch((error) => {
        console.error("Error mining block:", error);
        this.showNotification(`Error forging caravan: ${error.message}`);
      });
  }

  // Trigger creating a new transaction
  triggerCreateTransaction() {
    // Play transaction sound
    if (this.state.soundEnabled) {
      this.sounds.transaction.play();
    }

    // Create a random transaction
    fetch("/api/create-transaction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fromWallet: "wallet1",
        toAddress: "mxDuAYQUaT3ytdR5E7QKnKLPXXhhqPKTdZ",
        amount: 0.001 + Math.random() * 0.01,
      }),
    })
      .then((response) => response.json())
      .then((data) => {
        console.log("Create transaction result:", data);
        this.showNotification(
          `New cargo created! TXID: ${data.txid.substring(0, 8)}...`,
        );
      })
      .catch((error) => {
        console.error("Error creating transaction:", error);
        this.showNotification(`Error creating cargo: ${error.message}`);
      });
  }

  // Toggle sound on/off
  toggleSound() {
    this.state.soundEnabled = !this.state.soundEnabled;

    // Update icon
    const soundIcon = document.getElementById("sound-icon");
    if (this.state.soundEnabled) {
      soundIcon.className = "pixel-icon-sound-on";
      this.sounds.ambient.play();
    } else {
      soundIcon.className = "pixel-icon-sound-off";
      this.sounds.ambient.pause();
      this.sounds.rain.pause();
    }

    this.showNotification(
      `Sound ${this.state.soundEnabled ? "enabled" : "disabled"}`,
    );
  }

  // Update weather conditions
  updateWeather() {
    // Check if it's time to change weather
    this.state.weatherTimer++;

    if (this.state.weatherTimer >= this.state.weatherDuration) {
      this.state.weatherTimer = 0;

      // Random weather change
      const weathers = ["clear", "cloudy", "rainy"];
      const currentIndex = weathers.indexOf(this.state.weather);

      // Slightly favor returning to clear weather
      let newIndex;
      if (currentIndex !== 0 && Math.random() < 0.6) {
        newIndex = 0; // Clear weather
      } else {
        // Random weather that's different from current
        do {
          newIndex = Math.floor(Math.random() * weathers.length);
        } while (newIndex === currentIndex);
      }

      this.changeWeather(weathers[newIndex]);
    }
  }

  // Change weather conditions
  changeWeather(newWeather) {
    const oldWeather = this.state.weather;
    this.state.weather = newWeather;

    // Update weather indicator
    const weatherIndicator = document.getElementById("weather-indicator");

    switch (newWeather) {
      case "clear":
        weatherIndicator.innerHTML = '<span class="pixel-icon-sun"></span>';
        break;
      case "cloudy":
        weatherIndicator.innerHTML = '<span class="pixel-icon-cloud"></span>';
        break;
      case "rainy":
        weatherIndicator.innerHTML = '<span class="pixel-icon-rain"></span>';
        break;
    }

    // Visual effects based on weather
    switch (newWeather) {
      case "clear":
        // Clear existing weather effects
        this.clearWeatherEffects();

        // Brighten the sky
        gsap.to(this.sky, {
          tint: 0x4477aa,
          duration: 3,
        });

        // Stop rain sound if it was playing
        if (oldWeather === "rainy" && this.state.soundEnabled) {
          this.sounds.rain.fade(0.2, 0, 3000);
        }
        break;

      case "cloudy":
        // Clear existing weather effects
        this.clearWeatherEffects();

        // Add more clouds
        for (let i = 0; i < 10; i++) {
          this.createCloud(
            Math.random() * window.innerWidth * 3 - window.innerWidth,
            Math.random() * 200,
            0.05 + Math.random() * 0.1,
          );
        }

        // Darken the sky slightly
        gsap.to(this.sky, {
          tint: 0x3a6080,
          duration: 3,
        });

        // Stop rain sound if it was playing
        if (oldWeather === "rainy" && this.state.soundEnabled) {
          this.sounds.rain.fade(0.2, 0, 3000);
        }
        break;

      case "rainy":
        // Clear existing weather effects
        this.clearWeatherEffects();

        // Add darker clouds
        for (let i = 0; i < 15; i++) {
          const cloud = this.createCloud(
            Math.random() * window.innerWidth * 3 - window.innerWidth,
            Math.random() * 150,
            0.03 + Math.random() * 0.08,
          );

          // Darker clouds
          cloud.tint = 0x555555;
        }

        // Darken the sky
        gsap.to(this.sky, {
          tint: 0x2a4060,
          duration: 3,
        });

        // Start rain animation
        this.startRainAnimation();

        // Play rain sound
        if (this.state.soundEnabled) {
          this.sounds.rain.volume(0);
          this.sounds.rain.play();
          this.sounds.rain.fade(0, 0.2, 3000);
        }
        break;
    }

    this.showNotification(`Weather changed to ${newWeather}`);
  }

  // Clear weather effects
  clearWeatherEffects() {
    // Remove any weather-specific effects
    this.stopRainAnimation();

    // Remove excess clouds (keep only a few)
    if (this.clouds.children.length > 10) {
      // Keep first 10 clouds, remove the rest
      while (this.clouds.children.length > 10) {
        this.clouds.removeChildAt(10);
      }
    }
  }

  // Start rain animation
  startRainAnimation() {
    // Create rain container if it doesn't exist
    if (!this.rain) {
      this.rain = new PIXI.Container();
      this.effectsLayer.addChild(this.rain);
    }

    // Create raindrops
    for (let i = 0; i < 200; i++) {
      this.createRaindrop();
    }

    // Schedule periodic raindrop creation
    this.rainInterval = setInterval(() => {
      for (let i = 0; i < 5; i++) {
        this.createRaindrop();
      }
    }, 100);
  }

  // Create a single raindrop
  createRaindrop() {
    const raindrop = new PIXI.Graphics();
    raindrop.beginFill(0x4477aa, 0.7);
    raindrop.drawRect(0, 0, 1, 5);
    raindrop.endFill();

    // Random position above the screen, covering the viewable area
    raindrop.x =
      this.state.camera.x -
      window.innerWidth +
      Math.random() * window.innerWidth * 2;
    raindrop.y = this.state.camera.y - window.innerHeight - Math.random() * 100;

    // Add velocity for animation
    raindrop.vy = 10 + Math.random() * 5;
    raindrop.vx = 1 + Math.random();

    this.rain.addChild(raindrop);

    return raindrop;
  }

  // Update rain animation
  updateRainAnimation(delta) {
    if (!this.rain) return;

    // Update each raindrop
    for (let i = this.rain.children.length - 1; i >= 0; i--) {
      const raindrop = this.rain.children[i];

      // Move raindrop
      raindrop.y += raindrop.vy * delta * 60;
      raindrop.x += raindrop.vx * delta * 60;

      // Remove if offscreen
      if (
        raindrop.y >
        this.state.camera.y + window.innerHeight / this.state.camera.scale + 100
      ) {
        this.rain.removeChild(raindrop);

        // Create splash effect occasionally
        if (Math.random() > 0.9) {
          this.createRainSplash(raindrop.x, 300 + Math.random() * 100);
        }
      }
    }

    // If too few raindrops, add more
    if (this.rain.children.length < 100) {
      for (let i = 0; i < 10; i++) {
        this.createRaindrop();
      }
    }
  }

  // Create rain splash effect
  createRainSplash(x, y) {
    // Tiny circle that fades quickly
    const splash = new PIXI.Graphics();
    splash.beginFill(0x4477aa, 0.5);
    splash.drawCircle(0, 0, 2);
    splash.endFill();

    splash.x = x;
    splash.y = y;

    this.effectsLayer.addChild(splash);

    // Animate and remove
    gsap.to(splash, {
      alpha: 0,
      width: 6,
      height: 2,
      duration: 0.5,
      onComplete: () => {
        this.effectsLayer.removeChild(splash);
      },
    });
  }

  // Stop rain animation
  stopRainAnimation() {
    if (this.rainInterval) {
      clearInterval(this.rainInterval);
      this.rainInterval = null;
    }

    if (this.rain) {
      this.effectsLayer.removeChild(this.rain);
      this.rain = null;
    }
  }

  // Update time of day (day/night cycle)
  updateTimeOfDay(delta) {
    // Update time
    this.state.timeOfDay += delta * 0.1; // Speed of day/night cycle
    if (this.state.timeOfDay >= 24) {
      this.state.timeOfDay = 0;
    }

    // Update game time display
    const hours = Math.floor(this.state.timeOfDay);
    const minutes = Math.floor((this.state.timeOfDay - hours) * 60);
    document.getElementById("game-time").textContent =
      `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    // Update sky and lighting based on time
    this.updateDayNightCycle();
  }

  // Update the day/night cycle visuals
  updateDayNightCycle() {
    const time = this.state.timeOfDay;

    // Night: 0-6, Day: 8-18, Sunset: 18-20, Sunrise: 6-8, Evening: 20-24
    let skyColor, ambientIntensity, sunPosition, moonPosition;

    if (time >= 22 || time < 4) {
      // Night
      skyColor = 0x102040;
      ambientIntensity = 0.2;
      sunPosition = -40;
      moonPosition = 100;
    } else if (time >= 4 && time < 6) {
      // Dawn
      const t = (time - 4) / 2; // 0 to 1
      skyColor = this.lerpColor(0x102040, 0x6080c0, t);
      ambientIntensity = 0.2 + 0.2 * t;
      sunPosition = -40 + 80 * t;
      moonPosition = 100 - 40 * t;
    } else if (time >= 6 && time < 8) {
      // Sunrise
      const t = (time - 6) / 2; // 0 to 1
      skyColor = this.lerpColor(0x6080c0, 0x4477aa, t);
      ambientIntensity = 0.4 + 0.4 * t;
      sunPosition = 40 + 60 * t;
      moonPosition = 60 - 60 * t;
    } else if (time >= 8 && time < 18) {
      // Day
      skyColor = 0x4477aa;
      ambientIntensity = 0.8;
      sunPosition = 100;
      moonPosition = 0;
    } else if (time >= 18 && time < 20) {
      // Sunset
      const t = (time - 18) / 2; // 0 to 1
      skyColor = this.lerpColor(0x4477aa, 0xcc5500, t);
      ambientIntensity = 0.8 - 0.3 * t;
      sunPosition = 100 - 60 * t;
      moonPosition = 0 + 20 * t;
    } else if (time >= 20 && time < 22) {
      // Dusk
      const t = (time - 20) / 2; // 0 to 1
      skyColor = this.lerpColor(0xcc5500, 0x102040, t);
      ambientIntensity = 0.5 - 0.3 * t;
      sunPosition = 40 - 80 * t;
      moonPosition = 20 + 80 * t;
    }

    // Apply sky color
    if (this.sky) {
      // Don't override weather tint
      if (this.state.weather === "clear") {
        this.sky.tint = skyColor;
      }
    }

    // Position sun and moon
    if (this.sun) {
      this.sun.y = 300 - sunPosition;
      this.sun.alpha = Math.max(0, Math.min(1, sunPosition / 100));
    }

    if (this.moon) {
      this.moon.y = 300 - moonPosition;
      this.moon.alpha = Math.max(0, Math.min(1, moonPosition / 100));
    }

    // Show/hide stars
    if (this.stars) {
      this.stars.children.forEach((star) => {
        star.alpha = Math.max(0, (1 - sunPosition / 100) * 0.8);
      });
    }

    // Apply dark overlay for night time
    const timeCycle = document.getElementById("time-cycle");
    if (time >= 20 || time < 6) {
      // Night time
      const nightIntensity =
        time >= 22 || time < 4
          ? 0.5
          : time >= 4 && time < 6
            ? 0.5 - (time - 4) * 0.25
            : (time - 20) * 0.25;

      timeCycle.style.opacity = nightIntensity.toString();
    } else {
      timeCycle.style.opacity = "0";
    }

    // Update torch/fire brightness (brighter at night)
    this.updateLightSources(1 - ambientIntensity);
  }

  // Interpolate between two colors
  lerpColor(color1, color2, t) {
    const r1 = (color1 >> 16) & 255;
    const g1 = (color1 >> 8) & 255;
    const b1 = color1 & 255;

    const r2 = (color2 >> 16) & 255;
    const g2 = (color2 >> 8) & 255;
    const b2 = color2 & 255;

    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    return (r << 16) + (g << 8) + b;
  }

  // Update light sources based on time of day
  updateLightSources(intensity) {
    // Brighten campfires, lights, etc. at night
    // This would require tracking all light sources in a real implementation
    // For this demo, we'll leave it as a placeholder
  }

  // Main game loop
  gameLoop(delta) {
    const dt = Math.min(delta, 0.1); // Cap delta time to avoid huge jumps

    // Update game time and day/night cycle
    this.updateTimeOfDay(dt);

    // Update game state
    this.state.gameTime += dt;

    // Update camera
    this.state.camera.scale +=
      (this.state.camera.targetScale - this.state.camera.scale) * 0.1;
    this.worldContainer.position.set(
      window.innerWidth / 2 + this.state.camera.x,
      window.innerHeight / 2 + this.state.camera.y,
    );
    this.worldContainer.scale.set(
      this.state.camera.scale,
      this.state.camera.scale,
    );

    // Update clouds
    if (this.clouds) {
      this.clouds.children.forEach((cloud) => {
        cloud.x += cloud.speed * dt * 60;

        // Wrap around screen
        if (
          cloud.x >
          this.state.camera.x +
            window.innerWidth / this.state.camera.scale +
            cloud.cloudWidth
        ) {
          cloud.x =
            this.state.camera.x -
            window.innerWidth / this.state.camera.scale -
            cloud.cloudWidth;
        }
      });
    }

    // Update weather effects
    this.updateWeather();
    if (this.rain) {
      this.updateRainAnimation(dt);
    }

    // Update caravans
    this.updateCaravans(dt);

    // Update traders
    this.updateTraders(dt);

    // Update miners
    this.updateMiners(dt);

    // Random events
    this.triggerRandomEvents();
  }

  // Update caravans
  updateCaravans(delta) {
    // Add subtle animations to caravans
    this.state.caravans.forEach((caravan, index) => {
      // Skip the first caravan (already at final position)
      if (index === 0) return;

      // Calculate target position along the trail
      const pathIndex = Math.min(this.pathPoints.length - 1, index);
      const pathPoint = this.pathPoints[pathIndex];

      // Move caravan gradually towards target position
      const distance = Math.sqrt(
        Math.pow(caravan.x - pathPoint.x, 2) +
          Math.pow(caravan.y - (pathPoint.y - 10), 2),
      );

      if (distance > 1) {
        caravan.x += (pathPoint.x - caravan.x) * 0.01 * delta * 60;
        caravan.y += (pathPoint.y - 10 - caravan.y) * 0.01 * delta * 60;
      }

      // Add subtle swaying motion
      caravan.y +=
        Math.sin(this.state.gameTime * 2 + index) * 0.05 * delta * 60;
    });
  }

  // Update traders
  updateTraders(delta) {
    // Add idle animations and movement patterns for waiting traders
    this.state.traders.forEach((trader) => {
      if (trader.state === "waiting") {
        // Walking in place animation is already added in addTrader

        // Occasionally change direction
        if (Math.random() < 0.01) {
          const direction = Math.random() > 0.5 ? 1 : -1;
          const distance = 10 + Math.random() * 20;

          gsap.to(trader, {
            x: trader.x + direction * distance,
            duration: 2 + Math.random() * 2,
            ease: "power1.inOut",
          });
        }
      }
    });
  }

  // Update miners
  updateMiners(delta) {
    // For miners with active state, occasionally show mining effects
    this.state.miners.forEach((miner) => {
      if (miner.minerData && miner.minerData.active && Math.random() < 0.01) {
        // Small probability to show mining effect
        this.addMiningParticles(miner);

        // Probability to find a block based on hash power
        const findBlockChance = miner.minerData.hashPower / 10000;

        if (Math.random() < findBlockChance) {
          // This miner found a block!
          this.triggerMineBlock();

          // Increment blocks found
          miner.minerData.blocksFound++;
        }
      }
    });
  }

  // Trigger random events
  triggerRandomEvents() {
    // Occasional random events to make the world feel alive
    if (Math.random() < 0.001) {
      // Very low probability
      const eventType = Math.floor(Math.random() * 5);

      switch (eventType) {
        case 0:
          // Random trader appears
          this.triggerCreateTransaction();
          break;
        case 1:
          // Weather change
          const weathers = ["clear", "cloudy", "rainy"];
          const newWeather =
            weathers[Math.floor(Math.random() * weathers.length)];
          if (newWeather !== this.state.weather) {
            this.changeWeather(newWeather);
          }
          break;
        case 2:
          // Wandering miner
          if (this.state.miners.length > 0) {
            const randomMiner =
              this.state.miners[
                Math.floor(Math.random() * this.state.miners.length)
              ];
            this.showNotification(
              `${randomMiner.minerData.name} is looking for new mining opportunities!`,
            );
          }
          break;
        case 3:
          // Network message
          const messages = [
            "Network difficulty adjustment approaching...",
            "Increased transaction activity detected!",
            "Node connections optimized",
            "Mempool validation in progress",
          ];
          this.showNotification(
            messages[Math.floor(Math.random() * messages.length)],
          );
          break;
        case 4:
          // Rare caravan event
          if (this.state.caravans.length > 0) {
            const randomCaravan =
              this.state.caravans[
                Math.floor(Math.random() * this.state.caravans.length)
              ];
            this.showNotification(
              `Caravan #${randomCaravan.blockData.height} is sharing its route with other travelers`,
            );
          }
          break;
      }
    }
  }
}

// Initialize the application when the page is loaded
document.addEventListener("DOMContentLoaded", () => {
  // Setup loading bar first
  let loadingProgress = 0;
  const loadingInterval = setInterval(() => {
    loadingProgress += 5;
    if (loadingProgress > 100) {
      clearInterval(loadingInterval);
      return;
    }
    document.getElementById("loading-bar").style.width = `${loadingProgress}%`;
  }, 100);

  // Create the game
  window.game = new CaravanXBlockchain();
});
