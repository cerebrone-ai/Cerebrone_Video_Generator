import { Slide } from "@/actions/content_posts"
import html2canvas from 'html2canvas';
import { useRef, useEffect, useState } from 'react';
import { Button } from "./button";
import { Download } from "lucide-react";
import jsPDF from 'jspdf';

interface SlideCardProps {
  slide: Slide
  index: number
  theme?: 'dark' | 'light' | 'color'
  backgroundColor?: string // Custom background color
  isFirst?: boolean  // Add this to identify first slide
  onDownloadAll?: () => Promise<void>  // Add this for download all functionality
}

const themes = {
  dark: {
    background: 'bg-gradient-to-br from-[#1a2b4b] to-[#2a3b5b]',
    text: 'text-white',
    logoOpacity: 'opacity-90',
    buttonHover: 'hover:bg-[#1a2b4b] hover:text-white',
    canvasBackground: '#1a2b4b',
    logo: '/cerebrone_light.png'
  },
  light: {
    background: 'bg-gradient-to-br from-gray-50 to-gray-100',
    text: 'text-gray-900',
    logoOpacity: 'opacity-80',
    buttonHover: 'hover:bg-gray-100 hover:text-gray-900',
    canvasBackground: '#f8fafc',
    logo: '/cerebrone_dark.png'
  },
  color: {
    background: 'bg-gradient-to-br from-blue-500 to-purple-600',
    text: 'text-white',
    logoOpacity: 'opacity-95',
    buttonHover: 'hover:bg-blue-500 hover:text-white',
    canvasBackground: '#3b82f6',
    logo: '/cerebrone_light.png'
  }
}

export function SlideCard({ slide, theme = 'dark', backgroundColor, isFirst, onDownloadAll }: SlideCardProps) {
  const componentRef = useRef<HTMLDivElement>(null);
  const [videoThumbnail, setVideoThumbnail] = useState<string | null>(null);
  const currentTheme = themes[theme];

  useEffect(() => {
    if (slide.media_url && slide.media_type === 'video') {
      const video = document.createElement('video');
      video.crossOrigin = "anonymous";
      video.src = slide.media_url;
      
      video.onloadeddata = () => {
        // Get 3rd frame by setting currentTime to 0.1 seconds (assuming 30fps)
        video.currentTime = 0.2;
        
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        
        if (ctx) {
          video.onseeked = () => {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            setVideoThumbnail(canvas.toDataURL('image/jpeg'));
          };
        }
      };
    }
  }, [slide.media_url, slide.media_type]);

  const downloadAsJPEG = async () => {
    if (componentRef.current) {
      try {
        const images = componentRef.current.getElementsByTagName('img');

        Array.from(images).forEach(img => {
          if (!img.crossOrigin) {
            img.crossOrigin = "anonymous";
          }
        });

        await Promise.all(
          Array.from(images).map(img => {
            return new Promise((resolve) => {
              if (img.complete) resolve(undefined);
              img.onload = () => resolve(undefined);
              img.onerror = () => resolve(undefined);
            });
          })
        );

        await new Promise(resolve => setTimeout(resolve, 100));

        const canvas = await html2canvas(componentRef.current, {
          backgroundColor: backgroundColor || currentTheme.canvasBackground,
          useCORS: true,
          allowTaint: true,
          removeContainer: false,
          scale: 2,
          logging: true
        });
        
        const link = document.createElement('a');
        link.download = `slide-${slide.order}.jpeg`;
        link.href = canvas.toDataURL('image/jpeg', 1.0);
        link.click();
      } catch (error) {
        console.error("Failed to download slide:", error);
        alert("Failed to download slide. Please ensure all media content is loaded correctly.");
      }
    }
  };

  const backgroundStyle = backgroundColor 
    ? { background: backgroundColor }
    : {};

  return (
    <div className="flex-none w-[400px]">
      <div 
        className={`aspect-square ${!backgroundColor ? currentTheme.background : ''} overflow-hidden relative shadow-2xl rounded-xl transform transition-transform hover:scale-[1.02]`} 
        ref={componentRef}
        style={backgroundStyle}
        data-slide-id={slide.order}
      >
        {/* Logo */}
        <div className="absolute top-6 right-6 z-10">
          <img
            src={currentTheme.logo}
            alt="Cerebrone Logo" 
            className={`w-16 ${currentTheme.logoOpacity} drop-shadow-lg`}
            crossOrigin="anonymous"
          />
        </div>

        <div className="p-10 h-full flex flex-col relative">
          {/* Content */}
          <div className={`${currentTheme.text} ${!slide.media_url ? 'flex-1 flex items-center justify-center' : ''}`}>
            {slide.content && (
              <p 
                className="text-lg leading-relaxed font-medium tracking-wide mt-10 mb-6"
                style={{
                  fontFamily: 'Inter, sans-serif',
                  textShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  fontSize: '12px'
                }}
              >
                {slide.content}
              </p>
            )}
          </div>

          {/* Image if exists */}
          {slide.media_url && slide.media_type === 'photo' && (
            <div className="mt-auto">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl z-10"/>
                <img
                  src={slide.media_url}
                  alt={`Slide ${slide.order}`}
                  className="w-full h-auto rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] transform transition-transform hover:scale-[1.02]"
                  crossOrigin="anonymous"
                />
              </div>
            </div>
          )}

          {/* Video with thumbnail */}
          {slide.media_url && slide.media_type === 'video' && (
            <div className="mt-auto">
              {videoThumbnail && (
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-xl z-10"/>
                  <img
                    src={videoThumbnail}
                    alt={`Video thumbnail for slide ${slide.order}`}
                    className="w-full h-auto rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.2)] transform transition-transform hover:scale-[1.02]"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between mt-4">
        <div className="text-sm font-semibold text-muted-foreground bg-gray-100 px-3 py-1 rounded-full">
          Slide {slide.order}
        </div>
        <div className="flex gap-2">
          {isFirst && onDownloadAll && (
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onDownloadAll}
              className={`transition-colors ${currentTheme.buttonHover}`}
            >
              <Download className="h-4 w-4 mr-2" />
              Download All
            </Button>
          )}
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={downloadAsJPEG}
            className={`transition-colors ${currentTheme.buttonHover}`}
          >
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
      </div>
    </div>
  )
}

export async function downloadAllSlides(slides: Slide[], theme: 'dark' | 'light' | 'color', backgroundColor?: string) {
  try {
    // Create PDF document
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [400, 400]  // Match slide dimensions
    });

    for (let i = 0; i < slides.length; i++) {
      const slideElement = document.querySelector(`[data-slide-id="${slides[i].order}"]`) as HTMLElement;
      
      if (slideElement) {
        const canvas = await html2canvas(slideElement, {
          backgroundColor: backgroundColor || themes[theme].canvasBackground,
          useCORS: true,
          allowTaint: true,
          scale: 2,
          logging: true
        });

        // Add page to PDF
        if (i > 0) pdf.addPage();
        
        const imgData = canvas.toDataURL('image/jpeg', 1.0);
        pdf.addImage(imgData, 'JPEG', 0, 0, 400, 400);
      }
    }

    // Save the PDF
    pdf.save('all-slides.pdf');
  } catch (error) {
    console.error("Failed to download all slides:", error);
    alert("Failed to download all slides. Please ensure all media content is loaded correctly.");
  }
}
