FROM python:3.11-slim

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:0.11.6 /uv /uvx /bin/

COPY pyproject.toml uv.lock ./
RUN uv pip install --system --no-cache -r pyproject.toml
COPY src/ ./src/
RUN uv pip install --system --no-cache .
RUN uv lock

ENV DEV_MODE=true \
    DEV_USER_ID=dev-user-001 \
    DEV_USER_EMAIL=dev@example.com \
    DEV_USER_NAME=開発ユーザー \
    PORTAL_CATALOG=portal \
    AWS_REGION=ap-northeast-1 \
    AWS_SES_SENDER=noreply@portal.example.com \
    S3_VIDEO_BUCKET=portal-vehicle-videos

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
