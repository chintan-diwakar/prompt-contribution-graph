

<div align="center">
  <img src="build/icon.svg" width="128" alt="Prompt Contribution Graph logo">
  <h1>Prompt Contribution Graph</h1>
  <p><em>Track your daily prompt contributions across CLI coding agents.</em></p>

  <p>
    <a href="https://github.com/chintan-diwakar/prompt-contribution-graph/actions/workflows/desktop-builds.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/chintan-diwakar/prompt-contribution-graph/desktop-builds.yml?branch=main&amp;style=flat-square&amp;label=build"></a>
    <a href="https://github.com/chintan-diwakar/prompt-contribution-graph/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/chintan-diwakar/prompt-contribution-graph?style=flat-square"></a>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-24292f?style=flat-square"></a>
    <img alt="macOS and Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Linux-24292f?style=flat-square">
    <img alt="Local first" src="https://img.shields.io/badge/data-local--first-d95725?style=flat-square">
  </p>

  <p><strong>GitHub tracks code commits. Prompt Contribution Graph tracks your contributions to coding agents.</strong></p>
  <p>Prompts, final responses, and safe tool metadata. Stored locally. No account. No telemetry.</p>
</div>

> [!NOTE]
> The current release supports Claude Code. Prompt Contribution Graph is an unofficial community project that is not affiliated with Anthropic.

![Prompt Contribution Graph dashboard with daily insight, streaks, prompt totals, and a contribution chart](docs/prompttrail-activity.png)

## Features

- Captures prompts and final responses through official Claude Code hooks.
- Records tool names, status, duration, and safe targets such as file paths.
- Stores activity and session details in a local SQLite database.
- Displays a 53-week contribution chart.
- Calculates the current streak, longest streak, and prompt totals.
- Displays one daily insight from your recent activity.
- Captures a private activity screenshot for the system share menu.
- Searches prompt and response text, then filters results by project.
- Deletes complete interactions from the dashboard.
- Preserves existing Claude Code hooks and settings.

## Requirements

- Node.js 22.5 or later
- Claude Code with hook support

## Desktop builds

The release workflow creates these desktop packages:

- An AppImage for general Linux distributions.
- A `.deb` package for Ubuntu and Debian-based distributions.
- A `.dmg` package for Intel and Apple silicon Macs.

The desktop application installs its Claude Code hooks on the first launch. It uses the same local database as the command-line dashboard.

The current macOS packages do not have an Apple signature. macOS displays a security warning until a release uses signing and notarization.

### Share an activity screenshot

The **Share** button captures the activity screen. The screenshot does not contain prompt text, response text, project names, or tool details.

On macOS, Prompt Contribution Graph opens the system share menu. Select X, Messages, AirDrop, Mail, or another available service.

On Linux, Prompt Contribution Graph copies the screenshot and opens an X post window. Paste the screenshot into the post.

Prompt Contribution Graph also saves each screenshot in the `Prompt Contribution Graph` folder in your Pictures directory.

## Install from this repository

1. Clone this repository.

   ```bash
   git clone https://github.com/chintan-diwakar/prompt-contribution-graph.git
   cd prompt-contribution-graph
   ```

2. Link the `prompttrail` command.

   ```bash
   npm link
   ```

3. Install the Claude Code hooks.

   ```bash
   prompttrail install
   ```

4. Start the local dashboard.

   ```bash
   prompttrail start
   ```

Prompt Contribution Graph opens `http://127.0.0.1:4317` in your browser. Submit a new Claude Code prompt to add the first entry.

## Commands

| Command | Result |
| --- | --- |
| `prompttrail install` | Adds the activity hooks to your user settings. |
| `prompttrail start` | Starts the dashboard and opens the browser. |
| `prompttrail start --no-open` | Starts the dashboard without browser launch. |
| `prompttrail start --port 8080` | Starts the dashboard on a different port. |
| `prompttrail status` | Displays the hook state, prompt count, and database path. |
| `prompttrail uninstall` | Removes only the Prompt Contribution Graph hooks. |

## How it works

Claude Code sends lifecycle events to the configured hooks. Prompt Contribution Graph writes each event to SQLite and returns immediately.

![Prompt Contribution Graph system design from Claude Code hooks to the local dashboard](docs/prompttrail-system-design.png)

[Open the editable Excalidraw source](docs/prompttrail-system-design.excalidraw).

The dashboard server accepts connections only from your device. A failed capture does not stop Claude Code from processing the prompt.

Prompt Contribution Graph records these fields:

- Prompt text
- Submission time
- Claude session ID
- Project name and path
- Claude transcript path
- Final response text and status
- Total response duration
- Tool name, status, and duration
- File path or another safe target for supported tools

## Data location

Prompt Contribution Graph uses the standard data directory for each operating system.

| Operating system | Default database path |
| --- | --- |
| Linux | `~/.local/share/prompttrail/prompts.sqlite` |
| macOS | `~/Library/Application Support/PromptTrail/prompts.sqlite` |
| Windows | `%APPDATA%\PromptTrail\prompts.sqlite` |

Set `PROMPTTRAIL_HOME` to use a different directory.

```bash
PROMPTTRAIL_HOME=/private/prompt-data prompttrail start
```

The project keeps the `prompttrail` command, environment variable, hook marker, application ID, and data paths for compatibility.

## Privacy

Prompts and responses can contain source code, credentials, customer data, or other private text. Review the content before you share the database.

Prompt Contribution Graph does not store tool output. It does not store Bash command text or complete tool input.

Shared activity screenshots contain only counts, streaks, the daily insight, and the contribution chart.

The installer updates `~/.claude/settings.json`. It writes the previous file to `settings.json.prompttrail.bak` before each change.

The uninstall command keeps the SQLite database. Delete the database file manually if you also want to delete all prompt history.

## Development

Run the automated tests.

```bash
npm test
```

Run the JavaScript syntax checks.

```bash
npm run check
```

Start the Electron application.

```bash
npm run desktop
```

Build the Linux packages.

```bash
npm run build:linux
```

Build the macOS package on a Mac.

```bash
npm run build:mac
```

Use a temporary database during development.

```bash
PROMPTTRAIL_HOME="$PWD/.prompttrail-data" npm start -- --no-open
```

## Planned work

- Add a Codex hook adapter and installer.
- [Migrate the desktop shell from Electron to Tauri](docs/TAURI_MIGRATION.md).
- Add optional prompt redaction rules.
- Add JSON and CSV export.
- Import existing Claude Code transcript files.
- Add labels and favorites.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you create a pull request.

## License

Prompt Contribution Graph uses the [MIT License](LICENSE).
