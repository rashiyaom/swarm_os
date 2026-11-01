FROM node:22-bookworm-slim AS frontend
WORKDIR /app
COPY frontend/package*.json frontend/
RUN npm --prefix frontend ci
COPY frontend/ frontend/
COPY docs/media/ docs/media/
COPY models/ppo_754k/*.json models/ppo_754k/
RUN npm --prefix frontend run build

FROM python:3.12-slim-bookworm
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 SDL_VIDEODRIVER=dummy MPLBACKEND=Agg SWARM_BIND_HOST=0.0.0.0 PORT=10000
RUN apt-get update && apt-get install -y --no-install-recommends libgomp1 libstdc++6 && rm -rf /var/lib/apt/lists/*
COPY --from=frontend /usr/local/bin/node /usr/local/bin/node
COPY pyproject.toml README.md ./
COPY simulation/src/ simulation/src/
# Editable install preserves the source-relative config paths used by the checkpoint.
RUN python -m pip install --upgrade pip && python -m pip install torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu && python -m pip install -e .
COPY backend/ backend/
COPY configs/ configs/
COPY training/configs/ training/configs/
COPY models/ppo_754k/ models/ppo_754k/
COPY scripts/public-server.mjs scripts/cloud-start.mjs scripts/
COPY --from=frontend /app/frontend/dist/ frontend/dist/
RUN python -c "from backend.ppo_service import prepare_checkpoint, DEFAULT_CHECKPOINT; prepare_checkpoint(DEFAULT_CHECKPOINT)"
EXPOSE 10000
CMD ["node", "scripts/cloud-start.mjs"]
