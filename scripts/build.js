#!/usr/bin/env node

const fs = require("fs-extra");
const path = require("path");

async function copyStaticAssets() {
  try {
    // Create dist directories if they don't exist
    await fs.ensureDir("dist/visualization/static");
    await fs.ensureDir("dist/scripting/templates");

    // Copy visualization static files
    await fs.copy("src/visualization/static", "dist/visualization/static");
    console.log("✅ Visualization static files copied successfully");

    // Copy visualization assets
    await fs.copy("src/visualization/assets", "dist/visualization/assets");
    console.log("✅ Visualization assets copied successfully");

    // Copy script templates
    await fs.copy("src/scripting/templates", "dist/scripting/templates");
    console.log("✅ Script templates copied successfully");

    console.log("✨ All static assets copied successfully!");
  } catch (err) {
    console.error("Error copying static assets:", err);
    process.exit(1);
  }
}

copyStaticAssets();
