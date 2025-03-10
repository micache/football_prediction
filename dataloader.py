import os
import re
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

class FootballDataDownloader:
    def __init__(self, base_url, league_prefix="E", output_dir="data"):
        self.base_url = base_url
        self.league_prefix = league_prefix
        self.output_dir = output_dir
        os.makedirs(self.output_dir, exist_ok=True)

    def fetch_html(self):
        response = requests.get(self.base_url)
        response.raise_for_status()
        return response.text

    def extract_csv_links(self, html_content):
        soup = BeautifulSoup(html_content, "html.parser")
        return [a["href"] for a in soup.find_all("a", href=True) if a["href"].endswith(".csv")]

    def extract_season_from_link(self, link):
        match = re.search(r'mmz4281/(\d{4})/(' + self.league_prefix + r'\d+|EC)', link)
        if match:
            return match.groups()
        return None, None

    def download_files(self, csv_links):
        for link in csv_links:
            csv_url = urljoin(self.base_url, link)
            season_year, league_code = self.extract_season_from_link(link)
            
            if season_year and league_code:
                file_name = f"{season_year}_{league_code}.csv"
            else:
                file_name = os.path.basename(link)  # Fallback
            
            file_path = os.path.join(self.output_dir, file_name)
            try:
                response = requests.get(csv_url, stream=True)
                response.raise_for_status()
                
                with open(file_path, "wb") as file:
                    for chunk in response.iter_content(1024):
                        file.write(chunk)
                
                print(f"Downloaded: {file_path}")
            except requests.exceptions.RequestException as e:
                print(f"Failed to download {csv_url}: {e}")

    def run(self):
        html_content = self.fetch_html()
        csv_links = self.extract_csv_links(html_content)
        if not csv_links:
            print("No CSV links found on the page.")
            return
        self.download_files(csv_links)

if __name__ == "__main__":
    website_url = "https://www.football-data.co.uk/englandm.php"  # Change as needed
    league_prefix = "E"  # Allow customization
    downloader = FootballDataDownloader(website_url, league_prefix)
    downloader.run()
