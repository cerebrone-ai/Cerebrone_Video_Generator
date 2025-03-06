'use client'

import * as React from "react"
import { ArrowLeft, Edit2, Eye, Film, Moon, MoreHorizontal, Search, Sun, Trash2, Video } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
// import { createClient } from "@/utils/supabase/client" // REMOVE Supabase import
// import { User } from "@supabase/supabase-js" // REMOVE Supabase import
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { VideoEditor } from "@/components/video-editor"
import { TvMinimalPlay } from 'lucide-react';
import { LoaderCircle, Plus } from "lucide-react"
import { motion } from "framer-motion"

import { useSearchParams } from 'next/navigation';

interface VideoTask {
  task_id: string;
  id: string; //added to match the backend model
  status: string;
  progress: number;
  created_at: string;
  updated_at: string;
  project_data: {
    project_title: string;
    project_description: string;
    refined_description?: string;
    target_audience: string;
    duration: string;
    category: string;
    [key: string]: any;
  };
  shots: any[];
  background_music_url: string;
  error?: string;
}

export function VideoStudioDashboard() {
  const [user, setUser] = React.useState<any | null>(null) // User type removed because we are not using supabase
  const [tasks, setTasks] = React.useState<VideoTask[]>([])
  const [showCreateDialog, setShowCreateDialog] = React.useState(false)
  const [newProject, setNewProject] = React.useState({
    project_title: '',
    project_description: '',
    target_audience: 'Instagram',
    duration: '30',
    category: 'Social',
    language: 'english',
    style: 'realistic'
  })
  const [searchQuery, setSearchQuery] = React.useState('')
  const [isLoading, setIsLoading] = React.useState(false)
  const [isCreating, setIsCreating] = React.useState(false)
  const [hasIncompleteTask, setHasIncompleteTask] = React.useState(false)
  const pollingInterval = React.useRef<NodeJS.Timeout>()
  // const supabase = createClient() //REMOVE supabase
  
  const [isDarkMode, setIsDarkMode] = React.useState(false)
  const router = useRouter();
  
  const searchParams = useSearchParams();

  const selectedTaskId = searchParams.get('task_id');
  const [selectedTask, setSelectedTaskState] = React.useState<VideoTask | null>(null);

  const setSelectedTask = (task: VideoTask | null) => {
    setSelectedTaskState(task);
    if (task) {
      router.push(`/video-studio?task_id=${task.id}`); // changed to `task.id` as the backend return `id` not `task_id`
    } else {
      router.push('/video-studio');
    }
  };

  React.useEffect(() => {
    if (selectedTaskId) {
      const task = tasks.find(t => t.id === selectedTaskId);  // changed to `t.id` as the backend return `id` not `task_id`
      setSelectedTaskState(task || null);
    } else {
      setSelectedTaskState(null);
    }
  }, [selectedTaskId, tasks]);

  const toggleTheme = () => {
    setIsDarkMode(!isDarkMode)
    document.documentElement.classList.toggle('dark')
  }

  const fetchTasks = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/video-tasks`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setTasks(data || []);
    } catch (error) {
      console.error('Error fetching tasks:', error);
      toast.error("Failed to load video projects. Please try again later.");
      setTasks([]); // Set tasks to an empty array on error
    } finally {
      setIsLoading(false);
    }
  };
  

  const checkAndUpdateTasks = React.useCallback(async () => {
    try {
      const incompleteTasks = tasks.filter((task: VideoTask) => {  // Explicit type for task
        return task.status === 'PENDING' || task.status === 'IN_PROGRESS' || task.status === 'PROCESSING' || task.status === 'GENERATING_SCRIPT' || task.status === 'GENERATING_MEDIA'
      })
      if (incompleteTasks.length > 0) {
        setHasIncompleteTask(true)
        // const { data, error } = await supabase  //REMOVE Supabase query
        //   .from('video_tasks')
        //   .select('*')
        //   .in('task_id', incompleteTasks.map(t => t.task_id))
        const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/video-tasks/bulk-status`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(incompleteTasks.map(t => t.id)), // Send task IDs to your backend
        });

        if (!response.ok) {
          throw new Error('Failed to update tasks');
        }
        const data = await response.json();

        if (data) {
          setTasks(prevTasks => {
            const updatedTasks = [...prevTasks]
            data.forEach((updatedTask: VideoTask) => {   // Explicit type for updatedTask
              const index = updatedTasks.findIndex(t => t.id === updatedTask.id)  // changed to `t.id` as the backend return `id` not `task_id`
              if (index !== -1) {
                updatedTasks[index] = updatedTask
              }
            })
            return updatedTasks
          })

          // Check if all tasks are now complete
          const allComplete = data.every((task: VideoTask) => task.status === 'COMPLETED' || task.status === 'FAILED')  // Explicit type for task
          if (allComplete) {
            setHasIncompleteTask(false)
            if (pollingInterval.current) {
              clearInterval(pollingInterval.current)
            }
          }
        }
      } else {
        setHasIncompleteTask(false)
        if (pollingInterval.current) {
          clearInterval(pollingInterval.current)
        }
      }
    } catch (error) {
      console.error('Error updating tasks:', error)
    }
  }, [tasks])


  // Set up polling when tasks change
  React.useEffect(() => {
    const incompleteTasks = tasks.filter(task => task.status !== 'COMPLETED' && task.status !== 'FAILED')
    if (incompleteTasks.length > 0) {
      setHasIncompleteTask(true)
      // Clear existing interval if any
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
      }
      // Start new polling
      pollingInterval.current = setInterval(checkAndUpdateTasks, 5000)
    } else {
      setHasIncompleteTask(false)
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
      }
    }

    // Cleanup on unmount
    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
      }
    }
  }, [tasks, checkAndUpdateTasks])

  React.useEffect(() => {
    const setupData = async () => {
      // const { data: { user } } = await supabase.auth.getUser()  //REMOVE Supabase auth
      // console.log('Current user:', user)
      // setUser(user)
      
      // if (user) {
        await fetchTasks()
      // }
    }

    setupData()
  }, [])

  const handleCreateProject = async () => {
    setIsCreating(true)
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/generate-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_title: newProject.project_title,
          project_description: newProject.project_description,
          target_audience: newProject.target_audience,
          duration: parseInt(newProject.duration),
          category: newProject.category,
          language: newProject.language,
          style: newProject.style
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start video generation')
      }

      toast.success("Project created successfully")
      setShowCreateDialog(false)
      setNewProject({
        project_title: '',
        project_description: '',
        target_audience: 'Instagram',
        duration: '30',
        category: 'Social',
        language: 'english',
        style: 'realistic'
      })
      await fetchTasks()
    } catch (error) {
      console.error('Error creating project:', error)
      toast.error("Failed to create project")
    } finally {
      setIsCreating(false)
    }
  }

  const handleDelete = async (taskId: string) => {
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_VIDEO_API_URL}/api/v1/video-tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error('Failed to delete project');
      }
  
      setTasks(tasks.filter(task => task.id !== taskId));
      toast.success("Project deleted successfully");
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error("Failed to delete project");
    }
  };
  

  const filteredTasks = React.useMemo(() => {
    console.log('Filtering tasks:', tasks)
    return tasks.filter(task =>
      task.project_data?.project_title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      task.project_data?.project_description?.toLowerCase().includes(searchQuery.toLowerCase())
    )
  }, [tasks, searchQuery])

  React.useEffect(() => {
    console.log('Current tasks state:', tasks)
    console.log('Filtered tasks useMemo:', filteredTasks)
  }, [tasks, filteredTasks])

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-green-500/10 text-green-500'
      case 'GENERATING_SCRIPT':
        return 'bg-blue-500/10 text-blue-500'
      case 'GENERATING_MEDIA':
        return 'bg-yellow-500/10 text-yellow-500'
      default:
        return 'bg-gray-500/10 text-gray-500'
    }
  }

  const renderTaskCard = React.useCallback((task: VideoTask) => {
    const truncateText = (text: string, maxLength: number) => {
      if (!text) return '';
      return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    };

    return (
      <Card
        key={task.id}  // changed to `task.id` as the backend return `id` not `task_id`
        className="transition-all duration-300 hover:shadow-md cursor-pointer"
        onClick={() => setSelectedTask(task)}
      >
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center" style={{ width: '100%' }}>
              <CardTitle className="text-lg font-medium tracking-tight mr-2" style={{ flex: 1 }}>
                {truncateText(task.project_data?.project_title || 'Untitled Project', 20)}
              </CardTitle>
              <span className="text-sm text-muted-foreground" style={{ marginLeft: 'auto' }}>
                {new Date(task.created_at).toLocaleDateString()}
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-2">
          <div className="flex items-center justify-between text-sm text-muted-foreground mb-2">
            <span>{task.project_data?.duration}s</span>
          </div>
          <CardDescription className="line-clamp-2">
            {truncateText(task.project_data?.refined_description || task.project_data?.project_description, 100)}
          </CardDescription>
        </CardContent>
        <CardFooter className="pt-2">
          <div className="flex items-center justify-between w-full">
            <span className="text-xs px-2 py-1 bg-secondary rounded-full">
              {task.project_data?.target_audience}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Open menu</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  className="text-red-600"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(task.id);  // changed to `task.id` as the backend return `id` not `task_id`
                  }}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardFooter>
      </Card>
    )
  }, [setSelectedTask, handleDelete])

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex justify-center items-center h-full">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
        </div>
      )
    }

    if (tasks.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full text-center">
          <Film className="h-12 w-12 text-muted-foreground mb-4" />
          <div className="text-muted-foreground mb-4">
            {tasks.length === 0 ? (
              "No video projects found. Create a new project to get started."
            ) : (
              "No projects match your search criteria."
            )}
          </div>
          <Button onClick={() => setShowCreateDialog(true)}>
            <Plus className="mr-2 h-4 w-4" />
            Create New Project
          </Button>
        </div>
      )
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTasks.map(renderTaskCard)}
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-16 items-center justify-between px-6 bg-black">
        <div className="flex items-center gap-4">
          <TvMinimalPlay size={36} color="#fdff7a" strokeWidth={2} />
          <h1 className="text-2xl font-extrabold text-white tracking-wide font-serif">
            Cerebrone Video Generator
          </h1>
          {hasIncompleteTask && (
            <div className="flex items-center gap-2 px-2 py-1 bg-white/20 text-white rounded-full text-xs font-medium">
              <div className="animate-spin h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
              Generating videos...
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <Button onClick={() => setShowCreateDialog(true)} className="bg-white text-blue-700 hover:bg-white/90">
            <Plus className="mr-2 h-4 w-4" />
            Create New Project
          </Button>
        </div>
      </header>

      {selectedTask ? (
        <div className="flex-1 overflow-hidden">
          <div className="flex items-center justify-between border-b p-4">
            <div>
              <h2 className="text-xl font-semibold">{selectedTask.project_data.project_title}</h2>
              <p className="text-sm text-muted-foreground">{selectedTask.project_data.project_description}</p>
            </div>
            <Button variant="ghost" onClick={() => setSelectedTask(null)}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
          </div>
          <VideoEditor task={selectedTask} />
        </div>
      ) : (
        <main className="flex-1 overflow-hidden p-6">
          {/* Search Bar with Light Gray Background */}
          <div className="relative mb-8 flex items-center justify-center py-8 rounded-lg overflow-hidden bg-gray-100">
            {/* Search Bar */}
            <div className="relative flex items-center space-x-2 w-3/4 max-w-2xl z-20">
              <Input
                placeholder="Search projects..."
                className="flex-grow"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              <Button variant="outline" size="icon">
                <Search className="h-4 w-4" />
                <span className="sr-only">Search</span>
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[calc(100vh-14rem)]">
            {renderContent()}
          </ScrollArea>
        </main>
      )}

      {/* Dialog (Modal) */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Video Project</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project_title">Project Title</Label>
              <Input
                id="project_title"
                value={newProject.project_title}
                onChange={(e) => setNewProject(prev => ({ ...prev, project_title: e.target.value }))}
                placeholder="Enter project title"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project_description">Description</Label>
              <Textarea
                id="project_description"
                value={newProject.project_description}
                onChange={(e) => setNewProject(prev => ({ ...prev, project_description: e.target.value }))}
                placeholder="Enter project description"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="target_audience">Target Audience</Label>
              <select
                id="target_audience"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={newProject.target_audience}
                onChange={(e) => setNewProject(prev => ({ ...prev, target_audience: e.target.value }))}
              >
                <option value="Instagram">Instagram</option>
                <option value="YouTube">YouTube</option>
                <option value="LinkedIn">LinkedIn</option>
                <option value="TikTok">TikTok</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <select
                id="category"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={newProject.category}
                onChange={(e) => setNewProject(prev => ({ ...prev, category: e.target.value }))}
              >
                <option value="Social">Social</option>
                <option value="Marketing">Marketing</option>
                <option value="Educational">Educational</option>
                <option value="Product">Product</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="duration">Duration (seconds)</Label>
              <Input
                id="duration"
                type="number"
                value={newProject.duration}
                onChange={(e) => setNewProject(prev => ({ ...prev, duration: e.target.value }))}
                min="5"
                max="300"
              />
            </div>
             <div className="grid gap-2">
              <Label htmlFor="language">Language</Label>
              <select
                id="language"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={newProject.language}
                onChange={(e) => setNewProject(prev => ({ ...prev, language: e.target.value }))}
              >
                <option value="english">English</option>
                <option value="punjabi">Punjabi</option>
                <option value="hindi">Hindi</option>
                <option value="telugu">Telugu</option>
                <option value="tamil">Tamil</option>
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="style">Visual Style</Label>
              <select
                id="style"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={newProject.style}
                onChange={(e) => setNewProject(prev => ({ ...prev, style: e.target.value }))}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
            <Button onClick={handleCreateProject} disabled={isCreating}>
              {isCreating ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                  Creating...
                </>
              ) : (
                'Create Project'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
