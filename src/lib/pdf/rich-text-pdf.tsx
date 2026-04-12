import React from "react"
import { Text, View, StyleSheet } from "@react-pdf/renderer"

const styles = StyleSheet.create({
  paragraph: { marginBottom: 4 },
  bold: { fontFamily: "Helvetica-Bold" },
  italic: { fontFamily: "Helvetica-Oblique" },
  boldItalic: { fontFamily: "Helvetica-BoldOblique" },
})

interface TextNode {
  text: string
  bold?: boolean
  italic?: boolean
}

interface ParagraphNode {
  children: TextNode[]
}

/**
 * Parse simple HTML (from Tiptap, bold/italic only) into paragraph + text nodes.
 * Supports: <p>, <strong>, <em>, <br>
 */
function parseHtml(html: string): ParagraphNode[] {
  const paragraphs: ParagraphNode[] = []

  // Split by </p> to get paragraph chunks
  const pChunks = html.split(/<\/p>/i).filter((c) => c.trim())

  for (const chunk of pChunks) {
    // Remove opening <p> tag
    const content = chunk.replace(/<p[^>]*>/gi, "")
    const children: TextNode[] = []

    // Process inline elements
    const parts = content.split(/(<\/?(?:strong|em|b|i|br\s*\/?)>)/gi)

    let bold = false
    let italic = false

    for (const part of parts) {
      const lower = part.toLowerCase().trim()
      if (!lower) continue

      if (lower === "<strong>" || lower === "<b>") {
        bold = true
      } else if (lower === "</strong>" || lower === "</b>") {
        bold = false
      } else if (lower === "<em>" || lower === "<i>") {
        italic = true
      } else if (lower === "</em>" || lower === "</i>") {
        italic = false
      } else if (lower === "<br>" || lower === "<br/>") {
        children.push({ text: "\n" })
      } else if (!part.startsWith("<")) {
        // Decode basic HTML entities
        const decoded = part
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
        children.push({ text: decoded, bold, italic })
      }
    }

    if (children.length > 0) {
      paragraphs.push({ children })
    }
  }

  return paragraphs
}

function getTextStyle(node: TextNode) {
  if (node.bold && node.italic) return styles.boldItalic
  if (node.bold) return styles.bold
  if (node.italic) return styles.italic
  return undefined
}

export function RichTextPdf({ html }: { html: string }) {
  if (!html || html === "<p></p>") return null

  const paragraphs = parseHtml(html)

  return (
    <View>
      {paragraphs.map((p, pi) => (
        <Text key={pi} style={styles.paragraph}>
          {p.children.map((child, ci) => (
            <Text key={ci} style={getTextStyle(child)}>
              {child.text}
            </Text>
          ))}
        </Text>
      ))}
    </View>
  )
}
