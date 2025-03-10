from google import genai
from google.genai import types
from loguru import logger
from call_llms import LLM_caller

def get_match_context(data):
    """Formats the match context details."""
    return f"""
    ## **Match Context**
    - **Teams:** {data['home']} vs. {data['away']}
    - **Date:** {data['date']}
    - **League:** {data['league']}
    - **Season:** {data['season']}
    - **Starting lineup (in the format of {{player name : postition}}):** {data['lineup']}
    """

def get_team_statistics(key_insights):
    """Formats team statistics section."""
    return f"""
    ## **Team Statistics this season (Use This Data for Analysis)**
    {key_insights}
    
    ## **Explanation of Key Soccer Metrics:**
    - Expected Goals (xG): Measures the quality of goal-scoring chances based on factors like shot location, shot type, and build-up play. A higher xG indicates a team creates better scoring opportunities.
    - Non-Penalty Expected Goals (NPxG): Similar to xG but excludes penalties to give a clearer picture of a team's goal-scoring ability in open play.
    - Expected Goals Against (xGA): Estimates the number of goals a team is expected to concede based on the quality of chances they allow. A lower xGA suggests stronger defensive performance.
    - Non-Penalty Expected Goals Against (NPxGA): Like xGA but without penalty situations, providing a more accurate defensive assessment.
    - Non-Penalty Expected Goal Difference (NPxGD): The difference between NPxG and NPxGA, showing how well a team performs in open play. A positive value indicates better attacking than defensive performance.
    - Passes Per Defensive Action (PPDA): Measures pressing intensity by calculating how many passes an opponent completes before being disrupted. Lower PPDA means high pressing, which can disrupt opponent attacks.
    - Opponent PPDA (OPPDA): Evaluates how easily a team allows opponents to press them. A higher OPPDA suggests better ball retention and buildup under pressure.
    - Deep Completions (DC): Counts the number of passes completed within 20 yards of the opponent's goal. A higher value indicates strong attacking penetration.
    - Opponent Deep Completions (ODC): Measures how often an opponent completes passes near a team's goal. A lower value suggests stronger defensive organization.
    - Expected Points (xPTS): Predicts how many points a team should earn based on their overall performance, xG, and xGA. Helps assess whether a team is overperforming or underperforming.
    - Aerial Duels Won & Tackles Per Game: Indicates defensive robustness in duels and transitions.
    - Clean Sheet Probability: Based on past performances, estimate likelihood of a shutout.
    """

def generate_prompt_per_match(match_data):
    # Determine performance comparison between xG and actual goals
    h_sharpness = "higher" if float(match_data["h_goals"]) > float(match_data["h_xg"]) else "lower"
    a_sharpness = "higher" if float(match_data["a_goals"]) > float(match_data["a_xg"]) else "lower"

    # Determine shooting efficiency
    h_shot_efficiency = "higher" if int(match_data["h_shotOnTarget"]) / int(match_data["h_shot"]) > int(match_data["a_shotOnTarget"]) / int(match_data["a_shot"]) else "lower"
    a_shot_efficiency = "higher" if h_shot_efficiency == "lower" else "higher"

    # Pressing intensity (Lower PPDA = More aggressive pressing)
    pressing_advantage = "home" if float(match_data["h_ppda"]) < float(match_data["a_ppda"]) else "away"
    prompt = f"""
    The match took place on **{match_data['date']}**, in the **{match_data['league']}**, between **{match_data['team_h']} (home team)** and **{match_data['team_a']} (away team)**.
    The final score was **{match_data['h_goals']}-{match_data['a_goals']}** in favor of {'the home team' if match_data['h_goals'] > match_data['a_goals'] else 'the away team'}.
    ### **Match Performance Breakdown**
    - **Expected Goals (xG):** {match_data['h_xg']} for home vs. {match_data['a_xg']} for away
      - home's actual goals were **{h_sharpness}** than expected.
      - away's actual goals were **{a_sharpness}** than expected.
    - **Win Probabilities Before the Match:**  
      - home win: {float(match_data['h_w'])*100:.2f}%  
      - Draw: {float(match_data['h_d'])*100:.2f}%  
      - away win: {float(match_data['h_l'])*100:.2f}%  
    - **Shots and Efficiency:**  
      - home: {match_data['h_shot']} shots ({match_data['h_shotOnTarget']} on target)  
      - away: {match_data['a_shot']} shots ({match_data['a_shotOnTarget']} on target)  
      - home's shot efficiency was **{h_shot_efficiency}** than away.
    - **Attacking Penetration:**  
      - home had **{match_data['h_deep']}** deep entries  
      - away had **{match_data['a_deep']}** deep entries  
      - {"away" if int(match_data['a_deep']) > int(match_data['h_deep']) else "home"} dominated the attacking third.
    - **Pressing Intensity (PPDA):**  
      - home: {match_data['h_ppda']}  
      - away: {match_data['a_ppda']}  
      - {pressing_advantage} applied **more aggressive pressing** in this match.

    """

    return prompt.strip()

def generate_lineup_report_prompt(player_data, team: str = None):
    """
    Generates a structured, optimized prompt focusing on a single team’s performance or both teams.
    This uses prompt engineering techniques for LLaMA 3.3-70B to enhance analysis quality.
    
    :param player_data: Dictionary containing player performance data.
    :param team: "h" for home team, "a" for away team, or None to analyze both teams.
    :return: Optimized prompt for team performance analysis.
    """
    
    def filter_relevant_players(team_data):
        """
        Filters out players with minimal impact (played <30 mins and no key stats).
        """
        return [
            player for player in team_data.values()
            if int(player["time"]) >= 30 or any(float(player.get(stat, 0)) > 0 
                for stat in ["goals", "shots", "xG", "assists", "xA", "key_passes", "xGChain"])
        ]
    
    def generate_player_summary(players):
        """
        Creates a structured breakdown of player performances.
        """
        return [
            f"{player['player']} ({player['position']}): {player['time']}m | "
            f"Goals: {int(player['goals'])} | Shots: {int(player['shots'])} | xG: {float(player['xG']):.2f} | "
            f"Assists: {int(player['assists'])} | xA: {float(player['xA']):.2f} | Key Passes: {int(player['key_passes'])} | "
            f"xGChain: {float(player['xGChain']):.2f}"
            for player in players
        ]
    
    def extract_key_observations(players):
        """
        Generates insights on key contributors and impactful performances with rounded values.
        """
        key_contributors = sorted(players, key=lambda p: float(p.get("xG", 0)) + float(p.get("assists", 0)), reverse=True)
        
        comments = []
        if key_contributors:
            top_player = key_contributors[0]
            comments.append(
                f"{top_player['player']} had the most impact, with {int(top_player['goals'])} goal(s) and an xG of {float(top_player['xG']):.2f}. "
                f"Their ability to create chances ({int(top_player['key_passes'])} key passes) was crucial."
            )
        
        for player in key_contributors[1:4]:
            comments.append(
                f"{player['player']} played a strong role, contributing {int(player['assists'])} assist(s) and "
                f"creating {int(player['key_passes'])} key pass(es). Their xGChain value of {float(player['xGChain']):.2f} indicates "
                f"involvement in build-up play."
            )
        
        return comments
    
    teams_to_analyze = [team] if team else ["h", "a"]
    
    analysis_sections = []
    for t in teams_to_analyze:
        players = filter_relevant_players(player_data[t])
        player_analysis = generate_player_summary(players)
        observations = extract_key_observations(players)
        team_label = "Home Team" if t == "h" else "Away Team"
        
        analysis_sections.append(f"""
        #### **{team_label} Analysis**
        {chr(10).join(player_analysis) if player_analysis else "No significant contributions."}
        
        **Key Observations:**
        {' '.join(observations) if observations else "No standout performances to note."}
        """)
    
    prompt = f"""
    ### **TASK: Generate a structured performance analysis for the selected team(s).**

    Focus on **quantitative** insights and rank key contributors based on match impact.
    Highlight goal-scoring efficiency, creativity, and overall influence on the game.
    
    ### **Player Performance Breakdown**
    {chr(10).join(analysis_sections)}
    """.strip()
    
    return prompt

def generate_shot_event_prompt(match_data):
    def determine_shot_location(x, y):
        x, y = float(x), float(y)
        if x > 0.9:
            if y > 0.3 and y < 0.7:
                return "very close to goal, near the center"
            else:
                return "very close to goal, from a tight angle"
        elif x >= 0.84:
            return "inside the penalty area"
        elif x > 0.75:
            return "just outside the penalty area"
        else:
            return "far from goal"

    def format_shot_event(event):
        location_desc = determine_shot_location(event['X'], event['Y'])
        return (f"At minute {event['minute']}, {event['player']} took a {event['shotType']} shot in a {event['situation']} situation. "
                f"The shot was {event['result']} with an expected goal (xG) value of {event['xG']}. "
                f"The assist was provided by {event['player_assisted']}. The shot was taken {location_desc}.")
    
    prompt = f"""These are shot had been made by the home aganist the away: 
    """
    prompt += "\n".join(format_shot_event(event) for event in match_data['h'])

    prompt = f"""These are shot had been made by the away against the home:
    """
    prompt += "\n".join(format_shot_event(event) for event in match_data['a'])

    return prompt.strip()

def system_prompt_match_report():
    prompt = """
    ## **Role & Task**
    You are a **football data analyst**. Your task is to generate **structured, data-driven match summaries** based on statistics.  
    - **Focus on** team performance, xG vs. actual goals, tactical trends, and key player contributions.  
    - **Avoid assumptions, unnecessary details, and subjective opinions.**  
    ---
    ## **Key Insights to Cover**
    1. **Match Scenario** - Was it tense, open, defensive, or chaotic?  
    2. **xG vs. Actual Goals** - Who over/underperformed?  
    3. **Shooting & Attacking Efficiency** - Shot volume, accuracy, and conversion rates.  
    4. **Defensive & Pressing Analysis** - xGA, goalkeeper performance, PPDA.  
    5. **Key Player Performances** - Who made the biggest impact?  
    ---
    ## **Response Format**
    """
    return prompt.strip()

def generate_match_report(prompt):
    llm_client = LLM_caller()
    return llm_client.call_google(
        model_name="gemini-2.0-flash",
        system_prompt=system_prompt_match_report(),
        max_len=800,
        content=prompt,
        temperature=0.5
    )

def get_history_match_prompt(data):
    prompt = """"""

    for t in ["home", "away"]:
        prompt += f"""
        Analyze the nearest matches of {t} team and extract key insights to understand team performance:
        """
        for match_data in data['nearest_match'][t]:
            prompt += generate_match_report(
                generate_prompt_per_match(match_data['match_info']) + 
                generate_lineup_report_prompt(match_data['player_info'], 'h' if data[t]==match_data['match_info']['team_h'] else 'a') +
                generate_shot_event_prompt(match_data['shot_info']))

    prompt += f"""
    Analyze the nearest matches of home team as home and extract key insights to understand team performance:
    """
    for match_data in data['nearest_home_match']:
        prompt += generate_prompt_per_match(match_data['match_info'])
        prompt += generate_match_report(
                generate_prompt_per_match(match_data['match_info']) + 
                generate_lineup_report_prompt(match_data['player_info'], 'h') +
                generate_shot_event_prompt(match_data['shot_info']))

    prompt += f"""
    Analyze the matches in the past between home and away and extract key insights to understand team performance:
    """
    for match_data in data['past_match']:
        prompt += generate_match_report(
            generate_prompt_per_match(match_data['match_info']) + 
            generate_lineup_report_prompt(match_data['player_info']) + 
            generate_shot_event_prompt(match_data['shot_info']))

    prompt += """
### **Key Analytical Questions**
1. **How did actual goals compare to xG, and what does this reveal about team finishing efficiency or over/underperformance?**
2. **Did pressing intensity (PPDA) disrupt the opponent's build-up, and how did it translate into goal-scoring opportunities or defensive stability?**
3. **How effectively did each team convert deep entries into high-quality goal-scoring chances, and what tactical patterns emerged?**
4. **Which tactical elements from this match suggest future performance trends or strategic adaptations for both teams?**

### **Squad Data Analysis Instructions**
1. **Objective Performance Summary:** Base assessments strictly on data, avoiding subjective commentary.
2. **Impact Ranking:** Rank players by influence on the game, prioritizing metrics such as goals, assists, xG, key passes, and defensive contributions.
3. **Defensive Metrics Inclusion:** Evaluate xGA, goalkeeper performance, PPDA, and defensive duels to provide a balanced view.
4. **Finishing Efficiency:** Compare xG to actual goals to determine efficiency and potential areas of improvement.
5. **Clear Structuring:** Present findings in a structured, logical manner to enhance readability and clarity.

### **Shot Data Analysis Instructions**
1. **Performance Patterns:** Identify shot trends and their impact on overall team performance.
2. **Expected Goals (xG) Insights:** Assess xG values to measure shot quality and goal probability.
3. **Player Contributions:** Highlight key individuals in shot creation and execution.
4. **Match Context:** Explain how shot data correlates with the final result and overall tactical approach.
5. **Tactical Interpretation:** Determine if the shot distribution reflects specific strategies, such as counter-attacks or set-piece routines.
6. **Key Takeaways:** Summarize crucial insights that offer deeper understanding and predictive value for future matches.

Use this structured approach to extract critical insights into team performance, tactical effectiveness, and key areas for betting.
"""

    return prompt.strip()

def get_analysis_framework():
    return """
    ## **Step-by-Step Betting Analysis Framework**
    
    **Step 1: Comparative Team Evaluation**
    - Identify which team has **better attacking efficiency** (Goals, xG, Shot Conversion).
    - Compare **defensive strengths** (Goals Against, xGA, defensive rankings).
    - Assess **home vs. away performance differences**.
    - Analyze **lineup changes compared to past matches**, checking if key players (best/star players) are missing or returning.
    - Evaluate **team shape, midfield control, and stamina levels**, as these factors significantly affect match outcomes.
    
    **Step 2: Risk-Reward Betting Strategy**
    - Weigh **high-probability bets** vs. **high-value risk bets**.
    - Identify areas where **statistical trends indicate a betting edge**.
    - Consider how **lineup variations, fatigue, and midfield possession impact game control**.
    
    **Step 3: Betting Market Selection & Prioritization**
    - **Evaluate all of the following markets and shortlist viable options:**
      - **Match Result (1X2)**
      - **Over/Under Total Goals (1.5, 2.5, 3.5, 4.5)**
      - **Both Teams to Score (BTTS)**
      - **Asian Handicap**
      - **Total Yellow Cards (Over/Under), or Total Card 1X2 (which team has more cards)**
      - **Will a Red Card be shown? (Yes/No)**
      - **Total Corners (Over/Under), or Total Corners 1X2 (which team has more corners)**
      - **Total Fouls Committed**
      - **First Half vs. Second Half Predictions**
      - **Correct Score Betting: Predict possible final scores based on trends**
    
    **Step 4: Selection of Top Bets & Additional Predictions**
    - From the shortlisted markets, **select the 3 best bets** based on statistical confidence and value.
    - Provide **justifications** for each pick, considering defensive & offensive metrics.
    - Additionally, **list other potential betting opportunities**, such as:
      - **Likely correct scores**
      - **Alternative betting options that hold value**
      - **Situational bets (e.g., late-game goals, specific player performances)**
    """.strip()

def get_response_format():
    return """
    Provide a ranked list of the top three betting predictions based on data-driven insights. Each prediction should include:
    
    - **Bet Type**: Specify the type of bet.
    - **Prediction**: Clearly state the expected outcome.
    - **Justification**: Provide reasoning based on rankings, trends, and performance metrics.
    
    Additionally, summarize the key factors influencing these choices, considering aspects like team form, home vs. away performance, and statistical trends.
    """.strip()

def get_critical_requirements():
    """Lists out key instructions to ensure correct LLM response."""
    return """
    **Critical Requirements**
    - Do **not ignore any provided statistics**.
    - Do **not assume missing data**—infer logically from rankings and trends.
    - Prioritize **logical reasoning over raw probability calculations**.
    - Ensure recommendations are aligned with **team defensive strengths and tactical playstyles**.
    ## **Additional Considerations for Accuracy**
    - Do not be overly confident—account for **unpredictable factors** like injuries, fatigue, and team form fluctuations.
    - Compare **this match's lineup vs. previous matches** to detect critical changes in performance potential.
    - Assess **possession dominance in midfield**, as controlling the center often determines match flow.
    - Consider **stamina levels**, especially if one team has played multiple games in a short period.
    
    **Now generate a structured betting analysis using this format.**
    """

def extract_key_insights(team_stats):
    """Formats the structured stats into a readable format for the LLM."""

    def format_team_stats(team_data):
        """Formats a team's stats into readable text with rankings."""
        formatted_stats = []
        for stat, details in team_data.items():
            if stat in ['M']:
                continue
            formatted_stats.append(f"- {stat}: {details['value']} (Rank: {details['rank']}/20)")
        return "\n".join(formatted_stats)
    
    home_stats = format_team_stats(team_stats["home"])
    away_stats = format_team_stats(team_stats["away"])
    
    return f"### Home Team Stats:\n{home_stats}\n\n### Away Team Stats:\n{away_stats}"

def generate_prompt(data):
    """Generates an optimized prompt using structured team statistics."""
    
    # Preprocess the structured stats into readable format
    key_insights = extract_key_insights(data['all_league'])

    # Constructing the prompt from modular functions
    prompt = f"""
    Your task is to analyze the provided statistics and identify the **3 best betting opportunities** based on a structured risk-reward analysis.

    ---
    {get_match_context(data)}
    ---
    {get_team_statistics(key_insights)}
    ---
    {get_history_match_prompt(data)}
    ---
    {get_analysis_framework()}
    {get_critical_requirements()}
    ---
    {get_response_format()}
    """

    return prompt.strip()
