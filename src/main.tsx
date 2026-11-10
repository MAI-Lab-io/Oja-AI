// src/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './auth/AuthContext'
import { AppRouter } from './AppRouter'
import './index.css'
import './styles/layout.css'
import './styles/auth.css'
import './styles/data-zoo.css'



ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  </React.StrictMode>,
)
