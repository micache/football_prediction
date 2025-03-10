from google import genai
from google.genai import types
import groq

class LLM_caller:

    def __init__(self):
        self.google = genai.Client(api_key="AIzaSyCJcLCuV5mIRU9mW74diBWTalsku_k6NmE")
        self.groq = groq.Client(api_key="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")

    def call_google(self, model_name: str, system_prompt: str, max_len, content: str, temperature):
        response = self.google.models.generate_content(
            model=model_name, 
            config=types.GenerateContentConfig(
                system_instruction=system_prompt,
                max_output_tokens=max_len,
                temperature=temperature
            ),
            contents=[content]
        )
        return response.text

    def call_groq(self, model_name: str, system_prompt: str, max_len, content: str, temperature):
        response = self.groq.chat.completions.create(
            model=model_name,  # Replace with the actual model name from Groq
            messages=[{
                "role": "system", "content": system_prompt},
                {"role": "user", "content": content}],
            temperature=temperature,
            max_tokens=max_len
        )
        return response.choices[0].message.content