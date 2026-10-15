# Stellarium (스텔라리움)

[한국어](README.md) | **English** | [日本語](README.jp.md)

A Windows desktop app that checks the CHZZK live status of StelLive members and sends a Windows
notification when a broadcast starts.

This app is not an official StelLive service. It is an unofficial, fan-operated project.

Live status comes from CHZZK, and broadcast schedules (뱅온) come from StelLight. Built with the
[`stellastatus`](https://www.npmjs.com/package/stellastatus) library and Electron.

> 📌 For the difference between stable and beta versions and how to opt into betas, see the **[version guide](VERSIONING.md)** (written in Korean).

## Features

- Periodically checks the CHZZK live status of all members
- Windows notification when a subscribed member goes live (click to open the stream)
- Optionally opens the live stream in your default browser when a broadcast starts
- Per-member profile, live title / category / viewer count, thumbnails
- Today's schedule (from StelLight)
- Runs in the tray, optional launch at Windows startup
- Self-update via GitHub Releases

## Development

Requires Node.js 18+.

```bash
npm install
npm run gen-icon
npm run gen-logos
npm start
```

Use `npm run dev` to also open DevTools.

## Building the installer

Builds the custom installer (`스텔라리움 Setup.exe`) in one step.

```bash
npm run build-setup
```

The build packages the main app, bundles it inside the installer, and produces a single executable at
`dist-installer/스텔라리움 Setup.exe`. Electron and the app are all included, so that single file is
enough to install.

The installer uses a frameless dark UI (welcome, terms, install location, progress, done), creates
Desktop and Start Menu shortcuts, and registers an uninstall entry. You can also uninstall from within
the app settings.

## Distribution (GitHub Releases)

The distributed artifact is a single `스텔라리움 Setup.exe`. The app's self-updater checks the GitHub
Releases API for the latest release, so no extra metadata files are required.

Push a version tag and GitHub Actions builds the installer and uploads it to the release.

```bash
git tag v1.0.3
git push origin v1.0.3
```

## Data sources

- Live status: CHZZK internal API. This is an undocumented endpoint, so it may change or be blocked;
  intended for personal, non-commercial use.
- Schedules: the public API of StelLight, a fan-made service. The check interval is limited to a
  minimum of 30 seconds to reduce server load.

## Privacy policy

- This app does not collect or transmit any personal data.
- The app only sends network requests to:
  - **CHZZK** — to read broadcast status
  - **StelLight** — to read broadcast schedules
  - **GitHub** — to check for and download updates
- All settings (notification subscription lists, check interval, etc.) are **stored locally on the
  user's PC only** and are never transmitted anywhere.
- No information that the user did not request is sent to any external server.

## License

MIT
