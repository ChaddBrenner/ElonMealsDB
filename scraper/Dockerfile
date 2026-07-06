FROM python:3.13.2-alpine3.21 AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app
RUN apk add --no-cache tzdata \
  && addgroup -S -g 10001 elon \
  && adduser -S -D -H -u 10001 -G elon elon

COPY requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

COPY elon_scraper ./elon_scraper

USER elon
CMD ["python", "-m", "elon_scraper.cli", "import-db", "--days-ahead", "1"]
