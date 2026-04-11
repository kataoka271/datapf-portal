FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

ENV DEV_MODE=true \
    DEV_USER_ID=dev-user-001 \
    DEV_USER_EMAIL=dev@example.com \
    DEV_USER_NAME=開発ユーザー \
    PORTAL_CATALOG=portal \
    AWS_REGION=ap-northeast-1 \
    AWS_SES_SENDER=noreply@portal.example.com \
    S3_VIDEO_BUCKET=portal-vehicle-videos

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
