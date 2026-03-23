'use client'

import { useParams } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useHasPermission } from '@/hooks'
import { ArticleDetail } from '@/components/warehouse/article-detail'

export default function WhArticleDetailPage() {
  const t = useTranslations('warehouseArticles')
  const params = useParams<{ id: string }>()
  const { allowed: canAccess } = useHasPermission(['wh_articles.view'])

  if (canAccess === false) {
    return (
      <div className="p-6 text-center text-muted-foreground">
        {t('noPermission')}
      </div>
    )
  }

  return <ArticleDetail articleId={params.id} />
}
