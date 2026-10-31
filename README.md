# Swarm Mission Control

React, TypeScript and Three.js frontend with a standalone browser swarm simulator.
The source, simulation engine, tests, dependency lockfile and Vite server configuration
are in `frontend/`.

## Run locally

Install Node.js 18 or newer, then run from the repository root:

```sh
npm ci --prefix frontend
npm run dev
```

Open the local URL printed by Vite (normally http://localhost:5173).
The default heuristic simulator runs in the browser without a Python server.

```sh
npm test          # Simulation and frontend tests
npm run build    # Type-check and generate frontend/dist
npm run preview  # Serve the built app locally
```

Dependencies, build output and TypeScript caches stay ignored by Git.
Edit `frontend/src/` and rebuild to update the app.

## Optional services

- **PPO:** Vite forwards `/api/ppo` to `http://127.0.0.1:8765` during development.
  The Python simulation and learning source is in `simulation/src/swarm_sar`.
  The Python service (`backend/ppo_service.py`), dependency installation manifest
  and compatible trained checkpoint are not included in this checkout.
  PPO missions require restoring those original artifacts; the browser does not
  substitute heuristic actions for a missing policy.
- **ROS:** Connecting to robots requires an external rosbridge WebSocket server,
  normally on port 9090. Browser simulation does not require ROS.

Vite's production preview server does not provide the development API proxy.
A production deployment using PPO must route `/api/ppo` to that service separately.

See [frontend instructions](frontend/README.md) for controls and simulation details.

## Ubuntu simulation continuation

Simulation runs are carried out on a CHARUSAT PC with GPU access, connected
remotely through AnyDesk. Ubuntu, ROS 2 and Gazebo execute on that PC;
AnyDesk provides remote desktop access to the simulation workstation.

`simulation/ros2_ws/` contains the ROS 2/Gazebo workspace.
`simulation/src/swarm_sar/` adds the Python simulation, decentralized controllers,
peer networking, sensing, mapping and learning modules. `simulation/scripts/`
contains simulation runners, benchmarks, validation tools and ROS 2 runtime probes.

This repository records the workstation setup reported by the project team.
Local source checks do not establish GPU performance or a successful remote
ROS 2/Gazebo run; retain runtime probe output and benchmark reports with each run.
