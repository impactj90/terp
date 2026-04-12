'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface RichTextEditorProps {
  content: string
  onUpdate: (html: string) => void
  placeholder?: string
  editable?: boolean
  className?: string
}

export function RichTextEditor({
  content,
  onUpdate,
  placeholder = '',
  editable = true,
  className,
}: RichTextEditorProps) {
  const tc = useTranslations('common')
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Only bold and italic — disable everything else
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        code: false,
        horizontalRule: false,
        strike: false,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content,
    editable,
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none text-sm focus:outline-none min-h-[1.5em]',
          editable && 'cursor-text',
          !editable && 'cursor-default',
        ),
      },
    },
    onBlur: ({ editor: ed }) => {
      if (!editable) return
      const html = ed.getHTML()
      // Tiptap returns <p></p> for empty content
      const isEmpty = html === '<p></p>' || html === ''
      onUpdate(isEmpty ? '' : html)
    },
  })

  if (!editor) return null

  return (
    <div className={cn('relative', className)}>
      {editable && (
        <BubbleMenu
          editor={editor}
          className="flex items-center gap-0.5 rounded-md border bg-background p-0.5 shadow-md"
        >
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={editor.isActive('bold') ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('bold')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant={editor.isActive('italic') ? 'default' : 'ghost'}
                size="icon"
                className="h-7 w-7"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tc('italic')}</TooltipContent>
          </Tooltip>
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  )
}
