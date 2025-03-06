import os
import dotenv
import requests
import uuid
from flask import url_for
from libs.narakeet_api import AudioAPI

dotenv.load_dotenv()

class Text2Speech:
    def __init__(self):
        self.api_key = os.environ['NARAKEET_API_KEY']
        self.api = AudioAPI(self.api_key)
        self.voice_map = {
            'english': 'vidya',
            'punjabi': 'navneet', 
            'hindi': 'madhuri',
            'telugu': 'lalita',
            'tamil': 'aparna'
        }
        self.audio_folder = 'audios'
        
        # Create the audios folder if it doesn't exist
        if not os.path.exists(self.audio_folder):
            os.makedirs(self.audio_folder)

    def generate_speech(self, text, language):
        """
        Convert text to speech using Narakeet API and save locally
        
        Args:
            text (str): Text to convert to speech
            language (str): Language of the text (english/punjabi/hindi/telugu/tamil)
        
        Returns:
            str: Local path of the saved audio file
        """
        try:
            # Get voice based on language
            language = language.lower()
            if language not in self.voice_map:
                raise ValueError(f"Unsupported language. Supported languages are: {', '.join(self.voice_map.keys())}")
            
            voice = self.voice_map[language]

            # Request audio generation task
            task = self.api.request_audio_task('mp3', text, voice)
            
            # Poll until task completes
            task_result = self.api.poll_until_finished(task['statusUrl'])

            if task_result['succeeded']:
                # Download the audio file
                audio_response = requests.get(task_result['result'])
                
                # Generate unique filename
                filename = f"{str(uuid.uuid4())}.mp3"
                file_path = os.path.join(self.audio_folder, filename)
                
                # Save the audio file locally
                with open(file_path, 'wb') as f:
                    f.write(audio_response.content)
                
                # Return URL for the audio file
                return file_path
            else:
                raise Exception(task_result['message'])
                
        except Exception as e:
            print(f"Error generating speech: {str(e)}")
            raise
