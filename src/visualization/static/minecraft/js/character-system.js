/**
 * CharacterSystem - Manages NPCs and transaction characters
 */
class CharacterSystem {
  constructor(voxelEngine) {
    this.engine = voxelEngine;
    this.characters = [];
    this.playerInteractions = {};

    // Set character interaction handler on the voxel engine
    this.engine.onCharacterInteraction = this.interact.bind(this);

    // Initialize UI elements
    this.initializeUI();
  }

  initializeUI() {
    // Create conversation UI
    this.conversationUI = document.createElement("div");
    this.conversationUI.className = "conversation-ui";
    this.conversationUI.style.display = "none";
    document.body.appendChild(this.conversationUI);

    // Create interaction prompt
    this.interactionPrompt = document.createElement("div");
    this.interactionPrompt.className = "interaction-prompt";
    this.interactionPrompt.textContent = "Press E to interact";
    this.interactionPrompt.style.display = "none";
    document.body.appendChild(this.interactionPrompt);
  }

  createCharacter(type, position, data = {}) {
    // Create character in the 3D world
    const character = this.engine.createCharacter(
      type,
      position.x,
      position.y,
      position.z,
    );

    // Add additional data
    character.userData = {
      ...character.userData,
      ...data,
      interactable: true,
    };

    // Add dialogues based on type
    character.dialogues = this.generateDialogues(type, data);

    // Create nametag
    const nametag = document.createElement("div");
    nametag.className = "character-nametag";
    nametag.textContent = this.getCharacterName(type, data);
    nametag.style.display = "none";
    document.body.appendChild(nametag);
    character.nametag = nametag;

    // Add to characters array
    this.characters.push(character);

    return character;
  }

  createTransactionCharacter(txData) {
    // Determine position
    const centerX = 0;
    const centerZ = 0;
    const radius = 20;
    const angle = Math.random() * Math.PI * 2;

    const position = new THREE.Vector3(
      centerX + Math.cos(angle) * radius,
      1,
      centerZ + Math.sin(angle) * radius,
    );

    // Create character
    const character = this.createCharacter("transaction", position, txData);

    // Set additional properties
    character.txData = txData;
    character.state = "waiting";

    // Set random animation offset
    character.animationOffset = Math.random() * Math.PI * 2;

    return character;
  }

  getCharacterName(type, data) {
    switch (type) {
      case "transaction":
        return `TX: ${data.txid ? data.txid.substring(0, 8) + "..." : "Unknown"}`;
      case "miner":
        return "Block Miner";
      case "trader":
        return "Token Trader";
      case "validator":
        return "Validator";
      default:
        return type.charAt(0).toUpperCase() + type.slice(1);
    }
  }

  generateDialogues(type, data) {
    switch (type) {
      case "transaction":
        return this.generateTransactionDialogues(data);
      case "miner":
        return [
          "I'm a block miner! I secure the network by solving cryptographic puzzles.",
          "Each block I mine contains multiple transactions.",
          "Mining difficulty adjusts to keep block time consistent.",
          "Want to try mining? Find a block and click on it with your pickaxe.",
        ];
      case "trader":
        return [
          "I trade different cryptocurrencies across the blockchain.",
          "Each token has different properties and uses.",
          "Smart contracts ensure our trades are fair and automatic.",
          "Want to trade some tokens? I can help you exchange them.",
        ];
      case "validator":
        return [
          "I validate transactions to ensure they follow consensus rules.",
          "Invalid transactions get rejected from entering blocks.",
          "Validation is crucial for maintaining blockchain integrity.",
          "The rules of the blockchain are enforced by nodes like me.",
        ];
      default:
        return ["Hello there!"];
    }
  }

  generateTransactionDialogues(txData) {
    if (!txData) return ["I'm a transaction waiting to be processed."];

    const dialogues = [
      `I'm transaction ${txData.txid ? txData.txid.substring(0, 8) + "..." : "Unknown"}.`,
    ];

    // Add information about inputs and outputs
    if (txData.vin && txData.vout) {
      dialogues.push(
        `I have ${txData.vin.length} input(s) and ${txData.vout.length} output(s).`,
      );
    }

    // Add information about size
    if (txData.size) {
      dialogues.push(`My size is ${txData.size} bytes.`);
    }

    // Add information about confirmations
    if (txData.confirmations !== undefined) {
      if (txData.confirmations > 0) {
        dialogues.push(`I have ${txData.confirmations} confirmation(s).`);
      } else {
        dialogues.push(
          "I'm still waiting in the mempool to be included in a block.",
        );
      }
    }

    // Add a random fact
    const facts = [
      "Transactions like me get grouped together in blocks.",
      "I pay a fee to incentivize miners to include me in a block.",
      "My data is secured by cryptographic signatures.",
      "Once confirmed, I become a permanent part of the blockchain.",
    ];

    dialogues.push(facts[Math.floor(Math.random() * facts.length)]);

    return dialogues;
  }

  update(delta) {
    // Update all characters
    this.characters.forEach((character) => {
      // Skip if character is removed
      if (!character.parent) return;

      // Update animation based on state
      if (character.state === "waiting") {
        // Floating animation for waiting transactions
        character.position.y =
          1 + Math.sin(Date.now() / 1000 + character.animationOffset) * 0.1;
      } else if (character.state === "moving" && character.targetPosition) {
        // Moving animation
        this.updateMovingCharacter(character, delta);
      }

      // Update nametag position if it exists
      if (character.nametag) {
        this.updateNametag(character);
      }

      // Check for player proximity
      this.checkPlayerProximity(character);
    });
  }

  updateMovingCharacter(character, delta) {
    // Calculate direction to target
    const direction = new THREE.Vector3().subVectors(
      character.targetPosition,
      character.position,
    );

    // Check if we've reached the target
    if (direction.length() < 0.1) {
      character.position.copy(character.targetPosition);
      character.state = "arrived";

      // Handle arrival callback if set
      if (character.onArrival) {
        character.onArrival();
      }

      return;
    }

    // Move toward target
    direction.normalize();
    const moveSpeed = character.moveSpeed || 0.05;
    character.position.add(direction.multiplyScalar(moveSpeed));

    // Rotate character to face movement direction
    character.rotation.y = Math.atan2(direction.x, direction.z);

    // Add bob animation while moving
    character.position.y += Math.sin(Date.now() / 150) * 0.01;
  }

  updateNametag(character) {
    // Project 3D position to screen
    const vector = new THREE.Vector3();
    vector.setFromMatrixPosition(character.matrixWorld);
    vector.project(this.engine.camera);

    // Convert to screen coordinates
    const x = ((vector.x + 1) / 2) * window.innerWidth;
    const y = (-(vector.y - 1) / 2) * window.innerHeight;

    // Position nametag
    character.nametag.style.left = `${x}px`;
    character.nametag.style.top = `${y - 40}px`;

    // Check if character is in front of camera
    const cameraPosition = this.engine.camera.position;
    const characterPosition = character.position;
    const cameraDirection = new THREE.Vector3();
    this.engine.camera.getWorldDirection(cameraDirection);

    const toCharacter = new THREE.Vector3().subVectors(
      characterPosition,
      cameraPosition,
    );

    // Hide nametag if character is behind camera
    if (toCharacter.dot(cameraDirection) <= 0) {
      character.nametag.style.display = "none";
    }
  }

  checkPlayerProximity(character) {
    // Get player position
    const playerPosition = this.engine.controls.getObject().position;
    const characterPosition = character.position;

    // Calculate distance
    const distance = characterPosition.distanceTo(playerPosition);

    // Show nametag if close enough
    if (distance < 15) {
      character.nametag.style.display = "block";

      // Show interaction prompt if very close
      if (distance < 3 && character.userData.interactable) {
        this.showInteractionPrompt(character);
        this.interactionTarget = character;
      } else if (this.interactionTarget === character) {
        this.hideInteractionPrompt();
        this.interactionTarget = null;
      }
    } else {
      character.nametag.style.display = "none";

      if (this.interactionTarget === character) {
        this.hideInteractionPrompt();
        this.interactionTarget = null;
      }
    }
  }

  showInteractionPrompt() {
    // Position the prompt in the center of the screen
    this.interactionPrompt.style.display = "block";
  }

  hideInteractionPrompt() {
    this.interactionPrompt.style.display = "none";
  }

  interact(character) {
    // Called when player interacts with a character
    if (!character || !character.dialogues || character.dialogues.length === 0)
      return;

    console.log("Interacting with character:", character.characterType);

    // Start conversation
    this.startConversation(character);
  }

  startConversation(character) {
    // Pause the game
    if (this.engine.controls.isLocked) {
      this.engine.controls.unlock();
    }

    // Show conversation UI
    this.conversationUI.style.display = "block";

    // Create conversation content
    this.conversationUI.innerHTML = `
      <div class="conversation-header">
        <h3>${character.nametag ? character.nametag.textContent : "Character"}</h3>
        <button class="close-btn">×</button>
      </div>
      <div class="conversation-content">
        <p>${character.dialogues[0]}</p>
      </div>
      <div class="conversation-options">
        <button class="next-btn">Next</button>
      </div>
    `;

    // Set current dialogue state
    this.currentDialogueIndex = 0;
    this.currentCharacter = character;

    // Add event listeners
    this.conversationUI
      .querySelector(".close-btn")
      .addEventListener("click", () => {
        this.endConversation();
      });

    this.conversationUI
      .querySelector(".next-btn")
      .addEventListener("click", () => {
        this.showNextDialogue();
      });
  }

  showNextDialogue() {
    if (!this.currentCharacter || !this.currentCharacter.dialogues) return;

    this.currentDialogueIndex++;

    if (this.currentDialogueIndex >= this.currentCharacter.dialogues.length) {
      // End of dialogue
      this.endConversation();
      return;
    }

    // Update dialogue text
    const content = this.conversationUI.querySelector(".conversation-content");
    content.innerHTML = `<p>${this.currentCharacter.dialogues[this.currentDialogueIndex]}</p>`;
  }

  endConversation() {
    // Hide conversation UI
    this.conversationUI.style.display = "none";

    // Reset conversation state
    this.currentCharacter = null;
    this.currentDialogueIndex = 0;

    // Resume game
    if (!this.engine.controls.isLocked) {
      this.engine.controls.lock();
    }
  }

  moveCharacterTo(character, targetPosition, onArrival) {
    if (!character) return;

    // Set target position
    character.targetPosition = targetPosition.clone();
    character.state = "moving";
    character.moveSpeed = 0.05 + Math.random() * 0.03; // Random speed variation

    // Set optional arrival callback
    if (onArrival) {
      character.onArrival = onArrival;
    }
  }

  removeCharacter(character) {
    if (!character) return;

    // Remove from scene
    this.engine.scene.remove(character);

    // Remove nametag
    if (character.nametag && character.nametag.parentNode) {
      character.nametag.parentNode.removeChild(character.nametag);
    }

    // Remove from array
    const index = this.characters.indexOf(character);
    if (index !== -1) {
      this.characters.splice(index, 1);
    }
  }

  fadeOutCharacter(character, duration = 1) {
    if (!character) return;

    // Animate opacity
    let opacity = 1;
    const fadeInterval = setInterval(() => {
      opacity -= 0.05;

      if (opacity <= 0) {
        clearInterval(fadeInterval);
        this.removeCharacter(character);
        return;
      }

      // Update material opacity
      if (character.material) {
        if (!character.material.transparent) {
          character.material.transparent = true;
        }
        character.material.opacity = opacity;
      }

      // Update nametag opacity
      if (character.nametag) {
        character.nametag.style.opacity = opacity.toString();
      }
    }, duration * 50);
  }
}
