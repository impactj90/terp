'use client'

import { useParams } from 'next/navigation'
import { useHasPermission } from '@/hooks'
import { ArticleDetail } from '@/components/warehouse/article-detail'

export default function WhArticleDetailPage() {
  const params = useParams<{ id: string }>()
  const { allowed: canAccess } = useHasPermission(['wh_articles.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        Keine Berechtigung
      </div>
    )
  }

  return <ArticleDetail articleId={params.id} />
}
