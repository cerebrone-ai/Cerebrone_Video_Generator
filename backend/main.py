# Standard library imports
import os
import json
import logging
import threading
import asyncio
import uuid
import time
from datetime import datetime
from contextlib import contextmanager
from typing import Dict, List, Annotated, Sequence, TypedDict, Optional
from enum import Enum

# Third-party imports
from dotenv import load_dotenv
from flask import Flask, make_response, request, jsonify
from flask_cors import CORS
from flask_pydantic import validate
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import Column, Integer, String, DateTime, Boolean, JSON, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, OperationalError
from pydantic import BaseModel, Field
from langchain_core.messages import BaseMessage, HumanMessage
from flask import send_from_directory
from langchain_openai import ChatOpenAI
from langgraph.graph import Graph, StateGraph
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
import fal_client

# Local imports
from utils.text2speech import Text2Speech
from deep_research.src.deep_research.main import DeepResearchFlow


load_dotenv()


OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
FAL_API_KEY = os.getenv('FAL_API_KEY')

llm = ChatOpenAI(model="gpt-4", api_key=OPENAI_API_KEY)
fal_client.api_key = FAL_API_KEY

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Create custom logger for our application
logger = logging.getLogger('video_generator')
logger.setLevel(logging.INFO)

# Create formatters
default_formatter = logging.Formatter(
    '%(asctime)s - %(levelname)s - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
task_formatter = logging.Formatter(
    '%(asctime)s - %(levelname)s - [%(task_id)s] - %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)

# Add task ID filter
class TaskFilter(logging.Filter):
    def filter(self, record):
        if not hasattr(record, 'task_id'):
            record.task_id = 'NO_TASK_ID'
        return True

# Console handler with task ID
console_handler = logging.StreamHandler()
console_handler.setFormatter(task_formatter)
console_handler.addFilter(TaskFilter())

# Remove existing handlers
logger.handlers = []

# Add handlers to logger
logger.addHandler(console_handler)

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=True)

app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///./dev.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False


class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)
db.init_app(app)


# Task tracking
active_tasks = {}

# Initialize Text2Speech
text2speech = Text2Speech()

# Add VideoStyle enum after imports
class VideoStyle(str, Enum):
    REALISTIC = "realistic"
    CARTOONISH = "cartoonish"
    ANIME = "anime"
    DOODLE = "doodle"
    WATERCOLOR = "watercolor"
    PIXEL_ART = "pixel_art"
    OIL_PAINTING = "oil_painting"
    COMIC_BOOK = "comic_book"

# API Models
class VideoGenerationRequest(BaseModel):
    project_title: str = Field(..., description="Title of the video project")
    project_description: str = Field(..., description="Detailed description of the video")
    target_audience: str = Field(..., description="Target audience for the video")
    duration: int = Field(..., ge=5, le=600, description="Duration in seconds (5-600)")
    category: str = Field(..., description="Category of the video")
    language: str = Field(..., description="Language of the video (english/punjabi/hindi/telugu/tamil)")
    style: VideoStyle = Field(..., description="Visual style of the video")
    refined_description: Optional[str] = Field(None, description="Refined description after deep research")

class ShotResult(BaseModel):
    timestamp: str = Field(description="Timestamp in the video")
    ai_prompt: str = Field(description="Prompt used for video generation")
    starting_image_url: str = Field(None, description="URL of the starting image (if provided)")
    video_url: str = Field(description="Generated video URL")
    voiceover_script: str = Field(description="Script used for voiceover")
    voiceover_url: str = Field(description="Generated voiceover URL")
    captions: List[str] = Field(description="Text captions/overlays for the shot")
    order: int = Field(description="Shot order in the sequence")
    mood: str = Field(description="Mood and atmosphere of the shot")
    special_effects: List[str] = Field(description="Special effects applied")
    video_status: str = Field("completed", description="Status of video generation (completed/regenerating/failed)")
    audio_status: str = Field("completed", description="Status of audio generation (completed/regenerating/failed)")

class ErrorResponse(BaseModel):
    error: str = Field(..., description="Error message")
    status_code: int = Field(..., description="HTTP status code")

# Pydantic models for structured output
class VideoScript(BaseModel):
    title: str = Field(description="Title of the video")
    duration: int = Field(description="Duration in seconds")
    script_content: str = Field(description="The complete script content")
    tone: str = Field(description="The tone and style of the script")
    key_points: List[str] = Field(description="Main points covered in the script")
    music_prompt: str = Field(description="Generated prompt for background music")

class StoryboardScene(BaseModel):
    timestamp: str = Field(description="Timestamp in the video (e.g., '0:00-0:05')")
    scene_description: str = Field(description="Detailed description of the scene")
    camera_angle: str = Field(description="Camera angle and movement")
    visual_elements: List[str] = Field(description="Key visual elements in the scene")
    transitions: str = Field(description="Transition to/from this scene")

class ShotDetails(BaseModel):
    timestamp: str = Field(description="Timestamp in the video")
    ai_prompt: str = Field(description="Detailed prompt for AI video generation")
    voiceover_script: str = Field(description="Script for voiceover in the target language")
    captions: List[str] = Field(description="Text captions/overlays for the shot in the target language")
    mood: str = Field(description="Mood and atmosphere of the shot")
    special_effects: List[str] = Field(description="Any special effects or visual treatments")

class StoryboardCollection(BaseModel):
    scenes: List[StoryboardScene] = Field(description="Collection of storyboard scenes")

class ShotCollection(BaseModel):
    shots: List[ShotDetails] = Field(description="Collection of shot details")

class VideoProject(BaseModel):
    project_info: Dict = Field(description="Basic project information")
    script: VideoScript = Field(description="Complete video script")
    storyboard: List[StoryboardScene] = Field(description="Storyboard broken into scenes")
    shots: List[ShotDetails] = Field(description="Detailed shot information")

# Define models
class VideoTask(db.Model):
    __tablename__ = 'video_tasks'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String, nullable=False)
    progress = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    project_data = Column(JSON)
    shots = Column(JSON)
    background_music_url = Column(String)
    error = Column(String)

    def to_dict(self):
        return {
            'id': self.id,
            'status': self.status,
            'progress': self.progress,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
            'project_data': self.project_data,
            'shots': self.shots,
            'background_music_url': self.background_music_url,
            'error': self.error
        }

class SingleGenerationTask(db.Model):
    __tablename__ = 'single_generation_tasks'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    type = Column(String, nullable=False)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    request_data = Column(JSON)
    url = Column(String)
    error = Column(String)

class VideoExport(db.Model):
    __tablename__ = 'video_exports'
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id = Column(String, nullable=False)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    tracks = Column(JSON)
    video_url = Column(String)
    thumbnail_url = Column(String)
    error = Column(String)


with app.app_context():
    db.create_all()

# Initialize LLM
llm = ChatOpenAI(
    model="gpt-4o",  # Fixed model name
    temperature=0.7
)
script_llm = llm.with_structured_output(VideoScript)
storyboard_llm = llm.with_structured_output(StoryboardCollection)
shots_llm = llm.with_structured_output(ShotCollection)

# Define state type
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], "The messages in the conversation"]
    script: VideoScript
    storyboard: List[StoryboardScene]
    shots: List[ShotDetails]

# Prompts
script_prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder(variable_name="messages"),
    ("system", """You are a professional video script writer and music director who specializes in creating 
    culturally authentic content in multiple languages and various visual styles. Based on the project details 
    provided, create a compelling script and music direction that:
    
    1. Is written natively in the specified language (not translated)
    2. Incorporates local cultural elements, traditions, and values
    3. Uses language-appropriate idioms, expressions, and metaphors
    4. References local landmarks, customs, or cultural touchpoints when relevant
    5. Maintains cultural sensitivity and appropriateness
    6. Adapts the tone and style to local preferences and visual style:
       - For Hindi/Punjabi: More expressive and emotional style
       - For Tamil/Telugu: More formal and respectful tone
       - For English: Professional but conversational
    
    7. Considers the specified visual style in the narrative:
       - Realistic: Focus on authentic, detailed descriptions and natural scenarios
       - Cartoonish: Incorporate playful elements and exaggerated situations
       - Anime: Include dramatic moments and stylized scene descriptions
       - Doodle: Keep scenarios simple and whimsical
       - Watercolor: Emphasize mood and atmospheric elements
       - Pixel Art: Reference retro gaming aesthetics
       - Oil Painting: Focus on rich, classical scene descriptions
       - Comic Book: Include dynamic action and dramatic moments
    
    Additionally, generate a music prompt that:
    1. Matches the overall tone and theme of the video
    2. Complements the visual style:
       - Realistic: Professional soundtrack, natural ambience
       - Cartoonish: Playful, upbeat themes
       - Anime: J-pop inspired or dramatic orchestral
       - Doodle: Light, quirky melodies
       - Watercolor: Soft, ambient compositions
       - Pixel Art: Retro game music style
       - Oil Painting: Classical or baroque inspired
       - Comic Book: Epic, action-oriented themes
    
    3. Incorporates culturally appropriate musical elements based on language
    4. Considers:
       - Video duration and pacing
       - Target audience preferences
       - Cultural context and appropriateness
       - Overall emotional journey
    
    Structure the output as a VideoScript object including a music_prompt field that 
    captures these musical requirements."""),
])

storyboard_prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder(variable_name="messages"),
    ("system", """You are a professional storyboard artist with deep understanding of diverse cultural aesthetics, 
    visual storytelling traditions, and various artistic styles. Based on the script provided, create a culturally 
    authentic storyboard that:
    
    1. Incorporates local visual elements and aesthetics:
       - For Hindi/Punjabi: Vibrant colors, traditional motifs, Bollywood-inspired visuals
       - For Tamil/Telugu: Classical art influences, regional architecture, local landscapes
       - For English: Modern, international style with local touches
    
    2. Adapts to the specified visual style:
       - Realistic: Focus on natural lighting, authentic details, and photorealistic elements
       - Cartoonish: Use bold colors, exaggerated expressions, and simplified backgrounds
       - Anime: Incorporate manga-style elements, dramatic angles, and stylized effects
       - Doodle: Keep lines sketchy, use simple shapes, and maintain a hand-drawn feel
       - Watercolor: Emphasize soft edges, color bleeding, and artistic brush effects
       - Pixel Art: Plan for limited color palettes and pixelated aesthetics
       - Oil Painting: Include rich textures, classical composition, and dramatic lighting
       - Comic Book: Use dynamic poses, strong contrasts, and panel-like compositions
    
    3. Features culturally appropriate:
       - Settings and locations (local architecture, landscapes, urban/rural scenes)
       - Character appearances and clothing
       - Body language and gestures
       - Cultural symbols and motifs
       - Color schemes based on cultural preferences
    
    4. Maintains visual authenticity while adhering to the chosen style:
       - Uses real locations and landmarks when possible
       - Incorporates local design elements
       - Reflects local lifestyle and daily scenes
       - Shows authentic social interactions
    
    Create a detailed storyboard for each 5-second segment, ensuring all visual elements 
    are culturally appropriate and consistent with the chosen style.
    Structure the output as a StoryboardCollection containing multiple StoryboardScene objects."""),
    ("human", "Script: {script}")
])

shot_prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder(variable_name="messages"),
    ("system", """You are a professional video production expert, cinematographer, and creative director 
    who specializes in creating authentic local content in various visual styles. For each storyboard segment, 
    generate detailed shot information that incorporates both cultural elements and style-specific requirements:

    1. Visual Descriptions (AI Image Generation):
       Adapt descriptions based on the chosen style:
       - Realistic: Focus on natural lighting, authentic details, and photorealistic elements
       - Cartoonish: Describe bold colors, exaggerated features, and simplified backgrounds
       - Anime: Include cel-shading, manga-style elements, and stylized effects
       - Doodle: Specify sketchy lines, simple shapes, and hand-drawn qualities
       - Watercolor: Detail soft edges, color bleeding, and artistic brush effects
       - Pixel Art: Define limited color palettes and pixelated aesthetics
       - Oil Painting: Describe rich textures, classical composition, and dramatic lighting
       - Comic Book: Include strong outlines, dramatic shadows, and graphic novel elements
       
    2. Camera Work:
       Adapt cinematography to both style and cultural preferences:
       - Realistic: Natural movements and traditional techniques
       - Cartoonish: Playful and exaggerated camera moves
       - Anime: Dynamic angles and dramatic transitions
       - Doodle: Simple movements with hand-drawn feel
       - Watercolor: Gentle, flowing camera work
       - Pixel Art: Limited, precise movements
       - Oil Painting: Classical, measured compositions
       - Comic Book: Dynamic, action-oriented shots
       
    3. Lighting and Atmosphere:
       - Match lighting to both style and cultural context
       - Consider local environmental lighting
       - Adapt mood to style requirements
       
    4. Voiceover Scripts:
       - Write natively in the target language
       - Match tone to both style and cultural context
       - Time appropriately for language pace
       
    5. Captions and Text:
       - Use style-appropriate fonts and designs
       - Incorporate cultural elements
       - Position text according to style guidelines
       
    6. Special Effects:
       - Blend cultural motifs with style-specific effects
       - Use effects that match the chosen aesthetic
       - Maintain consistency with both style and culture
       
    Structure the output as a ShotCollection containing multiple ShotDetails objects.
    Each shot should feel authentically local while maintaining consistent style."""),
    ("human", "Storyboard: {storyboard}")
])

AUDIO_FOLDER = os.path.join(app.root_path, 'audios')


def update_task_status(task_id, status, progress, shots=None, background_music_url=None, error=None):
    with app.app_context():
        task = VideoTask.query.get(task_id)
        if task:
            task.status = status
            task.progress = progress
            task.updated_at = datetime.now()
            
            if shots is not None:
                task.shots = [shot.model_dump() for shot in shots]
            if background_music_url is not None:
                task.background_music_url = background_music_url
            if error is not None:
                task.error = error
            
            db.session.commit()
        else:
            logger.error(f"Task not found: {task_id}")


@app.route("/api/v1/generate-voiceover", methods=["POST"])
async def generate_voiceover(task_id: str, text: str, language: str) -> Dict:
    """Generate voiceover using Text2Speech"""
    logger.info(f"Generating voiceover in {language}", extra={"task_id": task_id})
    
    try:
        # Generate audio URL using Text2Speech
        audio_url = text2speech.make_speech(text,language)
        return {"url": audio_url}
        
    except Exception as e:
        logger.error(f"Error generating voiceover: {str(e)}", extra={"task_id": task_id})
        raise

async def generate_image(task_id: str, prompt: str, style: VideoStyle) -> Dict:
    """Generate image using Fal AI Flux with style-specific and cultural prompts"""
    logger.info(f"Generating image in {style} style", extra={"task_id": task_id})
    
    try:
        # Style-specific prompt enhancements
        style_prompts = {
            VideoStyle.REALISTIC: """
                Photorealistic, highly detailed cinematic shot with authentic cultural elements:
                Professional photography, 8K resolution, hyperrealistic details,
                Natural lighting optimized for local skin tones, authentic depth of field,
                Cultural authenticity in every detail, local architectural elements,
                Traditional clothing and accessories, cultural symbols and motifs
            """,
            VideoStyle.CARTOONISH: """
                Vibrant cartoon style animation with cultural authenticity:
                Disney/Pixar inspired but culturally accurate, exaggerated features while respecting cultural norms,
                Clean lines with traditional patterns, playful aesthetic with local color palettes,
                Cultural symbols and traditional elements in a family-friendly design,
                Local architectural styles and authentic environmental details
            """,
            VideoStyle.ANIME: """
                Japanese anime style with cultural fusion and authenticity:
                Anime aesthetic blended with local cultural elements,
                Cel shaded with culturally appropriate color schemes,
                Detailed backgrounds featuring local architecture and landscapes,
                Character designs respecting cultural dress and appearance,
                Traditional symbols and motifs in manga-inspired style
            """,
            VideoStyle.DOODLE: """
                Hand-drawn doodle style incorporating cultural elements:
                Sketchy lines featuring traditional patterns and motifs,
                Whimsical interpretations of local architecture and scenes,
                Simple shapes celebrating cultural symbols and icons,
                Playful scribbles of traditional elements and customs,
                Cultural authenticity in a casual, artistic style
            """,
            VideoStyle.WATERCOLOR: """
                Elegant watercolor artistic style with cultural depth:
                Soft color blending using traditional color palettes,
                Gentle gradients highlighting local landscapes and scenes,
                Artistic brush strokes incorporating cultural patterns,
                Flowing textures celebrating traditional art forms,
                Authentic representation of local life and customs
            """,
            VideoStyle.PIXEL_ART: """
                Retro pixel art style with cultural authenticity:
                16-bit or 32-bit aesthetic featuring local elements,
                Limited color palette based on traditional colors,
                Sharp pixel edges defining cultural symbols and patterns,
                Nostalgic gaming style with authentic local scenes,
                Traditional architecture and customs in pixel form
            """,
            VideoStyle.OIL_PAINTING: """
                Classical oil painting style rich in cultural heritage:
                Thick brush strokes depicting traditional scenes,
                Rich color depth from local color palettes,
                Canvas texture enhancing cultural elements,
                Traditional painting techniques meeting local artistic styles,
                Authentic composition of cultural life and customs
            """,
            VideoStyle.COMIC_BOOK: """
                Dynamic comic book style celebrating cultural identity:
                Strong outlines defining traditional elements,
                Halftone patterns incorporating cultural motifs,
                Dramatic shadows on authentic architecture and scenes,
                Action-oriented composition with local storytelling style,
                Cultural symbols and traditional elements in graphic novel form
            """
        }
        
        # Combine base prompt with style-specific enhancements
        style_prompt = style_prompts.get(style, "").strip()
        enhanced_prompt = f"""
        {style_prompt}
        Scene content: {prompt}
        Quality: High resolution, consistent style while maintaining cultural authenticity
        Composition: Professional framing with cultural elements in focus
        Aspect ratio: 16:9 cinematic
        Include: Local architecture, authentic clothing, cultural symbols, and appropriate environmental context
        Lighting: Professional lighting optimized for local skin tones and environment
        Cultural elements: Incorporate local design patterns, traditional motifs, and authentic details
        """
        
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/flux/dev",
            arguments={
                "prompt": enhanced_prompt.strip(),
                "style_preset": style.value
            },
            with_logs=True,
            on_queue_update=lambda update: logger.info(f"Image generation progress: {update.logs[-1]['message'] if isinstance(update, fal_client.InProgress) and update.logs else 'In progress'}", extra={"task_id": task_id}) if isinstance(update, fal_client.InProgress) else None
        )
        return result["images"][0]
        
    except Exception as e:
        logger.error(f"Error generating image: {str(e)}", extra={"task_id": task_id})
        raise

async def image_to_video(task_id: str, prompt: str, image_url: str, style: VideoStyle) -> Dict:
    """Convert image to video using Fal AI Kling with style and cultural consistency"""
    logger.info(f"Converting image to video in {style} style", extra={"task_id": task_id})
    
    try:
        # Style-specific motion enhancements with cultural considerations
        style_motion = {
            VideoStyle.REALISTIC: "Natural and fluid camera movement respecting cultural dynamics",
            VideoStyle.CARTOONISH: "Playful animation style while maintaining cultural authenticity",
            VideoStyle.ANIME: "Dramatic anime-style camera work blended with cultural storytelling",
            VideoStyle.DOODLE: "Hand-drawn animation feel celebrating cultural elements",
            VideoStyle.WATERCOLOR: "Gentle flowing transitions highlighting traditional elements",
            VideoStyle.PIXEL_ART: "Retro game-style movement with cultural motifs",
            VideoStyle.OIL_PAINTING: "Subtle artistic transitions preserving cultural depth",
            VideoStyle.COMIC_BOOK: "Dynamic transitions respecting cultural storytelling"
        }
        
        motion_prompt = style_motion.get(style, "Smooth and professional camera motion")
        
        enhanced_prompt = f"""
        5-second {style.value} style sequence with cultural authenticity: {prompt}
        Movement: {motion_prompt}
        Maintain consistent {style.value} style throughout while preserving cultural elements
        Quality: High resolution with authentic detail preservation
        Duration: Exactly 5 seconds
        Cultural elements: Preserve and enhance traditional motifs, local elements, and authentic details
        Transitions: Smooth flow that respects cultural storytelling traditions
        """
        
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/kling-video/v1/standard/image-to-video",
            arguments={
                "prompt": enhanced_prompt.strip(),
                "image_url": image_url,
                "style": style.value
            },
            with_logs=True,
            on_queue_update=lambda update: logger.info(f"Video generation progress: {update.logs[-1]['message'] if isinstance(update, fal_client.InProgress) and update.logs else 'In progress'}", extra={"task_id": task_id}) if isinstance(update, fal_client.InProgress) else None
        )
        return result["video"]
        
    except Exception as e:
        logger.error(f"Error converting image to video: {str(e)}", extra={"task_id": task_id})
        raise


def some_database_operation(task_id):
    try:
        # Database operations
        db.session.commit()
    except IntegrityError as e:
        db.session.rollback()
        logger.error(f"Integrity error: {str(e)}", extra={"task_id": task_id})
        # Handle integrity error (e.g., unique constraint violation)
    except OperationalError as e:
        db.session.rollback()
        logger.error(f"Operational error: {str(e)}", extra={"task_id": task_id})
        # Handle operational error (e.g., connection issues)
    except SQLAlchemyError as e:
        db.session.rollback()
        logger.error(f"An unexpected database error occurred: {str(e)}", extra={"task_id": task_id})
        # Handle other SQLAlchemy errors
    finally:
        db.session.close()

def create_video_workflow(task_id: str, project_data: dict) -> VideoProject:
    """Create video workflow including script, storyboard, and shots"""
    logger.info(f"Creating video workflow in {project_data['language']}", extra={"task_id": task_id})
    
    try:
        # Initialize the graph
        workflow = StateGraph(AgentState)
        
        # Add nodes and edges
        workflow.add_node("create_script", lambda x: create_script(x, task_id))
        workflow.add_node("create_storyboard", lambda x: create_storyboard(x, task_id))
        workflow.add_node("create_shots", lambda x: create_shots(x, task_id))
        
        workflow.add_edge("create_script", "create_storyboard")
        workflow.add_edge("create_storyboard", "create_shots")
        
        workflow.set_entry_point("create_script")
        
        # Create initial state with language information
        initial_state = {
            "messages": [
                HumanMessage(content=f"""
                Project Title: {project_data['project_title']}
                Project Description: {project_data['project_description']}
                Target Audience: {project_data['target_audience']}
                Duration: {project_data['duration']} seconds
                Category: {project_data['category']}
                Language: {project_data['language']}
                
                Please create a video script in {project_data['language']} based on these requirements.
                """)
            ],
            "script": None,
            "storyboard": [],
            "shots": []
        }
        
        # Run workflow
        graph = workflow.compile()
        result = graph.invoke(initial_state)
        
        return VideoProject(
            project_info={
                "title": project_data["project_title"],
                "description": project_data["project_description"],
                "target_audience": project_data["target_audience"],
                "duration": project_data["duration"],
                "category": project_data["category"],
                "language": project_data["language"],
                "created_at": datetime.now().isoformat()
            },
            script=result["script"],
            storyboard=result["storyboard"],
            shots=result["shots"]
        )
        
    except Exception as e:
        logger.error(f"Error in workflow: {str(e)}", extra={"task_id": task_id})
        raise

def create_script(state: AgentState, task_id: str) -> AgentState:
    """Generate video script"""
    logger.info("Generating script", extra={"task_id": task_id})
    messages = script_prompt.format_messages(messages=state["messages"])
    state["script"] = script_llm.invoke(messages)
    return state

def create_storyboard(state: AgentState, task_id: str) -> AgentState:
    """Generate storyboard"""
    logger.info("Generating storyboard", extra={"task_id": task_id})
    messages = storyboard_prompt.format_messages(
        messages=state["messages"],
        script=state["script"].model_dump()
    )
    storyboard_collection = storyboard_llm.invoke(messages)
    state["storyboard"] = storyboard_collection.scenes
    return state

def create_shots(state: AgentState, task_id: str) -> AgentState:
    """Generate shot details with improved prompts"""
    logger.info("Generating shots", extra={"task_id": task_id})
    
    # Enhanced shot prompt template
    enhanced_shot_prompt = ChatPromptTemplate.from_messages([
    MessagesPlaceholder(variable_name="messages"),
        ("system", """You are a professional video production expert, cinematographer, and voice director. For each storyboard segment,
        generate detailed shot information for a 5-second clip. Focus on:
        1. Clear, specific visual descriptions that can be turned into high-quality images
        2. Natural camera movements and transitions that work well with AI video generation
        3. Precise timing for 5-second duration
        4. Professional cinematic composition and lighting
        5. Compelling voiceover scripts that:
           - Match the visuals and enhance the story
           - Have natural pacing and emphasis
           - Are timed appropriately for 4-5 seconds (15-20 words)
           - Use professional voice acting direction (tone, emotion, pacing)
           - Include enough content to fill the full duration without rushing
        6. Engaging on-screen captions that:
           - Highlight key points and messages
           - Use appropriate font styles and sizes
           - Have good contrast with the visuals
           - Are timed well with the voiceover
           - Include calls-to-action where relevant
    Structure the output as a ShotCollection containing multiple ShotDetails objects."""),
    ("human", "Storyboard: {storyboard}")
])
    messages = enhanced_shot_prompt.format_messages(
        messages=state["messages"],
        storyboard=[scene.model_dump() for scene in state["storyboard"]]
    )
    shot_collection = shots_llm.invoke(messages)
    state["shots"] = shot_collection.shots
    return state

def insert_video_task(task_data):
    with app.app_context():
        new_task = VideoTask(
            id=task_data['task_id'],
            status=task_data['status'],
            progress=task_data['progress'],
            created_at=task_data['created_at'],
            updated_at=task_data['updated_at'],
            project_data=task_data['project_data']
        )
        db.session.add(new_task)
        db.session.commit()

async def generate_video(task_id: str, prompt: str, style: VideoStyle) -> Dict:
    """Generate video using image-to-video pipeline with consistent style"""
    logger.info(f"Starting video generation pipeline in {style} style", extra={"task_id": task_id})
    
    try:
        # First generate the image with style
        image_result = await generate_image(task_id, prompt, style)
        
        # Then convert image to video maintaining style
        video_result = await image_to_video(task_id, prompt, image_result["url"], style)
        
        return video_result, image_result["url"]
        
    except Exception as e:
        logger.error(f"Error in video generation pipeline: {str(e)}", extra={"task_id": task_id})
        raise


async def generate_background_music(task_id: str, prompt: str) -> Dict:
    """Generate background music using Fal AI Stable Audio"""
    logger.info(f"Generating background music", extra={"task_id": task_id})
    
    try:
        # Enhance the music prompt with cultural and emotional context
        enhanced_prompt = f"""
        High-quality background music:
        {prompt}
        Duration: 5 seconds
        Quality: Professional studio quality
        Mix: Well-balanced for background use
        Purpose: Video background music
        Volume: 0.3 (Low Volume)
        """
        
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/stable-audio",
            arguments={
                "prompt": enhanced_prompt.strip()
            },
            with_logs=True,
            on_queue_update=lambda update: logger.info(f"Music generation progress: {update.logs[-1]['message'] if isinstance(update, fal_client.InProgress) and update.logs else 'In progress'}", extra={"task_id": task_id}) if isinstance(update, fal_client.InProgress) else None
        )
        
        # Extract audio URL from result
        audio_url = result.get("audio_file", {}).get("url", "")
        return {"url": audio_url}
    
    except Exception as e:
        logger.error(f"Error generating background music: {str(e)}", extra={"task_id": task_id})
        raise

async def process_shots(task_id: str, shots: List[ShotDetails], language: str, style: VideoStyle) -> List[ShotResult]:
    """Process all shots in parallel with consistent style"""
    logger.info(f"Starting parallel processing of {len(shots)} shots in {style} style", extra={"task_id": task_id})
    
    async def process_single_shot(shot: ShotDetails, order: int, task_id: str, style: VideoStyle, language: str) -> ShotResult:
        try:
            video_result, starting_image_url = await generate_video(task_id, shot.ai_prompt, style)
            
            voiceover_result = await generate_voiceover(task_id, shot.voiceover_script, language)
            
            return ShotResult(
                timestamp=shot.timestamp,
                ai_prompt=shot.ai_prompt,
                starting_image_url=starting_image_url,
                video_url=video_result["url"],
                voiceover_script=shot.voiceover_script,
                voiceover_url=voiceover_result["url"],
                captions=shot.captions,
                order=order,
                mood=shot.mood,
                special_effects=shot.special_effects,
                video_status="completed",
                audio_status="completed"
            )
        except Exception as e:
            logger.error(f"Error processing shot {order}: {str(e)}", extra={"task_id": task_id})
            raise
    
    # Create tasks for all shots
    tasks = [
        process_single_shot(shot, idx, task_id, style, language)
        for idx, shot in enumerate(shots)
    ]
    
    # Process all shots in parallel with progress updates
    try:
        results = await asyncio.gather(*tasks)
        completed_shots = sorted(results, key=lambda x: x.order)
        
        # Update progress
        progress = 30 + 60  # Mark as complete
        update_task_status(task_id, "GENERATING_MEDIA", progress, shots=completed_shots)
        
        return completed_shots
    except Exception as e:
        logger.error(f"Error in parallel processing: {str(e)}", extra={"task_id": task_id})
        raise

def generate_video_background(task_id: str, project_data: dict):
    logger.info(f"Starting background video generation in {project_data['language']}", extra={"task_id": task_id})
    
    try:
        with app.app_context():
            # Update initial status
            task = VideoTask.query.get(task_id)
            task.status = "GENERATING_SCRIPT"
            task.progress = 10
            db.session.commit()

        description = project_data.get('refined_description') or project_data['project_description']
        project_data['project_description'] = description
        # Generate script and storyboard
        video_project = create_video_workflow(task_id, project_data)
        
        with app.app_context():
            # Update status before media generation
            task = VideoTask.query.get(task_id)
            task.status = "GENERATING_MEDIA"
            task.progress = 30
            db.session.commit()
        
        # Generate all videos and voiceovers in parallel
        completed_shots = asyncio.run(process_shots(task_id, video_project.shots, project_data['language'], project_data['style']))
        
        # Generate background music
        logger.info(f"Generating background music", extra={"task_id": task_id})
        music_result = asyncio.run(generate_background_music(task_id, video_project.script.music_prompt))
        
        with app.app_context():
            # Update final status with completed shots and background music
            task = VideoTask.query.get(task_id)
            task.status = "COMPLETED"
            task.progress = 100
            task.shots = [shot.model_dump() for shot in completed_shots]
            task.background_music_url = music_result["url"]
            db.session.commit()
        
        # Remove task from active tasks
        active_tasks.pop(task_id, None)
        
    except Exception as e:
        logger.error(f"Error in background task: {str(e)}", extra={"task_id": task_id})
        with app.app_context():
            task = VideoTask.query.get(task_id)
            task.status = "FAILED"
            task.progress = 0
            task.error = str(e)
            db.session.commit()
        active_tasks.pop(task_id, None)
        raise

@app.route("/api/v1/video-tasks", methods=["GET"])
def get_video_tasks():
    try:
        tasks = VideoTask.query.all()
        return jsonify([task.to_dict() for task in tasks])
    except Exception as e:
        logger.error(f"Error fetching video tasks: {str(e)}")
        return jsonify(ErrorResponse(
            error="Failed to fetch video tasks",
            status_code=500
        ).model_dump()), 500
    
def get_task_status(task_id):
    with app.app_context():
        task = VideoTask.query.get(task_id)
        if task:
            return {
                "id": task.id,
                "status": task.status,
                "progress": task.progress,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "updated_at": task.updated_at.isoformat() if task.updated_at else None
            }
        else:
            return None
        
@app.route("/api/v1/video-tasks/bulk-status", methods=["POST"])
def handle_bulk_status():
    try:
        task_ids = request.json()
        statuses = {}
        for task_id in task_ids:
            status = get_task_status(task_id)
            if status:
                statuses[task_id] = status
            else:
                statuses[task_id] = {"error": "Task not found"}
        return jsonify(statuses), 200
    except Exception as e:
        app.logger.error(f"Error in bulk status: {str(e)}")
        return jsonify({"error": "An error occurred while processing the request"}), 500

    
def build_preflight_response():
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response


@app.route("/api/v1/video-tasks/<task_id>", methods=["DELETE"])
def delete_video_task(task_id):
    try:
        with app.app_context():
            task = VideoTask.query.get(task_id)
            if not task:
                return jsonify(ErrorResponse(
                    error="Task not found",
                    status_code=404
                ).model_dump()), 404
            
            db.session.delete(task)
            db.session.commit()
        
        return jsonify({"message": "Video task deleted successfully"}), 200
    except Exception as e:
        logger.error(f"Error deleting video task: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error="Failed to delete video task",
            status_code=500
        ).model_dump()), 500

@app.route("/api/v1/video-tasks/<task_id>", methods=["OPTIONS"])
def handle_options(task_id):
    response = make_response()
    response.headers.add("Access-Control-Allow-Origin", "*")
    response.headers.add("Access-Control-Allow-Headers", "*")
    response.headers.add("Access-Control-Allow-Methods", "*")
    return response




@app.route("/api/v1/generate-video", methods=["POST"])
@validate()
def generate_video_endpoint(body: VideoGenerationRequest):
    task_id = str(uuid.uuid4())
    logger.info(f"Received video generation request", extra={"task_id": task_id})
    
    try:
        deep_research_flow = DeepResearchFlow(body.project_description)
        refined_description = deep_research_flow.kickoff()
        body.refined_description = refined_description

        project_data = body.model_dump()
        project_data['refined_description'] = refined_description
        
        with app.app_context():
            new_task = VideoTask(
                id=task_id,
                status="QUEUED",
                progress=0,
                project_data=project_data
            )
            db.session.add(new_task)
            db.session.commit()
        
        thread = threading.Thread(
            target=generate_video_background,
            args=(task_id, body.model_dump()),
            daemon=True
        )
        thread.start()
        
        active_tasks[task_id] = thread
        
        return jsonify({
            "task_id": task_id,
            "status": "QUEUED",
            "message": "Video generation started"
        })
        
    except Exception as e:
        logger.error(f"Error starting video generation: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500
    

@app.route("/api/v1/video-status/<task_id>", methods=["GET"])
def get_video_status(task_id: str):
    logger.info(f"Checking video status", extra={"task_id": task_id})
    
    try:
        thread = active_tasks.get(task_id)
        thread_status = "RUNNING" if thread and thread.is_alive() else "COMPLETED"
        
        with app.app_context():
            task = VideoTask.query.get(task_id)
        
        if not task:
            return jsonify(ErrorResponse(
                error="Task not found",
                status_code=404
            ).model_dump()), 404
        
        task_data = task.to_dict()
        task_data["thread_status"] = thread_status
        
        return jsonify(task_data)
        
    except Exception as e:
        logger.error(f"Error checking video status: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500

# Add new request models after existing models
class SingleVideoRequest(BaseModel):
    prompt: str = Field(..., description="Detailed prompt for video generation")
    language: str = Field(..., description="Language (english/punjabi/hindi/telugu/tamil)")
    duration: int = Field(5, description="Duration in seconds (default: 5)")
    style: VideoStyle = Field(..., description="Visual style of the video")

class SingleAudioRequest(BaseModel):
    prompt: str = Field(..., description="Detailed prompt for audio/music generation")
    language: str = Field(..., description="Language (english/punjabi/hindi/telugu/tamil)")
    is_voiceover: bool = Field(False, description="Whether this is a voiceover (True) or background music (False)")
    text: str = Field(None, description="Text for voiceover generation (required if is_voiceover=True)")

class SingleGenerationResponse(BaseModel):
    task_id: str = Field(..., description="Task ID for tracking")
    status: str = Field(..., description="Current status")
    url: str = Field(None, description="Generated media URL")
    error: str = Field(None, description="Error message if any")

@app.route("/api/v1/generate-single-video", methods=["POST"])
@validate()
def generate_single_video_endpoint(body: SingleVideoRequest):
    task_id = str(uuid.uuid4())
    logger.info(f"Received single video generation request", extra={"task_id": task_id})
    
    try:
        new_task = SingleGenerationTask(
            id=task_id,
            type="video",
            status="GENERATING",
            request_data=body.model_dump()
        )
        db.session.add(new_task)
        db.session.commit()
        
        thread = threading.Thread(
            target=generate_single_video_background,
            args=(task_id, body.model_dump()),
            daemon=True
        )
        thread.start()
        
        active_tasks[task_id] = thread
        
        return jsonify({
            "task_id": task_id,
            "status": "GENERATING",
            "message": "Video generation started"
        })
        
    except Exception as e:
        logger.error(f"Error starting video generation: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500
    
@app.route("/api/v1/generate-single-audio", methods=["POST"])
@validate()
def generate_single_audio_endpoint(body: SingleAudioRequest):
    task_id = str(uuid.uuid4())
    logger.info(f"Received single audio generation request", extra={"task_id": task_id})
    
    try:
        if body.is_voiceover and not body.text:
            return jsonify(ErrorResponse(
                error="Text is required for voiceover generation",
                status_code=400
            ).model_dump()), 400
        
        with app.app_context():
            new_task = SingleGenerationTask(
                id=task_id,
                type="audio",
                status="GENERATING",
                request_data=body.model_dump()
            )
            db.session.add(new_task)
            db.session.commit()
        
        thread = threading.Thread(
            target=generate_single_audio_background,
            args=(task_id, body.model_dump()),
            daemon=True
        )
        thread.start()
        
        active_tasks[task_id] = thread
        
        return jsonify({
            "task_id": task_id,
            "status": "GENERATING",
            "message": "Audio generation started"
        })
        
    except Exception as e:
        logger.error(f"Error starting audio generation: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500


@app.route("/api/v1/single-generation-status/<task_id>", methods=["GET"])
def get_single_generation_status(task_id: str):
    logger.info(f"Checking single generation status", extra={"task_id": task_id})
    
    try:
        thread = active_tasks.get(task_id)
        thread_status = "RUNNING" if thread and thread.is_alive() else "COMPLETED"
        
        with app.app_context():
            task = SingleGenerationTask.query.get(task_id)

        if not task:
            return jsonify(ErrorResponse(
                error="Task not found",
                status_code=404
            ).model_dump()), 404
        
        task_data = task.to_dict()
        task_data["thread_status"] = thread_status
        
        return jsonify(task_data)
        
    except Exception as e:
        logger.error(f"Error checking generation status: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500


def generate_single_video_background(task_id: str, request_data: dict):
    """Background task for single video generation"""
    logger.info(f"Starting single video generation", extra={"task_id": task_id})
    
    try:
        video_result = asyncio.run(generate_video(task_id, request_data["prompt"], request_data["style"]))
        
        with app.app_context():
            task = SingleGenerationTask.query.get(task_id)
            if task:
                task.status = "COMPLETED"
                task.updated_at = datetime.now()
                task.url = video_result["url"]
                db.session.commit()
        
        active_tasks.pop(task_id, None)
        
    except Exception as e:
        logger.error(f"Error in single video generation: {str(e)}", extra={"task_id": task_id})
        with app.app_context():
            task = SingleGenerationTask.query.get(task_id)
            if task:
                task.status = "FAILED"
                task.updated_at = datetime.now()
                task.error = str(e)
                db.session.commit()
        active_tasks.pop(task_id, None)
        raise


def generate_single_audio_background(task_id: str, request_data: dict):
    logger.info(f"Starting single audio generation", extra={"task_id": task_id})
    
    try:
        if request_data["is_voiceover"]:
            audio_result = asyncio.run(generate_voiceover(
                task_id,
                request_data["text"],
                request_data["language"]
            ))
        else:
            audio_result = asyncio.run(generate_background_music(
                task_id,
                request_data["prompt"]
            ))
        
        with app.app_context():
            task = SingleGenerationTask.query.get(task_id)
            task.status = "COMPLETED"
            task.updated_at = datetime.now()
            task.url = audio_result["url"]
            db.session.commit()
        
        active_tasks.pop(task_id, None)
        
    except Exception as e:
        logger.error(f"Error in single audio generation: {str(e)}", extra={"task_id": task_id})
        with app.app_context():
            task = SingleGenerationTask.query.get(task_id)
            task.status = "FAILED"
            task.updated_at = datetime.now()
            task.error = str(e)
            db.session.commit()
        active_tasks.pop(task_id, None)
        raise



@app.route("/health", methods=["GET"])
def health_check():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "timestamp": datetime.now().isoformat()
    })

# Add new request models for regeneration
class RegenerationRequest(BaseModel):
    shot_order: int = Field(..., description="Order of the shot to regenerate")
    regenerate_video: bool = Field(False, description="Whether to regenerate the video")
    regenerate_audio: bool = Field(False, description="Whether to regenerate the audio")
    language: str = Field(..., description="Language (english/punjabi/hindi/telugu/tamil)")
    new_video_prompt: str = Field(None, description="New prompt for video regeneration")
    new_voiceover_text: str = Field(None, description="New text for voiceover regeneration")
    starting_image_url: str = Field(None, description="URL of the starting image to use for video generation")

@app.route("/api/v1/regenerate-shot/<task_id>", methods=["POST"])
@validate()
def regenerate_shot_endpoint(task_id: str, body: RegenerationRequest):
    """Regenerate video or audio for a specific shot"""
    logger.info(f"Received shot regeneration request for order {body.shot_order}", extra={"task_id": task_id})
    
    try:
        with app.app_context():
            task = VideoTask.query.get(task_id)
        
        if not task:
            return jsonify(ErrorResponse(
                error="Task not found",
                status_code=404
            ).model_dump()), 404
            
        shots = task.shots
        
        # Validate shot order
        if body.shot_order >= len(shots):
            return jsonify(ErrorResponse(
                error=f"Invalid shot order. Task has {len(shots)} shots.",
                status_code=400
            ).model_dump()), 400
            
        # Update only the specific shot's status
        shot = shots[body.shot_order]
        components_to_regenerate = []
        
        if body.regenerate_video:
            shot["video_status"] = "regenerating"
            if body.new_video_prompt:
                shot["ai_prompt"] = body.new_video_prompt
            components_to_regenerate.append("video")
            
        if body.regenerate_audio:
            shot["audio_status"] = "regenerating"
            if body.new_voiceover_text:
                shot["voiceover_script"] = body.new_voiceover_text
            components_to_regenerate.append("audio")
        
        if not components_to_regenerate:
            return jsonify(ErrorResponse(
                error="Must specify at least one component to regenerate (video or audio)",
                status_code=400
            ).model_dump()), 400
        
        # Update task with modified shot status
        with app.app_context():
            task.shots = shots
            task.updated_at = datetime.now()
            db.session.commit()
        
        # Start background regeneration
        thread = threading.Thread(
            target=regenerate_shot_background,
            args=(task_id, body.model_dump(), shot),
            daemon=True
        )
        thread.start()
        
        # Store thread reference with unique key for this regeneration
        regen_task_id = f"{task_id}_regen_{body.shot_order}"
        active_tasks[regen_task_id] = thread
        
        return jsonify({
            "message": f"Shot {body.shot_order} regeneration started for {' and '.join(components_to_regenerate)}",
            "shot_order": body.shot_order,
            "regenerating_components": components_to_regenerate
        })
        
    except Exception as e:
        logger.error(f"Error starting shot regeneration: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500


def regenerate_shot_background(task_id: str, request_data: dict, shot: dict):
    logger.info(f"Starting shot regeneration for order {request_data['shot_order']}", extra={"task_id": task_id})
    language = request_data["language"]
    
    try:
        with app.app_context():
            task = VideoTask.query.get(task_id)
            if not task:
                raise Exception("Task not found")
            
            shots = task.shots
            style = VideoStyle(task.project_data.get("style", "realistic"))
            shot_order = request_data["shot_order"]
        
        video_regenerated = False
        audio_regenerated = False
        
        if request_data["regenerate_video"]:
            try:
                if request_data.get("starting_image_url"):
                    video_result = asyncio.run(image_to_video(
                        task_id,
                        shot["ai_prompt"],
                        request_data["starting_image_url"],
                        style
                    ))
                    shot["starting_image_url"] = request_data["starting_image_url"]
                else:
                    video_result = asyncio.run(generate_video(
                        task_id,
                        shot["ai_prompt"],
                        style
                    ))
                
                shot["video_url"] = video_result["url"]
                shot["video_status"] = "completed"
                video_regenerated = True
                
                with app.app_context():
                    task.shots[shot_order] = shot
                    task.updated_at = datetime.now()
                    db.session.commit()
                
            except Exception as e:
                shot["video_status"] = "failed"
                logger.error(f"Error regenerating video: {str(e)}", extra={"task_id": task_id})
                
                with app.app_context():
                    task.shots[shot_order] = shot
                    task.updated_at = datetime.now()
                    db.session.commit()
        
        if request_data["regenerate_audio"]:
            try:
                voiceover_result = asyncio.run(generate_voiceover(
                    task_id,
                    shot["voiceover_script"],
                    language
                ))
                shot["voiceover_url"] = voiceover_result["url"]
                shot["audio_status"] = "completed"
                audio_regenerated = True
                
                with app.app_context():
                    task.shots[shot_order] = shot
                    task.updated_at = datetime.now()
                    db.session.commit()
                
            except Exception as e:
                shot["audio_status"] = "failed"
                logger.error(f"Error regenerating audio: {str(e)}", extra={"task_id": task_id})
                
                with app.app_context():
                    task.shots[shot_order] = shot
                    task.updated_at = datetime.now()
                    db.session.commit()
        
        completion_message = []
        if request_data["regenerate_video"]:
            status = "successfully" if video_regenerated else "failed to"
            completion_message.append(f"Video {status} regenerate")
        if request_data["regenerate_audio"]:
            status = "successfully" if audio_regenerated else "failed to"
            completion_message.append(f"Audio {status} regenerate")
            
        logger.info(f"Shot regeneration completed: {', '.join(completion_message)}", extra={"task_id": task_id})
        
    except Exception as e:
        logger.error(f"Error in shot regeneration: {str(e)}", extra={"task_id": task_id})
        
        with app.app_context():
            task = VideoTask.query.get(task_id)
            if task:
                if request_data["regenerate_video"]:
                    task.shots[shot_order]["video_status"] = "failed"
                if request_data["regenerate_audio"]:
                    task.shots[shot_order]["audio_status"] = "failed"
                task.updated_at = datetime.now()
                db.session.commit()

# Add new request models for image generation
class ImageGenerationRequest(BaseModel):
    prompt: str = Field(..., description="Detailed prompt for image generation")
    style: VideoStyle = Field(..., description="Visual style of the image")

class ImageGenerationResponse(BaseModel):
    task_id: str = Field(..., description="Task ID for tracking")
    status: str = Field(..., description="Current status")
    url: str = Field(None, description="Generated image URL")
    error: str = Field(None, description="Error message if any")

# Add new API endpoint for image generation
@app.route("/api/v1/generate-image", methods=["POST"])
@validate()
def generate_image_endpoint(body: ImageGenerationRequest):
    """Generate a single image from prompt"""
    task_id = str(uuid.uuid4())
    logger.info(f"Received image generation request", extra={"task_id": task_id})
    
    try:
        
        image = asyncio.run(generate_image(
            task_id="regeneration_task_id",
            prompt=body.prompt,
            style=body.style
        ))
        
        return jsonify({
            "message": "Image generation started",
            "url": image["url"]
        })
        
    except Exception as e:
        logger.error(f"Error starting image generation: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500

class KeyFrame(BaseModel):
    timestamp: float = Field(..., description="Timestamp in milliseconds")
    duration: float = Field(..., description="Duration in milliseconds")
    url: str = Field(..., description="URL of the media file")

class Track(BaseModel):
    id: str = Field(..., description="Unique track identifier")
    type: str = Field(..., description="Type of track (audio/video)")
    keyframes: List[KeyFrame] = Field(..., description="List of keyframes in the track")

class ExportVideoRequest(BaseModel):
    video_id: str = Field(..., description="Video ID to export")
    tracks: List[Track] = Field(..., description="List of tracks to compose")

class ExportVideoResponse(BaseModel):
    video_url: str = Field(..., description="URL of the exported video")
    thumbnail_url: str = Field(None, description="URL of the video thumbnail")

async def export_video(task_id: str, tracks: List[Track]) -> Dict:
    """Export video using Fal AI FFmpeg API"""
    logger.info(f"Starting video export", extra={"task_id": task_id})
    
    try:
        result = await asyncio.to_thread(
            fal_client.subscribe,
            "fal-ai/ffmpeg-api/compose",
            arguments={
                "tracks": [track.model_dump() for track in tracks]
            },
            with_logs=True,
            on_queue_update=lambda update: logger.info(
                f"Export progress: {update.logs[-1]['message'] if isinstance(update, fal_client.InProgress) and update.logs else 'In progress'}", 
                extra={"task_id": task_id}
            ) if isinstance(update, fal_client.InProgress) else None
        )
        
        return {
            "video_url": result["video_url"],
            "thumbnail_url": result.get("thumbnail_url")
        }
        
    except Exception as e:
        logger.error(f"Error exporting video: {str(e)}", extra={"task_id": task_id})
        raise

@app.route("/api/v1/export-video", methods=["POST"])
@validate()
def export_video_endpoint(body: ExportVideoRequest):
    task_id = str(uuid.uuid4())
    logger.info(f"Received video export request", extra={"task_id": task_id})
    
    try:
        with app.app_context():
            new_export = VideoExport(
                id=task_id,
                video_id=body.video_id,
                status="EXPORTING",
                tracks=[track.model_dump() for track in body.tracks]
            )
            db.session.add(new_export)
            db.session.commit()
        
        thread = threading.Thread(
            target=export_video_background,
            args=(task_id, body.tracks),
            daemon=True
        )
        thread.start()
        
        active_tasks[task_id] = thread
        
        return jsonify({
            "task_id": task_id,
            "status": "EXPORTING",
            "message": "Video export started"
        })
        
    except Exception as e:
        logger.error(f"Error starting video export: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500

## export_video_background


def export_video_background(task_id: str, tracks: List[Track]):
    logger.info(f"Starting background video export", extra={"task_id": task_id})
    
    try:
        result = asyncio.run(export_video(task_id, tracks))
        
        with app.app_context():
            task = VideoExport.query.get(task_id)
            if task:
                task.status = "COMPLETED"
                task.updated_at = datetime.now()
                task.video_url = result["video_url"]
                task.thumbnail_url = result.get("thumbnail_url")
                db.session.commit()
        
        active_tasks.pop(task_id, None)
        
    except Exception as e:
        logger.error(f"Error in video export: {str(e)}", extra={"task_id": task_id})
        with app.app_context():
            task = VideoExport.query.get(task_id)
            if task:
                task.status = "FAILED"
                task.updated_at = datetime.now()
                task.error = str(e)
                db.session.commit()
        active_tasks.pop(task_id, None)
        raise


@app.route("/api/v1/export-status/<task_id>", methods=["GET"])
def get_export_status(task_id: str):
    logger.info(f"Checking export status", extra={"task_id": task_id})
    
    try:
        thread = active_tasks.get(task_id)
        thread_status = "RUNNING" if thread and thread.is_alive() else "COMPLETED"
        
        with app.app_context():
            task = VideoExport.query.get(task_id)
        
        if not task:
            return jsonify(ErrorResponse(
                error="Export task not found",
                status_code=404
            ).model_dump()), 404
        
        task_data = task.to_dict()
        task_data["thread_status"] = thread_status
        
        return jsonify(task_data)
        
    except Exception as e:
        logger.error(f"Error checking export status: {str(e)}", extra={"task_id": task_id})
        return jsonify(ErrorResponse(
            error=str(e),
            status_code=500
        ).model_dump()), 500
    
    
@app.route('/audios/<filename>')
def serve_audio(filename):
    logger.info(f"{AUDIO_FOLDER, filename}")
    return send_from_directory(AUDIO_FOLDER, filename)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5002, debug=False)
