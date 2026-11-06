# sg-care-capacity API. Build from the api/ folder:
#   docker build -t sg-health-api api
#   docker run --rm -p 8000:8000 -e CORS_ALLOW_ORIGINS=http://localhost:3000 sg-health-api
# On start it downloads the release named by DATA_SNAPSHOT (default: latest; about 3 MB, which took
# 74 s on a home connection), verifies every file
# against manifest.json and exits if anything doesn't match. Mount a volume on SNAPSHOT_CACHE_DIR
# to keep the download between restarts.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app
COPY pyproject.toml ./
COPY sg_health_api ./sg_health_api
RUN pip install . && useradd --create-home --uid 10001 api

USER api
ENV PORT=8000 \
    SNAPSHOT_CACHE_DIR=/home/api/snapshots
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=180s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.environ.get('PORT', '8000') + '/api/v1/health', timeout=4)"

CMD ["sh", "-c", "exec uvicorn --factory sg_health_api.main:create_app --host 0.0.0.0 --port \"$PORT\" --proxy-headers"]
