# Troubleshooting Guide

> 📹 **Video walkthrough:** _Coming soon_

Common issues and their solutions.

---

## Docker Issues

### Docker Not Installed

**Error:** `Docker command not found`

**Solution:**
- Install Docker Desktop: [https://docs.docker.com/get-docker/](https://docs.docker.com/get-docker/)
- Restart your terminal after installation
- Or use Manual mode instead

### Docker Daemon Not Running

**Error:** `Cannot connect to the Docker daemon`

**Solution:**
- **macOS:** Open Docker Desktop from Applications, or run `open -a Docker`
- **Linux:** Run `sudo systemctl start docker`
- Wait a few seconds after starting, then try again

### Container Name Conflict

**Error:** `Container "caravan-x-bitcoin" already exists`

**Solution:**
```bash
docker rm -f caravan-x-bitcoin
```
Or use a different container name in the setup wizard.

### Port Already In Use

**Error:** `Port 8080 is already in use`

Caravan-X usually auto-resolves this. If it persists:
```bash
# Find what's using the port
lsof -i :8080

# Kill the process (replace PID)
kill -9 <PID>
```

Or go to **Docker Management → Troubleshoot Port Issues**.

### Docker Image Pull Failed

**Error:** `Failed to pull the Docker image`

**Solution:**
- Check your internet connection
- Try manually: `docker pull bitcoin/bitcoin:27.0`
- Verify the image name in your config

---

## Bitcoin Core Connection Issues

### Connection Refused

**Error:** `Cannot connect to Bitcoin Core at http://localhost:18443`

**Checks:**
1. Is Bitcoin Core running? `bitcoin-cli -regtest getblockchaininfo`
2. If using Docker: `docker ps | grep caravan`
3. Verify host/port in Settings → Edit Current Config
4. Default regtest RPC port is 18443

### Authentication Failed

**Error:** `RPC authentication failed — wrong username or password`

**Solution:**
- Check credentials in Settings → Edit Current Config → RPC Settings
- Verify `bitcoin.conf` has matching `rpcuser`/`rpcpassword`
- Docker mode: credentials were set during setup

### 502 Bad Gateway

**Error:** `Proxy cannot reach Bitcoin Core`

**Solution:**
- Ensure all containers are running: `docker ps`
- Restart containers via Docker Management → Start container
- Check nginx logs: `docker logs caravan-x-nginx`

---

## Wallet Issues

### Caravan Can't See Wallets

**Checks:**
1. Are you using Docker mode with nginx proxy?
2. Does the RPC URL in Caravan match your Caravan-X setup?
3. Was the watch-only wallet created? Check with **Bitcoin Wallets → List all wallets**

### Descriptors Not Importing

**Checks:**
- Caravan-X uses `sortedmulti` — requires Bitcoin Core v0.17+
- Ensure you're using descriptor wallets (not legacy)
- Fingerprints and derivation paths must be correct (Caravan-X handles this automatically)

---

## Snapshot Issues

### Restore Failed

**Solution:**
1. Stop Bitcoin Core before restoring (Docker Management → Stop container)
2. Ensure you have enough disk space
3. Try restoring again

### Snapshot File Not Found

The snapshot's `.tar.gz` file may have been moved or deleted. Snapshots are stored in the profile's `snapshots/` directory.

---

## General Tips

- **Restart Caravan-X** after changing profiles or modes
- **Check Docker status** if anything seems unresponsive: `docker ps`
- **Use verbose logging** (Settings → Logging & Debug) to see detailed error information
- **File an issue** if you encounter a bug: [GitHub Issues](https://github.com/Legend101Zz/CaravanX/issues)
