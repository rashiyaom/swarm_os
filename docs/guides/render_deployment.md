# Render deployment

One Docker web service runs the built frontend and CPU PPO service. ROS/Gazebo
and GPU training are separate. The gateway listens on `0.0.0.0:$PORT`, accepts
Render's exact `RENDER_EXTERNAL_HOSTNAME`, and forwards only the bounded PPO API
to the private loopback backend. Local Windows/Quick Tunnel behavior is preserved.

The supervisor waits for verified policy readiness before opening the gateway;
backend failure stops the container rather than serving a silently broken policy.
Health check: `/api/ppo/health`. One instance preserves in-memory mission sessions.
No database or persistent disk is required. Restarts/deployments reset missions.

## Selected budget

The requested budget is **up to $50 total for one day**, using existing credits
only. The Blueprint selects the legacy `pro` compute plan: **2 CPUs / 4 GB**, listed
at $85/month, approximately $2.83 per 24 hours of compute before extras. The paid
instance does not idle-sleep. This is a service compute plan, not a paid workspace
subscription. No service has been created as of this preparation.

**It does not automatically suspend after a day.** Suspend the service from the
Render dashboard after the demo; leaving it running continues billing. The supplied Billing screenshot confirms $50 of Hackathon Participant credits,
valid until 1 November 2027. No spending beyond those credits is authorized.

## Account prerequisites

The currently logged-in workspace is `My Workspace` (`tea-dbj03jon74is73e126m0`).
Render Blueprint validation returned `need_payment_info` for both paid sizes.
The public workspace API returns identity metadata, not a credit balance. The supplied Billing screenshot independently confirms the $50 credit balance;
the validation error is a separate account/API restriction.
No payment method has been added or extra charges authorized.

Render also reported `branch main could not be found` for the private repository.
Confirm Render's GitHub integration can access `rashiyaom/swarm-sar`; do not make
the repository public or put a GitHub token in the Dockerfile.

Once the account checks allow credit-only creation:

```bash
render blueprints validate render.yaml --output json
render services create --name swarmos --type web_service --repo https://github.com/rashiyaom/swarm-sar.git --branch main --runtime docker --plan pro --region singapore --num-instances 1 --auto-deploy=false --health-check-path /api/ppo/health --env-var PORT=10000 --env-var SWARM_BIND_HOST=0.0.0.0 --output json --confirm
```

If a service already exists, update it rather than creating a duplicate. The
actual URL is returned by Render; do not assume the desired subdomain is free.

## Validation completed

- Three gateway HTTP integration tests passed, including Render hostname,
  same-origin writes, rejected foreign origins/hosts and existing limits.
- Real supervisor startup on isolated local ports loaded the verified 753664-step
  checkpoint. Public-host-style requests passed health, mission creation,
  actual inference and session deletion.
- Node syntax checks passed. A local Docker engine is unavailable, so the Linux
  image build still needs validation on Render before claiming deployment success.
