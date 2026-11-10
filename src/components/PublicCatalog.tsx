import React, { useEffect, useState } from 'react'
import { Brain, Database } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { Button } from './ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { PublicModelZoo } from './PublicModelZoo'
import { PublicDataZoo } from './PublicDataZoo'

export function PublicCatalog({ initialTab = 'models' }: { initialTab?: 'models' | 'datasets' }) {
  const { user } = useAuth()
  const [tab, setTab] = useState(initialTab)
  useEffect(() => { setTab(initialTab) }, [initialTab])
  return <div className="min-h-screen bg-gray-50">
    <header className="bg-white border-b"><nav aria-label="Catalog navigation" className="page-container page-header">
      <a href="/" aria-label={'\u1ECCJ\u00C0 AI home'} className="catalog-brand text-xl font-semibold text-gray-900">
        <span className="p-2 bg-indigo-100 rounded-lg"><Brain className="h-6 w-6 text-indigo-600" aria-hidden="true" /></span>
        <span>{'\u1ECCJ\u00C0 AI'}</span>
      </a>
      <div className="page-actions"><a href="/">Home</a>{user ? <Button asChild><a href="/dashboard">Dashboard</a></Button> : <><Button asChild variant="outline"><a href="/auth/login">Sign in</a></Button><Button asChild><a href="/auth/signup">Create account</a></Button></>}</div>
    </nav></header>
    <main className="page-container page-content space-y-5">
      <div><h1 className="text-3xl font-bold">Explore models and datasets</h1><p className="text-gray-600 mt-2">Discover public AI resources, review their documentation, and download published versions.</p></div>
      <Tabs value={tab} onValueChange={value => {
        setTab(value as 'models' | 'datasets')
        window.history.pushState({}, '', value === 'models' ? '/models' : '/datasets')
        window.dispatchEvent(new PopStateEvent('popstate'))
      }} className="platform-tabs catalog-tabs">
        <TabsList aria-label="Resource type"><TabsTrigger value="models"><Brain aria-hidden="true" />Oja Models</TabsTrigger><TabsTrigger value="datasets"><Database aria-hidden="true" />Oja Datasets</TabsTrigger></TabsList>
        <TabsContent value="models"><PublicModelZoo embedded /></TabsContent>
        <TabsContent value="datasets"><PublicDataZoo embedded /></TabsContent>
      </Tabs>
    </main>
  </div>
}
