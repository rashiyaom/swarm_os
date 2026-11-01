# Public Windows demo

The public gateway serves only `frontend/dist`, with a same-origin PPO proxy to
127.0.0.1:8765. It does not expose the repository, Vite, Python port, or ROS bridge.
The original local backend checks remain unchanged. The proxy allows localhost,
Quick Tunnel hostnames, or the exact hostname in `SWARM_PUBLIC_HOST` for a named tunnel.
API requests are capped at 16 KB, 40 per second globally, and eight in flight.
The backend retains its four-mission cap and 30-minute idle expiry. Visitors can
use browser-only missions when all PPO slots are occupied. This is a small demo,
not a multi-classroom service. There is no visitor login; mission IDs are bearer
capabilities, and anyone with the URL can consume the shared demo capacity.

In Windows CMD, leave `npm.cmd run swarm` running in its existing terminal.
In another CMD window:

```cmd
cd /d C:\Users\Administrator\projects\swarm-sar
git pull --ff-only origin main
npm.cmd --prefix frontend ci
npm.cmd --prefix frontend run build
npm.cmd run test:public
npm.cmd run public
```

Check http://localhost:3000/ and http://localhost:3000/api/ppo/health.
Install the connector in another CMD window:

```cmd
winget install --id Cloudflare.cloudflared -e
```

Reopen CMD so PATH includes the installation, then run:

```cmd
cloudflared tunnel --url http://127.0.0.1:3000
```

Share the HTTPS `trycloudflare.com` address printed by cloudflared. Verify it
from a phone using mobile data: frontend, Explain, observatory and a PPO mission.
Only port 3000 should be tunneled. The PC must remain awake, connected and running
the backend, gateway and connector. This does not automatically start on reboot.
Ctrl+C in the connector window withdraws the link. Quick Tunnel addresses change
on restart and have no uptime guarantee; a stable address needs a named tunnel
and a domain. See https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/.

ROS/SLAM is not installed or published by these commands. Remote browsers cannot
reach the host's rosbridge through their own `localhost`; do not publish raw port
9090. The GNN concept remains an explicitly labeled teaching illustration.
The audiobook remains separately available at https://swarmsar.vercel.app.
