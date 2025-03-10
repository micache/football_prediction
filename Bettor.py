from InternalDataloader import InternalDataloader
from prompt import generate_prompt
from call_llms import LLM_caller
from loguru import logger
import asyncio

def sys_prompt():
    prompt = """You are a highly analytical sports bettor with access to expert insights, advanced statistical data, and betting probabilities.
                Your goal is to critically evaluate the provided betting opportunities, identify the most profitable and logical bet(s), and determine how much money to stake based on risk management principles."""
    return prompt.strip()

class Bettor:

    LIM = 5

    def __init__(self):
        """Initialize the Bettor class with an LLM API key."""
        self.llm_client = LLM_caller()

    async def get_team_stats(self, home, away, date, season, league):
        """Fetch team statistics asynchronously from InternalDataloader."""
        in_dataloader = InternalDataloader(year=season, league=league)
        return await in_dataloader.get_all_data(team=[home, away], date=date, lim=self.LIM)

    async def analyze_bet(self, home, away, date, season, league):
        """Fetch team data, generate prompt, and get LLM analysis."""
        
        # Fetch team statistics
        team_stats = await self.get_team_stats(home, away, date, season, league)
        team_stats['home'] = home
        team_stats['away'] = away
        team_stats['league'] = league
        team_stats['season'] = season
        team_stats['date'] = date

        #print(team_stats['nearest_match'])

        # Generate the structured betting prompt
        prompt = generate_prompt(team_stats)
        #print(prompt)
        logger.info("gen prompt completed")

        return self.llm_client.call_google(
            model_name="gemini-2.0-flash-thinking-exp-01-21",
            system_prompt=sys_prompt(),
            max_len=None,
            content=prompt,
            temperature=0.5
        )

# Example usage
if __name__ == "__main__":
    import asyncio

    bettor = Bettor()

    # Define match details
    home = "Arsenal"
    away = "West Ham"
    date = "2025-02-22"
    season = "2024"
    league = "EPL"

    # Run the bet analysis
    betting_analysis = asyncio.run(bettor.analyze_bet(home, away, date, season, league))
    
    # Print LLM's betting suggestion
    print(betting_analysis)
