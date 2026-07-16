FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app_anilist.py .

ENV SKIP_BROWSER_OPEN=1
EXPOSE 3000

CMD ["python", "app_anilist.py"]
