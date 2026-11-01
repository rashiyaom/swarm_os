# Reference integration — 2026-11-01

Compared this workspace with the private repository
[`rashiyaom/swarm-sar`](https://github.com/rashiyaom/swarm-sar) at commit
`100a6c0313eefc7e88147f950d852e67a6c8316b` using a downloaded archive. Files were copied directly;
no Git history was imported. The reference contains no root license file or
GitHub license declaration. Existing notices and historical evidence were retained.

## Comparison and changes

Of 1,474 reference files, 1,230 already matched on disk, 220 were missing, and
24 differed. All 220 missing files now exist locally. Shared frontend integration
files were updated to connect the imported features. All local-only tracked files
were preserved, including `documents/`, `experiments copy/`, and local GNN evidence.

- Added rescue dossiers, HTML export, safe route overlays, and mission integration.
- Added explain mode, evidence galleries, observatory tours, and first-visit tutorials.
- Added GNN concept visualization, branding, and light/dark controls.
- Added Python packaging, documentation/media, public serving and Docker/Render files.
- Restored 18 expert dataset chunks and their manifest locally (about 127 MiB).

The existing ignore rules still exclude training data, runtime output, and build
output. The copied dataset and `training/runs/.gitkeep` therefore remain ignored.
The 654 generated fieldbook files already matched and were left untouched.
The JSON record lists every copied path and its SHA-256 checksum.

## Local adaptations

Five reference paths intentionally differ:

- `README.md` retains this workspace's instructions, corrects the backend setup,
  and documents the available features.
- `package.json` retains dev/build/test/preview commands and adds swarm/public commands.
- `.gitignore` retains output/data exclusions and adds local environments and caches.
- `render.yaml` points at `rashiyaom/swarm_os`; automatic deployment remains disabled.
- `frontend/tools/validate_layout_theme.py` skips onboarding for its dedicated layout
  checks and explicitly selects dark mode after navigation. Onboarding has a separate
  passing browser regression.

The existing `.venv` editable installation was corrected from the neighboring
`Desktop/swarm` checkout to this workspace using `pip install --no-deps
--no-build-isolation -e .`. No dependency upgrades were performed.

## Validation

- Frontend: 179 tests passed across 23 test files.
- Python: 208 passed, 3 skipped; ROS/xacro expansion requires a sourced ROS host.
- Public server: 3 tests passed.
- TypeScript and Vite production build passed.
- Chrome onboarding check passed at desktop/mobile sizes with no JavaScript errors.
- GNN browser check: 9 checks passed, including mission isolation and real packet export.
- Layout check: 8 viewport sizes; sampled dark-theme contrast passed across mission,
  fleet, activity, controls, layers, explain mode, audio, editor, survivor story,
  dossiers, GNN, and ROS connection controls. No JavaScript errors were reported.
- Final byte comparison found no missing reference files and only the five intended
  differences listed above.

Historical reports copied under `docs/` describe reference runs. They do not establish
new local GPU, ROS, Gazebo, or deployment results. Those runtime checks were not run.

The import was prepared on `integrate/reference-missing-features` without deploying.
Publication is split into two focused commits: documentation and the simulation
README in `71b1c27` under Purva Shah (`24CS094Purva`), followed by the remaining
frontend, packaging, serving, and deployment configuration under Yash Bharvada
(`Yash-Bharvada`). Ignored datasets, generated output, and local environments are
excluded from both commits. Deployment configuration is included without triggering
a deployment.

See [the machine-readable import record](reference-integration.json) for file inventory
and browser-check results.
