FROM apify/actor-python:3.11

# Install Playwright browsers only if using PlaywrightCrawler later
# RUN pip install playwright && playwright install --with-deps chromium

COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY . ./

# Do not copy venv
CMD ["python", "main.py"]
