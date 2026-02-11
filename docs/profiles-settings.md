# Profiles & Settings Guide

> 📹 **Video walkthrough:** _Coming soon_

This guide covers how to manage multiple configurations and customize Caravan-X.

---

## Accessing Settings

From the main menu, select **⚙️ System → Settings**, or the Settings shortcut:
```
View All Configurations
Switch Mode
Edit Current Config
Manage Profiles
Logging & Debug
```

---

## Viewing All Configurations

Shows a dashboard of all Docker and Manual profiles, plus which one is currently active. Displays:
- Profile name and mode
- Last used date
- RPC connection details
- Docker container name (Docker profiles)

---

## Switching Modes

**Settings → Switch Mode**

Switch between Docker and Manual mode. If the target mode has existing profiles, you can select one. If not, the setup wizard runs to create a new one.

---

## Editing Current Config

**Settings → Edit Current Config**

Modify the active profile's configuration:
- RPC settings (host, port, credentials)
- Docker settings (container name, ports)
- Snapshot settings

---

## Managing Profiles

**Settings → Manage Profiles**

For each profile, you can:
- **Set as Active** — Switch to this profile
- **Rename** — Update the display name
- **Delete** — Permanently remove the profile and all its data (including Docker containers)

---

## Logging & Debug

Configure verbosity levels:

- **Silent** — No output except errors
- **Normal** — Standard operation messages
- **Verbose** — Detailed operation logs
- **Debug** — Everything, including RPC commands and Docker operations

Logs are saved per-profile in the `logs/` directory.
