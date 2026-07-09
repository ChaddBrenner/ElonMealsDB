FROM python:3.12-slim-bookworm AS runtime

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV HOME=/home/elon

WORKDIR /app
RUN apt-get update \
  && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends tzdata \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 elon \
  && useradd --system --uid 10001 --gid elon --home-dir /home/elon --create-home --shell /usr/sbin/nologin elon \
  && chown -R elon:elon /home/elon

COPY requirements.txt .
RUN pip install --no-cache-dir --root-user-action=ignore -r requirements.txt

COPY elon_scraper ./elon_scraper

USER elon
CMD ["python", "-m", "elon_scraper.cli", "import-db", "--days-ahead", "1"]
