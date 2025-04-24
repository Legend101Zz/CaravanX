/**
 * Types for CaravanXBlockchain
 */
interface CaravanState {
  blocks: any[];
  mempool: any[];
  caravans: PIXI.Container[];
  traders: PIXI.Graphics[];
  miners: PIXI.Graphics[];
  outposts: PIXI.Graphics[];
  focusedEntity: any | null;
  timeOfDay: number;
  gameTime: number;
  weather: "clear" | "cloudy" | "rainy";
  weatherTimer: number;
  weatherDuration: number;
  isTutorialShown: boolean;
  soundEnabled: boolean;
  camera: {
    x: number;
    y: number;
    scale: number;
    targetScale: number;
    dragging: boolean;
    lastPosition: { x: number; y: number } | null;
  };
  animationIds: any[]; // Store animation IDs for cleanup
}

interface Sound {
  play: () => void;
  pause: () => void;
  stop?: () => void;
  fade?: (from: number, to: number, duration: number) => void;
  volume?: (level: number) => void;
}

interface Sounds {
  mining: Sound;
  transaction: Sound;
  click: Sound;
  caravan: Sound;
  ambient: Sound;
  rain: Sound;
}

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
  // PIXI Application
  private app: PIXI.Application;

  // Containers
  private worldContainer: PIXI.Container;
  private backgroundLayer: PIXI.Container;
  private trailLayer: PIXI.Container;
  private caravanLayer: PIXI.Container;
  private traderLayer: PIXI.Container;
  private minerLayer: PIXI.Container;
  private outpostLayer: PIXI.Container;
  private effectsLayer: PIXI.Container;
  private uiLayer: PIXI.Container;

  // Path data
  private pathPoints: Array<{ x: number; y: number }> = [];

  // World elements
  private sky: PIXI.Graphics | null = null;
  private sun: PIXI.Graphics | null = null;
  private moon: PIXI.Graphics | null = null;
  private stars: PIXI.Container | null = null;
  private clouds: PIXI.Container | null = null;
  private trail: PIXI.Graphics | null = null;
  private ground: PIXI.Graphics | null = null;
  private mountains: PIXI.Graphics | null = null;

  // Weather effects
  private rain: PIXI.Container | null = null;
  private rainInterval: NodeJS.Timeout | null = null;

  // Socket connection
  private socket: any | null = null;

  // Sounds
  private sounds: Sounds = {
    mining: { play: () => {}, pause: () => {} },
    transaction: { play: () => {}, pause: () => {} },
    click: { play: () => {}, pause: () => {} },
    caravan: { play: () => {}, pause: () => {} },
    ambient: { play: () => {}, pause: () => {} },
    rain: { play: () => {}, pause: () => {} },
  };

  // Animation tracking
  private activeAnimations: Set<any> = new Set();

  // Debug counters
  private frameCount: number = 0;

  // World initialization flag
  private worldInitialized: boolean = false;

  // Weather types for fallback
  private weathers: string[] = ["clear", "cloudy", "rainy"];

  // Game state
  private state: CaravanState;

  constructor() {
    // Initialize game state
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
      animationIds: [], // Store animation IDs for cleanup
    };

    // Initialize PIXI Application
    this.app = new PIXI.Application({
      width: window.innerWidth,
      height: window.innerHeight,
      backgroundColor: 0x0a0a1a,
      resolution: window.devicePixelRatio || 1,
      antialias: false,
    });

    const gameContainer = document.getElementById("game-container");
    if (gameContainer) {
      gameContainer.appendChild(this.app.view);
    }

    // Create all containers
    this.worldContainer = new PIXI.Container();
    this.backgroundLayer = new PIXI.Container();
    this.trailLayer = new PIXI.Container();
    this.caravanLayer = new PIXI.Container();
    this.traderLayer = new PIXI.Container();
    this.minerLayer = new PIXI.Container();
    this.outpostLayer = new PIXI.Container();
    this.effectsLayer = new PIXI.Container();
    this.uiLayer = new PIXI.Container();

    // Add all layers to world container
    this.app.stage.addChild(this.worldContainer);
    this.worldContainer.addChild(this.backgroundLayer);
    this.worldContainer.addChild(this.trailLayer);
    this.worldContainer.addChild(this.caravanLayer);
    this.worldContainer.addChild(this.traderLayer);
    this.worldContainer.addChild(this.minerLayer);
    this.worldContainer.addChild(this.outpostLayer);
    this.worldContainer.addChild(this.effectsLayer);
    this.app.stage.addChild(this.uiLayer);

    // Initialize sounds
    this.initializeSounds();

    // Socket connection
    this.initializeSocket();

    // Set up event listeners
    this.setupEventListeners();

    // Start game loop
    this.app.ticker.add(this.gameLoop.bind(this));

    // Initialize game
    this.initialize();
  }

  // Initialize sounds
  private initializeSounds(): void {
    try {
      if (typeof Howl !== "undefined") {
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
          click: new Howl({
            src: ["sounds/click.mp3"],
            volume: 0.5,
            loop: false,
          }),
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
          rain: new Howl({
            src: ["sounds/rain.mp3"],
            volume: 0.2,
            loop: true,
          }),
        };
      } else {
        console.warn("Howler.js not available, sound disabled");
        this.createDummySounds();
      }
    } catch (error) {
      console.error("Error initializing sounds:", error);
      this.createDummySounds();
    }
  }

  // Create dummy sound objects
  private createDummySounds(): void {
    this.sounds = {
      mining: { play: () => {}, pause: () => {}, fade: () => {} },
      transaction: { play: () => {}, pause: () => {}, fade: () => {} },
      click: { play: () => {}, pause: () => {}, fade: () => {} },
      caravan: { play: () => {}, pause: () => {}, fade: () => {} },
      ambient: { play: () => {}, pause: () => {} },
      rain: { play: () => {}, pause: () => {} },
    };
  }

  // Initialize socket connection
  private initializeSocket(): void {
    try {
      if (typeof io !== "undefined") {
        this.socket = io();
        console.log("Socket.io initialized");
      }
    } catch (error) {
      console.warn("Could not connect to socket.io:", error);
      this.socket = null;
    }
  }

  // Initialize the game
  private async initialize(): Promise<void> {
    try {
      console.log("Starting initialization...");

      // Load assets
      await this.loadAssets();
      console.log("Assets loaded!");

      // Create the world
      this.createWorld();
      console.log("World created!");

      // Fetch initial blockchain data
      await this.fetchBlockchainData();
      console.log("Blockchain data fetched!");

      // Set default camera position to show the blockchain path
      this.state.camera = {
        x: -100, // Start slightly to the right so we can see the beginning of the path
        y: 0,
        scale: 0.8,
        targetScale: 0.8,
        dragging: false,
        lastPosition: null,
      };

      // Hide loading screen
      const loadingScreen = document.getElementById("loading-screen");
      if (loadingScreen) {
        loadingScreen.style.display = "none";
      }

      // Add intro animation
      this.playIntroAnimation();

      // Start ambient sound
      if (this.state.soundEnabled && this.sounds) {
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

      console.log("Game initialized successfully");
    } catch (error) {
      console.error("Error initializing game:", error);
      const loadingText = document.getElementById("loading-text");
      if (loadingText) {
        loadingText.textContent =
          "Error loading caravan: " + (error as Error).message;
      }
    }
  }

  // Load game assets
  private async loadAssets(): Promise<void> {
    return new Promise((resolve) => {
      // Simulate loading process
      let progress = 0;
      const loadingInterval = setInterval(() => {
        progress += 5;
        const loadingBar = document.getElementById("loading-bar");
        if (loadingBar) {
          loadingBar.style.width = `${progress}%`;
        }

        const loadingText = document.getElementById("loading-text");
        if (loadingText) {
          loadingText.textContent = `Loading the caravan... ${progress}%`;
        }

        if (progress >= 100) {
          clearInterval(loadingInterval);
          resolve();
        }
      }, 100);
    });
  }

  // Create the world environment
  private createWorld(): void {
    try {
      // Create sky background with gradient
      this.createSky();
      console.log("Sky created");

      // Create distant mountains
      this.createMountains();
      console.log("Mountains created");

      // Create the blockchain trail (the path that caravans follow)
      this.createBlockchainTrail();
      console.log("Trail created");

      // Create ground
      this.createGround();
      console.log("Ground created");

      // Add environmental elements
      this.addEnvironmentalElements();
      console.log("Environmental elements added");

      // Mark world as initialized
      this.worldInitialized = true;
      console.log("World marked as initialized!");
    } catch (error) {
      console.error("Error creating world:", error);
      throw error;
    }
  }

  // Create the sky with gradient and day/night cycle capability
  private createSky(): void {
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

    // Add stars container
    this.stars = new PIXI.Container();
    this.backgroundLayer.addChild(this.stars);

    // Generate stars
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

    // Add clouds container
    this.clouds = new PIXI.Container();
    this.backgroundLayer.addChild(this.clouds);

    // Generate clouds
    for (let i = 0; i < 10; i++) {
      this.createCloud(
        Math.random() * window.innerWidth * 3 - window.innerWidth,
        Math.random() * 200,
        0.1 + Math.random() * 0.2,
      );
    }
  }

  // Create a single cloud
  private createCloud(
    x: number,
    y: number,
    speed: number,
  ): PIXI.Graphics | null {
    if (!this.clouds) return null;

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
    cloud.endFill();

    cloud.x = x;
    cloud.y = y;

    // Add custom properties
    (cloud as any).speed = speed;
    (cloud as any).cloudWidth = cloudWidth;

    this.clouds.addChild(cloud);
    return cloud;
  }

  // Create distant mountains for background
  private createMountains(): void {
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
  private createBlockchainTrail(): void {
    const trail = new PIXI.Graphics();

    // Main dirt path
    trail.beginFill(0x8b4513, 0.7);

    // Create a winding path using bezier curves
    this.pathPoints = [];
    let x = -window.innerWidth;
    const baseY = 300;

    // Generate winding path points
    for (let i = 0; i < 50; i++) {
      const segment = {
        x: x,
        y: baseY + Math.sin(i * 0.2) * 30,
      };
      this.pathPoints.push(segment);
      x += 200;
    }

    // Draw the path as a series of quadratic curves
    trail.moveTo(this.pathPoints[0].x, this.pathPoints[0].y);

    for (let i = 1; i < this.pathPoints.length; i++) {
      const prev = this.pathPoints[i - 1];
      const current = this.pathPoints[i];

      // Control point halfway between points
      const cpX = (prev.x + current.x) / 2;
      const cpY = prev.y + (Math.random() * 20 - 10); // Slight random variation

      trail.quadraticCurveTo(cpX, cpY, current.x, current.y);
    }

    // Make the path wider by drawing another line slightly offset
    const pathWidth = 30;
    for (let i = this.pathPoints.length - 1; i >= 0; i--) {
      const point = this.pathPoints[i];
      trail.lineTo(point.x, point.y + pathWidth);
    }

    trail.endFill();

    // Add some small stones along the path edges
    trail.beginFill(0x999999, 0.5);
    for (let i = 0; i < 200; i++) {
      const pathIndex = Math.floor(Math.random() * this.pathPoints.length);
      const point = this.pathPoints[pathIndex];
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
  }

  // Create ground with grass and texture
  private createGround(): void {
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
          ground.drawRect(x, y, 3 + Math.random() * 3, 3 + Math.random() * 3);
        }
      }
    }
    ground.endFill();

    this.backgroundLayer.addChild(ground);
    this.ground = ground;
  }

  // Add environmental elements to the scene
  private addEnvironmentalElements(): void {
    // Add outposts (representing blockchain nodes)
    this.createOutposts();

    // Add miners' camps
    this.createMinerCamps();

    // Add decorative elements like trees, rocks, etc.
    this.addDecorations();
  }

  // Create outposts (blockchain nodes)
  private createOutposts(): void {
    if (!this.pathPoints || this.pathPoints.length === 0) {
      console.warn("Path points not initialized, cannot create outposts");
      return;
    }

    // Create 3 outposts along the blockchain path
    for (let i = 0; i < 3; i++) {
      const pathIndex = Math.floor(this.pathPoints.length / 3) * i + 5;
      if (pathIndex >= this.pathPoints.length) continue;

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
      (outpost as any).outpostData = {
        id: `outpost_${i}`,
        name: `Node ${i + 1}`,
        type: i === 0 ? "Full Node" : i === 1 ? "Mining Node" : "Light Client",
        connections: Math.floor(Math.random() * 8) + 3,
      };

      // Make interactive
      outpost.interactive = true;
      outpost.buttonMode = true;

      outpost.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
        this.showTooltip(
          `${(outpost as any).outpostData.name} (${(outpost as any).outpostData.type})`,
          event.data.global.x,
          event.data.global.y,
        );
      });

      outpost.on("pointerout", () => {
        this.hideTooltip();
      });

      outpost.on("pointerdown", () => {
        this.showOutpostDetails((outpost as any).outpostData);
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
  private addConnectivityEffect(outpost: PIXI.Graphics): void {
    if (!this.effectsLayer) return;

    // Create effect container to keep animations properly tracked
    const effectContainer = new PIXI.Container();
    effectContainer.position.set(outpost.x, outpost.y - 60);
    this.effectsLayer.addChild(effectContainer);

    const connectivityPulse = new PIXI.Graphics();
    connectivityPulse.beginFill(0x44aaff, 0.5);
    connectivityPulse.drawCircle(0, 0, 5);
    connectivityPulse.endFill();
    effectContainer.addChild(connectivityPulse);

    // Store a reference to the active animations for possible cleanup
    this.activeAnimations.add(effectContainer);

    // Recursive animation function
    const animate = () => {
      // Skip if container was removed
      if (!effectContainer.parent) return;

      // Reset pulse
      connectivityPulse.scale.set(1);
      connectivityPulse.alpha = 1;

      // Animation timeline with cleanup
      const tl = gsap.timeline({
        onComplete: () => {
          // Schedule next pulse after a delay
          if (effectContainer.parent) {
            gsap.delayedCall(1 + Math.random(), animate);
          } else {
            // Container was removed, stop animation
            gsap.killTweensOf(connectivityPulse);
            this.activeAnimations.delete(effectContainer);
          }
        },
      });

      tl.to(
        connectivityPulse.scale,
        {
          x: 3,
          y: 3,
          duration: 1.5,
          ease: "sine.out",
        },
        0,
      );

      tl.to(
        connectivityPulse,
        {
          alpha: 0,
          duration: 1.5,
          ease: "sine.out",
        },
        0,
      );
    };

    // Start animation
    animate();
  }

  // Create miner camps
  private createMinerCamps(): void {
    if (!this.pathPoints || this.pathPoints.length === 0) {
      console.warn("Path points not initialized, cannot create miner camps");
      return;
    }

    // Create 4 mining camps around the trail
    for (let i = 0; i < 4; i++) {
      const pathIndex = Math.floor(this.pathPoints.length / 5) * (i + 1);
      if (pathIndex >= this.pathPoints.length) continue;

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

      // Position miner camp
      minerCamp.x = x;
      minerCamp.y = y;

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

      // Miner character
      const miner = this.createMinerCharacter(x + 15, y + 10);
      if (!miner) continue;

      // Store miner data
      (miner as any).minerData = {
        id: `miner_${i}`,
        name: `Miner ${i + 1}`,
        hashPower: Math.floor(Math.random() * 100) + 10,
        blocksFound: Math.floor(Math.random() * 5),
        active: Math.random() > 0.3, // 70% chance of being active
      };

      // Make interactive
      miner.interactive = true;
      miner.buttonMode = true;

      miner.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
        this.showTooltip(
          `${(miner as any).minerData.name} (Hashpower: ${(miner as any).minerData.hashPower})`,
          event.data.global.x,
          event.data.global.y,
        );
      });

      miner.on("pointerout", () => {
        this.hideTooltip();
      });

      miner.on("pointerdown", () => {
        this.showMinerDetails((miner as any).minerData);
        if (this.state.soundEnabled) this.sounds.click.play();
      });

      if (this.minerLayer) {
        this.minerLayer.addChild(minerCamp);
        this.minerLayer.addChild(campfire);
        this.state.miners.push(miner);
      }

      // Add fire animation
      this.addFireAnimation(campfire);

      // Add mining animation if active
      if ((miner as any).minerData.active) {
        this.addMiningAnimation(miner);
      }
    }
  }

  // Create miner character
  private createMinerCharacter(x: number, y: number): PIXI.Graphics | null {
    if (!this.minerLayer) return null;

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

    if (this.minerLayer) {
      this.minerLayer.addChild(miner);
    }

    return miner;
  }

  // Add fire animation to campfire
  private addFireAnimation(campfire: PIXI.Graphics): void {
    if (!this.effectsLayer) return;

    // Create a container for the fire effect (for easier cleanup)
    const fireContainer = new PIXI.Container();
    fireContainer.position.set(campfire.x, campfire.y);
    this.effectsLayer.addChild(fireContainer);

    // Create the fire graphics inside the container
    const fireGraphics = new PIXI.Graphics();
    fireContainer.addChild(fireGraphics);

    // Track for cleanup
    this.activeAnimations.add(fireContainer);

    // Animation function using requestAnimationFrame
    const animate = () => {
      // Skip if container was removed
      if (!fireContainer.parent) return;

      // Redraw fire
      fireGraphics.clear();

      // Orange outer flame
      fireGraphics.beginFill(0xff6600, 0.8);
      fireGraphics.moveTo(-2, 0);
      fireGraphics.quadraticCurveTo(
        -3 + Math.random() * 6,
        -5 - Math.random() * 5,
        2,
        -8 - Math.random() * 4,
      );
      fireGraphics.quadraticCurveTo(
        3 + Math.random() * 2,
        -5 - Math.random() * 5,
        2,
        0,
      );
      fireGraphics.lineTo(-2, 0);
      fireGraphics.endFill();

      // Yellow inner flame
      fireGraphics.beginFill(0xffcc00, 0.9);
      fireGraphics.moveTo(-1, 0);
      fireGraphics.quadraticCurveTo(
        -1 + Math.random() * 2,
        -3 - Math.random() * 3,
        1,
        -5 - Math.random() * 2,
      );
      fireGraphics.quadraticCurveTo(
        1 + Math.random() * 1,
        -3 - Math.random() * 3,
        1,
        0,
      );
      fireGraphics.lineTo(-1, 0);
      fireGraphics.endFill();

      // Schedule next frame if container still exists
      if (fireContainer.parent) {
        requestAnimationFrame(animate);
      } else {
        // Container removed, clean up
        this.activeAnimations.delete(fireContainer);
      }
    };

    // Start animation
    animate();
  }

  // Add mining animation to miner
  private addMiningAnimation(miner: PIXI.Graphics): void {
    if (!this.minerLayer) return;

    // Create a container for better cleanup and control
    const miningContainer = new PIXI.Container();
    miningContainer.position.set(miner.x, miner.y - 5);
    this.minerLayer.addChild(miningContainer);

    // Create pickaxe
    const pickaxe = new PIXI.Graphics();
    pickaxe.lineStyle(2, 0x888888);
    pickaxe.moveTo(0, 0);
    pickaxe.lineTo(15, -10);
    pickaxe.lineStyle(0);

    pickaxe.beginFill(0x444444);
    pickaxe.drawRect(12, -14, 6, 4);
    pickaxe.endFill();

    pickaxe.pivot.set(0, 0);
    miningContainer.addChild(pickaxe);

    // Track for cleanup
    this.activeAnimations.add(miningContainer);

    // Mining animation with safety and cleanup
    const miningAnimation = gsap.to(pickaxe, {
      rotation: -0.5,
      duration: 0.5,
      repeat: -1,
      yoyo: true,
      ease: "power1.inOut",
      onComplete: () => {
        if (this.minerLayer && miningContainer.parent) {
          this.minerLayer.removeChild(miningContainer);
          this.activeAnimations.delete(miningContainer);
        }
      },
    });

    // Occasionally play mining sound
    const playMiningSound = () => {
      if (!miningContainer.parent) return;

      if (this.state.soundEnabled && Math.random() > 0.7) {
        this.sounds.mining.play();
      }

      // Schedule next sound only if container still exists
      if (miningContainer.parent) {
        gsap.delayedCall(5 + Math.random() * 10, playMiningSound);
      }
    };

    // Start sound timing
    gsap.delayedCall(Math.random() * 5, playMiningSound);
  }

  // Add decorative elements to the world
  private addDecorations(): void {
    try {
      // Add trees, rocks, cacti, etc.
      this.addTrees();
      this.addRocks();

      // Add occasional landmarks
      this.addBlockchainMonument();
      this.addTradingOasis();
    } catch (error) {
      console.error("Error adding decorations:", error);
    }
  }

  // Add trees to the scene
  private addTrees(): void {
    if (!this.backgroundLayer || !this.pathPoints) return;

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
  private addRocks(): void {
    if (!this.backgroundLayer || !this.pathPoints) return;

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

  // Add a blockchain monument (decorative landmark)
  private addBlockchainMonument(): void {
    if (!this.backgroundLayer || !this.effectsLayer || !this.pathPoints) return;

    // Position at a specific point on the path
    const pathIndex = Math.floor(this.pathPoints.length * 0.7);
    if (pathIndex >= this.pathPoints.length) return;

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

    // Create a container for the glow effect
    const glowContainer = new PIXI.Container();
    glowContainer.position.set(x, y - 20);
    this.effectsLayer.addChild(glowContainer);

    // Add ambient glow effect
    const glow = new PIXI.Graphics();
    glow.beginFill(0xffcc00, 0.2);
    glow.drawCircle(0, 0, 30);
    glow.endFill();
    glowContainer.addChild(glow);

    // Animate glow with safe cleanup
    gsap.to(glow, {
      alpha: 0.4,
      duration: 2,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onComplete: () => {
        if (this.effectsLayer && glowContainer.parent) {
          this.effectsLayer.removeChild(glowContainer);
          this.activeAnimations.delete(glowContainer);
        }
      },
    });

    // Track for cleanup
    this.activeAnimations.add(glowContainer);

    this.backgroundLayer.addChild(monument);

    // Make interactive
    monument.interactive = true;
    monument.buttonMode = true;

    monument.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
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
  private addTradingOasis(): void {
    if (!this.backgroundLayer || !this.pathPoints) return;

    // Position at a specific point on the path
    const pathIndex = Math.floor(this.pathPoints.length * 0.3);
    if (pathIndex >= this.pathPoints.length) return;

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
    this.createTrader(x + 20, y + 5, {
      id: "oasis_trader",
      name: "Oasis Merchant",
      speciality: "Rare Tokens",
      inventory: Math.floor(Math.random() * 10) + 5,
    });

    // Add ambient effects
    this.addWaterAnimation(x, y);
  }

  // Add water ripple animation for the oasis
  private addWaterAnimation(x: number, y: number): void {
    if (!this.effectsLayer) return;

    // Create a container for the water effect
    const waterContainer = new PIXI.Container();
    waterContainer.position.set(x, y);
    this.effectsLayer.addChild(waterContainer);

    // Main water circle with animation
    const waterCircle = new PIXI.Graphics();
    waterContainer.addChild(waterCircle);

    // Track for cleanup
    this.activeAnimations.add(waterContainer);

    // Animation function
    const animate = () => {
      // Skip if container was removed
      if (!waterContainer.parent) return;

      // Redraw water
      waterCircle.clear();
      waterCircle.beginFill(0x4477aa, 0.5);
      waterCircle.drawCircle(0, 0, 5 + Math.sin(Date.now() / 500) * 2);
      waterCircle.endFill();

      // Randomly create ripples
      if (Math.random() > 0.98) {
        this.createWaterRipple(waterContainer);
      }

      // Continue animation only if container still exists
      if (waterContainer.parent) {
        requestAnimationFrame(animate);
      } else {
        // Cleanup
        this.activeAnimations.delete(waterContainer);
      }
    };

    // Start animation
    animate();
  }

  // Create water ripple effect
  private createWaterRipple(parentContainer: PIXI.Container): void {
    // Create a ripple graphic
    const ripple = new PIXI.Graphics();
    ripple.position.set(Math.random() * 10 - 5, Math.random() * 10 - 5);
    ripple.lineStyle(1, 0x4477aa, 0.8);
    ripple.drawCircle(0, 0, 2);
    ripple.lineStyle(0);
    parentContainer.addChild(ripple);

    // Animate and remove with GSAP
    const tl = gsap.timeline({
      onComplete: () => {
        if (ripple.parent) {
          ripple.parent.removeChild(ripple);
        }
      },
    });

    tl.to(ripple.scale, { x: 4, y: 4, duration: 1.5, ease: "sine.out" }, 0);
    tl.to(ripple, { alpha: 0, duration: 1.5, ease: "sine.out" }, 0);
  }

  // Create a trader character
  private createTrader(x: number, y: number, data: any): PIXI.Graphics | null {
    if (!this.traderLayer) return null;

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
    (trader as any).traderData = data;

    // Make interactive
    trader.interactive = true;
    trader.buttonMode = true;

    trader.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
      this.showTooltip(
        `${(trader as any).traderData.name} (${(trader as any).traderData.speciality})`,
        event.data.global.x,
        event.data.global.y,
      );
    });

    trader.on("pointerout", () => {
      this.hideTooltip();
    });

    trader.on("pointerdown", () => {
      this.showTraderDetails((trader as any).traderData);
      if (this.state.soundEnabled) this.sounds.click.play();
    });

    this.traderLayer.addChild(trader);
    return trader;
  }

  // Fetch blockchain data from API
  private async fetchBlockchainData(): Promise<any> {
    try {
      console.log("Fetching blockchain data...");

      // Add timeout for fetch
      const fetchPromise = fetch("/api/blockchain");
      const timeoutPromise = new Promise<Response>((_, reject) =>
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

      // Only process blocks if the world is fully initialized
      if (this.worldInitialized) {
        this.processBlocks(safeData.blocks);
      } else {
        console.log("Deferring block processing until world is initialized");
      }

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

      // Only process blocks if world is initialized
      if (this.worldInitialized) {
        this.processBlocks(fallbackData.blocks);
      }

      this.processMempool(fallbackData.mempool);

      return fallbackData;
    }
  }

  // Update stats display
  private updateStats(stats: any): void {
    try {
      const blockCount = document.getElementById("block-count");
      const txCount = document.getElementById("tx-count");
      const mempoolSize = document.getElementById("mempool-size");
      const gameTime = document.getElementById("game-time");

      if (blockCount) blockCount.textContent = stats.blockCount || "0";
      if (txCount) txCount.textContent = stats.totalTxCount || "0";
      if (mempoolSize) mempoolSize.textContent = stats.mempoolSize || "0";

      // Update compass direction based on mining activity
      this.updateCompassDirection(stats.mempoolSize || 0);
    } catch (error) {
      console.error("Error updating stats:", error);
    }
  }

  // Update compass direction
  private updateCompassDirection(mempoolSize: number): void {
    try {
      // Transform mempool size into an angle (more txs = more north/east)
      const angle = (mempoolSize / 20) * 360; // 1 full rotation per 20 txs

      // Update compass arrow
      const compassArrow = document.getElementById("compass-arrow");
      if (compassArrow) {
        compassArrow.style.transform = `rotate(${angle}deg)`;
      }

      // Update label based on quadrant
      const compassLabel = document.getElementById("compass-label");
      if (compassLabel) {
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
    } catch (error) {
      console.error("Error updating compass:", error);
    }
  }

  // Process blocks into caravans
  private processBlocks(blocks: any[]): void {
    // Safety check for blocks data
    if (!blocks || !Array.isArray(blocks)) {
      console.warn("Invalid blocks data received:", blocks);
      return;
    }

    // Safety check for required properties
    if (
      !this.caravanLayer ||
      !this.pathPoints ||
      !Array.isArray(this.pathPoints) ||
      !this.worldInitialized
    ) {
      console.warn("Cannot process blocks yet, world not fully initialized");
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
  private processMempool(mempool: any): void {
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

    // Safety check for trader layer
    if (!this.traderLayer) {
      console.error("Trader layer not available, cannot process mempool");
      return;
    }

    // Clear existing traders
    this.traderLayer.removeChildren();
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
    mempool.txids.slice(0, 20).forEach((txid: string, index: number) => {
      if (!txid) return;

      // Random position around the starting area
      const x = startX + Math.random() * 250 - 120;
      const y = startY + Math.random() * 40 - 20;

      // Add a trader for this transaction
      this.addTrader(txid, x, y, "waiting");
    });
  }

  // Add a caravan to represent a blockchain block
  private addCaravan(
    block: any,
    position: number,
    isNew: boolean = false,
  ): PIXI.Container | null {
    if (
      !this.caravanLayer ||
      !this.pathPoints ||
      !Array.isArray(this.pathPoints)
    ) {
      console.error("Cannot add caravan, missing required layers or path data");
      return null;
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
    (caravan as any).blockData = block;

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
          if (caravan.parent) {
            // Add flag waving animation
            this.addFlagWavingAnimation(hashFlag);
          }
        },
      });

      // Track for cleanup
      this.activeAnimations.add(caravan);
    } else {
      // Add flag waving animation
      this.addFlagWavingAnimation(hashFlag);
    }

    // Make caravan interactive
    caravan.interactive = true;
    caravan.buttonMode = true;

    caravan.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
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
  private addFlagWavingAnimation(flag: PIXI.Graphics): void {
    if (!flag || !flag.parent) return;

    // Store original flag rotation to restore on cleanup
    const originalRotation = flag.rotation;

    // Add waving animation with cleanup
    const wavingAnimation = gsap.to(flag, {
      rotation: originalRotation + 0.1,
      duration: 0.8 + Math.random() * 0.4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
      onComplete: () => {
        if (flag && flag.parent) {
          flag.rotation = originalRotation;
        }
      },
    });

    // Track for cleanup
    this.activeAnimations.add(flag);
  }

  // Add a trader to represent a transaction
  private addTrader(
    txid: string,
    x: number,
    y: number,
    state = "waiting",
  ): PIXI.Graphics | null {
    if (!this.traderLayer) return null;

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
    (trader as any).txid = txid;
    (trader as any).state = state;
    (trader as any).traderType = ["merchant", "nomad", "scout"][traderType];

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
        onComplete: () => {
          if (trader && trader.parent) {
            trader.y = y; // Reset position
          }
        },
      });

      // Track for cleanup
      this.activeAnimations.add(trader);
    }

    // Make trader interactive
    trader.interactive = true;
    trader.buttonMode = true;

    trader.on("pointerover", (event: PIXI.interaction.InteractionEvent) => {
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
  private moveTraderToCaravan(
    trader: PIXI.Graphics,
    caravan: PIXI.Container,
  ): void {
    if (!trader || !caravan || !this.traderLayer || !this.effectsLayer) return;

    // Set state to moving
    (trader as any).state = "moving";

    // Stop existing animations
    gsap.killTweensOf(trader);

    // Remove from active animations
    this.activeAnimations.delete(trader);

    // Play transaction sound
    if (this.state.soundEnabled) {
      this.sounds.transaction.play();
    }

    // Animate movement with safety checks
    gsap.to(trader, {
      x: caravan.x,
      y: caravan.y,
      duration: 2,
      ease: "power1.inOut",
      onComplete: () => {
        if (!trader || !trader.parent || !caravan || !caravan.parent) {
          return; // Objects no longer exist
        }

        // Trader reached the caravan
        (trader as any).state = "confirmed";

        // Flash effect when joining
        const flash = new PIXI.Graphics();
        flash.beginFill(0xffffff, 0.7);
        flash.drawCircle(0, 0, 30);
        flash.endFill();
        flash.x = caravan.x;
        flash.y = caravan.y;

        if (this.effectsLayer) {
          this.effectsLayer.addChild(flash);
        }

        // Fade out flash
        gsap.to(flash, {
          alpha: 0,
          duration: 0.5,
          onComplete: () => {
            if (this.effectsLayer && flash && flash.parent) {
              this.effectsLayer.removeChild(flash);
            }
          },
        });

        // Fade out and remove trader
        gsap.to(trader, {
          alpha: 0,
          duration: 0.5,
          onComplete: () => {
            if (this.traderLayer && trader && trader.parent) {
              this.traderLayer.removeChild(trader);
              // Update state to remove trader
              this.state.traders = this.state.traders.filter(
                (t) => t !== trader,
              );
            }
          },
        });
      },
    });
  }

  // Show tooltip
  private showTooltip(text: string, x: number, y: number): void {
    try {
      const tooltip = document.getElementById("tooltip");
      if (tooltip) {
        tooltip.textContent = text;
        tooltip.style.left = `${x + 10}px`;
        tooltip.style.top = `${y - 30}px`;
        tooltip.style.opacity = "1";
      }
    } catch (error) {
      console.error("Error showing tooltip:", error);
    }
  }

  // Hide tooltip
  private hideTooltip(): void {
    try {
      const tooltip = document.getElementById("tooltip");
      if (tooltip) {
        tooltip.style.opacity = "0";
      }
    } catch (error) {
      console.error("Error hiding tooltip:", error);
    }
  }

  // Show block details
  private showBlockDetails(block: any): void {
    try {
      if (!block) {
        console.warn("Cannot show details for undefined block");
        return;
      }

      const detailsPanel = document.getElementById("details-panel");
      const detailsContent = document.getElementById("details-content");
      const detailsClose = document.getElementById("details-close");

      if (!detailsPanel || !detailsContent) {
        console.warn("Details panel elements not found");
        return;
      }

      // Format time as pixel-style date
      const date = new Date((block.time || Date.now() / 1000) * 1000);
      const pixelDate = `${date.getDate().toString().padStart(2, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getFullYear()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`;

      // Build HTML content with proper structure
      let html = `<div class="panel-header">CARAVAN #${block.height}<span class="close-button" id="close-details">✕</span></div>`;

      html += `
        <div class="detail-section">
          <div class="detail-item">
            <span class="detail-label">ROUTE:</span>
            <span class="detail-value">${block.hash ? block.hash.substring(0, 20) + "..." : "Unknown"}</span>
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
            <span class="detail-value">${((block.size || 0) / 1024).toFixed(2)} KB</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">JOURNEY DIFFICULTY:</span>
            <span class="detail-value">${(block.difficulty || 1).toFixed(2)}</span>
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

      detailsContent.innerHTML = html;
      detailsPanel.style.display = "block";

      // Add button handlers
      const forgeButton = document.getElementById("forge-next-btn");
      if (forgeButton) {
        forgeButton.addEventListener("click", () => {
          this.triggerMineBlock();
          detailsPanel.style.display = "none";
        });
      }

      // Add close button handler
      const closeButton = document.getElementById("close-details");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          detailsPanel.style.display = "none";
        });
      }
    } catch (error) {
      console.error("Error showing block details:", error);
    }
  }

  // Generate cargo items for block details
  private generateCargoItems(block: any): string {
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
  private async showTransactionDetails(txid: string): Promise<void> {
    try {
      const detailsPanel = document.getElementById("details-panel");
      const detailsContent = document.getElementById("details-content");

      if (!detailsPanel || !detailsContent) {
        console.warn("Details panel elements not found");
        return;
      }

      // Build initial HTML with header and loading indicator
      let html = `<div class="panel-header">TRADER CARGO<span class="close-button" id="close-details">✕</span></div>`;

      html += `
        <div class="loading-indicator">
          LOADING TRADER DATA...
        </div>
      `;

      detailsContent.innerHTML = html;
      detailsPanel.style.display = "block";

      try {
        // Fetch transaction details
        const response = await fetch(`/api/tx/${txid}`);
        const tx = await response.json();

        // Update panel with details
        html = `<div class="panel-header">TRADER CARGO<span class="close-button" id="close-details">✕</span></div>`;

        html += `
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

        detailsContent.innerHTML = html;

        // Add deliver button handler
        const deliverButton = document.getElementById("deliver-cargo-btn");
        if (deliverButton) {
          deliverButton.addEventListener("click", () => {
            // Find first caravan to attach to
            if (this.state.caravans.length > 0) {
              const caravan = this.state.caravans[0];

              // Find the trader
              const trader = this.state.traders.find(
                (t) => (t as any).txid === txid,
              );

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
        }

        // Add close button handler
        const closeButton = document.getElementById("close-details");
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            detailsPanel.style.display = "none";
          });
        }
      } catch (error) {
        // Show error state
        detailsContent.innerHTML = `
          <div class="panel-header">TRADER CARGO<span class="close-button" id="close-details">✕</span></div>
          <div class="error-message">
            ERROR LOADING TRADER DATA
          </div>
          <button id="close-error-btn" class="pixel-button detail-action-btn">
            CLOSE
          </button>
        `;

        // Add close button handler
        const errorCloseBtn = document.getElementById("close-error-btn");
        if (errorCloseBtn) {
          errorCloseBtn.addEventListener("click", () => {
            detailsPanel.style.display = "none";
          });
        }

        // Add panel close button handler
        const closeButton = document.getElementById("close-details");
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            detailsPanel.style.display = "none";
          });
        }
      }
    } catch (error) {
      console.error("Error showing transaction details:", error);
    }
  }

  // Generate transaction details
  private generateTransactionDetails(tx: any): string {
    let html = "";

    // For a full implementation, we'd show actual inputs and outputs
    // For simplicity, we'll just show a summary

    if (tx.vin && tx.vin.length > 0) {
      html += '<div class="tx-section-label">SOURCES:</div>';

      tx.vin.slice(0, 3).forEach((input: any, index: number) => {
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

      tx.vout.slice(0, 3).forEach((output: any, index: number) => {
        const address =
          output.scriptPubKey?.address ||
          (output.scriptPubKey?.addresses
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
  private showMinerDetails(minerData: any): void {
    try {
      const detailsPanel = document.getElementById("details-panel");
      const detailsContent = document.getElementById("details-content");

      if (!detailsPanel || !detailsContent) {
        console.warn("Details panel elements not found");
        return;
      }

      let html = `<div class="panel-header">${minerData.name.toUpperCase()}<span class="close-button" id="close-details">✕</span></div>`;

      html += `
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

      detailsContent.innerHTML = html;
      detailsPanel.style.display = "block";

      // Add button handler
      const mineButton = document.getElementById("mine-with-btn");
      if (mineButton) {
        mineButton.addEventListener("click", () => {
          this.triggerMineBlock();
          detailsPanel.style.display = "none";
        });
      }

      // Add close button handler
      const closeButton = document.getElementById("close-details");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          detailsPanel.style.display = "none";
        });
      }
    } catch (error) {
      console.error("Error showing miner details:", error);
    }
  }

  // Show outpost details
  private showOutpostDetails(outpostData: any): void {
    try {
      const detailsPanel = document.getElementById("details-panel");
      const detailsContent = document.getElementById("details-content");

      if (!detailsPanel || !detailsContent) {
        console.warn("Details panel elements not found");
        return;
      }

      let html = `<div class="panel-header">${outpostData.name.toUpperCase()}<span class="close-button" id="close-details">✕</span></div>`;

      html += `
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

      detailsContent.innerHTML = html;
      detailsPanel.style.display = "block";

      // Add close button handler
      const closeButton = document.getElementById("close-details");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          detailsPanel.style.display = "none";
        });
      }
    } catch (error) {
      console.error("Error showing outpost details:", error);
    }
  }

  // Show trader details
  private showTraderDetails(traderData: any): void {
    try {
      const detailsPanel = document.getElementById("details-panel");
      const detailsContent = document.getElementById("details-content");

      if (!detailsPanel || !detailsContent) {
        console.warn("Details panel elements not found");
        return;
      }

      let html = `<div class="panel-header">${traderData.name.toUpperCase()}<span class="close-button" id="close-details">✕</span></div>`;

      html += `
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

      detailsContent.innerHTML = html;
      detailsPanel.style.display = "block";

      // Add button handler
      const createTxButton = document.getElementById("create-tx-btn");
      if (createTxButton) {
        createTxButton.addEventListener("click", () => {
          this.triggerCreateTransaction();
          detailsPanel.style.display = "none";
        });
      }

      // Add close button handler
      const closeButton = document.getElementById("close-details");
      if (closeButton) {
        closeButton.addEventListener("click", () => {
          detailsPanel.style.display = "none";
        });
      }
    } catch (error) {
      console.error("Error showing trader details:", error);
    }
  }

  // Generate trader inventory
  private generateTraderInventory(traderData: any): string {
    try {
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
    } catch (error) {
      console.error("Error generating trader inventory:", error);
      return "Error loading inventory";
    }
  }

  // Show a notification
  private showNotification(message: string): void {
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
        if (notification && notification.parentNode) {
          notification.parentNode.removeChild(notification);
        }
      }, 4000);
    } catch (error) {
      console.warn("Could not show notification:", message, error);
    }
  }

  // Show the tutorial
  private showTutorial(): void {
    try {
      const tutorialElement = document.getElementById("tutorial");
      if (tutorialElement) {
        tutorialElement.style.display = "block";

        // Add close button handler
        const closeButton = document.getElementById("tutorial-close");
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            if (tutorialElement) {
              tutorialElement.style.display = "none";
              this.state.isTutorialShown = true;
            }
          });
        }
      } else {
        console.warn("Tutorial element not found");
        // Create tutorial element if it doesn't exist
        const tutorial = document.createElement("div");
        tutorial.id = "tutorial";
        tutorial.className = "tutorial";
        tutorial.innerHTML = `
            <div class="panel-header">WELCOME, EXPLORER!</div>
            <div class="tutorial-content">
              <p>This is the CARAVAN-X blockchain visualization. Each block is represented as a <span class="highlight">caravan</span> traveling along the chain.</p>
              <p>Transactions are shown as <span class="highlight">traders</span> waiting to join the next caravan.</p>
              <p>Click on caravans or traders to see details. Use the control buttons to interact with the blockchain.</p>
            </div>
            <button id="tutorial-close" class="pixel-button">GOT IT!</button>
          `;
        document.body.appendChild(tutorial);

        // Add event listener to the close button
        const closeButton = tutorial.querySelector("#tutorial-close");
        if (closeButton) {
          closeButton.addEventListener("click", () => {
            tutorial.style.display = "none";
            this.state.isTutorialShown = true;
          });
        }
      }
    } catch (error) {
      console.error("Error showing tutorial:", error);
    }
  }

  // Play intro animation
  private playIntroAnimation(): void {
    try {
      // Pan camera to show the world
      gsap.to(this.state.camera, {
        x: -200,
        y: -50,
        duration: 3,
        ease: "power2.inOut",
      });

      // Zoom out slightly
      gsap.to(this.state.camera, {
        //@ts-ignore
        targetScale: 0.8,
        duration: 3,
        ease: "power2.inOut",
      });

      // Highlight the first caravan if it exists
      if (this.state.caravans.length > 0 && this.effectsLayer) {
        const firstCaravan = this.state.caravans[0];

        // Create a container for the highlight effect (for easier cleanup)
        const highlightContainer = new PIXI.Container();
        highlightContainer.position.set(firstCaravan.x, firstCaravan.y);
        this.effectsLayer.addChild(highlightContainer);

        // Add highlight effect
        const highlight = new PIXI.Graphics();
        highlight.beginFill(0xffcc00, 0.3);
        highlight.drawCircle(0, 0, 50);
        highlight.endFill();
        highlightContainer.addChild(highlight);

        // Animate highlight with safety cleanup
        gsap.to(highlight, {
          alpha: 0,
          duration: 1.5,
          repeat: 2,
          yoyo: true,
          onComplete: () => {
            if (this.effectsLayer && highlightContainer.parent) {
              this.effectsLayer.removeChild(highlightContainer);
              this.activeAnimations.delete(highlightContainer);
            }
          },
        });

        // Track for cleanup
        this.activeAnimations.add(highlightContainer);
      }
    } catch (error) {
      console.error("Error playing intro animation:", error);
    }
  }

  // Setup event listeners
  private setupEventListeners(): void {
    try {
      // Socket events
      if (this.socket) {
        this.socket.on("connect", () => {
          console.log("Connected to server");
          this.showNotification("Connected to blockchain network");
        });

        this.socket.on("disconnect", () => {
          console.log("Disconnected from server");
          this.showNotification("Disconnected from blockchain network");
        });

        this.socket.on("blockchain_update", (data: any) => {
          console.log("Received blockchain update", data);
          if (data) {
            if (data.stats) this.updateStats(data.stats);

            // Only process blocks if world is initialized
            if (data.blocks && this.worldInitialized) {
              this.processBlocks(data.blocks);
            } else if (data.blocks) {
              console.log(
                "Deferring block processing until world is initialized",
              );
            }

            if (data.mempool) this.processMempool(data.mempool);
          }
        });

        this.socket.on("new_block", (block: any) => {
          console.log("New block mined", block);
          if (block) {
            this.processNewBlock(block);
            this.showNotification(`New caravan formed: Block #${block.height}`);
          }
        });

        this.socket.on("new_transaction", (tx: any) => {
          console.log("New transaction", tx);
          if (tx) {
            this.processNewTransaction(tx);
            if (tx.txid) {
              this.showNotification(
                `New cargo ready: ${tx.txid.substring(0, 8)}...`,
              );
            }
          }
        });
      }

      // UI button events - safely add listeners
      this.addSafeEventListener("mine-btn", "click", () => {
        this.triggerMineBlock();
      });

      this.addSafeEventListener("tx-btn", "click", () => {
        this.triggerCreateTransaction();
      });

      this.addSafeEventListener("zoom-in-btn", "click", () => {
        this.state.camera.targetScale = Math.min(
          2,
          this.state.camera.targetScale + 0.2,
        );
      });

      this.addSafeEventListener("zoom-out-btn", "click", () => {
        this.state.camera.targetScale = Math.max(
          0.5,
          this.state.camera.targetScale - 0.2,
        );
      });

      // Close details panel
      this.addSafeEventListener("details-close", "click", () => {
        const detailsPanel = document.getElementById("details-panel");
        if (detailsPanel) {
          detailsPanel.style.display = "none";
        }
      });

      // View toggle buttons
      this.addSafeEventListener("view-toggle", "click", () => {
        window.location.href = "index.html";
      });

      // Sound toggle
      this.addSafeEventListener("toggle-sound", "click", () => {
        this.toggleSound();
      });

      // Dragging functionality for canvas
      if (this.app && this.app.view) {
        this.app.view.addEventListener("mousedown", (e: MouseEvent) => {
          this.state.camera.dragging = true;
          this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
        });

        this.app.view.addEventListener("touchstart", (e: TouchEvent) => {
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

        this.app.view.addEventListener("mousemove", (e: MouseEvent) => {
          if (this.state.camera.dragging && this.state.camera.lastPosition) {
            const dx = e.clientX - this.state.camera.lastPosition.x;
            const dy = e.clientY - this.state.camera.lastPosition.y;

            this.state.camera.x += dx;
            this.state.camera.y += dy;

            this.state.camera.lastPosition = { x: e.clientX, y: e.clientY };
          }
        });

        this.app.view.addEventListener("touchmove", (e: TouchEvent) => {
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
      }

      // Window resize
      window.addEventListener("resize", () => {
        if (this.app && this.app.renderer) {
          this.app.renderer.resize(window.innerWidth, window.innerHeight);
        }
      });

      console.log("Event listeners setup complete");
    } catch (error) {
      console.error("Error setting up event listeners:", error);
    }
  }

  // Helper method to safely add event listeners
  private addSafeEventListener(
    elementId: string,
    eventType: string,
    callback: EventListener,
  ): void {
    try {
      const element = document.getElementById(elementId);
      if (element) {
        element.addEventListener(eventType, callback);
      } else {
        console.warn(
          `Element with ID '${elementId}' not found, cannot add ${eventType} listener`,
        );
      }
    } catch (error) {
      console.error(`Error adding event listener to ${elementId}:`, error);
    }
  }

  // Process a new block
  private processNewBlock(block: any): void {
    try {
      // Add the block to our state
      this.state.blocks.unshift(block);

      // Create a new caravan
      this.addCaravan(block, 0, true);

      // Update stats
      const blockCount = document.getElementById("block-count");
      if (blockCount) {
        blockCount.textContent = (
          parseInt(blockCount.textContent || "0") + 1
        ).toString();
      }

      // Move some traders into the new caravan
      if (this.state.caravans.length > 0) {
        const caravan = this.state.caravans[0];

        // Find traders in waiting state
        const waitingTraders = this.state.traders
          .filter((trader) => trader && (trader as any).state === "waiting")
          .slice(0, 5); // Limit to 5 traders

        // Move traders to the caravan
        waitingTraders.forEach((trader) => {
          this.moveTraderToCaravan(trader, caravan);
        });
      }

      // Update mempool display
      const mempoolSize = document.getElementById("mempool-size");
      if (mempoolSize) {
        mempoolSize.textContent = Math.max(
          0,
          parseInt(mempoolSize.textContent || "0") - 5,
        ).toString();
      }
    } catch (error) {
      console.error("Error processing new block:", error);
    }
  }

  // Process a new transaction
  private processNewTransaction(tx: any): void {
    try {
      if (!tx || !tx.txid) {
        console.warn("Invalid transaction data", tx);
        return;
      }

      // Create a new trader at a random entry point
      const startX =
        this.state.caravans.length > 0
          ? this.state.caravans[0].x - 300 - Math.random() * 200
          : this.pathPoints && this.pathPoints.length > 0
            ? this.pathPoints[0].x - 300 - Math.random() * 200
            : -500;

      const startY =
        this.pathPoints && this.pathPoints.length > 0
          ? this.pathPoints[0].y + Math.random() * 40 - 20
          : 300;

      this.addTrader(tx.txid, startX, startY, "waiting");

      // Update mempool display
      const mempoolSize = document.getElementById("mempool-size");
      if (mempoolSize) {
        mempoolSize.textContent = (
          parseInt(mempoolSize.textContent || "0") + 1
        ).toString();
      }

      // Play transaction sound
      if (this.state.soundEnabled && this.sounds && this.sounds.transaction) {
        this.sounds.transaction.play();
      }
    } catch (error) {
      console.error("Error processing new transaction:", error);
    }
  }

  // Add mining particles
  private addMiningParticles(miner: PIXI.Graphics): void {
    if (!miner || !this.effectsLayer) return;

    try {
      // Create container for the mining effect (easier cleanup)
      const particleContainer = new PIXI.Container();
      particleContainer.position.set(miner.x, miner.y);
      this.effectsLayer.addChild(particleContainer);

      // Track for cleanup
      this.activeAnimations.add(particleContainer);

      // Creates floating particles around the miner
      const particleCount = 10;

      for (let i = 0; i < particleCount; i++) {
        const particle = new PIXI.Graphics();
        particle.beginFill(0xffcc00, 0.8);
        particle.drawCircle(0, 0, 2);
        particle.endFill();

        // Set random initial position around the center
        particle.position.set(Math.random() * 10 - 5, Math.random() * 10 - 5);

        particleContainer.addChild(particle);

        // Animate particle
        gsap.to(particle, {
          x: Math.random() * 40 - 20,
          y: Math.random() * 40 - 20,
          alpha: 0,
          duration: 1 + Math.random(),
          ease: "power1.out",
          onComplete: () => {
            if (particle.parent) {
              particle.parent.removeChild(particle);
            }
          },
        });
      }

      // Auto-cleanup after all particles are done
      gsap.delayedCall(2, () => {
        if (particleContainer.parent) {
          this.effectsLayer?.removeChild(particleContainer);
          this.activeAnimations.delete(particleContainer);
        }
      });
    } catch (error) {
      console.error("Error adding mining particles:", error);
    }
  }

  // Trigger mining a new block
  private triggerMineBlock(): void {
    try {
      // Play mining sound
      if (this.state.soundEnabled && this.sounds && this.sounds.mining) {
        this.sounds.mining.play();
      }

      // Add visual effects to miners
      if (this.state.miners && Array.isArray(this.state.miners)) {
        this.state.miners.forEach((miner) => {
          if (miner) {
            this.addMiningParticles(miner);
          }
        });
      }

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
          this.showNotification(
            `Error forging caravan: ${(error as Error).message}`,
          );

          // Simulate block creation for demo purposes
          setTimeout(() => {
            this.processNewBlock({
              height:
                (this.state.blocks.length > 0
                  ? this.state.blocks[0].height
                  : 0) + 1,
              hash: `000000000000000000000000000000000000000000000000000000000000${Math.floor(Math.random() * 1000)}`,
              time: Date.now() / 1000,
              txCount: Math.floor(Math.random() * 5) + 1,
              size: 1000 + Math.floor(Math.random() * 1000),
            });
          }, 2000);
        });
    } catch (error) {
      console.error("Error triggering mine block:", error);
    }
  }

  // Trigger creating a new transaction
  private triggerCreateTransaction(): void {
    try {
      // Play transaction sound
      if (this.state.soundEnabled && this.sounds && this.sounds.transaction) {
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
          if (data && data.txid) {
            this.showNotification(
              `New cargo created! TXID: ${data.txid.substring(0, 8)}...`,
            );

            // Process the new transaction
            this.processNewTransaction({
              txid: data.txid,
              vin: [{ txid: "previous_tx" }],
              vout: [{ value: 0.001 + Math.random() * 0.01 }],
              size: 225 + Math.floor(Math.random() * 100),
            });
          }
        })
        .catch((error) => {
          console.error("Error creating transaction:", error);
          this.showNotification(
            `Error creating cargo: ${(error as Error).message}`,
          );

          // Simulate transaction creation for demo purposes
          const fakeTxid = `tx${Math.random().toString(16).substring(2, 10)}`;
          this.processNewTransaction({
            txid: fakeTxid,
            vin: [{ txid: "previous_tx" }],
            vout: [{ value: 0.001 + Math.random() * 0.01 }],
            size: 225 + Math.floor(Math.random() * 100),
          });
        });
    } catch (error) {
      console.error("Error triggering create transaction:", error);
    }
  }

  // Toggle sound on/off
  private toggleSound(): void {
    try {
      this.state.soundEnabled = !this.state.soundEnabled;

      // Update icon
      const soundIcon = document.getElementById("sound-icon");
      if (soundIcon) {
        soundIcon.className = this.state.soundEnabled
          ? "pixel-icon-sound-on"
          : "pixel-icon-sound-off";
      }

      // Update sounds
      if (this.sounds) {
        if (this.state.soundEnabled) {
          if (this.sounds.ambient) this.sounds.ambient.play();
          if (this.state.weather === "rainy" && this.sounds.rain)
            this.sounds.rain.play();
        } else {
          if (this.sounds.ambient) this.sounds.ambient.pause();
          if (this.sounds.rain) this.sounds.rain.pause();
        }
      }

      this.showNotification(
        `Sound ${this.state.soundEnabled ? "enabled" : "disabled"}`,
      );
    } catch (error) {
      console.error("Error toggling sound:", error);
    }
  }

  // Update weather conditions
  private updateWeather(): void {
    try {
      // Basic sanity checks
      if (!this.state) {
        console.warn("updateWeather: missing state object");
        return;
      }
      const { weatherTimer, weatherDuration, weather } = this.state;
      if (
        typeof weatherTimer !== "number" ||
        typeof weatherDuration !== "number"
      ) {
        console.warn("updateWeather: timers must be numbers", this.state);
        return;
      }
      if (weatherDuration <= 0) {
        console.warn("updateWeather: invalid weatherDuration", weatherDuration);
        return;
      }

      // Use weathers array from instance or default
      const weathers = this.weathers || ["clear", "cloudy", "rainy"];

      // Safe increment
      this.state.weatherTimer = weatherTimer + 1;

      // Only change when timer exceeds duration
      if (this.state.weatherTimer < weatherDuration) {
        return;
      }

      // Reset timer
      this.state.weatherTimer = 0;

      if (!weathers.includes(weather)) {
        console.warn("updateWeather: current weather not recognized", weather);
        this.state.weather = weathers[0] as "clear" | "cloudy" | "rainy";
      }

      const currentIndex = weathers.indexOf(this.state.weather);
      let newIndex: number;

      // Favor returning to clear weather
      if (currentIndex !== 0 && Math.random() < 0.6) {
        newIndex = 0;
      } else {
        // Pick a different weather at random
        const maxTries = 5;
        let tries = 0;
        do {
          newIndex = Math.floor(Math.random() * weathers.length);
          tries++;
        } while (newIndex === currentIndex && tries < maxTries);
        // If still same, just pick next in list
        if (newIndex === currentIndex) {
          newIndex = (currentIndex + 1) % weathers.length;
        }
      }

      // Change weather
      this.changeWeather(weathers[newIndex] as "clear" | "cloudy" | "rainy");
    } catch (error) {
      console.error("Error updating weather:", error);
    }
  }

  // Change weather conditions
  private changeWeather(newWeather: "clear" | "cloudy" | "rainy"): void {
    try {
      const oldWeather = this.state.weather;
      this.state.weather = newWeather;

      // Update weather indicator
      const weatherIndicator = document.getElementById("weather-indicator");
      if (weatherIndicator) {
        switch (newWeather) {
          case "clear":
            weatherIndicator.innerHTML = '<span class="pixel-icon-sun"></span>';
            break;
          case "cloudy":
            weatherIndicator.innerHTML =
              '<span class="pixel-icon-cloud"></span>';
            break;
          case "rainy":
            weatherIndicator.innerHTML =
              '<span class="pixel-icon-rain"></span>';
            break;
        }
      }

      // Visual effects based on weather
      switch (newWeather) {
        case "clear":
          // Clear existing weather effects
          this.clearWeatherEffects();

          // Brighten the sky if it exists
          if (this.sky) {
            gsap.to(this.sky, {
              //@ts-ignore
              tint: 0x4477aa,
              duration: 3,
            });
          }

          // Stop rain sound if it was playing
          if (
            oldWeather === "rainy" &&
            this.state.soundEnabled &&
            this.sounds &&
            this.sounds.rain
          ) {
            this.sounds.rain.fade!(0.2, 0, 3000);
          }
          break;

        case "cloudy":
          // Clear existing weather effects
          this.clearWeatherEffects();

          // Add more clouds
          if (this.clouds) {
            for (let i = 0; i < 10; i++) {
              this.createCloud(
                Math.random() * window.innerWidth * 3 - window.innerWidth,
                Math.random() * 200,
                0.05 + Math.random() * 0.1,
              );
            }
          }

          // Darken the sky slightly
          if (this.sky) {
            gsap.to(this.sky, {
              //@ts-ignore
              tint: 0x3a6080,
              duration: 3,
            });
          }

          // Stop rain sound if it was playing
          if (
            oldWeather === "rainy" &&
            this.state.soundEnabled &&
            this.sounds &&
            this.sounds.rain
          ) {
            this.sounds.rain.fade!(0.2, 0, 3000);
          }
          break;

        case "rainy":
          // Clear existing weather effects
          this.clearWeatherEffects();

          // Add darker clouds
          if (this.clouds) {
            for (let i = 0; i < 15; i++) {
              const cloud = this.createCloud(
                Math.random() * window.innerWidth * 3 - window.innerWidth,
                Math.random() * 150,
                0.03 + Math.random() * 0.08,
              );

              if (cloud) {
                // Darker clouds
                cloud.tint = 0x555555;
              }
            }
          }

          // Darken the sky
          if (this.sky) {
            gsap.to(this.sky, {
              //@ts-ignore
              tint: 0x2a4060,
              duration: 3,
            });
          }

          // Start rain animation
          this.startRainAnimation();

          // Play rain sound
          if (this.state.soundEnabled && this.sounds && this.sounds.rain) {
            this.sounds.rain.volume!(0);
            this.sounds.rain.play();
            this.sounds.rain.fade!(0, 0.2, 3000);
          }
          break;
      }

      this.showNotification(`Weather changed to ${newWeather}`);
    } catch (error) {
      console.error("Error changing weather:", error);
    }
  }

  // Clear weather effects
  private clearWeatherEffects(): void {
    try {
      // Remove any weather-specific effects
      this.stopRainAnimation();

      // Remove excess clouds (keep only a few)
      if (
        this.clouds &&
        this.clouds.children &&
        this.clouds.children.length > 10
      ) {
        // Keep first 10 clouds, remove the rest
        while (this.clouds.children.length > 10) {
          this.clouds.removeChildAt(10);
        }
      }
    } catch (error) {
      console.error("Error clearing weather effects:", error);
    }
  }

  // Start rain animation
  private startRainAnimation(): void {
    try {
      // Clean up existing rain if any
      this.stopRainAnimation();

      // Create rain container if it doesn't exist
      if (!this.effectsLayer) return;

      this.rain = new PIXI.Container();
      this.effectsLayer.addChild(this.rain);

      // Create initial raindrops
      for (let i = 0; i < 200; i++) {
        this.createRaindrop();
      }

      // Schedule periodic raindrop creation - store the interval ID for cleanup
      this.rainInterval = setInterval(() => {
        if (this.rain && this.rain.parent) {
          for (let i = 0; i < 5; i++) {
            this.createRaindrop();
          }
        } else {
          // Rain container was removed, clear interval
          if (this.rainInterval) {
            clearInterval(this.rainInterval);
            this.rainInterval = null;
          }
        }
      }, 100);

      // Track for cleanup
      this.activeAnimations.add(this.rain);
    } catch (error) {
      console.error("Error starting rain animation:", error);
    }
  }

  // Create a single raindrop
  private createRaindrop(): PIXI.Graphics | null {
    if (!this.rain || !this.rain.parent) return null;

    try {
      const raindrop = new PIXI.Graphics();
      raindrop.beginFill(0x4477aa, 0.7);
      raindrop.drawRect(0, 0, 1, 5);
      raindrop.endFill();

      // Random position above the screen, covering the viewable area
      raindrop.x =
        this.state.camera.x -
        window.innerWidth +
        Math.random() * window.innerWidth * 2;
      raindrop.y =
        this.state.camera.y - window.innerHeight - Math.random() * 100;

      // Add velocity for animation
      (raindrop as any).vy = 10 + Math.random() * 5;
      (raindrop as any).vx = 1 + Math.random();

      this.rain.addChild(raindrop);

      return raindrop;
    } catch (error) {
      console.error("Error creating raindrop:", error);
      return null;
    }
  }

  // Update rain animation
  private updateRainAnimation(delta: number): void {
    if (!this.rain || !this.rain.parent) return;

    try {
      // Update each raindrop
      for (let i = this.rain.children.length - 1; i >= 0; i--) {
        const raindrop = this.rain.children[i];
        if (!raindrop) continue;

        // Move raindrop
        raindrop.y += (raindrop as any).vy * delta;
        raindrop.x += (raindrop as any).vx * delta;

        // Remove if offscreen
        if (
          raindrop.y >
          this.state.camera.y +
            window.innerHeight / this.state.camera.scale +
            100
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
    } catch (error) {
      console.error("Error updating rain animation:", error);
    }
  }

  // Create rain splash effect
  private createRainSplash(x: number, y: number): void {
    if (!this.effectsLayer) return;

    try {
      // Create container for splash for easier cleanup
      const splashContainer = new PIXI.Container();
      splashContainer.position.set(x, y);
      this.effectsLayer.addChild(splashContainer);

      // Tiny circle that fades quickly
      const splash = new PIXI.Graphics();
      splash.beginFill(0x4477aa, 0.5);
      splash.drawCircle(0, 0, 2);
      splash.endFill();
      splashContainer.addChild(splash);

      // Track for cleanup
      this.activeAnimations.add(splashContainer);

      // Animate and remove with safety
      gsap.to(splash.scale, {
        x: 3,
        y: 1, // Flatten as it grows outward
        duration: 0.5,
        ease: "sine.out",
      });

      gsap.to(splash, {
        alpha: 0,
        duration: 0.5,
        ease: "sine.out",
        onComplete: () => {
          if (this.effectsLayer && splashContainer.parent) {
            this.effectsLayer.removeChild(splashContainer);
            this.activeAnimations.delete(splashContainer);
          }
        },
      });
    } catch (error) {
      console.error("Error creating rain splash:", error);
    }
  }

  // Stop rain animation
  private stopRainAnimation(): void {
    try {
      if (this.rainInterval) {
        clearInterval(this.rainInterval);
        this.rainInterval = null;
      }

      if (this.rain && this.effectsLayer) {
        this.effectsLayer.removeChild(this.rain);
        this.activeAnimations.delete(this.rain);
        this.rain = null;
      }
    } catch (error) {
      console.error("Error stopping rain animation:", error);
    }
  }

  // Update time of day (day/night cycle)
  private updateTimeOfDay(delta: number): void {
    try {
      // Update time
      this.state.timeOfDay += delta * 0.1; // Speed of day/night cycle
      if (this.state.timeOfDay >= 24) {
        this.state.timeOfDay = 0;
      }

      // Update game time display
      const hours = Math.floor(this.state.timeOfDay);
      const minutes = Math.floor((this.state.timeOfDay - hours) * 60);

      const gameTimeElement = document.getElementById("game-time");
      if (gameTimeElement) {
        gameTimeElement.textContent = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      }

      // Update sky and lighting based on time
      this.updateDayNightCycle();
    } catch (error) {
      console.error("Error updating time of day:", error);
    }
  }

  // Update the day/night cycle visuals
  private updateDayNightCycle(): void {
    try {
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

      // Apply sky color with safety check
      if (this.sky) {
        // Don't override weather tint completely
        if (this.state.weather === "clear") {
          this.sky.tint = skyColor!;
        }
      }

      // Position sun and moon with safety checks
      if (this.sun) {
        this.sun.y = 300 - sunPosition!;
        this.sun.alpha = Math.max(0, Math.min(1, sunPosition! / 100));
      }

      if (this.moon) {
        this.moon.y = 300 - moonPosition!;
        this.moon.alpha = Math.max(0, Math.min(1, moonPosition! / 100));
      }

      // Show/hide stars with safety check
      if (this.stars && this.stars.children) {
        this.stars.children.forEach((star) => {
          if (star) {
            star.alpha = Math.max(0, (1 - sunPosition! / 100) * 0.8);
          }
        });
      }

      // Apply dark overlay for night time
      const timeCycle = document.getElementById("time-cycle");
      if (timeCycle) {
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
      }
    } catch (error) {
      console.error("Error updating day/night cycle:", error);
    }
  }

  // Interpolate between two colors
  private lerpColor(color1: number, color2: number, t: number): number {
    try {
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
    } catch (error) {
      console.error("Error lerping colors:", error);
      return color1; // Return first color as fallback
    }
  }

  // Update caravans
  private updateCaravans(delta: number): void {
    try {
      // Add subtle animations to caravans
      if (this.state.caravans && Array.isArray(this.state.caravans)) {
        this.state.caravans.forEach((caravan, index) => {
          if (!caravan) return; // Skip if undefined

          // Skip the first caravan (already at final position)
          if (index === 0) return;

          // Skip if pathPoints are not initialized
          if (!this.pathPoints || !Array.isArray(this.pathPoints)) return;

          // Calculate target position along the trail
          const pathIndex = Math.min(this.pathPoints.length - 1, index);
          const pathPoint = this.pathPoints[pathIndex];

          if (!pathPoint) return; // Skip if pathPoint is undefined

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
    } catch (error) {
      console.error("Error updating caravans:", error);
    }
  }

  // Update traders
  private updateTraders(delta: number): void {
    try {
      // Add idle animations and movement patterns for waiting traders
      if (this.state.traders && Array.isArray(this.state.traders)) {
        this.state.traders.forEach((trader) => {
          if (!trader) return; // Skip if undefined

          if ((trader as any).state === "waiting" && Math.random() < 0.01) {
            const direction = Math.random() > 0.5 ? 1 : -1;
            const distance = 10 + Math.random() * 20;

            gsap.to(trader, {
              x: trader.x + direction * distance,
              duration: 2 + Math.random() * 2,
              ease: "power1.inOut",
            });
          }
        });
      }
    } catch (error) {
      console.error("Error updating traders:", error);
    }
  }

  // Update miners
  private updateMiners(delta: number): void {
    try {
      // For miners with active state, occasionally show mining effects
      if (this.state.miners && Array.isArray(this.state.miners)) {
        this.state.miners.forEach((miner) => {
          if (!miner || !(miner as any).minerData) return; // Skip if undefined

          if ((miner as any).minerData.active && Math.random() < 0.01) {
            // Small probability to show mining effect
            this.addMiningParticles(miner);

            // Probability to find a block based on hash power
            const findBlockChance = (miner as any).minerData.hashPower / 10000;

            if (Math.random() < findBlockChance) {
              // This miner found a block!
              this.triggerMineBlock();

              // Increment blocks found
              (miner as any).minerData.blocksFound++;
            }
          }
        });
      }
    } catch (error) {
      console.error("Error updating miners:", error);
    }
  }

  // Update clouds
  private updateClouds(delta: number): void {
    try {
      if (this.clouds && this.clouds.children) {
        this.clouds.children.forEach((cloud) => {
          if (cloud && (cloud as any).speed !== undefined) {
            cloud.x += (cloud as any).speed * delta * 60;

            // Wrap around screen
            if (
              cloud.x >
              this.state.camera.x +
                window.innerWidth / this.state.camera.scale +
                ((cloud as any).cloudWidth || 50)
            ) {
              cloud.x =
                this.state.camera.x -
                window.innerWidth / this.state.camera.scale -
                ((cloud as any).cloudWidth || 50);
            }
          }
        });
      }
    } catch (error) {
      console.error("Error updating clouds:", error);
    }
  }

  // Trigger random events
  private triggerRandomEvents(): void {
    try {
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
            const weathers = ["clear", "cloudy", "rainy"] as const;
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
              if (randomMiner && (randomMiner as any).minerData) {
                this.showNotification(
                  `${(randomMiner as any).minerData.name} is looking for new mining opportunities!`,
                );
              }
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
              if (randomCaravan && (randomCaravan as any).blockData) {
                this.showNotification(
                  `Caravan #${(randomCaravan as any).blockData.height} is sharing its route with other travelers`,
                );
              }
            }
            break;
        }
      }
    } catch (error) {
      console.error("Error triggering random events:", error);
    }
  }

  // Clean up animations and resources
  public cleanup(): void {
    try {
      console.log("Cleaning up resources...");

      // Kill all animations tracked in activeAnimations
      this.activeAnimations.forEach((animation) => {
        gsap.killTweensOf(animation);
      });
      this.activeAnimations.clear();

      // Clear intervals
      if (this.rainInterval) {
        clearInterval(this.rainInterval);
        this.rainInterval = null;
      }

      // Stop sounds
      if (this.sounds) {
        if (this.sounds.ambient && this.sounds.ambient.stop)
          this.sounds.ambient.stop();
        if (this.sounds.rain && this.sounds.rain.stop) this.sounds.rain.stop();
      }

      // Clean up PIXI containers in a controlled manner
      if (this.app && this.app.stage) {
        // Remove all containers properly
        if (this.worldContainer) {
          // First remove all layers to prevent rendering during cleanup
          if (this.backgroundLayer)
            this.worldContainer.removeChild(this.backgroundLayer);
          if (this.trailLayer) this.worldContainer.removeChild(this.trailLayer);
          if (this.caravanLayer)
            this.worldContainer.removeChild(this.caravanLayer);
          if (this.traderLayer)
            this.worldContainer.removeChild(this.traderLayer);
          if (this.minerLayer) this.worldContainer.removeChild(this.minerLayer);
          if (this.outpostLayer)
            this.worldContainer.removeChild(this.outpostLayer);
          if (this.effectsLayer)
            this.worldContainer.removeChild(this.effectsLayer);

          // Then destroy each layer safely
          [
            this.backgroundLayer,
            this.trailLayer,
            this.caravanLayer,
            this.traderLayer,
            this.minerLayer,
            this.outpostLayer,
            this.effectsLayer,
          ].forEach((layer) => {
            if (layer) {
              layer.children.forEach((child) => {
                layer.removeChild(child);
              });
              layer.destroy({ children: true });
            }
          });

          // Finally remove and destroy the worldContainer
          this.app.stage.removeChild(this.worldContainer);
          this.worldContainer.destroy({ children: true });
        }

        // Clean up UI layer
        if (this.uiLayer) {
          this.app.stage.removeChild(this.uiLayer);
          this.uiLayer.destroy({ children: true });
        }

        // Clear the stage
        this.app.stage.removeChildren();
      }

      // Destroy the application
      if (this.app) {
        this.app.destroy(true, {
          children: true,
          texture: true,
          baseTexture: true,
        });
      }

      // Clear DOM references
      const gameContainer = document.getElementById("game-container");
      if (gameContainer) {
        gameContainer.innerHTML = "";
      }

      console.log("Cleanup complete");
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  }

  // Main game loop
  private gameLoop(delta: number): void {
    try {
      this.frameCount++;

      // Cap delta time to avoid huge jumps
      const dt = Math.min(delta / 60, 0.1);

      // Update game time
      this.state.gameTime += dt;

      // Update camera with safety checks
      if (this.state.camera) {
        this.state.camera.scale +=
          (this.state.camera.targetScale - this.state.camera.scale) * 0.1;

        // Apply camera position to world container
        if (this.worldContainer) {
          this.worldContainer.position.set(
            window.innerWidth / 2 + this.state.camera.x,
            window.innerHeight / 2 + this.state.camera.y,
          );
          this.worldContainer.scale.set(
            this.state.camera.scale,
            this.state.camera.scale,
          );
        }
      }

      // Only update game elements if the world is initialized
      if (this.worldInitialized) {
        // Update time of day
        this.updateTimeOfDay(dt);

        // Update environment elements
        this.updateClouds(dt);
        this.updateWeather();

        // Update rain if it exists
        if (this.rain) {
          this.updateRainAnimation(dt);
        }

        // Update game entities
        this.updateCaravans(dt);
        this.updateTraders(dt);
        this.updateMiners(dt);

        // Random events (with lower probability to reduce load)
        if (Math.random() < 0.0005) {
          this.triggerRandomEvents();
        }
      }

      // Log debug info occasionally
      if (this.frameCount % 300 === 0) {
        console.log(
          `Frame ${this.frameCount}, Game time: ${this.state.gameTime.toFixed(2)}`,
        );
      }
    } catch (error) {
      console.error("Error in game loop:", error);

      // Try to recover from errors by skipping this frame
      // Don't tear down the game loop unless absolutely necessary
    }
  }
}
