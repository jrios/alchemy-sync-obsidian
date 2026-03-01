# Alchemy Sync

Sync your Obsidian notes with Articles in your [Alchemy](https://alchemyrpg.com/) Universes.

## Features

- Sync notes from Alchemy to your vault to allow offline editing.
- Sync notes from your Obsidian vault back to Alchemy

## Requirements

- *Obsidian 1.12.4* or later
- Alchemy user token*


*Add this as a bookmarklet to copy your Alchemy user token to your clipboard:
`javascript:(function () { const token = JSON.parse(localStorage.getItem('user')).token; navigator.clipboard.writeText(token).then(() => alert('Alchemy user token copied!')) })();`

## Installation

### Manual installation instructions

1. Download the zip from the latest [release](https://github.com/jrios/alchemy-sync-obsidian/releases/latest).
2. Extract the zip to your vault's plugins folder: `path-to-vault/.obsidian/plugins/`.
3. Restart Obsidian or navigate to Settings -> Community plugins -> Reload plugins
4. Enable "Alchemy Sync" in Settings -> Community Plugins

## Setup & Usage

In order to sync your notes, need to configure the plugin: Settings -> Community Plugins -> Alchemy Sync

- Add your Alchemy user token
- Set the folder to sync notes to and from

There are two commands available in the Command Pallete (CTRL+P on Windows or CMD+P on Mac):

**Sync Vault to Alchemy** will attempt to sync notes to Universes in Alchemy.
**Sync Vault from Alchemy** will attempt to pull articles and create/update matching notes in your Vault.


