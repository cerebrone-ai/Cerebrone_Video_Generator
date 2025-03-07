import os
import dotenv
import uuid
import httpx
import asyncio
import fal_client

dotenv.load_dotenv()

class Text2Speech:
    def __init__(self):
        self.voice_map = {
            'english': 'vidya',
        }
        self.audio_folder = 'audios'
        
        if not os.path.exists(self.audio_folder):
            os.makedirs(self.audio_folder)

    async def generate_speech(self, text, language):
        try:
            handler = await fal_client.submit_async(
                "fal-ai/playai/tts/v3",
                arguments={
                    "input": text,
                    "voice": "Jennifer (English (US)/American)"
                })
            request_id = handler.request_id
            result = fal_client.result("fal-ai/playai/tts/v3", request_id)
            audio_url = result.get("audio").get("url")
            
            async with httpx.AsyncClient() as client:
                response = await client.get(audio_url)
  
            filename = f"{str(uuid.uuid4())}.mp3"
            file_path = os.path.join(self.audio_folder, filename)
            
            with open(file_path, 'wb') as f:
                f.write(response.content)
            
            return file_path
        except Exception as e:
            print(f"Error generating speech: {str(e)}")
            raise
    
    def make_speech(self,text,language):
        result = asyncio.run(self.generate_speech(text,language))
        return result
