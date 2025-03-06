'use client'

import { useState } from 'react'
import { Button } from './button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './dialog'
import { Input } from './input'
import { Label } from './label'
import { Checkbox } from './checkbox'
import { Send } from 'lucide-react'
import { sendToAudience } from '@/actions/send_emails'

interface SendToAudienceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  emailContent: string
}

export function SendToAudience({ open, onOpenChange, emailContent }: SendToAudienceProps) {
  const [emails, setEmails] = useState<string[]>([])
  const [newEmail, setNewEmail] = useState('')
  const [useFirstImpress, setUseFirstImpress] = useState(false)
  const [isSending, setIsSending] = useState(false)

  const handleAddEmail = () => {
    if (newEmail && !emails.includes(newEmail)) {
      setEmails([...emails, newEmail])
      setNewEmail('')
    }
  }
  const handleRemoveEmail = (email: string) => {
    setEmails(emails.filter(e => e !== email))
  }

  const handleSend = async () => {
    setIsSending(true)
    try {
      await sendToAudience(emails, useFirstImpress, emailContent)
      onOpenChange(false)
      setEmails([])
      setUseFirstImpress(false)
    } catch (error) {
      console.error('Error sending to audience:', error)
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Send to Audience</DialogTitle>
          <DialogDescription>
            Choose your audience or add email addresses manually
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="FirstImpress"
              checked={useFirstImpress}
              onCheckedChange={(checked) => setUseFirstImpress(checked as boolean)}
            />
            <Label htmlFor="FirstImpress">Send to FirstImpress Audience List</Label>
          </div>

          <div className="grid gap-2">
            <Label>Add Additional Email Addresses</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Enter email address"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddEmail()
                  }
                }}
              />
              <Button type="button" onClick={handleAddEmail}>Add</Button>
            </div>
          </div>

          {emails.length > 0 && (
            <div className="grid gap-2">
              <Label>Added Emails:</Label>
              <div className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <div key={email} className="flex items-center gap-1 bg-secondary px-2 py-1 rounded">
                    <span className="text-sm">{email}</span>
                    <button
                      onClick={() => handleRemoveEmail(email)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSend}
            disabled={isSending || (!useFirstImpress && emails.length === 0)}
          >
            {isSending ? (
              <>
                <div className="animate-spin mr-2 h-4 w-4 border-2 border-current border-t-transparent rounded-full" />
                Sending...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Send
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
