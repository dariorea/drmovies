import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App.tsx'
import { BrowserRouter } from 'react-router-dom'
import { SpatialNavigationProvider } from "@tv-spatial-navigation/react"


createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <BrowserRouter>
            <SpatialNavigationProvider
                options={{
                    enabled: true,
                    scroll: true
                }}
            >
                <App />
            </SpatialNavigationProvider>        
        </BrowserRouter>
    </StrictMode>,
)
