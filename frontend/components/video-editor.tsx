'use client'

import * as React from "react"
import { Player, PlayerRef } from "@remotion/player"
import { preloadVideo, preloadAudio, resolveRedirect } from "@remotion/preload"
import { AbsoluteFill, Audio, Sequence, useVideoConfig, Video } from "remotion"
import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Edit, Loader2, Play, Pause, Film, Music, Type, Volume2, VolumeX, Clock, Layers, RefreshCcw, AlertCircle } from "lucide-react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { UUID } from "crypto"



interface Shot {
  mood: string;
  order: number;
  captions: string[];
  ai_prompt: string;
  timestamp: string;
  video_url: string;
  voiceover_url: string;
  special_effects: string[];
  voiceover_script: string;
  video_status?: string;
  audio_status?: string;
  starting_image_url?: string;
}

interface VideoTask {
  task_id: string;
  status: string;
  progress: number;
  project_data: any;
  shots: Shot[];
  background_music_url: string | null;
  exported_video_url?: string;
}

interface VideoEditorProps {
  task: VideoTask;
}

interface PreloadStatus {
  [key: string]: {
    loaded: boolean;
    progress: number;
  };
}

const useMediaPreload = (urls: { video: string; audio: string }[]) => {
  const [loadedMedia, setLoadedMedia] = React.useState<PreloadStatus>({})
  const [isLoading, setIsLoading] = React.useState(true)
  const [progress, setProgress] = React.useState(0)
  const mediaRefs = React.useRef<{ [key: string]: HTMLMediaElement }>({})

  const preloadMedia = React.useCallback(async () => {
    const totalFiles = urls.length * 2 // videos + audio files
    let loadedFiles = 0

    const preloadPromises = urls.map(({ video, audio }) => {
      const videoPromise = new Promise<void>((resolve, reject) => {
        const videoEl = document.createElement('video')
        videoEl.crossOrigin = 'anonymous'
        videoEl.preload = 'auto'
        videoEl.muted = true
        
        videoEl.addEventListener('loadeddata', () => {
          loadedFiles++
          setProgress((loadedFiles / totalFiles) * 100)
          setLoadedMedia(prev => ({
            ...prev,
            [video]: { loaded: true, progress: 100 }
          }))
          mediaRefs.current[video] = videoEl
          resolve()
        })

        videoEl.addEventListener('progress', () => {
          if (videoEl.buffered.length > 0) {
            const progress = (videoEl.buffered.end(0) / videoEl.duration) * 100
            setLoadedMedia(prev => ({
              ...prev,
              [video]: { loaded: false, progress }
            }))
          }
        })

        videoEl.addEventListener('error', reject)
        videoEl.src = video
        videoEl.load()
      })

      const audioPromise = new Promise<void>((resolve, reject) => {
        const audioEl = document.createElement('audio')
        audioEl.crossOrigin = 'anonymous'
        audioEl.preload = 'auto'

        audioEl.addEventListener('loadeddata', () => {
          loadedFiles++
          setProgress((loadedFiles / totalFiles) * 100)
          setLoadedMedia(prev => ({
            ...prev,
            [audio]: { loaded: true, progress: 100 }
          }))
          mediaRefs.current[audio] = audioEl
          resolve()
        })

        audioEl.addEventListener('progress', () => {
          if (audioEl.buffered.length > 0) {
            const progress = (audioEl.buffered.end(0) / audioEl.duration) * 100
            setLoadedMedia(prev => ({
              ...prev,
              [audio]: { loaded: false, progress }
            }))
          }
        })

        audioEl.addEventListener('error', reject)
        audioEl.src = audio
        audioEl.load()
      })

      return Promise.all([videoPromise, audioPromise])
    })

    try {
      await Promise.all(preloadPromises)
    } catch (error) {
      console.error('Error preloading media:', error)
     
    } finally {
      setIsLoading(false)
    }
  }, [urls])

  React.useEffect(() => {
    preloadMedia()
    return () => {
      // Cleanup media elements
      Object.values(mediaRefs.current).forEach(element => {
        element.src = ''
        element.load()
      })
      mediaRefs.current = {}
    }
  }, [preloadMedia])

  return { isLoading, loadedMedia, progress }
}

const PreloadMedia: React.FC<{ task: VideoTask }> = ({ task }) => {
  const mediaUrls = React.useMemo(() => 
    task.shots.map(shot => ({
      video: shot.video_url,
      audio: `${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`
    })),
    [task.shots]
  )

  const { isLoading, progress, loadedMedia } = useMediaPreload(mediaUrls)

  if (isLoading) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div 
                className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                style={{
                  clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 100%)`
                }}
              ></div>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm font-medium text-white">{Math.round(progress)}%</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <p className="text-white text-sm font-medium">Loading media files...</p>
            <div className="w-64 h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            {/* <p className="text-white/60 text-xs">
              {Object.values(loadedMedia).filter(m => m.loaded).length} of {mediaUrls.length * 2} files loaded
            </p> */}
          </div>
        </div>
      </div>
    )
  }

  return null
}

const VideoShot: React.FC<{ shot: Shot }> = ({ shot }) => {
  const videoConfig = useVideoConfig()
  const videoRef = React.useRef<HTMLVideoElement>(null)

  React.useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
    }
  }, [shot.video_url])

  return (
    <AbsoluteFill>
      <Video 
        src={shot.video_url}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <Audio src={`${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`} />
      {/* Background gradient overlay for better text visibility */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '40%',
          background: 'linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)',
          pointerEvents: 'none'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '90%',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.5rem',
          alignItems: 'center'
        }}
      >
        {shot.captions.map((caption, index) => (
          <div 
            key={index}
            style={{
              maxWidth: '90%',
              background: 'rgba(0,0,0,0.85)',
              backdropFilter: 'blur(20px)',
              borderRadius: '24px',
              padding: '1.75rem 2.5rem',
              border: '1px solid rgba(255,255,255,0.15)',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
              color: 'white',
              fontSize: '2.5rem',
              fontWeight: '700',
              lineHeight: '1.2',
              letterSpacing: '-0.02em',
              textAlign: 'center',
              animation: `fadeInUp 0.6s ${index * 0.2}s ease-out both`,
              transform: 'scale(1.0)',
              transition: 'transform 0.3s ease-out',
              textShadow: '0 2px 4px rgba(0,0,0,0.2)',
              WebkitBackgroundClip: 'padding-box',
              backgroundClip: 'padding-box',
              position: 'relative',
              zIndex: shot.captions.length - index
            }}
          >
            {/* Gradient border */}
            <div
              style={{
                position: 'absolute',
                inset: '-2px',
                borderRadius: '26px',
                background: 'linear-gradient(45deg, rgba(255,255,255,0.15), rgba(255,255,255,0.05))',
                zIndex: -1,
                opacity: 0.5
              }}
            />
            {/* Text with gradient */}
            <div
              style={{
                background: 'linear-gradient(135deg, #FFFFFF 0%, #E0E0E0 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                position: 'relative'
              }}
            >
              {caption}
            </div>
            {/* Subtle glow effect */}
            <div
              style={{
                position: 'absolute',
                inset: '-1px',
                background: 'radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 70%)',
                borderRadius: '25px',
                filter: 'blur(8px)',
                opacity: 0.5,
                zIndex: -1
              }}
            />
          </div>
        ))}
      </div>
      <style>
        {`
          @keyframes fadeInUp {
            from {
              opacity: 0;
              transform: translate3d(0, 30px, 0);
            }
            to {
              opacity: 1;
              transform: translate3d(0, 0, 0);
            }
          }
        `}
      </style>
    </AbsoluteFill>
  )
}

const LoadingState: React.FC<{ status: string; progress: number }> = ({ status, progress }) => {
  return (
    <div className="flex flex-col items-center justify-center h-full">
      <Loader2 className="h-12 w-12 animate-spin mb-4" />
      <h3 className="text-lg font-semibold mb-2">{status.replace('_', ' ')}</h3>
      <div className="w-64 bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-sm text-muted-foreground mt-2">{Math.round(progress)}% complete</p>
    </div>
  );
};


export function VideoEditor({ task }: VideoEditorProps) {
  const [selectedShot, setSelectedShot] = React.useState<Shot | null>(null)
  const [shots, setShots] = React.useState<Shot[]>(task.shots)
  const [isPlaying, setIsPlaying] = React.useState(false)
  const [currentTime, setCurrentTime] = React.useState(0)
  const [isMuted, setIsMuted] = React.useState(false)
  const [isPreviewMode, setIsPreviewMode] = React.useState(false)
  const [isPreloading, setIsPreloading] = React.useState(true)
  const [showEditDialog, setShowEditDialog] = React.useState(false)
  const [editType, setEditType] = React.useState<'video' | 'audio' | 'caption' | 'image' | null>(null)
  const [editPrompt, setEditPrompt] = React.useState('')
  const [isRegenerating, setIsRegenerating] = React.useState(false)
  const [hasRegeneratingShot, setHasRegeneratingShot] = React.useState(false)
  const [isGeneratingImage, setIsGeneratingImage] = React.useState(false)
  const [currentStyle, setCurrentStyle] = React.useState<string>('realistic')
  const pollingInterval = React.useRef<NodeJS.Timeout>()

  const playerRef = React.useRef<PlayerRef>(null)
  const timelineRef = React.useRef<HTMLDivElement>(null)
  const [isExporting, setIsExporting] = React.useState(false)
  const [exportStatus, setExportStatus] = React.useState<string | null>(null)
  const exportPollingInterval = React.useRef<NodeJS.Timeout>()
  const [showExportDialog, setShowExportDialog] = React.useState(false)
  const [exportedVideoUrl, setExportedVideoUrl] = React.useState<string | null>(null)
  const [exportTaskId, setExportTaskId] = React.useState<string | null>(null)

  // Preload all media when the component mounts
  React.useEffect(() => {
    const preloadAllMedia = async () => {
      try {
        const preloadPromises = task.shots.flatMap(shot => {
          return [
            resolveRedirect(shot.video_url)
              .then(resolvedUrl => preloadVideo(resolvedUrl))
              .catch(() => preloadVideo(shot.video_url)),
            resolveRedirect(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`)
              .then(resolvedUrl => preloadAudio(resolvedUrl))
              .catch(() => preloadAudio(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`))
          ]
        })

        await Promise.all(preloadPromises)
      } catch (error) {
        console.error('Error preloading media:', error)
      } finally {
        setIsPreloading(false)
      }
    }

    preloadAllMedia()
  }, [task.shots])

  // Check for existing export when component mounts
  React.useEffect(() => {
    const checkExistingExport = async () => {
      try {
        const response = await fetch(`/api/video-exports/${task.task_id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
    
        if (!response.ok) {
          throw new Error('Failed to fetch export data');
        }
    
        const exportData = await response.json();
    
        if (exportData) {
          setExportStatus(exportData.status);
          if (exportData.status === 'COMPLETED' && exportData.video_url) {
            setExportedVideoUrl(exportData.video_url);
            setShowExportDialog(true);
          } else if (exportData.status === 'EXPORTING' || exportData.status === 'QUEUED') {
            setIsExporting(true);
            // Start polling if export is in progress
            if (exportPollingInterval.current) {
              clearInterval(exportPollingInterval.current);
            }
            exportPollingInterval.current = setInterval(checkExportStatus, 3000);
          }
        }
      } catch (error) {
        console.error('Error checking existing export:', error);
      }
    };
    
    checkExistingExport();    
  }, [exportTaskId])

  // Add status polling for regeneration

  
  const checkShotStatus = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/video-tasks/${task.task_id}`);
      if (!response.ok) throw new Error('Failed to fetch task data');
      const data = await response.json();
  
      if (data) {
        const updatedShots = data.shots;
        const hasIncomplete = updatedShots.some(
          (shot: { video_status: string; audio_status: string }) => 
            shot.video_status === 'regenerating' || shot.audio_status === 'regenerating'
        );
        
        setShots(updatedShots);
        if (selectedShot) {
          const updatedSelectedShot = updatedShots.find((s: { order: number }) => s.order === selectedShot.order);
          if (updatedSelectedShot) {
            setSelectedShot(updatedSelectedShot);
          }
        }
        
        setHasRegeneratingShot(hasIncomplete);
        
        if (!hasIncomplete && pollingInterval.current) {
          clearInterval(pollingInterval.current);
          toast.success('Content regenerated successfully');
        }
      }
    } catch (error) {
      console.error('Error checking shot status:', error);
    }
  }, [task.task_id, selectedShot]);
  

  const handleGenerateImage = async () => {
    if (!selectedShot || !editPrompt) return;
  
    setIsGeneratingImage(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/generate-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: editPrompt,
          style: currentStyle
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to generate image');
      }
  
      const result = await response.json();
      
      // Update the shot with the new starting image URL
      const updateResponse = await fetch(`/api/video-tasks/${task.task_id}/update-shot`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shotOrder: selectedShot.order,
          startingImageUrl: result.url
        }),
      });
  
      if (!updateResponse.ok) {
        throw new Error('Failed to update shot');
      }
  
      const updatedData = await updateResponse.json();
  
      if (updatedData) {
        setShots(updatedData.shots);
        const updatedShot = updatedData.shots.find((s: { order: number }) => s.order === selectedShot.order);
        if (updatedShot) {
          setSelectedShot(updatedShot);
        }
        toast.success('Starting image generated successfully');
      }
    } catch (error) {
      console.error('Error generating image:', error);
      toast.error('Failed to generate starting image');
    } finally {
      setIsGeneratingImage(false);
    }
  };

  
  
  const generate_voiceover = async (taskId:string , text:string, language:string) => {
    const response = await fetch('/api/generate-voiceover', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ task_id: taskId, text, language }),
    });
  
    if (!response.ok) {
      throw new Error('Failed to generate voiceover');
    }
  
    const result = await response.json();
    return result.url;
  };
  
  const handleRegenerate = async () => {
    if (!selectedShot || !editType || !editPrompt) return;
  
    // For captions, update directly in Supabase
    if (editType === 'caption') {
      await handleCaptionUpdate();
      return;
    }
  
    // Close modal and show regenerating status immediately
    setShowEditDialog(false);
    setIsRegenerating(true);
    setHasRegeneratingShot(true);
    setEditPrompt('');
    setEditType(null);
  
    try {
      let voiceover_url;
  
      if (editType === 'audio') {
        voiceover_url = await generate_voiceover(
          task.task_id,
          editPrompt,
          task.project_data.language || 'english'
        );
      }
  
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/regenerate-shot/${task.task_id}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shot_order: selectedShot.order,
          regenerate_video: editType === 'video' || editType === 'image',
          regenerate_audio: editType === 'audio',
          new_video_prompt: editType === 'video' ? editPrompt : undefined,
          new_voiceover_text: editType === 'audio' ? editPrompt : undefined,
          new_voiceover_url: voiceover_url,
          starting_image_url: selectedShot.starting_image_url,
          language: task.project_data.language || 'english'
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to regenerate shot');
      }
  
      const result = await response.json();
      
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
      pollingInterval.current = setInterval(checkShotStatus, 3000);
      
      toast.success(`Started regenerating ${editType}`);
    } catch (error) {
      console.error('Error regenerating shot:', error);
      toast.error(`Failed to regenerate ${editType}`);
      setHasRegeneratingShot(false);
    } finally {
      setIsRegenerating(false);
    }
  };
  

  const handleCaptionUpdate = async () => {
    if (!selectedShot || !editPrompt) return;
  
    setIsRegenerating(true);
    try {
      // Split captions by newline to support multiple captions
      const newCaptions = editPrompt.split('\n').filter(caption => caption.trim());
  
      // Update the shot's captions via API
      const response = await fetch(`/api/video-tasks/${task.task_id}/update-captions`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          shotOrder: selectedShot.order,
          captions: newCaptions
        }),
      });
  
      if (!response.ok) {
        throw new Error('Failed to update captions');
      }
  
      const data = await response.json();
  
      if (data) {
        // Update local state
        const updatedShots = data.shots;
        setShots(updatedShots);
        const updatedSelectedShot = updatedShots.find((s: { order: number }) => s.order === selectedShot.order);
        if (updatedSelectedShot) {
          setSelectedShot(updatedSelectedShot);
        }
        toast.success('Captions updated successfully');
      }
    } catch (error) {
      console.error('Error updating captions:', error);
      toast.error('Failed to update captions');
    } finally {
      setIsRegenerating(false);
      setShowEditDialog(false);
      setEditPrompt('');
      setEditType(null);
    }
  };
  

  // Move useEffect outside of renderEditDialog
  React.useEffect(() => {
    if (showEditDialog && selectedShot && editType) {
      const initialValue = editType === 'video' 
        ? selectedShot.ai_prompt 
        : editType === 'audio'
          ? selectedShot.voiceover_script
          : selectedShot.captions.join('\n')
      setEditPrompt(initialValue)
    } else {
      setEditPrompt('')
    }
  }, [showEditDialog, selectedShot, editType])

  // Add cleanup for export polling
  React.useEffect(() => {
    return () => {
      if (exportPollingInterval.current) {
        clearInterval(exportPollingInterval.current)
      }
    }
  }, [])

  const checkExportStatus = React.useCallback(async () => {
    try {
      const response = await fetch(`/api/video-exports/${task.task_id}/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
  
      if (!response.ok) {
        throw new Error('Failed to fetch export status');
      }
  
      const exportData = await response.json();
  
      if (exportData) {
        setExportStatus(exportData.status);
  
        if (exportData.status === 'COMPLETED' && exportData.video_url) {
          // Update exported video URL
          setExportedVideoUrl(exportData.video_url);
          
          // Clear polling and show success message
          if (exportPollingInterval.current) {
            clearInterval(exportPollingInterval.current);
          }
          setIsExporting(false);
          toast.success('Video exported successfully');
        } else if (exportData.status === 'FAILED') {
          // Handle failure
          if (exportPollingInterval.current) {
            clearInterval(exportPollingInterval.current);
          }
          setIsExporting(false);
          setShowExportDialog(false);
          toast.error(`Export failed: ${exportData.error || 'Unknown error'}`);
        }
      }
    } catch (error) {
      console.error('Error checking export status:', error);
      // Don't stop polling on check errors
    }
  }, [task.task_id]);
  

  const handleExportVideo = async () => {
    setIsExporting(true)
    setExportStatus('QUEUED')
    setShowExportDialog(true)
    try {
      // Create video track from shots
      const videoTrack = {
        id: 'video-track',
        type: 'video',
        keyframes: shots.map((shot, index) => ({
          timestamp: index * 5000, // Convert to milliseconds (5 seconds per shot)
          duration: 5000, // 5 seconds in milliseconds
          url: shot.video_url
        }))
      }

      // Create voiceover track from shots
      const voiceoverTrack = {
        id: 'voiceover-track',
        type: 'audio',
        keyframes: shots.map((shot, index) => ({
          timestamp: index * 5000, // Sync with video timestamps
          duration: 5000,
          url: `${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`
        }))
      }

      // Create background music track if available
      const tracks = [videoTrack, voiceoverTrack]
      if (task.background_music_url) {
        tracks.push({
          id: 'background-music',
          type: 'audio',
          keyframes: [{
            timestamp: 0,
            duration: shots.length * 5000, // Total duration in milliseconds
            url: task.background_music_url
          }]
        })
      }


      // Call the export API
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/export-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tracks, video_id: task.task_id.toString() })
      })

      if (!response.ok) {
        throw new Error('Failed to export video')
      }

      const result = await response.json()
      setExportTaskId(result.task_id)
      if (result.status === 'EXPORTING') {
        // Start polling for status
        if (exportPollingInterval.current) {
          clearInterval(exportPollingInterval.current)
        }
        exportPollingInterval.current = setInterval(checkExportStatus, 3000)
        toast.success('Video export started')
      } else {
        throw new Error('Unexpected response from export API')
      }
    } catch (error) {
      console.error('Error exporting video:', error)
      toast.error('Failed to start video export')
      setIsExporting(false)
      setExportStatus(null)
      setShowExportDialog(false)
    }
  }

  if (task.status !== 'COMPLETED') {
    return <LoadingState status={task.status} progress={task.progress} />
  }

  if (isPreloading) {
    return (
      <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
              <div 
                className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
              ></div>
            </div>
          </div>
          <p className="text-white text-sm font-medium">Preloading media files...</p>
        </div>
      </div>
    )
  }

  const totalDuration = task.shots.reduce((acc, shot, index) => {
    // Each shot is 5 seconds
    const start = index * 5
    const end = start + 5
    // Update the timestamp in the shot object
    shot.timestamp = `${Math.floor(start/60)}:${String(start%60).padStart(2, '0')}-${Math.floor(end/60)}:${String(end%60).padStart(2, '0')}`
    return acc + 5
  }, 0)

  const handleTimeUpdate = (time: number) => {
    setCurrentTime(time / 30)
    if (timelineRef.current) {
      const scrollPosition = (time / (totalDuration * 30)) * timelineRef.current.scrollWidth
      timelineRef.current.scrollLeft = scrollPosition - (timelineRef.current.clientWidth / 2)
    }
  }

  const renderTimelineTrack = (shot: Shot, type: 'video' | 'audio' | 'caption') => {
    const shotIndex = shot.order
    const start = shotIndex * 5
    const end = start + 5
    const duration = 5
    const width = (duration / totalDuration) * 100

    const getTrackStyle = () => {
      switch (type) {
        case 'video':
          return 'bg-blue-500/10 border-blue-500/50 hover:bg-blue-500/20 hover:border-blue-500'
        case 'audio':
          return 'bg-green-500/10 border-green-500/50 hover:bg-green-500/20 hover:border-green-500'
        case 'caption':
          return 'bg-purple-500/10 border-purple-500/50 hover:bg-purple-500/20 hover:border-purple-500'
      }
    }

    return (
      <div
        key={`${shot.order}-${type}`}
        className={cn(
          "relative h-14 rounded-lg border transition-all duration-200 cursor-pointer group overflow-hidden backdrop-blur-sm",
          selectedShot?.order === shot.order
            ? 'border-primary/80 bg-primary/10 ring-2 ring-primary ring-offset-2 shadow-lg scale-[1.02] z-10'
            : `border ${getTrackStyle()} hover:shadow-md hover:scale-[1.02] hover:z-10`,
        )}
        style={{ width: `${Math.max(width * 3, 100)}px`, marginBottom: '8px' }}
        onClick={() => {
          setSelectedShot(shot)
          if (playerRef.current) {
            playerRef.current.seekTo(start * 30)
          }
        }}
      >
        {renderEditButton(type)}
        {type === 'video' && (
          <>
            <video 
              src={shot.video_url} 
              className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"
              muted
              loop
              autoPlay
              playsInline
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          </>
        )}
        {type === 'audio' && (
          <div className="absolute inset-0 flex items-center justify-center px-3">
            <div className="w-full h-2 bg-green-500/30 rounded-full overflow-hidden">
              <div className="w-full h-full bg-green-500/50 rounded-full animate-pulse" />
            </div>
          </div>
        )}
        {type === 'caption' && (
          <div className="absolute inset-0 flex items-center justify-center px-3 py-2">
            <div className="w-full bg-purple-500/5 rounded-lg p-2 backdrop-blur-sm border border-purple-500/20">
              <p className="text-sm font-medium leading-tight max-w-full text-center line-clamp-2">
                {shot.captions[0]}
              </p>
              {shot.captions.length > 1 && (
                <div className="absolute bottom-1 right-2 flex -space-x-1">
                  {shot.captions.slice(1).map((_, i) => (
                    <div 
                      key={i} 
                      className="w-1.5 h-1.5 rounded-full bg-purple-500/50"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="absolute inset-0 p-2 opacity-90 group-hover:opacity-100 transition-opacity">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full bg-background/80 backdrop-blur-sm shadow-sm">
                {shot.order + 1}
              </span>
              <span className="text-xs text-muted-foreground bg-background/80 px-1.5 py-0.5 rounded-full backdrop-blur-sm">
                {shot.timestamp}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const renderEditDialog = () => {
    if (!selectedShot || !editType) return null;

    const getTitle = () => {
      switch (editType) {
        case 'video':
          return 'Edit Video';
        case 'audio':
          return 'Edit Voiceover Script';
        case 'caption':
          return 'Edit Captions';
        case 'image':
          return 'Edit Starting Image';
        default:
          return 'Edit';
      }
    };

    const getPlaceholder = () => {
      switch (editType) {
        case 'video':
          return 'Enter new video prompt...';
        case 'audio':
          return 'Enter new voiceover script...';
        case 'caption':
          return 'Enter captions (one per line)...';
        case 'image':
          return 'Enter image prompt...';
        default:
          return '';
      }
    };

    return (
      <Dialog open={showEditDialog} onOpenChange={(open) => {
        setShowEditDialog(open);
        if (!open) {
          setEditType(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{getTitle()}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {editType === 'image' && selectedShot.starting_image_url && (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border">
                <img 
                  src={selectedShot.starting_image_url} 
                  alt="Starting image"
                  className="object-cover w-full h-full"
                />
              </div>
            )}
            <div className="grid gap-2">
              <Label>
                {editType === 'video' ? 'Video Prompt' : 
                 editType === 'audio' ? 'Voiceover Script' : 
                 editType === 'image' ? 'Image Prompt' : 'Captions'}
                {editType === 'caption' && (
                  <span className="text-xs text-muted-foreground ml-2">
                    Enter each caption on a new line
                  </span>
                )}
              </Label>
              <Textarea
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                placeholder={getPlaceholder()}
                rows={editType === 'caption' ? 8 : 5}
              />
            </div>
            {editType === 'image' && (
              <div className="grid gap-2">
                <Label htmlFor="style">Visual Style</Label>
                <select
                  id="style"
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={currentStyle}
                  onChange={(e) => setCurrentStyle(e.target.value)}
                >
                  <option value="realistic">Realistic</option>
                  <option value="cartoonish">Cartoonish</option>
                  <option value="anime">Anime</option>
                  <option value="doodle">Doodle</option>
                  <option value="watercolor">Watercolor</option>
                  <option value="pixel_art">Pixel Art</option>
                  <option value="oil_painting">Oil Painting</option>
                  <option value="comic_book">Comic Book</option>
                </select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowEditDialog(false);
                setEditType(null);
              }}
            >
              Cancel
            </Button>
            {editType === 'image' ? (
              <>
                <Button 
                  onClick={handleGenerateImage}
                  disabled={isGeneratingImage || !editPrompt}
                >
                  {isGeneratingImage ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating Image...
                    </>
                  ) : (
                    'Generate Image'
                  )}
                </Button>
                <Button
                  onClick={handleRegenerate}
                  disabled={isRegenerating || !selectedShot.starting_image_url}
                >
                  {isRegenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Regenerating Video...
                    </>
                  ) : (
                    'Regenerate Video'
                  )}
                </Button>
              </>
            ) : (
              <Button 
                onClick={handleRegenerate}
                disabled={isRegenerating || !editPrompt}
              >
                {isRegenerating ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editType === 'caption' ? 'Updating...' : 'Regenerating...'}
                  </>
                ) : (
                  editType === 'caption' ? 'Update Captions' : 'Regenerate'
                )}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  const renderEditButton = (type: 'video' | 'audio' | 'caption') => {
    if (!selectedShot) return null

    const isRegenerating = selectedShot.video_status === 'regenerating' || selectedShot.audio_status === 'regenerating'

    return (
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity z-20"
        onClick={(e) => {
          e.stopPropagation()
          setEditType(type)
          setShowEditDialog(true)
        }}
        disabled={isRegenerating}
      >
        {isRegenerating ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Edit className="h-4 w-4" />
        )}
      </Button>
    )
  }

  const renderMediaCard = (shot: Shot, type: 'video' | 'audio' | 'caption') => {
    const isRegenerating = type === 'video' ? shot.video_status === 'regenerating' : type === 'audio' ? shot.audio_status === 'regenerating' : false
    const hasError = type === 'video' ? shot.video_status === 'failed' : type === 'audio' ? shot.audio_status === 'failed' : false

    return (
      <Card 
        key={shot.order}
        className={cn(
          "p-2 cursor-pointer transition-all duration-300 group relative",
          selectedShot?.order === shot.order 
            ? 'bg-primary/10 ring-2 ring-primary' 
            : 'hover:bg-accent hover:scale-[1.02]'
        )}
      >
        {/* Status Badge - Only show on video and audio cards */}
        {type !== 'caption' && (isRegenerating || hasError) && (
          <Badge
            variant={hasError ? "destructive" : "secondary"}
            className="absolute top-3 left-3 z-20 animate-pulse"
          >
            {hasError ? (
              <div className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Failed
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <RefreshCcw className="h-3 w-3 animate-spin" />
                Regenerating
              </div>
            )}
          </Badge>
        )}

        {/* Edit Button */}
        <Button
          variant="ghost"
          size="sm"
          className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity z-20"
          onClick={(e) => {
            e.stopPropagation()
            setSelectedShot(shot)
            setEditType(type)
            setShowEditDialog(true)
          }}
          disabled={isRegenerating}
        >
          {isRegenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Edit className="h-4 w-4" />
          )}
        </Button>

        {type === 'video' && (
          <div className="relative overflow-hidden rounded-md" onClick={() => setSelectedShot(shot)}>
            {/* Add image edit button */}
            <Button
              variant="secondary"
              size="sm"
              className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity z-20"
              onClick={(e) => {
                e.stopPropagation();
                setSelectedShot(shot);
                setEditType('image');
                setEditPrompt(shot.ai_prompt);
                setShowEditDialog(true);
              }}
            >
              <Edit className="h-4 w-4 mr-2" />
              Edit Image
            </Button>
            <video 
              src={shot.video_url} 
              className="w-full h-32 object-cover"
              controls={false}
              muted
              playsInline
              loop
              autoPlay
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-black/80 backdrop-blur-md text-white border-white/20 font-medium shadow-lg">
                  Shot {shot.order + 1}
                </Badge>
                {/* {shot.video_status && (
                  <Badge 
                    variant={shot.video_status === 'completed' ? 'default' : 'secondary'}
                    className="bg-black/50 backdrop-blur-sm"
                  >
                    {shot.video_status}
                  </Badge>
                )} */}
              </div>
              <p className="text-xs opacity-75">{shot.timestamp}</p>
            </div>
          </div>
        )}

        {type === 'audio' && (
          <div className="p-3" onClick={() => setSelectedShot(shot)}>
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">Shot {shot.order + 1}</Badge>
              {/* {shot.audio_status && (
                <Badge 
                  variant={shot.audio_status === 'completed' ? 'default' : 'secondary'}
                >
                  {shot.audio_status}
                </Badge>
              )} */}
            </div>
            <audio src={`${process.env.NEXT_PUBLIC_VIDEO_API_URL}${shot.voiceover_url}`} controls className="w-full mb-2" />
            <p className="text-sm text-muted-foreground line-clamp-2">{shot.voiceover_script}</p>
          </div>
        )}

        {type === 'caption' && (
          <div className="p-3" onClick={() => setSelectedShot(shot)}>
            <div className="flex items-center justify-between mb-2">
              <Badge variant="outline">Shot {shot.order + 1}</Badge>
            </div>
            {shot.captions.map((caption, index) => (
              <p key={index} className="text-sm mb-1 line-clamp-2">
                {caption}
              </p>
            ))}
          </div>
        )}
      </Card>
    )
  }

  const renderExportDialog = () => {
    return (
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="sm:max-w-[800px]">
          <DialogHeader>
            <DialogTitle>Export Video</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {isExporting ? (
              <div className="flex flex-col items-center justify-center p-8 gap-4">
                <div className="relative">
                  <div className="w-16 h-16">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20"></div>
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin"
                    ></div>
                  </div>
                </div>
                <p className="text-lg font-medium">
                  {exportStatus === 'QUEUED' ? 'Video export queued...' :
                   exportStatus === 'EXPORTING' ? 'Exporting your video...' :
                   'Processing...'}
                   {exportStatus === 'COMPLETED' && exportedVideoUrl && (
                    <p className="text-sm text-muted-foreground text-center">
                      Your video has been exported successfully!
                    </p>
                   )}
                </p>
                <p className="text-sm text-muted-foreground text-center">
                  This may take a few minutes. Please do not close this dialog
                </p>
              </div>
            ) : exportedVideoUrl ? (
              <div className="space-y-4">
                <div className="aspect-video relative rounded-lg overflow-hidden border bg-muted">
                  <video 
                    src={exportedVideoUrl}
                    controls
                    className="w-full h-full"
                    autoPlay
                  />
                </div>
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    Your video has been exported successfully!
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        // Copy video URL to clipboard
                        navigator.clipboard.writeText(exportedVideoUrl)
                        toast.success('Video URL copied to clipboard')
                      }}
                    >
                      Copy URL
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => {
                        // Download video
                        const link = document.createElement('a')
                        link.href = exportedVideoUrl
                        link.download = `video-${task.task_id}.mp4`
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                      }}
                    >
                      Download
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowExportDialog(false)
                // Don't reset status if still exporting
                if (!isExporting) {
                  setExportStatus(null)
                  setExportedVideoUrl(null)
                }
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <>
      <PreloadMedia task={{ ...task, shots }} />
      {renderEditDialog()}
      {renderExportDialog()}
      <div className="flex h-full">
        {/* Left Panel - Media Assets */}
        <div className={cn(
          "border-r bg-muted/10 transition-all duration-300",
          isPreviewMode ? "w-0 opacity-0" : "w-80 opacity-100"
        )}>
          <Tabs defaultValue="videos" className="h-full">
            <TabsList className="w-full grid grid-cols-3">
              <TabsTrigger value="videos">
                <Film className="h-4 w-4 mr-2" />
                Videos
              </TabsTrigger>
              <TabsTrigger value="audio">
                <Music className="h-4 w-4 mr-2" />
                Audio
              </TabsTrigger>
              <TabsTrigger value="captions">
                <Type className="h-4 w-4 mr-2" />
                Text
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="videos" className="p-4">
              <ScrollArea className="h-[calc(100vh-12rem)]">
                <div className="space-y-4">
                  {shots.map((shot) => renderMediaCard(shot, 'video'))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="audio" className="p-4">
              <ScrollArea className="h-[calc(100vh-12rem)]">
                <div className="space-y-4">
                  {task.background_music_url && (
                    <Card className="p-4">
                      <h3 className="text-sm font-medium mb-2">Background Music</h3>
                      <audio src={task.background_music_url} controls className="w-full" />
                    </Card>
                  )}
                  {shots.map((shot) => renderMediaCard(shot, 'audio'))}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="captions" className="p-4">
              <ScrollArea className="h-[calc(100vh-12rem)]">
                <div className="space-y-4">
                  {shots.map((shot) => renderMediaCard(shot, 'caption'))}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Video Preview */}
          <div className="flex-1 bg-black relative">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                className="bg-black/50 hover:bg-black/75 text-white"
                onClick={handleExportVideo}
                disabled={isExporting || hasRegeneratingShot}
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {exportStatus === 'QUEUED' ? 'Queued...' :
                     exportStatus === 'EXPORTING' ? 'Exporting...' :
                     'Processing...'}
                  </>
                ) : (
                  <>
                    <Film className="h-4 w-4 mr-2" />
                    Export Video
                  </>
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="bg-black/50 hover:bg-black/75 text-white"
                onClick={() => setIsPreviewMode(!isPreviewMode)}
              >
                <Layers className="h-4 w-4" />
              </Button>
            </div>
            <Player 
              ref={playerRef}
              component={() => (
                <>
                  {task.background_music_url && (
                    <Sequence from={0} durationInFrames={totalDuration * 30}>
                      <Audio src={task.background_music_url} volume={0.3} />
                    </Sequence>
                  )}
                  {shots.map((shot) => {
                    const start = shot.order * 5 // 5 seconds per shot
                    const duration = 5 // Fixed 5 second duration

                    return (
                      <Sequence key={shot.order} from={start * 30} durationInFrames={duration * 30} premountFor={100}>
                        <VideoShot shot={shot} />
                      </Sequence>
                    )
                  })}
                </>
              )}
              durationInFrames={totalDuration * 30}
              fps={30}
              compositionWidth={1920}
              compositionHeight={1080}
              style={{ width: '100%', height: '100%' }}
              controls
              autoPlay={isPlaying}
              loop
              renderLoading={() => (
                <div className="flex items-center justify-center h-full bg-black">
                  <div className="flex flex-col items-center gap-4">
                    <Loader2 className="h-8 w-8 animate-spin text-white" />
                    <p className="text-white text-sm">Loading video...</p>
                  </div>
                </div>
              )}
              inputProps={{ muted: isMuted }}
            />
          </div>

          {/* Timeline */}
          <div className="h-96 border-t bg-background">
            <div className="p-4 border-b bg-background/95 backdrop-blur-sm sticky top-0 z-20">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <Button
                    variant="outline"
                    size="icon"
                    className="rounded-full hover:bg-primary/10 transition-colors"
                    onClick={() => {
                      setIsPlaying(!isPlaying)
                      if (playerRef.current) {
                        if (isPlaying) {
                          playerRef.current.pause()
                        } else {
                          playerRef.current.play()
                        }
                      }
                    }}
                  >
                    {isPlaying ? (
                      <Pause className="h-4 w-4" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="rounded-full"
                    onClick={() => setIsMuted(!isMuted)}
                  >
                    {isMuted ? (
                      <VolumeX className="h-4 w-4" />
                    ) : (
                      <Volume2 className="h-4 w-4" />
                    )}
                  </Button>
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded-full">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium tabular-nums">
                      {Math.floor(currentTime / 60)}:
                      {Math.floor(currentTime % 60).toString().padStart(2, '0')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            
            <ScrollArea 
              ref={timelineRef} 
              className="h-[calc(100%-65px)]"
            >
              <div className="p-6">
                <div className="space-y-8">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-24 text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Film className="h-4 w-4" />
                        Video
                      </div>
                      <div className="flex-1 flex space-x-2 min-w-max">
                        {shots.map((shot) => renderTimelineTrack(shot, 'video'))}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-24 text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Volume2 className="h-4 w-4" />
                        Audio
                      </div>
                      <div className="flex-1 flex space-x-2 min-w-max">
                        {shots.map((shot) => renderTimelineTrack(shot, 'audio'))}
                      </div>
                    </div>
                  </div>

                  {task.background_music_url && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-24 text-sm font-medium text-muted-foreground flex items-center gap-2">
                          <Music className="h-4 w-4" />
                          Music
                        </div>
                        <div className="flex-1 min-w-max">
                          <div
                            className="relative h-14 rounded-lg border border-orange-500/50 bg-orange-500/10 hover:bg-orange-500/20 hover:border-orange-500 transition-all duration-200 cursor-pointer overflow-hidden backdrop-blur-sm hover:shadow-md hover:scale-[1.02] hover:z-10"
                            style={{ width: `${100 * 3}%`, marginBottom: '8px' }}
                          >
                            <div className="absolute inset-0 flex items-center justify-center px-3">
                              <div className="w-full h-2 bg-orange-500/30 rounded-full overflow-hidden">
                                <div className="w-full h-full bg-orange-500/50 rounded-full animate-pulse" />
                              </div>
                            </div>
                            <div className="absolute inset-0 p-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-background/80 backdrop-blur-sm shadow-sm">
                                    Music
                                  </span>
                                  <span className="text-xs text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full backdrop-blur-sm">
                                    Full Duration
                                  </span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-24 text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <Type className="h-4 w-4" />
                        Captions
                      </div>
                      <div className="flex-1 flex space-x-2 min-w-max">
                        {shots.map((shot) => renderTimelineTrack(shot, 'caption'))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>
      {/* Only show the global regenerating indicator if there's no specific shot being regenerated */}
      {hasRegeneratingShot && !shots.some(shot => 
        shot.video_status === 'regenerating' || shot.audio_status === 'regenerating'
      ) && (
        <div className="absolute bottom-4 right-4 z-50">
          <div className="bg-primary text-primary-foreground px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Regenerating content...</span>
          </div>
        </div>
      )}
    </>
  )
} 
