FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV PIP_NO_CACHE_DIR=1
ENV HF_HUB_DISABLE_TELEMETRY=1

RUN sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list.d/debian.sources 2>/dev/null; \
    sed -i 's|deb.debian.org|mirrors.aliyun.com|g' /etc/apt/sources.list 2>/dev/null; \
    apt-get update \
    && apt-get install -y --no-install-recommends libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --upgrade pip -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com \
    && pip install --retries 10 --timeout 120 -r requirements.txt \
       -i https://mirrors.aliyun.com/pypi/simple/ --trusted-host mirrors.aliyun.com \
    && pip uninstall -y hf-xet || true

COPY app ./app

EXPOSE 8001

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
