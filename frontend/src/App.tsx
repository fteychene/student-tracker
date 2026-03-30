import React from 'react'
import SubmitPage from './components/SubmitPage'
import AdminPage from './components/AdminPage'

const App: React.FC = () => {
  const path = window.location.pathname

  if (path === '/admin' || path.startsWith('/admin/')) {
    return <AdminPage />
  }

  return <SubmitPage />
}

export default App
