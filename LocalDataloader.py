import pandas as pd
import requests
from bs4 import BeautifulSoup
import os
from urllib.parse import urljoin

def scarpe_data(base_url, LIM=9999999):
    # Send a GET request
    response = requests.get(base_url)
    soup = BeautifulSoup(response.text, "html.parser")

    # Find all CSV file links
    csv_links = [a["href"] for a in soup.find_all("a", href=True) if a["href"].endswith(".csv")]

    # Directory to save CSV files
    save_dir = "data"
    os.makedirs(save_dir, exist_ok=True)

    # Download and save each CSV file
    cnt = 0
    for link in csv_links:
        if cnt >= LIM:
            break

        cnt += 1
        csv_url = urljoin(base_url, link)  # Ensure full URL construction
        file_name = "_".join(link.split("/")[-2:]) if "/" in link else link  # Format filename as "9394_E0.csv"
        save_path = os.path.join(save_dir, file_name)

        # Download CSV file
        csv_response = requests.get(csv_url)
        
        # Check if the response is actually a CSV file
        if "text/csv" in csv_response.headers.get("Content-Type", ""):
            with open(save_path, "wb") as file:
                file.write(csv_response.content)
            print(f"Saved: {file_name}")
        else:
            print(f"Failed to download valid CSV: {csv_url}")


class LocalDataloader:
    _instance = None
    
    def __new__(cls, season, league):
        if cls._instance is None:
            cls._instance = super(LocalDataloader, cls).__new__(cls)
            scarpe_data("https://www.football-data.co.uk/englandm.php", LIM=5)
            start_year = int(season[-2:])
            end_year = start_year + 1   
            file_path = f"./data/{start_year:02}{end_year:02}_{league}"
            cls._instance.df = pd.read_csv(file_path)
            cls._instance.df['Date'] = pd.to_datetime(cls._instance.df['Date'], errors='coerce')
        return cls._instance
    
    def find_match(self, date, home_team, away_team):
        date = pd.to_datetime(date, errors='coerce')
        match = self.df[(self.df['Date'] == date) & (self.df['HomeTeam'] == home_team) & (self.df['AwayTeam'] == away_team)]
        return match if not match.empty else "No match found."