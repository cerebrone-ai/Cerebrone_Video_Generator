import { captureScreenshot, captureVideo } from '@/actions/media_capture'

interface DownloadOptions {
  type: 'image' | 'video'
  filename: string
  content: string | { html: string; url: string }
}

export async function downloadMedia({ type, filename, content }: DownloadOptions) {
  try {
    let blob: Blob

    // If content is a string, treat it as a URL
    if (typeof content === 'string') {
      const response = await fetch(content)
      blob = await response.blob()
    } else {
      // If content is an object with HTML, use Playwright to capture
      if (type === 'video') {
        const videoBuffer = await captureVideo(content.html)
        blob = new Blob([videoBuffer], { type: 'video/mp4' })
      } else {
        const imageBuffer = await captureScreenshot(content.html)
        blob = new Blob([imageBuffer], { type: 'image/png' })
      }
    }

    // Create download link
    const blobUrl = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.style.display = 'none'
    link.href = blobUrl
    link.download = filename
    
    // Trigger download
    document.body.appendChild(link)
    link.click()
    
    // Cleanup
    setTimeout(() => {
      window.URL.revokeObjectURL(blobUrl)
      document.body.removeChild(link)
    }, 100)
  } catch (error) {
    console.error(`Error downloading ${type}:`, error)
    // Fallback to direct download if content is a URL
    if (typeof content === 'string') {
      try {
        window.open(content, '_blank')
        alert(`Direct download failed. The ${type} will open in a new tab. Please use "Save As" to download it.`)
      } catch (fallbackError) {
        alert(`Failed to download ${type}. Please try right-clicking and "Save As" instead.`)
      }
    } else {
      alert(`Failed to download ${type}. Please try again.`)
    }
  }
} 