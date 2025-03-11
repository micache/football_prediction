import asyncio
import json
import aiohttp
import pandas as pd

from datetime import datetime, timedelta
from understat import Understat
from understatapi import UnderstatClient
from loguru import logger

class InternalDataloader:

    def __init__(self, year, league):
        self.season = year
        self.league = league
        self.understat = UnderstatClient()
        self.

    async def get_league_table(self, start_date=None, end_date=None):
        async with aiohttp.ClientSession() as session:
            understat = Understat(session)
            return await understat.get_league_table(self.league, self.season, start_date=start_date, end_date=end_date)

    async def get_team_players(self, team, start_date, end_date):
        async with aiohttp.ClientSession() as session:
            understat = Understat(session)
            return await understat.get_team_players(team, self.season, options={"end_date": end_date})

    async def get_match_player(self, match_id):
        async with aiohttp.ClientSession() as session:
            understat = Understat(session)
            return await understat.get_match_players(match_id)

    def get_team_all_stats(self, team, df):
        team_stats = {}
        for column in df.columns[1:]:  # Skip "Team" column
            df_sorted = df.sort_values(by=column, ascending=False).reset_index(drop=True)
            team_value = df.loc[df['Team'] == team, column].values[0]
            team_rank = df_sorted[df_sorted['Team'] == team].index[0] + 1
            team_stats[column] = {'value': team_value, 'rank': team_rank}
        
        return team_stats
    
    async def get_lineup(self, match_id):
        raw_lineup = await self.get_match_player(match_id)
        extracted_lineup = {'home': [], 'away': []}

        for team_key, team_label in [('h', 'home'), ('a', 'away')]:
            for player in raw_lineup.get(team_key, {}).values():
                extracted_lineup[team_label].append({player['player']: player['position']})
        
        return extracted_lineup

    async def get_team_data(self, home, away, start_date=None, end_date=None):
        end_date = datetime.strptime(end_date, "%Y-%m-%d").date()  # Convert string to date
        end_date -= timedelta(days=1)
        table = await self.get_league_table(start_date=start_date, end_date=end_date.strftime("%Y-%m-%d"))
        df = pd.DataFrame(table[1:], columns=table[0])
        home_stats = self.get_team_all_stats(home, df)
        away_stats = self.get_team_all_stats(away, df)
        return  {
                    'home': home_stats,
                    'away': away_stats
                }
    
    def get_more_match_info(self, cur_data):


    async def get_all_data(self, team, date, lim, lineup=None):
        data = {}
        data["all_league"] = await self.get_team_data(team[0], team[1], end_date=date)
        logger.info("finish get team data in the season")

        h_matches = self.understat.team(team=team[0]).get_match_data(season=self.season)
        if lineup is None:
            for match in reversed(h_matches):
                if match['datetime'][:10] == date and match['h']['title']==team[0] and match['a']['title']==team[1]:           
                    data["lineup"] = await self.get_lineup(match['id'])
                    logger.info("finish get lineup data")
                    break

        data["nearest_match"] = {}
        for i, t in enumerate(["home", "away"]):
            matches = self.understat.team(team=team[i]).get_match_data(season=self.season)
            cnt = 0
            data["nearest_match"][t] = []
            for match in reversed(matches):
                match_date = match['datetime'][:10]
                if match_date >= date or cnt >= lim:
                    continue
                data["nearest_match"][t].append({
                        'match_info': self.get_more_match_info(self.understat.match(match["id"]).get_match_info()),
                        'player_info': self.understat.match(match["id"]).get_roster_data(),
                        'shot_info': self.understat.match(match["id"]).get_shot_data()
                    })
                cnt += 1
                
        logger.info("finish get nearest match")

        matches = h_matches
        data["nearest_home_match"] = []
        cnt = 0
        for match in reversed(matches):
            match_date = match['datetime'][:10]
            if match_date >= date or cnt >= lim or match['h']['title'] != team[0]:
                continue     
            data["nearest_home_match"].append({
                    'match_info': self.understat.match(match["id"]).get_match_info(),
                    'player_info': self.understat.match(match["id"]).get_roster_data(),
                    'shot_info': self.understat.match(match["id"]).get_shot_data()
                })
            cnt += 1
        logger.info("finish get nearest home match")

        data["past_match"] = []
        cnt = 0
        for match in reversed(matches):
            match_date = match['datetime'][:10]
            if match_date >= date or cnt >= lim or not (match['h']['title'] in team and match['a']['title'] in team):
                continue
            data["past_match"].append({
                    'match_info': self.understat.match(match["id"]).get_match_info(),
                    'player_info': self.understat.match(match["id"]).get_roster_data(),
                    'shot_info': self.understat.match(match["id"]).get_shot_data()
                })
            cnt += 1
        logger.info("finish get past match")

        return data

if __name__ == "__main__":
    
    async def main():
        test = InternalDataloader(year="2024", league="EPL")
        home = "Tottenham"
        away = "Manchester City"
        date = "2025-02-26"
        stats = await test.get_all_data(team=[home, away], date=date, lim=3)
        print(stats)

    loop = asyncio.get_event_loop()
    loop.run_until_complete(main())
