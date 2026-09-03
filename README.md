<div align="center">
  <img src="build/icon.svg" width="128" alt="Prompt Contribution Graph logo">
  <h1>Prompt Contribution Graph</h1>
  <p><em>Track your daily prompt contributions across CLI coding agents.</em></p>

  <p>
    <a href="https://github.com/chintan-diwakar/prompt-contribution-graph/actions/workflows/desktop-builds.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/chintan-diwakar/prompt-contribution-graph/desktop-builds.yml?branch=main&amp;style=flat-square&amp;label=build"></a>
    <a href="https://github.com/chintan-diwakar/prompt-contribution-graph/releases"><img alt="Latest release" src="https://img.shields.io/github/v/release/chintan-diwakar/prompt-contribution-graph?style=flat-square"></a>
    <a href="LICENSE"><img alt="MIT license" src="https://img.shields.io/badge/license-MIT-24292f?style=flat-square"></a>
    <img alt="macOS and Ubuntu" src="https://img.shields.io/badge/platform-macOS%20%7C%20Ubuntu-24292f?style=flat-square">
    <img alt="Local first" src="https://img.shields.io/badge/data-local--first-d95725?style=flat-square">
  </p>

  <p><strong>GitHub tracks code commits. Prompt Contribution Graph tracks your contributions to coding agents.</strong></p>
  <p>Prompts, final responses, and safe tool metadata. Stored locally. No account. No telemetry.</p>
</div>

> [!NOTE]
> The current release supports Claude Code and Codex. Prompt Contribution Graph is an unofficial community project that is not affiliated with Anthropic or OpenAI.

![Prompt Contribution Graph dashboard with daily insight, streaks, prompt totals, and a contribution chart](docs/prompttrail-activity.png)

## Features

- Captures prompts and final responses through official Claude Code and Codex hooks.
- Records tool names, status, duration, and safe targets such as file paths.
- Stores activity and session details in a local SQLite database.
- Displays a 53-week contribution chart.
- Calculates the current streak, longest streak, and prompt totals.
- Displays one daily insight from your recent activity.
- Shares a dedicated aggregate activity image without exposing prompt or response content.
- Searches prompt and response text, then filters results by project.
- Deletes complete interactions from the dashboard.
- Preserves existing Claude Code and Codex hooks and settings.

## Requirements

- Node.js 22.5 or later
- Rust 1.77.2 or later for native builds
- Claude Code or Codex with hook support

## Desktop builds

The release workflow creates these desktop packages:

- An x86-64 `.deb` package for Ubuntu and Debian-based distributions.
- An x86-64 AppImage for other Linux distributions.
- One universal `.dmg` for Intel and Apple silicon Macs.

The Tauri desktop application installs its Claude Code and Codex hooks on the first packaged launch. It uses the same local database as the command-line dashboard and existing Electron releases. Codex requires a one-time review: run `/hooks` in Codex and trust the Prompt Contribution Graph hooks after installation.

The current macOS packages do not have an Apple signature. macOS displays a security warning until a release uses signing and notarization.

### Share activity

The **Share** button renders a dedicated image containing only counts, streaks, the daily insight, and the contribution graph. It sends that PNG to the native share sheet when file sharing is available. The desktop fallback saves the PNG in the `Prompt Contribution Graph` folder in Pictures and opens an X post window. Prompt text, responses, project names, and tool details are not included.

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

3. Install the Claude Code and Codex hooks.

   ```bash
   prompttrail install
   ```

4. Start the local dashboard.

   ```bash
   prompttrail start
   ```

Prompt Contribution Graph opens `http://127.0.0.1:4317` in your browser. If you use Codex, run `/hooks` once and trust the installed Prompt Contribution Graph hooks. Submit a new prompt in Claude Code or Codex to add the first entry.

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

Claude Code and Codex send lifecycle events to their configured hooks. Prompt Contribution Graph writes each event to SQLite and returns immediately. Codex discovers user hooks in `~/.codex/hooks.json`; see the [official Codex hooks documentation](https://learn.chatgpt.com/docs/hooks).

![Prompt Contribution Graph system design from coding-agent hooks to the local dashboard](docs/prompttrail-system-design.png)

[Open the editable Excalidraw source](docs/prompttrail-system-design.excalidraw).

The dashboard server accepts connections only from your device. A failed capture does not stop the coding agent from processing the prompt.

Prompt Contribution Graph records these fields:

- Prompt text
- Submission time
- Coding-agent name and session ID
- Project name and path
- Coding-agent transcript path
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

Shared activity images and text contain only counts, streaks, the daily insight, and the contribution chart.

The installer updates `~/.claude/settings.json` and `~/.codex/hooks.json`. It writes the previous file beside each one with a `.prompttrail.bak` suffix before each change. Existing unrelated hooks remain in place.

The uninstall command keeps the SQLite database. Delete the database file manually if you also want to delete all prompt history.

## Development

Run the automated tests.

```bash
npm test
```

Run JavaScript and Rust checks.

```bash
npm run check
```

Start the Tauri application.

```bash
npm run desktop
```

Build the Ubuntu `.deb` and Linux AppImage on an x86-64 Linux system.

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

- The Electron-to-Tauri desktop migration is complete for v0.2.0. See the [migration record](docs/TAURI_MIGRATION.md) and [release plan](docs/RELEASE_V0.2.0.md).
- Add optional prompt redaction rules.
- Add JSON and CSV export.
- Import existing Claude Code transcript files.
- Add labels and favorites.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before you create a pull request.

## Star history

[![Star History Chart](https://api.star-history.com/chart?repos=chintan-diwakar/prompt-contribution-graph&type=date&legend=top-left&sealed_token=-6z0yJ1Vfh-7yW0_FMBkPLjvaCKIBjfjvDiKq7XDowc0Qsg35FItGcZvD80FCziOTsqaY8ZTirTqib1I_5WXchMhIanshfbJpKMC4Au2oNa1ACk7qDNuJgGwRN9_d_-b6pRJRrOfMS8AJLip9OAkevRAmQXvxLZ3k0tP8jOS3xJ_IeA6w4M-I0mGcHZH)](https://www.star-history.com/?repos=chintan-diwakar%2Fprompt-contribution-graph&type=date&legend=top-left)

## License

Prompt Contribution Graph uses the [MIT License](LICENSE).
