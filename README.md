# Caravan Regtest Manager

A terminal-based utility for managing Caravan multisig wallets in regtest mode. This tool simplifies development and testing with Caravan by providing an easy-to-use interface for:

- Managing Bitcoin wallets in regtest mode
- Creating and configuring multisig wallet setups
- Handling PSBTs (Partially Signed Bitcoin Transactions)
- Mining blocks and simulating network activity
- Integrating with Caravan for multisig wallet management

## Features

### Bitcoin Wallet Management
- Create and manage various types of Bitcoin wallets
- Generate and extract private keys
- Fund wallets by mining blocks
- Send funds between wallets
- View wallet details and balances

### Caravan Multisig Support
- Create multisig wallet configurations for Caravan
- Set up watch-only wallets for multisig addresses
- Configure private keys for signing transactions
- Import and export wallet configurations
- Generate extended public keys (xpubs)

### Transaction Operations
- Create PSBTs for multisig transactions
- Sign PSBTs with various wallets or private keys
- Analyze, decode, and inspect PSBTs
- Finalize and broadcast transactions
- Extract signatures in Caravan-compatible format

### Regtest Environment Management
- Mine blocks to confirm transactions
- Generate new regtest coins for testing
- Simulate network activity
- Test with different fee rates and confirmation settings

## Prerequisites

- Node.js v14 or later
- Bitcoin Core running in regtest mode
- Caravan (optional, for UI-based multisig wallet management)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/caravan-regtest-manager.git
   cd caravan-regtest-manager
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Build the project:
   ```
   npm run build
   ```

4. Link the CLI globally (optional):
   ```
   npm link
   ```

## Usage

### Interactive Mode

Start the interactive terminal UI:

```
npm start
```

Or if you've linked it globally:

```
caravan-regtest
```

### CLI Commands

You can also use direct commands:

```
# List all wallets
caravan-regtest list-wallets

# Create a new wallet
caravan-regtest create-wallet

# Create a new Caravan multisig wallet
caravan-regtest create-caravan

# Fund a wallet with regtest coins
caravan-regtest fund-wallet --wallet <wallet-name>

# Create a new PSBT
caravan-regtest create-psbt

# Sign a PSBT with a wallet
caravan-regtest sign-psbt --file <psbt-file> --wallet <wallet-name>
```

## Configuration

The default configuration is stored in `~/.caravan-regtest/config.json`. You can modify this file to change:

- Bitcoin Core RPC connection settings
- Directory paths for Caravan wallet configurations
- Key storage locations

## Development

### Running in Development Mode

```
npm run dev
```

### Linting

```
npm run lint
```

### Running Tests

```
npm test
```

## Security Considerations

This tool is intended for **regtest and development purposes only**. It should never be used with real funds or on mainnet because:

1. Private keys may be stored in plain text
2. Security is not hardened for production use
3. It focuses on developer convenience over security best practices

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.
