# Contributing

Sightline is a personal project, built with Claude Code to a design doc and a phased plan. It's public so that anyone can read the code and play the build. It isn't looking for contributors.

- **Bug reports are welcome,** best with a recording (below). So are questions, as issues.
- **Please ask in an issue before writing code.** The work runs as planned labs, each on its own branch, and an outside change would likely collide with one. A pull request that arrives without an issue may be closed.

## Reporting a bug

The simulation is deterministic, so a recording of a run reproduces exactly what you saw. That makes it the best bug report there is.

1. **Save the run.** When something goes wrong, press M to mark the moment, then Esc, then **Save recording**. If the game stops with an error, its message offers the same. The development build also keeps every run in `playtests/`.
2. **Open an issue.** Say what you did, what you expected and what happened, and give your browser and operating system. Zip the `.slrec` file and attach it, since GitHub doesn't accept the extension as it is.

With the recording, two commands find the cause:
- `npm run sim -- --replay <file>` re-simulates the run in this build, and says where it diverges or why it can't.
- `npm run bisect -- --recording <file>` compares this build with the one that made the recording, whose commit the recording carries. It reports where they part ways: the first tick, the first system in it, and the state paths that system left different.

## Reading the code

- [README.md](README.md) has the layout, the commands and the determinism rules in brief.
- [CLAUDE.md](CLAUDE.md) has every rule a change must keep, and how each is checked.
- [docs/foundation-shape.md](docs/foundation-shape.md) explains the kernel, the lanes and the game.
- [docs/decisions.md](docs/decisions.md) gives the reasoning behind each change.

Anything you contribute is under the [MIT License](LICENSE), like the rest of the repository.
