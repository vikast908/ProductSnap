import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  FolderOpen, ArrowLeft, Upload, Trash2, FileText, File,
  Search, X, Clock, MessageSquare, AlertCircle
} from 'lucide-react'

export function MyFilesPage() {
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuth()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState('')
  const fileInputRef = useRef(null)

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/')
      return
    }
    fetchFiles()
  }, [isAuthenticated])

  const fetchFiles = async () => {
    try {
      const response = await fetch('/api/files', {
        credentials: 'include'
      })
      if (response.ok) {
        const data = await response.json()
        setFiles(data.files || [])
      }
    } catch (error) {
      console.error('Error fetching files:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleUpload = async (e) => {
    const selectedFiles = e.target.files
    if (!selectedFiles || selectedFiles.length === 0) return

    setUploading(true)
    setError('')

    const formData = new FormData()
    for (const file of selectedFiles) {
      // Validate file type
      const ext = file.name.split('.').pop().toLowerCase()
      if (!['txt', 'pdf', 'md', 'docx'].includes(ext)) {
        setError('Invalid file type. Allowed: TXT, PDF, MD, DOCX')
        setUploading(false)
        return
      }
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File too large. Maximum 10MB per file.')
        setUploading(false)
        return
      }
      formData.append('files', file)
    }

    try {
      const response = await fetch('/api/files/upload', {
        method: 'POST',
        credentials: 'include',
        body: formData
      })

      if (response.ok) {
        const data = await response.json()
        setFiles(prev => [...data.files, ...prev])
      } else {
        const err = await response.json()
        setError(err.error || 'Upload failed')
      }
    } catch (error) {
      console.error('Error uploading:', error)
      setError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  const deleteFile = async (fileId) => {
    if (!confirm('Are you sure you want to delete this file?')) return

    try {
      const response = await fetch(`/api/files/${fileId}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (response.ok) {
        setFiles(prev => prev.filter(f => f.id !== fileId))
      }
    } catch (error) {
      console.error('Error deleting file:', error)
    }
  }

  const filteredFiles = files.filter(f => {
    if (!searchQuery) return true
    return f.originalName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const getFileIcon = (filename) => {
    const ext = filename.split('.').pop().toLowerCase()
    if (ext === 'pdf') return '📄'
    if (ext === 'md') return '📝'
    if (ext === 'docx') return '📃'
    return '📄'
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 glass border-b border-border/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h1 className="text-lg font-semibold">My Files</h1>
                <Badge variant="secondary">{files.length}</Badge>
              </div>
            </div>

            {/* Upload button */}
            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.pdf,.md,.docx"
                onChange={handleUpload}
                className="hidden"
                id="file-upload"
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? 'Uploading...' : 'Upload Files'}
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Info banner */}
        <Card className="p-4 mb-6 bg-primary/5 border-primary/20">
          <div className="flex items-start gap-3">
            <MessageSquare className="h-5 w-5 text-primary mt-0.5" />
            <div>
              <p className="font-medium">Chat with your files</p>
              <p className="text-sm text-muted-foreground">
                Upload documents (TXT, PDF, MD, DOCX) and they'll be included when you chat with AI.
                Your files are private and only visible to you.
              </p>
            </div>
          </div>
        </Card>

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-3">
            <AlertCircle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
            <button onClick={() => setError('')} className="ml-auto">
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Search */}
        {files.length > 0 && (
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 max-w-md"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2"
              >
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {/* Empty state */}
        {files.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-accent flex items-center justify-center">
              <FolderOpen className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold mb-2">No files uploaded</h3>
            <p className="text-muted-foreground text-sm mb-4 max-w-md mx-auto">
              Upload your documents to chat with them. Supported formats: TXT, PDF, MD, DOCX (max 10MB each)
            </p>
            <Button onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Upload Files
            </Button>
          </div>
        ) : filteredFiles.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No files match your search</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredFiles.map(file => (
              <Card key={file.id} className="p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-center gap-4">
                  {/* Icon */}
                  <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center flex-shrink-0 text-xl">
                    {getFileIcon(file.originalName)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium truncate">{file.originalName}</h3>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>{formatFileSize(file.size)}</span>
                      <span>{file.wordCount?.toLocaleString()} words</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(file.uploadedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => deleteFile(file.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Supported formats */}
        <div className="mt-8 pt-8 border-t border-border">
          <h3 className="text-sm font-medium mb-3">Supported Formats</h3>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">.txt - Plain Text</Badge>
            <Badge variant="outline">.pdf - PDF Documents</Badge>
            <Badge variant="outline">.md - Markdown</Badge>
            <Badge variant="outline">.docx - Word Documents</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-3">
            Maximum file size: 10MB per file. Up to 5 files can be uploaded at once.
          </p>
        </div>
      </main>
    </div>
  )
}

export default MyFilesPage
