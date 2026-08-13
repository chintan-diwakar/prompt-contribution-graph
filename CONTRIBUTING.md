# Contributing to Prompt Contribution Graph

Thank you for contributing to Prompt Contribution Graph. This project welcomes focused fixes, documentation, tests, and features.

Prompt Contribution Graph is local-first. Privacy and compatibility are requirements for every contribution.

## Before you start

1. Search the existing issues and pull requests.
2. For a large feature or data-model change, open an issue before you write code.
3. For a small fix or documentation change, you can create a pull request directly.

Do not put private prompts, responses, credentials, tokens, or customer data in an issue or pull request.

## Prepare the repository

1. Fork the repository.
2. Clone your fork.

   ```bash
   git clone https://github.com/YOUR-USER/prompt-contribution-graph.git
   cd prompt-contribution-graph
   ```

3. Install the dependencies.

   ```bash
   npm ci
   ```

4. Create a focused branch from `main`.

   ```bash
   git switch -c feat/short-description
   ```

5. Use a temporary database during development.

   ```bash
   PROMPTTRAIL_HOME="$PWD/.prompttrail-data" npm start -- --no-open
   ```

## Obey the project rules

- Keep activity data on the local device.
- Do not add analytics, telemetry, advertisements, or remote synchronization by default.
- Do not store tool output, complete tool input, or Bash command text.
- Preserve existing hooks and unrelated user settings.
- Make database migrations preserve existing data.
- Keep the activity screen compact and separate from prompt history.
- Add accessible names to interactive controls.
- Respect reduced-motion and reduced-transparency preferences.
- Do not add private user data to fixtures, logs, or screenshots.

## Run the checks

Run these commands before you create a pull request.

```bash
npm run check
npm test
```

If you change the desktop integration or Linux packaging, run the Linux build.

```bash
npm run build:linux
```

If you change the macOS integration or packaging, run the macOS build on a Mac.

```bash
npm run build:mac
```

GitHub Actions runs the core checks and all desktop builds for each pull request.

## Write focused commits

Keep each commit limited to one related change. Use a short prefix that identifies the change type.

```text
feat: add a user feature
fix: correct a defect
docs: update documentation
test: add or update tests
chore: update project maintenance
```

## Create the pull request

1. Use a clear title.
2. Explain the problem and the new behavior.
3. List the commands that you ran.
4. If the user interface changes, add before-and-after screenshots.
5. If behavior or installation changes, update the documentation.
6. Describe all changes to privacy, storage, hooks, or network access.
7. Resolve every review conversation.

The `main` branch is protected. All changes must enter through a pull request and pass the required checks.

## License

When you contribute, you agree that the project can publish your contribution under the [MIT License](LICENSE).
